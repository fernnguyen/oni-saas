import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { InventoryClient } from './InventoryClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function InventoryPage({ params }: Props) {
  const { branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()
  const { data: shop } = await admin
    .from('shops')
    .select('id, name, tenant_id')
    .eq('slug', branch)
    .maybeSingle()
    
  if (!shop) notFound()

  const { data: subscription } = await admin
    .from('subscriptions')
    .select('plans(code)')
    .eq('tenant_id', shop.tenant_id)
    .maybeSingle()

  const planCode = Array.isArray(subscription?.plans) ? subscription?.plans[0]?.code : subscription?.plans?.code;

  return <InventoryClient shopId={shop.id} shopName={shop.name} planCode={planCode} />
}
