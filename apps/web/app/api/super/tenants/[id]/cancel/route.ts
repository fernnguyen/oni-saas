import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '../../../../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../../../../lib/server/supabaseAdmin';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('tenant_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
