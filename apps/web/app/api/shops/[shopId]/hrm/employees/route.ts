import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmDepartmentScopeError } from '@oni/adapters';
import {
  HrmAccessError,
  requireHrmAccess,
} from '@/lib/server/hrm/access';
import { createHrmEmployeeSchema } from '@/lib/validators/hrm/employees';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'HRM_VALIDATION_ERROR',
          message: error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof HrmDepartmentScopeError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể xử lý dữ liệu nhân viên.',
      },
    },
    { status: 503 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const url = new URL(request.url);
    const canManage = access.permissions.includes('hrm.employee.manage');
    const selfEmployeeId = canManage
      ? null
      : await access.repository.getEmployeeIdForAuthUser(access.userId);
    const data = await access.repository.listEmployees({
      search: url.searchParams.get('search') ?? '',
      limit: 50,
      employeeId: canManage
        ? null
        : (selfEmployeeId ?? '__HRM_UNLINKED_EMPLOYEE__'),
    });

    return NextResponse.json({
      ...data,
      canManage,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.employee.manage');
    const input = createHrmEmployeeSchema.parse(await request.json());
    
    let employeeCode = input.employee_code;
    if (!employeeCode) {
      const listData = await access.repository.listEmployees({ limit: 1 });
      const nextId = (listData.total + 1).toString().padStart(4, '0');
      const hash = crypto.createHash('sha256').update(shopId).digest('hex').substring(0, 4).toUpperCase();
      employeeCode = `NV-${hash}-${nextId}`;
    }

    const employeeId = `EMP-${crypto.randomUUID()}`;
    const profileId = `HRMP-${crypto.randomUUID()}`;

    const customData: Record<string, unknown> = {};
    const definitions = await access.repository.listCustomFields({
      includeInactive: false,
    });
    for (const definition of definitions.filter((field) => field.active)) {
      const value = input.custom_data[definition.key];
      const isEmpty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (definition.required && isEmpty) {
        return NextResponse.json(
          {
            error: {
              code: 'HRM_VALIDATION_ERROR',
              message: `${definition.label} là bắt buộc.`,
            },
          },
          { status: 400 },
        );
      }
      if (isEmpty) {
        continue;
      }

      const isValid =
        (definition.fieldType === 'text' && typeof value === 'string') ||
        (definition.fieldType === 'number' &&
          typeof value === 'number' &&
          Number.isFinite(value)) ||
        (definition.fieldType === 'date' &&
          typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
        (definition.fieldType === 'boolean' && typeof value === 'boolean') ||
        (definition.fieldType === 'select' &&
          typeof value === 'string' &&
          definition.options.includes(value)) ||
        (definition.fieldType === 'multiselect' &&
          Array.isArray(value) &&
          value.every(
            (option) =>
              typeof option === 'string' &&
              definition.options.includes(option),
          )) ||
        (definition.fieldType === 'upload' && typeof value === 'string');
      if (!isValid) {
        return NextResponse.json(
          {
            error: {
              code: 'HRM_VALIDATION_ERROR',
              message: `${definition.label} không đúng định dạng.`,
            },
          },
          { status: 400 },
        );
      }
      customData[definition.key] = value;
    }

    const created = await access.repository.createEmployee({
      employeeId,
      profileId,
      employeeCode: employeeCode,
      name: input.name,
      phone: input.phone,
      jobTitle: input.job_title,
      departmentId: input.department_id,
      defaultShiftTemplateId: input.default_shift_template_id,
      employmentType: input.employment_type,
      joinedAt: input.joined_at,
      email: input.email,
      address: input.address,
      ethnicity: input.ethnicity,
      taxCode: input.tax_code,
      insuranceCode: input.insurance_code,
      bankName: input.bank_name,
      bankAccountCiphertext: input.bank_account,
      bankAccountLast4: input.bank_account ? input.bank_account.slice(-4) : undefined,
      customData,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
