import { NextResponse } from 'next/server';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { respondPayrollError } from '@/lib/server/hrm/payrollResponses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/shops/[shopId]/hrm/payroll-runs/[runId]/funds
 *
 * Returns active payment funds scoped to this branch from shared PostgreSQL.
 * Does NOT call the cashbook HTTP API — reads payment_funds table directly.
 *
 * Permission required: hrm.payroll.pay
 */
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ shopId: string; runId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.pay');
    const funds = await access.repository.listPaymentFunds();
    return NextResponse.json({ data: funds });
  } catch (error) {
    return respondPayrollError(error);
  }
}
