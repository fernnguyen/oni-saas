import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('user_tenants')
    .select('tenants(id, name, slug)')
    .eq('user_id', auth.user.id);

  const tenants = (data ?? []).map((row: any) => row.tenants).filter(Boolean);
  return NextResponse.json({ tenants });
}
