import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getTenantForUser } from '@/lib/server/tenants';
import { getShopsForTenant } from '@/lib/server/shops';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const tenant = await getTenantForUser(auth.user.id);
  if (!tenant) return NextResponse.json({ connected: false });

  const admin = getSupabaseAdminClient();
  const { data: connector } = await admin
    .from('connectors')
    .select('id, type, status, config, updated_at')
    .eq('tenant_id', tenant.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connector) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    connector_id: connector.id,
    connector_type: connector.type,
    sheet_title: connector.config?.sheet_title ?? null,
    sheet_url: connector.config?.sheet_url ?? null,
    status: connector.status,
    updated_at: connector.updated_at,
  });
}
