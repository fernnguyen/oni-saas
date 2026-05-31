import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { DashboardShell } from '@/app/components/layout/DashboardShell';
import type { Metadata } from 'next';
import { checkFeatureAccess } from '@/lib/server/features';
import { NotificationProvider } from '@/app/components/notifications/NotificationContext';
import QRNotificationCenter from './channels/pos/components/QRNotificationCenter';
import { ShiftProvider } from '@/app/components/providers/ShiftProvider';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, branch } = await params;
  const admin = getSupabaseAdminClient();
  
  // Fetch tenant info
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, industry_type')
    .eq('slug', slug)
    .maybeSingle();

  // Fetch shop/branch info
  const { data: shop } = await admin
    .from('shops_view')
    .select('name, industry_type')
    .eq('slug', branch)
    .eq('tenant_id', tenant?.id)
    .maybeSingle();

  if (!tenant || !shop) return { title: 'ONI.vn' };

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'oni.vn';
  const siteUrl = `https://${slug}.${rootDomain}/${branch}`;

  const INDUSTRY_MAP: Record<string, string> = {
    retail: 'Cửa hàng bán lẻ',
    fnb: 'Cà phê & Nhà hàng',
    billiards: 'CLB Billiards',
    sports_court: 'Sân bóng & Cầu lông',
    lodging: 'Khách sạn & Homestay',
    fashion: 'Thời trang & Phụ kiện',
    service_hourly: 'Dịch vụ thuê theo giờ',
  };

  const resolvedIndustry = shop?.industry_type ?? tenant?.industry_type ?? 'retail';
  const industryName = INDUSTRY_MAP[resolvedIndustry] || 'Cửa hàng';
  const title = `${shop.name} | ${tenant.name} – Nền tảng quản trị doanh nghiệp SME ONI.vn`;
  const description = `Hệ thống POS, quản lý kho hàng và báo cáo doanh thu cho chi nhánh ${shop.name} thuộc chuỗi ${tenant.name} (${industryName}) trên nền tảng ONI.vn.`;

  return {
    title,
    description,
    openGraph: {
      type: 'website',
      url: siteUrl,
      title,
      description,
      siteName: 'ONI.vn',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function BranchLayout({ params, children }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`);
  }

  const admin = getSupabaseAdminClient();
  const controlPlaneOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'}`;

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug, industry_type')
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
    .select('id, roles(name)')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  let roleName = '';

  if (!tenantAccess) {
    const { data: shopAccess } = await admin
      .from('user_shops')
      .select('id, roles(name)')
      .eq('user_id', authData.user.id)
      .eq('shop_id', shop.id)
      .maybeSingle();
    if (!shopAccess) notFound();
    // @ts-ignore
    roleName = Array.isArray(shopAccess.roles) ? shopAccess.roles[0]?.name : shopAccess.roles?.name;
  } else {
    // @ts-ignore
    roleName = Array.isArray(tenantAccess.roles) ? tenantAccess.roles[0]?.name : tenantAccess.roles?.name;
  }

  const permissions = await getUserPermissions(authData.user.id, tenant.id, shop.id).catch(() => [] as string[]);
  const homePath = `/${branch}`;

  // Lấy thông tin gói cước
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('current_period_start, current_period_end, plans(code, name)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .maybeSingle();

  let planCode = '';
  let planName = '';
  let periodStart = undefined;
  let periodEnd = undefined;

  if (subscription && subscription.plans) {
    const p = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
    planCode = p.code;
    planName = p.name;
    periodStart = subscription.current_period_start;
    periodEnd = subscription.current_period_end;
  }

  const displayName: string =
    (authData.user.user_metadata?.display_name as string | undefined) ??
    (authData.user.user_metadata?.full_name as string | undefined) ??
    '';

  const hasP2pAccess = await checkFeatureAccess(tenant.id, 'warehouse_p2p');

  return (
    <NotificationProvider shopId={shop.id} tenantId={tenant.id}>
      <DashboardShell
        tenantId={tenant.id}
        hasP2pAccess={hasP2pAccess}
        tenantName={tenant.name}
        shopName={shop.name}
        userEmail={authData.user.email}
        displayName={displayName || undefined}
        roleName={roleName || undefined}
        sidebarBasePath={homePath}
        tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
        connectorsHref={`${homePath}/connectors`}
        settingsHref={`${homePath}/settings`}
        tenantBillingHref={`/billing`}
        tenantSettingsHref={`/settings`}
        tenantTeamHref={`/team`}
        tenantRolesHref={`/roles`}
        accountHref={`${homePath}/account`}
        supportHref={`${homePath}/support`}
        permissions={permissions}
        planCode={planCode}
        planName={planName}
        periodStart={periodStart}
        periodEnd={periodEnd}
        currentBranchSlug={branch}
        currentBranchAddress={shop.address}
        industryType={shop?.industry_type ?? tenant.industry_type}
      >
        <ShiftProvider
          shopId={shop.id}
          branchId={shop.id}
          userEmail={authData.user.email || ''}
          permissions={permissions}
        >
          {children}
        </ShiftProvider>
      </DashboardShell>
      <QRNotificationCenter
        shopId={shop.id}
        branchId={shop.id}
        isGlobalDrawer={true}
      />
    </NotificationProvider>
  );
}
