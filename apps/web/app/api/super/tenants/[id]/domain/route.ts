import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '../../../../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../../../../lib/server/supabaseAdmin';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { slug, shop_id } = body as { slug?: string; shop_id?: string };

  if (!slug || !shop_id) {
    return NextResponse.json({ error: 'slug và shop_id là bắt buộc' }, { status: 400 });
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'oni.vn';
  const domain = `${slug}.${rootDomain}`;

  const admin = getSupabaseAdminClient();

  // Verify shop belongs to tenant
  const { data: shop } = await admin
    .from('shops')
    .select('id')
    .eq('id', shop_id)
    .eq('tenant_id', id)
    .single();

  if (!shop) {
    return NextResponse.json({ error: 'Shop không thuộc tenant này' }, { status: 403 });
  }

  const { error } = await admin.from('domains').insert({ shop_id, domain, is_primary: false });

  if (error) {
    const msg = error.code === '23505' ? 'Domain này đã tồn tại' : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, domain });
}
