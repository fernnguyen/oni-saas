import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
import { InventoryClient } from './InventoryClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function InventoryPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()
  const { shop } = await getTenantAndShopBySlugs(slug, branch)
    
  if (!shop) notFound()

  const { data: subscription } = await admin
    .from('subscriptions')
    .select('plans(code)')
    .eq('tenant_id', shop.tenant_id)
    .maybeSingle()

  const plans = subscription?.plans as any;
  const planCode = Array.isArray(plans) ? plans[0]?.code : plans?.code;

  return <InventoryClient shopId={shop.id} shopName={shop.name} planCode={planCode} />
}
