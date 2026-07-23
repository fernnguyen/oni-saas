import { NextResponse } from 'next/server';
import { getTenantActivePlanDetails } from '@/lib/server/subscriptions';
import { getSessionUserWithTenant } from '@/lib/server/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let tenantId = searchParams.get('tenant_id');

    if (!tenantId) {
      const userRes = await getSessionUserWithTenant();
      tenantId = userRes?.tenantId ?? null;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant_id parameter' }, { status: 400 });
    }

    const details = await getTenantActivePlanDetails(tenantId);
    if (!details) {
      // Default to mini plan if no active subscription row
      return NextResponse.json({
        planCode: 'plan_mini',
        planName: 'Gói Tiên phong',
        periodStart: undefined,
        periodEnd: undefined,
      });
    }

    return NextResponse.json(details, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err: any) {
    console.error('[API /api/subscriptions] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
