import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '../../../../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../../../../lib/server/supabaseAdmin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { enabledFeatures } = body as { enabledFeatures: string[] };

  if (!Array.isArray(enabledFeatures)) {
    return NextResponse.json({ error: 'enabledFeatures array is required' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // 1. Fetch all registered system modules in the DB to avoid violating FK constraints
  const { data: modules, error: modulesErr } = await admin
    .from('system_modules')
    .select('code');

  if (modulesErr) {
    return NextResponse.json({ error: modulesErr.message }, { status: 500 });
  }

  const validKeys = (modules || []).map((m) => m.code);

  // 2. Map all valid keys and upsert their statuses in feature_flags
  const upsertRows = validKeys.map((key) => ({
    tenant_id: id,
    key,
    enabled: enabledFeatures.includes(key),
  }));

  const { error: upsertErr } = await admin
    .from('feature_flags')
    .upsert(upsertRows, { onConflict: 'tenant_id,key' });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // 3. Log a detailed audit record
  await admin.from('audit_logs').insert({
    tenant_id: id,
    user_id: user.id,
    action: 'tenant.features_change',
    metadata: {
      enabled_features: enabledFeatures,
    },
  });

  return NextResponse.json({ ok: true });
}
