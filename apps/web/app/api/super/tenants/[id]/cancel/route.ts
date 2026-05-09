import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '../../../../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../../../../lib/server/supabaseAdmin';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseAdminClient();

  const { data: prev } = await admin
    .from('subscriptions')
    .select('status')
    .eq('tenant_id', id)
    .maybeSingle();

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('tenant_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('audit_logs').insert({
    tenant_id: id,
    user_id: user.id,
    action: 'tenant.cancel',
    metadata: { previous_status: prev?.status ?? null, new_status: 'canceled' },
  });

  return NextResponse.json({ ok: true });
}
