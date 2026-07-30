import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { respondPayrollError } from '@/lib/server/hrm/payrollResponses';
import { payPayrollRunSchema } from '@/lib/validators/hrm/payrollRuns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/shops/[shopId]/hrm/payroll-runs/[runId]/pay
 *
 * Permissions required: hrm.payroll.pay AND cashbook.manage
 *
 * Body: { fund_id: string, expected_version: number }
 *
 * Returns: { data: { payrollRun, posting } }
 *
 * Idempotent: retrying the same runId returns the existing posting
 * without creating a second cashbook transaction or deducting the fund again.
 */
export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ shopId: string; runId: string }> },
) {
  try {
    const { shopId, runId } = await params;

    // Both permissions must be present on the same user
    const access = await requireHrmAccess(shopId, [
      'hrm.payroll.pay',
      'cashbook.manage',
    ]);

    const input = payPayrollRunSchema.parse(await request.json());

    // Build period label from run — we'll derive it after fetching the run
    const existingRun = await access.repository.getPayrollRun(runId);
    if (!existingRun) {
      return NextResponse.json(
        {
          error: {
            code: 'HRM_PAYROLL_RUN_NOT_FOUND',
            message: 'Không tìm thấy kỳ lương.',
          },
        },
        { status: 404 },
      );
    }

    // Format "Bảng lương MM/YYYY" as the cashbook reference name
    const [periodYear, periodMonth] = existingRun.periodStart.split('-');
    const periodLabel = `Bảng lương ${periodMonth}/${periodYear}`;

    const result = await access.repository.payPayrollRun({
      runId,
      postingId: `HRMPST-${crypto.randomUUID()}`,
      cashbookTransactionId: `CB-HRM-${crypto.randomUUID()}`,
      fundId: input.fund_id,
      expectedVersion: input.expected_version,
      actorUserId: access.userId,
      auditId: `HRMAUD-${crypto.randomUUID()}`,
      periodLabel,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return respondPayrollError(error);
  }
}
