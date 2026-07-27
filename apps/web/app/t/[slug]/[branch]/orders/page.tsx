import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
import { getUserPermissions } from '@/lib/server/permissions'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { OrdersClient } from './OrdersClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function OrdersPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  // Lấy ID trực tiếp để truyền cho Client, các logic kiểm tra quyền đã nằm ở Layout
  const { shop } = await getTenantAndShopBySlugs(slug, branch)

  if (!shop) notFound()

  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[])
  const admin = getSupabaseAdminClient()
  const { data: membership } = await admin.from('user_tenants').select('role_id').eq('user_id', authData.user.id).eq('tenant_id', shop.tenant_id).maybeSingle()
  const { data: role } = membership?.role_id ? await admin.from('roles').select('code').eq('id', membership.role_id).maybeSingle() : { data: null }
  const canCreateManual = role?.code === 'owner' || role?.code === 'admin'

  return (
    <OrdersClient
      shopId={shop.id}
      shopName={shop.name}
      permissions={permissions}
      canCreateManual={canCreateManual}
      manualOrderHref={`/${branch}/orders/new`}
    />
  )
}
