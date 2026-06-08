import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import QRClientPage from './QRClientPage';

interface Props {
  params: Promise<{ shop_slug: string; table_id: string }>;
}

function extractSubdomain(host: string, rootDomain: string): string | null {
  const cleanRoot = rootDomain.replace(/^https?:\/\//, '');
  const rootBase = cleanRoot.split(':')[0];
  const hostBase = host.split(':')[0];
  if (hostBase === rootBase) return null;
  if (!hostBase.endsWith(`.${rootBase}`)) return null;
  const sub = hostBase.slice(0, hostBase.length - rootBase.length - 1);
  return sub === 'www' || sub === '' ? null : sub;
}

export default async function Page({ params }: Props) {
  const { shop_slug, table_id } = await params;
  const admin = getSupabaseAdminClient();

  // Get host header to extract tenant subdomain
  const headerStore = await headers();
  const host = headerStore.get('host') ?? '';
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const tenantSlug = extractSubdomain(host, rootDomain);

  let shop = null;

  if (tenantSlug) {
    // 1. Fetch tenant ID by slug
    const { data: tenant } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (tenant) {
      // 2. Fetch shop details by tenant_id and shop_slug
      const { data: s } = await admin
        .from('shops')
        .select('id, name, tenant_id, slug')
        .eq('tenant_id', tenant.id)
        .eq('slug', shop_slug)
        .maybeSingle();
      shop = s;
    }
  }

  // Fallback if tenant subdomain is not found or not matched (e.g. running on localhost without subdomains)
  if (!shop) {
    const { data: s } = await admin
      .from('shops')
      .select('id, name, tenant_id, slug')
      .eq('slug', shop_slug)
      .maybeSingle();
    shop = s;
  }

  if (!shop) {
    return notFound();
  }

  return (
    <QRClientPage
      shopId={shop.id}
      shopName={shop.name}
      tenantId={shop.tenant_id}
      shopSlug={shop.slug}
      resourceId={table_id}
    />
  );
}
