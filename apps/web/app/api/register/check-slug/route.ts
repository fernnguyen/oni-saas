import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')?.toLowerCase().trim();
  if (!slug || slug.length < 2) {
    return NextResponse.json({ available: false, message: 'Slug quá ngắn' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ available: false, message: 'Chỉ dùng chữ thường, số và dấu gạch ngang' });
  }

  const admin = getSupabaseAdminClient();
  const [{ count: tenantCount }, { count: shopCount }] = await Promise.all([
    admin.from('tenants').select('*', { count: 'exact', head: true }).eq('slug', slug),
    admin.from('shops').select('*',   { count: 'exact', head: true }).eq('slug', slug),
  ]);

  const taken = (tenantCount ?? 0) > 0 || (shopCount ?? 0) > 0;
  return NextResponse.json({ available: !taken });
}
