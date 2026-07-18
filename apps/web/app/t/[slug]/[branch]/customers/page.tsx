import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
import { CustomersClientDynamic as CustomersClient } from './CustomersClientDynamic'
import { Suspense } from 'react'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function CustomersPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const { tenant, shop } = await getTenantAndShopBySlugs(slug, branch)

  if (!tenant || !shop) notFound()
  const { getUserPermissions } = await import('@/lib/server/permissions')
  const permissions = await getUserPermissions(authData.user.id, tenant.id, shop.id).catch(() => [] as string[])

  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Đang tải danh sách khách hàng...</div>}>
      <CustomersClient shopId={shop.id} shopName={shop.name} permissions={permissions} />
    </Suspense>
  )
}
