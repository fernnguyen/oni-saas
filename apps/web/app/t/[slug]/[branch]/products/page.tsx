import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { ProductsClient } from './ProductsClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function ProductsPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, industry_type')
    .eq('slug', branch)
    .maybeSingle()

  if (!shop) notFound()

  // Fetch industry_type and max_products
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, industry_type')
    .eq('slug', slug)
    .maybeSingle()

  const industryType = shop.industry_type ?? tenant?.industry_type ?? 'retail'

  const { data: sub } = await admin
    .from('subscriptions')
    .select('plans(metadata)')
    .eq('tenant_id', tenant?.id)
    .maybeSingle()

  const plans = sub?.plans as any;
  const planMeta = Array.isArray(plans) ? plans[0]?.metadata : plans?.metadata;
  const maxProducts = planMeta?.max_products;

  return (
    <ProductsClient
      shopId={shop.id}
      shopName={shop.name}
      industryType={industryType}
      maxProducts={maxProducts}
    />
  )
}
