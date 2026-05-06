import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', auth.user.id)
    .eq('is_default', true)
    .maybeSingle();

  return NextResponse.json({ tenant_id: data?.tenant_id ?? null });
}
