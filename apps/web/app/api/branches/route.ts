import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getLimitStatus } from '@/lib/server/planLimits';

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenant_id = req.nextUrl.searchParams.get('tenant_id');
  if (!tenant_id) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 });

  const admin = getSupabaseAdminClient();

  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  let branches;
  if (tenantAccess) {
    const { data, error } = await admin
      .from('shops_view')
      .select('id, name, slug, address')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    branches = data ?? [];
  } else {
    const { data: userShops } = await admin
      .from('user_shops')
      .select('shop_id')
      .eq('user_id', auth.user.id);

    const shopIds = (userShops ?? []).map((s) => s.shop_id);
    if (!shopIds.length) return NextResponse.json({ branches: [], limit: null });

    const { data, error } = await admin
      .from('shops_view')
      .select('id, name, slug, address')
      .eq('tenant_id', tenant_id)
      .in('id', shopIds)
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    branches = data ?? [];
  }

  // Limit status — only for tenant-level members (who can create branches)
  const limit = tenantAccess
    ? await getLimitStatus('create_shop', { tenantId: tenant_id }, tenant_id)
    : null;

  return NextResponse.json({ branches, limit });
}
