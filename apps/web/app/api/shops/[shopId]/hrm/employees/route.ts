import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
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
    const data = await access.repository.listEmployees({
      search: url.searchParams.get('search') ?? '',
      limit: 50,
    });

    return NextResponse.json({
      ...data,
      canManage: access.permissions.includes('hrm.employee.manage'),
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
    const employeeId = `EMP-${crypto.randomUUID()}`;
    const profileId = `HRMP-${crypto.randomUUID()}`;
    const created = await access.repository.createEmployee({
      employeeId,
      profileId,
      employeeCode: input.employee_code,
      name: input.name,
      phone: input.phone,
      jobTitle: input.job_title,
      employmentType: input.employment_type,
      joinedAt: input.joined_at,
      email: input.email,
      address: input.address,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
