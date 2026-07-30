import { NextResponse } from 'next/server';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { adjustPayrollItem } from '@/lib/server/hrm/payrollService';
import { respondPayrollError } from '@/lib/server/hrm/payrollResponses';
import { adjustPayrollItemSchema } from '@/lib/validators/hrm/payrollRuns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ shopId: string; runId: string; itemId: string }>;
  },
) {
  try {
    const { shopId, runId, itemId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.manage');
    const input = adjustPayrollItemSchema.parse(await request.json());
    const data = await adjustPayrollItem({
      repository: access.repository,
      runId,
      itemId,
      expectedVersion: input.expected_version,
      actorUserId: access.userId,
      adjustments: {
        additionalAllowances: input.additional_allowances,
        bonuses: input.bonuses,
        commissions: input.commissions,
        deductions: input.deductions,
      },
      manualNote: input.manual_note,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return respondPayrollError(error);
  }
}
