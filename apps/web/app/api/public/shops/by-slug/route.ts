import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant_slug');
    const shopSlug = req.nextUrl.searchParams.get('shop_slug');
    
    if (!tenantSlug || !shopSlug) {
      return NextResponse.json({ error: 'Missing tenant_slug or shop_slug parameter' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    
    // 1. Fetch tenant by slug to get tenant ID
    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .select('id, slug')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // 2. Fetch shop details by tenant_id and shop_slug
    const { data: shop, error: shopError } = await admin
      .from('shops')
      .select('id, tenant_id, name, slug, address, phone, logo_url, banner_url')
      .eq('tenant_id', tenant.id)
      .eq('slug', shopSlug)
      .maybeSingle();

    if (shopError || !shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
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
