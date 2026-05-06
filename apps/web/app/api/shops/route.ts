import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug chỉ chứa a-z, 0-9, dấu gạch ngang'),
  address: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const json = await req.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid input', errors: parsed.error.flatten() }, { status: 400 });
  }

  const { tenant_id, name, slug, address } = parsed.data;

  // Use admin client for role check — bypasses RLS, user identity already verified above
  const admin = getSupabaseAdminClient();
  const { data: membership } = await admin
    .from('user_tenants')
    .select('roles(code)')
    .eq('user_id', auth.user.id)
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  const roleCode = (membership?.roles as any)?.code;
  if (!roleCode || !['owner', 'admin'].includes(roleCode)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await admin.rpc('create_shop', {
    p_tenant_id: tenant_id,
    p_name: name,
    p_slug: slug,
    p_address: address ?? null,
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ shop: data }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const tenant_id = req.nextUrl.searchParams.get('tenant_id');
  if (!tenant_id) return NextResponse.json({ message: 'tenant_id required' }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('shops_view')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ shops: data ?? [] });
}
