import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  HrmSalaryEmployeeNotFoundError,
  HrmSalaryGroupNotFoundError,
} from '@oni/adapters';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { assignHrmSalaryPolicySchema } from '@/lib/validators/hrm/salaryGroups';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function respondError(error: unknown) {
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
  if (
    error instanceof HrmSalaryEmployeeNotFoundError ||
    error instanceof HrmSalaryGroupNotFoundError
  ) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_SALARY_ASSIGNMENT_FAILED',
        message: 'Không thể áp dụng chính sách lương.',
      },
    },
    { status: 503 },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.manage');
    const input = assignHrmSalaryPolicySchema.parse(await request.json());
    await access.repository.assignSalaryPolicy({
      id: `HRMSA-${crypto.randomUUID()}`,
      profileId: `HRMP-${crypto.randomUUID()}`,
      auditId: `HRML-${crypto.randomUUID()}`,
      employeeId: input.employee_id,
      salaryMode: input.salary_mode,
      salaryGroupId: input.salary_group_id,
      actorUserId: access.userId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}
