import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { AccountingClient } from './AccountingClient'
import { PermissionGate } from '@/app/components/ui/PermissionGate'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function AccountingPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, tenant_id')
    .eq('slug', branch)
    .maybeSingle()

  if (!shop) notFound()

  const { getUserPermissions } = await import('@/lib/server/permissions')
  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [])
  if (!permissions.includes('accounting.view')) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Kế toán</h1>
        </div>
        <PermissionGate />
      </div>
    )
  }

  return <AccountingClient shopId={shop.id} />
}
