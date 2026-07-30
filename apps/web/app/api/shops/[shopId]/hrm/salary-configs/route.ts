import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  HrmSalaryConfigConflictError,
  HrmSalaryEmployeeNotFoundError,
} from '@oni/adapters';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { createHrmSalaryConfigSchema } from '@/lib/validators/hrm/salaryConfigs';

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
  if (error instanceof HrmSalaryConfigConflictError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }
  if (error instanceof HrmSalaryEmployeeNotFoundError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_SALARY_CONFIG_FAILED',
        message: 'Không thể xử lý cấu hình lương.',
      },
    },
    { status: 503 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.view');
    return NextResponse.json({
      data: await access.repository.listEmployeeSalaryConfigurations(),
      canManage: access.permissions.includes('hrm.payroll.manage'),
    });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.manage');
    const input = createHrmSalaryConfigSchema.parse(await request.json());
    await access.repository.createSalaryConfiguration({
      id: `HRMSC-${crypto.randomUUID()}`,
      profileId: `HRMP-${crypto.randomUUID()}`,
      auditId: `HRML-${crypto.randomUUID()}`,
      employeeId: input.employee_id,
      salaryType: input.salary_type,
      baseAmount: input.base_amount,
      standardWorkDays: input.standard_work_days,
      standardWorkHours: input.standard_work_hours,
      overtimeMultiplier: input.overtime_multiplier,
      recurringAllowances: input.recurring_allowances,
      effectiveFrom: input.effective_from,
      actorUserId: access.userId,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}
