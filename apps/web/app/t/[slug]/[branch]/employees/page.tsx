import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getUserPermissions } from '@/lib/server/permissions'
import { DashboardShell } from '@/app/components/layout/DashboardShell'
import { EmployeesClient } from './EmployeesClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function EmployeesPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()
  const controlPlaneOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'}`

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!tenant) notFound()

  const { data: shop } = await admin
    .from('shops_view')
    .select('*')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle()
  if (!shop) notFound()

  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('id')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  if (!tenantAccess) {
    const { data: shopAccess } = await admin
      .from('user_shops')
      .select('id')
      .eq('user_id', authData.user.id)
      .eq('shop_id', shop.id)
      .maybeSingle()
    if (!shopAccess) notFound()
  }

  const permissions = await getUserPermissions(authData.user.id, tenant.id, shop.id).catch(() => [])
  const homePath = `/${branch}`

  return (
    <DashboardShell
      tenantName={tenant.name}
      shopName={shop.name}
      userEmail={authData.user.email}
      sidebarBasePath={homePath}
      tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
      connectorsHref={`${homePath}/connectors`}
      settingsHref={`${homePath}/settings`}
      supportHref={`${homePath}/support`}
      permissions={permissions}
    >
      <EmployeesClient shopId={shop.id} shopName={shop.name} />
    </DashboardShell>
  )
}
