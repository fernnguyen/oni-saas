import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getVerticalConfig, type ResourceTemplate } from '@oni/core'
import { POSClientDynamic as POSClient } from './POSClientDynamic'
import { TableMapPOS } from './components/TableMapPOS'

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
    .select('id, name, slug, industry_type')
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

  const { data: settings } = await admin
    .from('shop_settings')
    .select('auto_print_receipt, mute_pos_sound')
    .eq('shop_id', shop.id)
    .maybeSingle()

  const autoPrintReceipt = settings?.auto_print_receipt ?? true
  const mutePosSound = settings?.mute_pos_sound ?? false
  const backPath = `/${branch}`

  // Determine POS layout from industry type
  const vertical = getVerticalConfig(tenant.industry_type ?? 'retail')

  if (vertical.posLayout === 'table_map' || vertical.posLayout === 'room_map') {
    return (
      <TableMapPOS
        shopId={shop.id}
        branchId={shop.id}
        shopName={shop.name}
        userEmail={authData.user.email ?? ''}
        backPath={backPath}
        resourceLabel={vertical.resourceLabel ?? 'Vị trí'}
        resourceType={vertical.resourceType ?? 'table'}
        posLabel={vertical.posLabel}
        hasHourlyBilling={vertical.features.hourly_billing}
        autoPrintReceipt={autoPrintReceipt}
        mutePosSound={mutePosSound}
        resourceTemplate={vertical.resourceTemplate}
      />
    )
  }

  return (
    <POSClient
      shopId={shop.id}
      branchId={shop.id}
      shopName={shop.name}
      userEmail={authData.user.email ?? ''}
      backPath={backPath}
      autoPrintReceipt={autoPrintReceipt}
      mutePosSound={mutePosSound}
    />
  )
}
