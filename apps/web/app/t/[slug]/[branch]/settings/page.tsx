import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { ShopSettingsForm } from '@/app/components/settings/ShopSettingsForm';
import { PermissionGate } from '@/app/components/ui/PermissionGate';
import { getTenantPlanMeta } from '@/lib/server/subscriptions';
import { listRoles } from '@/lib/server/roles';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

export default async function BranchSettingsPage({ params }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`);
  }

  const admin = getSupabaseAdminClient();
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, slug, address, tenant_id, industry_type')
    .eq('slug', branch)
    .maybeSingle();

  if (!shop) notFound();

  // Fetch tenant to get the industry_type
  const { data: tenant } = await admin
    .from('tenants')
    .select('industry_type')
    .eq('id', shop.tenant_id)
    .maybeSingle();

  const permissions: string[] = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[]);
  if (!permissions.includes('settings.view') && !permissions.includes('shops.view') && !permissions.includes('shops.manage')) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt chi nhánh</h1>
        </div>
        <PermissionGate />
      </div>
    );
  }
  const shopId: string = shop.id;

  const planMeta = await getTenantPlanMeta(shop.tenant_id);
  const canUsePushNotify = !!planMeta?.can_use_push_notify;
  const canUseCustomNotify = !!planMeta?.can_use_custom_notify;

  const [settingsResult, shopResult, channelsResult, eventsResult, roles] = await Promise.all([
    admin.from('shop_settings').select('*').eq('shop_id', shopId).maybeSingle(),
    admin.from('shops').select('phone').eq('id', shopId).maybeSingle(),
    admin.from('tenant_notification_channels').select('config').eq('shop_id', shopId).eq('provider', 'telegram').eq('is_active', true).maybeSingle(),
    admin.from('tenant_notification_events').select('event_name, is_enabled, channels_config').eq('shop_id', shopId),
    listRoles(shop.tenant_id).catch(() => [])
  ]);

  const canManage =
    permissions.includes('settings.manage') || permissions.includes('shops.manage');

  const defaultSettings = {
    shop_id: shopId,
    shop_name: shop.name as string,
    currency: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    tax_rate: 0,
    invoice_prefix: 'ORD',
    low_stock_threshold: 5,
    allow_negative_stock: true,
    auto_print_receipt: true,
    mute_pos_sound: false,
    default_price_type: 'retail',
    qr_auto_approve_session: false,
    synced_from_sheet_at: null as string | null,
    updated_at: new Date().toISOString(),
  };

  const { checkFeatureAccess } = await import('@/lib/server/features');
  const hasCrmAccess = await checkFeatureAccess(shop.tenant_id, 'crm');

  const settings = {
    ...(settingsResult.data ?? defaultSettings),
    has_crm_access: hasCrmAccess
  };

  const eventsConfig = (eventsResult.data || []).reduce((acc: any, curr: any) => {
    acc[curr.event_name] = {
      is_enabled: curr.is_enabled,
      channels_config: curr.channels_config
    };
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shop.name}</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt chi nhánh</h1>
        <p className="text-sm text-slate-500 mt-0.5">Cấu hình thông tin chi nhánh và bán hàng</p>
      </div>
      <ShopSettingsForm
        shop={{ id: shopId, name: shop.name, slug: shop.slug, address: shop.address ?? null, phone: shopResult.data?.phone ?? null }}
        settings={settings}
        canManage={canManage}
        permissions={permissions}
        industryType={shop?.industry_type ?? tenant?.industry_type ?? 'retail'}
        tenantId={shop.tenant_id}
        slug={slug}
        canUsePushNotify={canUsePushNotify}
        canUseCustomNotify={canUseCustomNotify}
        telegramConfig={channelsResult.data?.config as any}
        eventsConfig={eventsConfig}
        roles={roles}
      />
    </div>
  );
}
