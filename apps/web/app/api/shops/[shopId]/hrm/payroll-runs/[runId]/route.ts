import { NextResponse } from 'next/server';
import { HrmPayrollRunNotFoundError } from '@oni/adapters';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { respondPayrollError } from '@/lib/server/hrm/payrollResponses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ shopId: string; runId: string }> },
) {
  try {
    const { shopId, runId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.view');
    const data = await access.repository.getPayrollRun(runId);
    if (!data) throw new HrmPayrollRunNotFoundError();
    return NextResponse.json({
      data,
      canManage: access.permissions.includes('hrm.payroll.manage'),
      canPay:
        access.permissions.includes('hrm.payroll.pay') &&
        access.permissions.includes('cashbook.manage'),
    });
  } catch (error) {
    return respondPayrollError(error);
  }
}
