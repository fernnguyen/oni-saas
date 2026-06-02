import { notFound } from 'next/navigation'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { HousekeepingClient } from './HousekeepingClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function HousekeepingPage({ params }: Props) {
  const { slug, branch } = await params
  const admin = getSupabaseAdminClient()

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, industry_type')
    .eq('slug', slug)
    .maybeSingle()
  if (!tenant) notFound()

  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, industry_type')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle()
  if (!shop) notFound()

  return (
    <HousekeepingClient 
      shopId={shop.id} 
      slug={slug} 
      branch={branch}
    />
  )
}
