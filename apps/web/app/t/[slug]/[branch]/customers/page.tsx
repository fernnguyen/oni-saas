import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { CustomersClient } from './CustomersClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function CustomersPage({ params }: Props) {
  const { branch } = await params
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
  const { getUserPermissions } = await import('@/lib/server/permissions')
  const { data: tenantShop } = await admin
    .from('shops')
    .select('tenant_id')
    .eq('id', shop.id)
    .single()
  const permissions = tenantShop 
    ? await getUserPermissions(authData.user.id, tenantShop.tenant_id, shop.id).catch(() => [] as string[])
    : []

  return <CustomersClient shopId={shop.id} shopName={shop.name} permissions={permissions} />
}
