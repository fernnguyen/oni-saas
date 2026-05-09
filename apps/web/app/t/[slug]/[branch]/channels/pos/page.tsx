import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { POSClientDynamic as POSClient } from './POSClientDynamic'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function POSPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent(`/t/${slug}/${branch}/channels/pos`)}`)
  }

  const admin = getSupabaseAdminClient()

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

  const backPath = `/${branch}`

  return (
    <POSClient
      shopId={shop.id}
      branchId={shop.id}
      shopName={shop.name}
      userEmail={authData.user.email ?? ''}
      backPath={backPath}
    />
  )
}
