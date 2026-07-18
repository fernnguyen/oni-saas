import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
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
  const { tenant, shop } = await getTenantAndShopBySlugs(slug, branch)

  if (!tenant || !shop) notFound()

  const industryType = shop.industry_type ?? tenant?.industry_type ?? 'retail'

  const { data: sub } = await admin
    .from('subscriptions')
    .select('plans(code, metadata)')
    .eq('tenant_id', tenant?.id)
    .maybeSingle()

  const plans = sub?.plans as any;
  const planMeta = Array.isArray(plans) ? plans[0]?.metadata : plans?.metadata;
  const planCode = Array.isArray(plans) ? plans[0]?.code : plans?.code;
  const maxProducts = planMeta?.max_products;

  return (
    <ProductsClient
      shopId={shop.id}
      shopName={shop.name}
      industryType={industryType}
      maxProducts={maxProducts}
      planCode={planCode}
    />
  )
}
