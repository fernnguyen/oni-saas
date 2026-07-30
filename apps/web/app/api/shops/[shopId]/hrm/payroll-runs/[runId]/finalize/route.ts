import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { respondPayrollError } from '@/lib/server/hrm/payrollResponses';
import { finalizePayrollRunSchema } from '@/lib/validators/hrm/payrollRuns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ shopId: string; runId: string }> },
) {
  try {
    const { shopId, runId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.manage');
    const input = finalizePayrollRunSchema.parse(await request.json());
    const data = await access.repository.finalizePayrollRun({
      runId,
      expectedVersion: input.expected_version,
      actorUserId: access.userId,
      auditId: `HRMAUD-${crypto.randomUUID()}`,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return respondPayrollError(error);
  }
}
