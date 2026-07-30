import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmDepartmentScopeError } from '@oni/adapters';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { listTenantUsers } from '@/lib/server/tenantUsers';
import { updateHrmEmployeeProfileSchema } from '@/lib/validators/hrm/profile';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ shopId: string; employeeId: string }> },
) {
  try {
    const { shopId, employeeId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.employee.manage');
    const input = updateHrmEmployeeProfileSchema.parse(await request.json());
    if (input.auth_user_id) {
      const tenantUsers = await listTenantUsers(access.tenantId);
      const selectedUser = tenantUsers.find(
        (user) => user.user_id === input.auth_user_id,
      );
      const selectedRole = selectedUser?.role as
        | { scope?: string; shop?: { id?: string } }
        | null
        | undefined;
      const isInScope =
        selectedRole?.scope === 'workspace' ||
        (selectedRole?.scope === 'shop' && selectedRole.shop?.id === shopId);
      if (!selectedUser || !isInScope) {
        return NextResponse.json(
          {
            error: {
              code: 'HRM_INVALID_AUTH_USER',
              message: 'Tài khoản không thuộc phạm vi cửa hàng này.',
            },
          },
          { status: 400 },
        );
      }
    }
    const definitions = await access.repository.listCustomFields();
    const customData: Record<string, unknown> = {};

    for (const definition of definitions) {
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
      if (isEmpty) continue;

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
          ));
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

    await access.repository.updateEmployeeProfile({
      employeeId,
      profileId: `HRMP-${crypto.randomUUID()}`,
      authUserId: input.auth_user_id,
      employeeCode: input.employee_code,
      name: input.name,
      phone: input.phone,
      jobTitle: input.job_title,
      employmentStatus: input.employment_status,
      employmentType: input.employment_type,
      joinedAt: input.joined_at,
      email: input.email,
      address: input.address,
      departmentId: input.department_id,
      customData,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
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
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'HRM_AUTH_USER_ALREADY_LINKED',
            message: 'Tài khoản này đã liên kết với một nhân viên khác.',
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: 'HRM_DATA_PLANE_UNAVAILABLE',
          message: 'Không thể cập nhật hồ sơ nhân viên.',
        },
      },
      { status: 503 },
    );
  }
}
