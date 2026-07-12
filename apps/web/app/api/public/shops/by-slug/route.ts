import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug parameter' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    
    // Fetch shop details by slug
    const { data: shop, error: shopError } = await admin
      .from('shops')
      .select('id, tenant_id, name, slug, address, phone, logo_url, banner_url')
      .eq('slug', slug)
      .maybeSingle();

    if (shopError || !shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Resolve the tenant's slug for subdomain routing
    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .select('slug')
      .eq('id', shop.tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...shop,
      tenant_slug: tenant.slug
    });
  } catch (err: any) {
    console.error('[GET api/public/shops/by-slug]', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
