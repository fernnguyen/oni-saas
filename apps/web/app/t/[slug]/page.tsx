import { notFound, redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getShopsForTenant } from '@/lib/server/shops';
import { SignInForm } from '@/app/components/auth/SignInForm';
import type { Metadata } from 'next';
import { MapPin, ChevronRight } from 'lucide-react';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const admin = getSupabaseAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, industry_type')
    .eq('slug', slug)
    .maybeSingle();

  if (!tenant) return { title: 'Đăng nhập hệ thống ONI.vn' };

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'oni.vn';
  const siteUrl = `https://${slug}.${rootDomain}`;

  const INDUSTRY_MAP: Record<string, string> = {
    retail: 'Cửa hàng bán lẻ',
    fnb: 'Cà phê & Nhà hàng',
    billiards: 'CLB Billiards',
    sports_court: 'Sân bóng & Cầu lông',
    lodging: 'Khách sạn & Homestay',
    fashion: 'Thời trang & Phụ kiện',
    service_hourly: 'Dịch vụ thuê theo giờ',
  };

  const industryName = INDUSTRY_MAP[tenant.industry_type] || 'Cửa hàng';
  const title = `${tenant.name} – Nền tảng quản trị doanh nghiệp SME ONI.vn`;
  const description = `Cổng thông tin & POS quản lý bán hàng cho ${tenant.name} (${industryName}) trên nền tảng ONI.vn. Đăng nhập để bắt đầu bán hàng và theo dõi báo cáo doanh thu.`;

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

// Only accessible via subdomain rewrite. slug = tenant slug from subdomain.
export default async function TenantRootPage({ params }: Props) {
  const { slug } = await params;
  const admin = getSupabaseAdminClient();

  // Tenant lookup doesn't require auth — needed for personalized login screen
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (!tenant) {
    notFound();
  }

  // Auth check after tenant is known — can show personalized login if not authenticated
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return <SignInForm tenantName={tenant.name} tenantSlug={tenant.slug} />;
  }

  // Check tenant-level membership (owner/admin)
  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('id')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  // Check shop-level membership (staff/viewer assigned to specific shops)
  const { data: shopAccesses } = tenantAccess
    ? { data: null }
    : await admin
        .from('user_shops')
        .select('shop_id, shops!inner(tenant_id)')
        .eq('user_id', authData.user.id)
        .eq('shops.tenant_id', tenant.id);

  const allowedShopIds = shopAccesses?.map((s) => s.shop_id) ?? null;

  if (!tenantAccess && (!allowedShopIds || allowedShopIds.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-2">
          <p className="text-slate-900 font-medium">Không có quyền truy cập</p>
          <p className="text-slate-500 text-sm">Tài khoản của bạn chưa được thêm vào workspace này.</p>
        </div>
      </div>
    );
  }

  const allBranches = await getShopsForTenant(tenant.id);
  // Tenant-level members see all branches; shop-level members see only their assigned shops
  const branches = allowedShopIds
    ? allBranches.filter((b) => allowedShopIds.includes(b.id))
    : allBranches;

  if (branches.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500 text-sm">Workspace chưa có chi nhánh nào.</p>
        </div>
      </div>
    );
  }

  // Auto-redirect to the single branch
  if (branches.length === 1) {
    redirect(`/${branches[0].slug}`);
  }

  const tenantStyle = getBranchStyle(tenant.slug);

  // Branch selector for tenants with multiple branches
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-16 pb-12 px-6">

      <div className="w-full max-w-md">
        <div className="mb-8 text-center animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl font-black text-xl tracking-wider shadow-md border border-white/20 transition-all hover:scale-105 duration-200 ${tenantStyle.bg}`}>
            {tenant.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{tenant.name}</h1>
          <p className="mt-1.5 text-sm text-slate-500 font-medium">Chọn chi nhánh để tiếp tục làm việc</p>
        </div>
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-350">
          {branches.map((branch) => {
            const bStyle = getBranchStyle(branch.slug);
            const initial = branch.name.charAt(0).toUpperCase();
            return (
              <a
                key={branch.id}
                href={`/${branch.slug}`}
                className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-3xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 active:translate-y-0 active:scale-99 cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`h-11 w-11 rounded-2xl flex items-center justify-center text-base font-black shrink-0 shadow-3xs transition-transform duration-300 group-hover:scale-105 ${bStyle.bg}`}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-bold text-slate-800 truncate leading-tight group-hover:text-primary transition-colors">
                        {branch.name}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono font-medium truncate uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded-md">
                        {branch.slug}
                      </span>
                    </div>
                    {branch.address ? (
                      <div className="mt-2 flex items-center gap-1 text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-400 leading-normal truncate">
                          {branch.address}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1 text-slate-350">
                        <MapPin className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        <span className="text-xs text-slate-350 italic leading-normal truncate">
                          Chưa có thông tin địa chỉ
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 opacity-60 group-hover:opacity-100 group-hover:bg-primary/10 group-hover:text-primary transition-all duration-200">
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getBranchStyle(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % 7;

  const gradients = [
    { bg: 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-xs border border-indigo-400/20', text: 'text-indigo-600' },
    { bg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs border border-emerald-400/20', text: 'text-teal-600' },
    { bg: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xs border border-orange-400/20', text: 'text-orange-600' },
    { bg: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-xs border border-rose-400/20', text: 'text-pink-600' },
    { bg: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-xs border border-purple-400/20', text: 'text-fuchsia-600' },
    { bg: 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-xs border border-cyan-400/20', text: 'text-cyan-600' },
    { bg: 'bg-gradient-to-br from-slate-500 to-zinc-700 text-white shadow-xs border border-slate-400/20', text: 'text-slate-650' },
  ];
  return gradients[index];
}

