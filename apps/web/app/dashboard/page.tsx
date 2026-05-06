import { getSessionUserWithTenant } from '../../lib/server/auth';
import { getShopsForTenant } from '../../lib/server/shops';
import Link from 'next/link';

export default async function DashboardHome() {
  const ctx = await getSessionUserWithTenant();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = ctx?.tenant as unknown as { id: string; name: string } | null;
  const shops = tenant ? await getShopsForTenant(tenant.id).catch(() => []) : [];

  // Empty state: no tenant yet
  if (!tenant) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0268FF]/10">
          <svg className="h-8 w-8 text-[#0268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Chào mừng đến ONI.vn</h2>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Bạn chưa có tổ chức nào. Tạo tổ chức để bắt đầu quản lý cửa hàng, đơn hàng và sản phẩm.
        </p>
        <Link
          href="/dashboard/tenants/new"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0268FF] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0256CC] transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tạo tổ chức đầu tiên
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tổng quan</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Xin chào, {ctx?.user?.email?.split('@')[0] ?? 'bạn'} 👋
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Đơn hàng hôm nay', value: '—', bg: 'bg-blue-50', text: 'text-blue-700', emoji: '📦' },
          { label: 'Doanh thu hôm nay', value: '—', bg: 'bg-green-50', text: 'text-green-700', emoji: '💰' },
          { label: 'Sản phẩm', value: '—', bg: 'bg-purple-50', text: 'text-purple-700', emoji: '🏷️' },
          { label: 'Chi nhánh', value: String(shops.length), bg: 'bg-orange-50', text: 'text-orange-700', emoji: '🏪' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-xl mb-3 ${stat.bg} ${stat.text}`}>
              {stat.emoji}
            </div>
            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Chi nhánh — {tenant.name}</h2>
            <Link
              href={`/dashboard/shops/new?tenant_id=${tenant.id}`}
              className="text-xs font-medium text-[#0268FF] hover:underline"
            >
              + Thêm chi nhánh
            </Link>
          </div>
          {shops.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm text-slate-400 mb-3">Chưa có chi nhánh nào</p>
              <Link
                href={`/dashboard/shops/new?tenant_id=${tenant.id}`}
                className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] transition-colors"
              >
                Tạo chi nhánh đầu tiên
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {(shops as any[]).map((shop) => (
                <div key={shop.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0268FF]/10 text-[#0268FF] font-bold text-xs">
                      {shop.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-700">{shop.name}</div>
                      <div className="text-xs text-slate-400">{shop.slug}</div>
                    </div>
                  </div>
                  <Link href="/dashboard/connectors" className="text-xs text-[#0268FF] hover:underline">
                    Quản lý →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 flex flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#0268FF]/10">
            <svg className="h-6 w-6 text-[#0268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="font-semibold text-slate-700">Kết nối Google Sheets</h3>
          <p className="text-sm text-slate-400 mt-1 mb-4">Đồng bộ sản phẩm & đơn hàng từ bảng tính</p>
          <Link
            href="/dashboard/connectors"
            className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] transition-colors"
          >
            Thiết lập ngay
          </Link>
        </div>
      </div>
    </div>
  );
}
