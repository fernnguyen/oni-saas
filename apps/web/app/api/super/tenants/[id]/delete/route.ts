import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '../../../../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../../../../lib/server/supabaseAdmin';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, slug')
    .eq('id', id)
    .maybeSingle();

  // Write log before cascade delete removes it
  await admin.from('audit_logs').insert({
    tenant_id: id,
    user_id: user.id,
    action: 'tenant.delete',
    metadata: { tenant_name: tenant?.name ?? null, tenant_slug: tenant?.slug ?? null },
  });

  // cascade deletes shops, subscriptions, feature_flags, audit_logs via FK
  const { error } = await admin.from('tenants').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
