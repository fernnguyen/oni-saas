import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { HousekeepingClient } from './HousekeepingClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function HousekeepingPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, industry_type')
    .eq('slug', slug)
    .maybeSingle()
  if (!tenant) notFound()

  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, tenant_id, industry_type')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle()
  if (!shop) notFound()

  const { getUserPermissions } = await import('@/lib/server/permissions')
  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[])
  if (!permissions.includes('housekeeping.view')) {
    const { PermissionGate } = await import('@/app/components/ui/PermissionGate')
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Buồng phòng & Dọn dẹp</h1>
        </div>
        <PermissionGate />
      </div>
    )
  }

  return (
    <HousekeepingClient 
      shopId={shop.id} 
      slug={slug} 
      branch={branch}
    />
  )
}
