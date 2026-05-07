import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { DashboardShell } from '@/app/components/layout/DashboardShell';
import { ShopSettingsForm } from '@/app/components/settings/ShopSettingsForm';

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
  const controlPlaneOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'}`;

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (!tenant) notFound();

  const { data: shop } = await admin
    .from('shops_view')
    .select('*')
    .eq('slug', branch)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!shop) notFound();

  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('id')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!tenantAccess) {
    const { data: shopAccess } = await admin
      .from('user_shops')
      .select('id')
      .eq('user_id', authData.user.id)
      .eq('shop_id', shop.id)
      .maybeSingle();
    if (!shopAccess) notFound();
  }

  const permissions = await getUserPermissions(authData.user.id, tenant.id, shop.id).catch(() => []);

  const shopId: string = shop.id;
  const homePath = `/${branch}`;

  const [settingsResult, connectorResult] = await Promise.all([
    admin.from('shop_settings').select('*').eq('shop_id', shopId).maybeSingle(),
    admin
      .from('connectors')
      .select('id, shop_id, status, config, updated_at')
      .eq('shop_id', shopId)
      .eq('type', 'google_sheets')
      .maybeSingle(),
  ]);

  const canManage =
    permissions.includes('connectors.manage') || permissions.includes('settings.manage');

  const defaultSettings = {
    shop_id: shopId,
    shop_name: shop.name as string,
    currency: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    tax_rate: 0,
    invoice_prefix: 'ORD',
    low_stock_threshold: 5,
    allow_negative_stock: false,
    default_price_type: 'retail',
    synced_from_sheet_at: null as string | null,
    updated_at: new Date().toISOString(),
  };

  const settings = settingsResult.data ?? defaultSettings;
  const connectorRaw = connectorResult.data;
  const connector = connectorRaw
    ? {
        connector_id: connectorRaw.id as string,
        shop_id: connectorRaw.shop_id as string,
        shop_name: shop.name as string,
        sheet_id: (connectorRaw.config?.sheet_id as string) ?? '',
        sheet_title: (connectorRaw.config?.sheet_title as string) ?? 'Google Sheet',
        sheet_url: (connectorRaw.config?.sheet_url as string) ?? '',
        status: connectorRaw.status as string,
        updated_at: connectorRaw.updated_at as string,
      }
    : null;

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
      <div className="space-y-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shop.name}</div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt chi nhánh</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cấu hình thông tin chi nhánh, bán hàng và kết nối dữ liệu</p>
        </div>
        <ShopSettingsForm
          shop={{ id: shopId, name: shop.name, slug: shop.slug, address: shop.address ?? null }}
          settings={settings}
          connector={connector}
          canManage={canManage}
        />
      </div>
    </DashboardShell>
  );
}
