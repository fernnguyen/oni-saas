import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { notFound } from 'next/navigation';
import QRClientPage from './QRClientPage';

interface Props {
  params: Promise<{ shop_slug: string; table_id: string }>;
}

export default async function Page({ params }: Props) {
  const { shop_slug, table_id } = await params;
  const admin = getSupabaseAdminClient();

  // Fetch shop details by slug
  const { data: shop } = await admin
    .from('shops')
    .select('id, name, tenant_id, slug')
    .eq('slug', shop_slug)
    .maybeSingle();

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
