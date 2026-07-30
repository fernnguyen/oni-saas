import { NextResponse } from 'next/server';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { calculatePayrollRun } from '@/lib/server/hrm/payrollService';
import { respondPayrollError } from '@/lib/server/hrm/payrollResponses';
import { calculatePayrollRunSchema } from '@/lib/validators/hrm/payrollRuns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.view');
    return NextResponse.json({
      data: await access.repository.listPayrollRuns(),
      canManage: access.permissions.includes('hrm.payroll.manage'),
      canPay:
        access.permissions.includes('hrm.payroll.pay') &&
        access.permissions.includes('cashbook.manage'),
    });
  } catch (error) {
    return respondPayrollError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.manage');
    const input = calculatePayrollRunSchema.parse(await request.json());
    const data = await calculatePayrollRun({
      repository: access.repository,
      period: input.period,
      standardWorkDays: input.standard_work_days,
      expectedVersion: input.expected_version,
      actorUserId: access.userId,
    });
    return NextResponse.json({ data }, { status: input.expected_version ? 200 : 201 });
  } catch (error) {
    return respondPayrollError(error);
  }
}
