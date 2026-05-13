import { listTenantsForCurrentUser } from '../../../lib/server/tenants';
import Link from 'next/link';

export default async function TenantsPage() {
  const { tenants } = await listTenantsForCurrentUser();

  if (tenants.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tổ chức</h1>
          <p className="text-sm text-slate-500 mt-0.5">Quản lý tổ chức và chi nhánh kinh doanh</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <svg className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Chưa có tổ chức nào</h3>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Tạo tổ chức để bắt đầu thêm chi nhánh, kết nối dữ liệu và quản lý đơn hàng.
          </p>
          <Link
            href="/dashboard/tenants/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Tạo tổ chức đầu tiên
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tổ chức</h1>
          <p className="text-sm text-slate-500 mt-0.5">Quản lý tổ chức và chi nhánh kinh doanh</p>
        </div>
      </div>

      <div className="space-y-3">
        {(tenants as any[]).map((t) => (
          <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-base">
                  {t.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{t.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {t.slug}.oni.vn
                    {t.plan_name && (
                      <span className="ml-2 rounded-full bg-blue-50 text-primary px-2 py-0.5 text-[10px] font-medium">
                        {t.plan_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{t.shop_count ?? 0} chi nhánh</span>
                <Link
                  href={`/dashboard/shops/new?tenant_id=${t.id}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  + Chi nhánh
                </Link>
                <Link
                  href={`/dashboard/shops?tenant_id=${t.id}`}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark transition-colors"
                >
                  Xem chi nhánh →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
