import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { DashboardShell } from '@/app/components/layout/DashboardShell';

interface Props {
  params: Promise<{ slug: string; branch: string; segments: string[] }>;
}

const moduleMeta: Record<string, { title: string; description: string }> = {
  products: {
    title: 'Sản phẩm',
    description: 'Quản lý danh mục hàng bán, giá niêm yết và dữ liệu đồng bộ từ Google Sheet.',
  },
  orders: {
    title: 'Đơn hàng',
    description: 'Theo dõi đơn mới, xử lý đóng gói và cập nhật trạng thái bán hàng.',
  },
  customers: {
    title: 'Khách hàng',
    description: 'Lưu hồ sơ mua hàng, thông tin liên hệ và các ghi chú chăm sóc khách.',
  },
  categories: {
    title: 'Danh mục',
    description: 'Sắp xếp cây danh mục sản phẩm để lọc bán hàng và tổ chức dữ liệu tốt hơn.',
  },
  suppliers: {
    title: 'Nhà cung cấp',
    description: 'Quản lý đầu mối nhập hàng, điều khoản thanh toán và thông tin liên hệ.',
  },
  employees: {
    title: 'Nhân viên',
    description: 'Lưu dữ liệu nhân sự bán hàng nội bộ, vai trò vận hành và trạng thái làm việc.',
  },
  inventory: {
    title: 'Kho',
    description: 'Kiểm tra tồn kho, nhập xuất và chuẩn bị các cảnh báo thiếu hàng.',
  },
  reports: {
    title: 'Báo cáo',
    description: 'Tổng hợp doanh thu, hiệu quả bán hàng và tình hình vận hành của chi nhánh.',
  },
  channels: {
    title: 'Kênh bán hàng',
    description: 'Quản lý POS, Facebook và các kênh bán mở rộng theo từng chi nhánh.',
  },
  settings: {
    title: 'Cài đặt chi nhánh',
    description: 'Cấu hình thông tin chi nhánh, nguồn dữ liệu và các tùy chọn vận hành.',
  },
  connectors: {
    title: 'Kết nối dữ liệu',
    description: 'Cấu hình Google Sheet và các nguồn dữ liệu cho chi nhánh này.',
  },
};

// Only accessible via subdomain rewrite. slug = tenant slug, branch = shop slug.
export default async function BranchSectionPage({ params }: Props) {
  const { slug, branch, segments } = await params;
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

  const homePath = `/${branch}`;
  const key = segments[0] ?? 'overview';
  const meta = moduleMeta[key] ?? {
    title: segments.map((s) => s.replace(/-/g, ' ')).join(' / ') || 'Chi nhánh',
    description: 'Module đã sẵn sàng — gắn dữ liệu thật từ connector và dựng UI nghiệp vụ ở bước tiếp theo.',
  };

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
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shop.name}</div>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">{meta.title}</h1>
            </div>
            <Link
              href={homePath}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Về tổng quan
            </Link>
          </div>
          <p className="text-sm leading-6 text-slate-600">{meta.description}</p>
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            Module đã sẵn sàng — gắn dữ liệu thật từ connector và dựng UI nghiệp vụ ở bước tiếp theo.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { href: `${homePath}/channels/pos`, label: 'Bán tại quầy' },
            { href: `${homePath}/orders`, label: 'Đơn hàng' },
            { href: `${homePath}/products`, label: 'Sản phẩm' },
            { href: `${homePath}/categories`, label: 'Danh mục' },
            { href: `${homePath}/customers`, label: 'Khách hàng' },
            { href: `${homePath}/suppliers`, label: 'Nhà cung cấp' },
            { href: `${homePath}/employees`, label: 'Nhân viên' },
            { href: `${homePath}/inventory`, label: 'Kho' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 hover:border-[#0268FF] hover:text-[#0268FF]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
