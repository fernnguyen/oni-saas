import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { CashbookClient } from './CashbookClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function CashbookPage({ params }: Props) {
  const { branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()
  const { data: shop } = await admin
  .from('shops_view')
  .select('id, name, tenant_id')
  .eq('slug', branch)
  .maybeSingle()

  if (!shop) notFound()

  const { getUserPermissions } = await import('@/lib/server/permissions')
  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[])
  if (!permissions.includes('cashbook.view')) {
    const { PermissionGate } = await import('@/app/components/ui/PermissionGate')
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Sổ quỹ</h1>
        </div>
        <PermissionGate />
      </div>
    )
  }

  return <CashbookClient shopId={shop.id} shopName={shop.name} />
}
