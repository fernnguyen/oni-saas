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
    .select('id, name')
    .eq('slug', branch)
    .maybeSingle()

  if (!shop) notFound()

  // Fetch industry_type to drive product type UI (modifier vs variant)
  const { data: tenant } = await admin
    .from('tenants')
    .select('industry_type')
    .eq('slug', slug)
    .maybeSingle()

  const industryType = tenant?.industry_type ?? 'retail'

  return (
    <ProductsClient
      shopId={shop.id}
      shopName={shop.name}
      industryType={industryType}
    />
  )
}
