import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getVerticalConfig, type ResourceTemplate } from '@oni/core'
import { getUserPermissions } from '@/lib/server/permissions'
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

  const permissions = await getUserPermissions(authData.user.id, tenant.id, shop.id).catch(() => [] as string[])

  // Determine POS layout from industry type
  const resolvedIndustryType = shop.industry_type ?? tenant.industry_type ?? 'retail'
  const vertical = getVerticalConfig(resolvedIndustryType)

  const { data: subscription } = await admin
    .from('subscriptions')
    .select('status, current_period_end, plans(code, metadata)')
    .eq('tenant_id', tenant.id)
    .in('status', ['active', 'past_due', 'locked', 'deleted'])
    .maybeSingle()
  
  const planInfo = Array.isArray(subscription?.plans) ? subscription.plans[0] : subscription?.plans;
  const planCode = planInfo?.code;
  const planMetadata = planInfo?.metadata as Record<string, any> | undefined;
  const maxOrders = planMetadata?.max_orders_per_month;

  const isLocked = subscription?.status === 'locked' || subscription?.status === 'deleted'
  
  // For mini plan, only the first shop is allowed to sell. Other shops are read-only.
  let isReadOnly = isLocked;
  if (!isLocked && planCode === 'plan_mini') {
    const { data: allShops } = await admin
      .from('shops')
      .select('id')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: true })
      .limit(1)
      
    if (allShops && allShops.length > 0 && allShops[0].id !== shop.id) {
      isReadOnly = true;
    }
  }

  // Get accurate order count for the current month if maxOrders is set
  let initialMonthOrdersCount = 0;
  if (maxOrders && maxOrders > -1 && planCode === 'plan_mini') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('created_at', startOfMonth);
    initialMonthOrdersCount = count || 0;
  }

  if (vertical.posLayout === 'table_map' || vertical.posLayout === 'room_map') {
    return (
      <TableMapPOS
        key={shop.id}
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
        industryType={resolvedIndustryType}
        permissions={permissions}
        isReadOnly={isReadOnly}
        planCode={planCode}
        maxOrders={maxOrders}
        initialMonthOrdersCount={initialMonthOrdersCount}
      />
    )
  }

  return (
    <POSClient
      key={shop.id}
      shopId={shop.id}
      branchId={shop.id}
      shopName={shop.name}
      userEmail={authData.user.email ?? ''}
      backPath={backPath}
      autoPrintReceipt={autoPrintReceipt}
      mutePosSound={mutePosSound}
      permissions={permissions}
      isReadOnly={isReadOnly}
      planCode={planCode}
      maxOrders={maxOrders}
      initialMonthOrdersCount={initialMonthOrdersCount}
    />
  )
}
