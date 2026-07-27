import { notFound, redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
import { ManualOrderClient } from './ManualOrderClient'

interface Props { params: Promise<{ slug: string; branch: string }> }

export default async function NewManualOrderPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect(`/auth/signin?next=${encodeURIComponent('/')}`)

  const { shop } = await getTenantAndShopBySlugs(slug, branch)
  if (!shop) notFound()
  const admin = getSupabaseAdminClient()
  const [{ data: membership }, { data: settings }] = await Promise.all([
    admin.from('user_tenants').select('role_id').eq('user_id', auth.user.id).eq('tenant_id', shop.tenant_id).maybeSingle(),
    admin.from('shop_settings').select('enable_manual_orders').eq('shop_id', shop.id).maybeSingle(),
  ])
  const { data: role } = membership?.role_id
    ? await admin.from('roles').select('code').eq('id', membership.role_id).maybeSingle()
    : { data: null }
  if ((role?.code !== 'owner' && role?.code !== 'admin') || settings?.enable_manual_orders === false) notFound()

  return <ManualOrderClient shopId={shop.id} shopName={shop.name} backHref={`/${branch}/orders`} />
}
