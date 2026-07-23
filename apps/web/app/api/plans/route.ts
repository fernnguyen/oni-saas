import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

const getCachedPlans = unstable_cache(
  async () => {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('plans')
      .select('id, code, name, price_monthly, price_yearly, metadata')
      .order('id', { ascending: true });

    if (error) {
      console.error('[API /api/plans] Error fetching plans:', error);
      return [];
    }
    return data || [];
  },
  ['public_plans_list'],
  { tags: ['plans'], revalidate: 3600 }
);

export async function GET() {
  try {
    const plans = await getCachedPlans();
    return NextResponse.json(plans, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err: any) {
    console.error('[API /api/plans] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
