import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getUserPermissions } from '@/lib/server/permissions'
import { OrdersClient } from './OrdersClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function OrdersPage({ params }: Props) {
  const { branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()
  
  // Lấy ID trực tiếp để truyền cho Client, các logic kiểm tra quyền đã nằm ở Layout
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, tenant_id')
    .eq('slug', branch)
    .maybeSingle()

  if (!shop) notFound()

  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[])

  return <OrdersClient shopId={shop.id} shopName={shop.name} permissions={permissions} />
}
