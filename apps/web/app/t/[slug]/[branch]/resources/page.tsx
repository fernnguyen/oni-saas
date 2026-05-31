import { notFound } from 'next/navigation'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { ResourcesClient } from './ResourcesClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function ResourcesPage({ params }: Props) {
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
    .select('id, industry_type')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle()
  if (!shop) notFound()

  return <ResourcesClient shopId={shop.id} industryType={shop.industry_type ?? tenant.industry_type ?? 'fnb'} />
}
