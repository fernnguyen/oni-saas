import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getShopBySlug, assertUserShopAccess } from '../../../../lib/server/shops';
import { getUserPermissions } from '../../../../lib/server/permissions';
import { DashboardShell } from '../../../components/layout/DashboardShell';
import type { Metadata } from 'next';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

interface Props {
  params: Promise<{ slug: string; segments: string[] }>;
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
    title: 'Cài đặt',
    description: 'Cấu hình thông tin chi nhánh, nguồn dữ liệu và các tùy chọn vận hành.',
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, segments } = await params;
  const admin = getSupabaseAdminClient();
  const { data: shop } = await admin.from('shops_view').select('name').eq('slug', slug).maybeSingle();
  if (!shop) return { title: 'ONI.vn' };

  const key = segments[0] ?? 'overview';
  const meta = moduleMeta[key] ?? { title: segments.map(s => s.replace(/-/g, ' ')).join(' / ') || 'Chi nhánh' };

  return { title: `${meta.title} - ${shop.name} | ONI.vn` };
}

export default async function ShopSectionPage({ params }: Props) {
  const { slug, segments } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const headerStore = await headers();
  const host = headerStore.get('host') ?? '';
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const subdomain = extractSubdomain(host, rootDomain);
  const homePath = subdomain ? '/' : `/s/${slug}`;
  const controlPlaneOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? `http://${rootDomain}`;

  if (!authData.user) {
    const nextPath = extractSubdomain(host, rootDomain) ? `/${segments.join('/')}` : `/s/${slug}/${segments.join('/')}`;
    redirect(`/auth/signin?next=${encodeURIComponent(nextPath)}`);
  }

  const shop = await getShopBySlug(slug);
  if (!shop) redirect('/dashboard');

  const hasAccess = await assertUserShopAccess(authData.user.id, shop.id);
  if (!hasAccess) redirect('/dashboard');

  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[]);

  const key = segments[0] ?? 'overview';
  const meta = moduleMeta[key] ?? {
    title: segments.map((segment) => segment.replace(/-/g, ' ')).join(' / ') || 'Chi nhánh',
    description: 'Module này đã được mở route trong không gian chi nhánh và sẵn sàng nối tiếp phần nghiệp vụ.',
  };

  return (
    <DashboardShell
      tenantName={shop.name}
      shopName={shop.name}
      userEmail={authData.user.email}
      sidebarBasePath={homePath}
      tenantHref={`${controlPlaneOrigin}/dashboard/tenants`}
      connectorsHref={`${homePath === '/' ? '' : homePath}/connectors` || '/connectors'}
      settingsHref={`${homePath === '/' ? '' : homePath}/settings` || '/settings'}
      supportHref={`${homePath === '/' ? '' : homePath}/support` || '/support'}
      permissions={permissions}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shop.name}</div>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">{meta.title}</h1>
            </div>
            <Link href={homePath} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Về tổng quan shop
            </Link>
          </div>
          <p className="text-sm leading-6 text-slate-600">{meta.description}</p>
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            Phần điều hướng cho module này đã sẵn sàng trong không gian riêng của chi nhánh. Bước tiếp theo là gắn dữ liệu thật từ connector và dựng UI nghiệp vụ chi tiết.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <QuickLink href={`${homePath === '/' ? '' : homePath}/orders` || '/orders'} label="Đơn hàng" />
          <QuickLink href={`${homePath === '/' ? '' : homePath}/products` || '/products'} label="Sản phẩm" />
          <QuickLink href={`${homePath === '/' ? '' : homePath}/inventory` || '/inventory'} label="Kho" />
          <QuickLink href={`${homePath === '/' ? '' : homePath}/customers` || '/customers'} label="Khách hàng" />
          <QuickLink href={`${homePath === '/' ? '' : homePath}/channels/pos` || '/channels/pos'} label="Bán tại quầy" />
          <QuickLink href={`${homePath === '/' ? '' : homePath}/reports` || '/reports'} label="Báo cáo" />
        </div>
      </div>
    </DashboardShell>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 hover:border-primary hover:text-primary">
      {label}
    </Link>
  );
}

function extractSubdomain(host: string, rootDomain: string): string | null {
  if (host === rootDomain) return null;
  if (!host.endsWith(`.${rootDomain}`)) return null;
  const sub = host.slice(0, host.length - rootDomain.length - 1);
  if (sub === 'www') return null;
  return sub || null;
}
