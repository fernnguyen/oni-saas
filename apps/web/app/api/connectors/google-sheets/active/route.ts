import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { getTenantForUser } from '../../../../../lib/server/tenants';
import { getShopsForTenant } from '../../../../../lib/server/shops';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const tenant = await getTenantForUser(auth.user.id);
  if (!tenant) return NextResponse.json({ connected: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shops = await getShopsForTenant((tenant as any).id).catch(() => []);
  if (!shops.length) return NextResponse.json({ connected: false });

  const shopIds = shops.map((s: { id: string }) => s.id);

  const admin = getSupabaseAdminClient();
  const { data: connector } = await admin
    .from('connectors')
    .select('id, shop_id, type, status, config, updated_at')
    .in('shop_id', shopIds)
    .eq('type', 'google_sheets')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connector) return NextResponse.json({ connected: false });

  const shop = shops.find((s: { id: string }) => s.id === connector.shop_id) as
    | { id: string; name: string; slug: string }
    | undefined;

  return NextResponse.json({
    connected: true,
    connector_id: connector.id,
    shop_id: connector.shop_id,
    connector_type: connector.type,
    shop_name: shop?.name ?? '',
    sheet_id: connector.config?.sheet_id ?? null,
    sheet_title: connector.config?.sheet_title ?? null,
    sheet_url: connector.config?.sheet_url ?? null,
    status: connector.status,
    updated_at: connector.updated_at,
  });
}
