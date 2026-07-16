import Link from 'next/link';
import { redirect } from 'next/navigation';

import { listTenantsForCurrentUser } from '@/lib/server/tenants';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

function getProtocol() {
  return ROOT_DOMAIN.includes('localhost') ? 'http' : 'https';
}

export default async function SelectWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  const { tenants } = await listTenantsForCurrentUser();

  if (tenants.length === 0) {
    redirect('/onboarding');
  }

  if (tenants.length === 1 && intent !== 'register') {
    redirect(`${getProtocol()}://${tenants[0].slug}.${ROOT_DOMAIN}`);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm sm:p-8">
          <div className="mb-8">
            <div className="mb-4 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Workspace
            </div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              {intent === 'register' ? 'Tài khoản này đã có gian hàng' : 'Chọn gian hàng để tiếp tục'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
              {intent === 'register'
                ? 'Bạn có thể vào một gian hàng hiện có hoặc tạo gian hàng mới để bắt đầu quy trình vận hành phù hợp.'
                : 'Chúng tôi đã tìm thấy các gian hàng đang liên kết với tài khoản của bạn.'}
            </p>
          </div>

          <div className="space-y-3">
            {(tenants as Array<{ id: string; name: string; slug: string; plan_name?: string | null; shop_count?: number | null }>).map((tenant) => (
              <Link
                key={tenant.id}
                href={`${getProtocol()}://${tenant.slug}.${ROOT_DOMAIN}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-5 py-4 transition-colors hover:border-primary/30 hover:bg-slate-50"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 font-bold text-primary">
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{tenant.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {tenant.slug}.{ROOT_DOMAIN}
                      {tenant.plan_name ? ` • ${tenant.plan_name}` : ''}
                      {typeof tenant.shop_count === 'number' ? ` • ${tenant.shop_count} chi nhánh` : ''}
                    </div>
                  </div>
                </div>
                <span className="text-sm font-semibold text-primary">Vào gian hàng</span>
              </Link>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Tạo gian hàng mới
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
