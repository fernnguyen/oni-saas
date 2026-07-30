import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmSalaryGroupNotFoundError } from '@oni/adapters';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { saveHrmSalaryGroupSchema } from '@/lib/validators/hrm/salaryGroups';

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
  if (error instanceof HrmSalaryGroupNotFoundError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }
  if ((error as { code?: string }).code === '23505') {
    return NextResponse.json(
      {
        error: {
          code: 'HRM_SALARY_GROUP_CONFLICT',
          message: 'Tên nhóm lương đã tồn tại trong chi nhánh.',
        },
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_SALARY_GROUP_FAILED',
        message: 'Không thể cập nhật nhóm lương.',
      },
    },
    { status: 503 },
  );
}

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ shopId: string; groupId: string }> },
) {
  try {
    const { shopId, groupId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.manage');
    const input = saveHrmSalaryGroupSchema.parse(await request.json());
    await access.repository.updateSalaryGroup({
      id: groupId,
      auditId: `HRML-${crypto.randomUUID()}`,
      name: input.name,
      salaryType: input.salary_type,
      baseAmount: input.base_amount,
      standardWorkDays: input.standard_work_days,
      standardWorkHours: input.standard_work_hours,
      overtimeMultiplier: input.overtime_multiplier,
      recurringAllowances: input.recurring_allowances,
      isDefault: input.is_default,
      active: input.active,
      actorUserId: access.userId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}
