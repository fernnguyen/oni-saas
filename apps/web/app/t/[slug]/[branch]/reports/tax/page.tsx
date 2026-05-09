import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { TaxClient } from './TaxClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function TaxPage({ params }: Props) {
  const { branch } = await params
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

  // Kiểm tra plan ở server để render đúng ngay lần đầu
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plans(code)')
    .eq('tenant_id', shop.tenant_id)
    .eq('status', 'active')
    .maybeSingle()

  const planCode = sub?.plans
    ? (Array.isArray(sub.plans) ? (sub.plans[0] as { code: string }).code : (sub.plans as { code: string }).code)
    : ''

  const hasAccess = planCode === 'plan_pro' || planCode === 'plan_enterprise'

  return <TaxClient shopId={shop.id} hasAccess={hasAccess} />
}
