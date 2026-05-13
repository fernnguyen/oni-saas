import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';

interface SearchParams {
  q?: string;
}

export default async function SuperUsers({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q } = await searchParams;
  const admin = getSupabaseAdminClient();

  type UserResult = {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    app_metadata: Record<string, unknown>;
  };

  let users: UserResult[] = [];
  let errorMsg = '';

  if (q && q.trim().length > 0) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 });
    if (error) {
      errorMsg = error.message;
    } else {
      users = (data.users as any[])
        .filter((u) =>
          u.email?.toLowerCase().includes(q.toLowerCase()) ||
          u.id?.toLowerCase().includes(q.toLowerCase()),
        )
        .slice(0, 20);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tìm người dùng</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tìm kiếm theo email hoặc user ID</p>
      </div>

      <form method="GET" className="flex gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Email hoặc user ID..."
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          Tìm
        </button>
      </form>

      {errorMsg && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {q && users.length === 0 && !errorMsg && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-8 text-center text-sm text-slate-400">
          Không tìm thấy người dùng nào cho &ldquo;{q}&rdquo;
        </div>
      )}

      {users.length > 0 && (
        <div className="space-y-3">
          {users.map((user) => {
            const isSuperAdmin = user.app_metadata?.role === 'super_admin';
            return (
              <UserRow key={user.id} user={user} isSuperAdmin={isSuperAdmin} admin={admin} />
            );
          })}
        </div>
      )}

      {!q && (
        <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
          Nhập email để bắt đầu tìm kiếm
        </div>
      )}
    </div>
  );
}

async function UserRow({
  user,
  isSuperAdmin,
  admin,
}: {
  user: { id: string; email: string; created_at: string; last_sign_in_at: string | null };
  isSuperAdmin: boolean;
  admin: ReturnType<typeof getSupabaseAdminClient>;
}) {
  const { data: tenants } = await admin
    .from('user_tenants')
    .select('tenant_id, tenants(name, slug), roles(code)')
    .eq('user_id', user.id);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{user.email}</span>
            {isSuperAdmin && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                super_admin
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">{user.id}</div>
        </div>
        <div className="text-xs text-slate-400 text-right">
          <div>Tạo: {new Date(user.created_at).toLocaleDateString('vi-VN')}</div>
          {user.last_sign_in_at && (
            <div>Login: {new Date(user.last_sign_in_at).toLocaleDateString('vi-VN')}</div>
          )}
        </div>
      </div>

      {(tenants ?? []).length > 0 && (
        <div>
          <div className="text-xs text-slate-400 mb-1.5">Tổ chức</div>
          <div className="flex flex-wrap gap-2">
            {(tenants as any[]).map((t) => (
              <span key={t.tenant_id} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                <span className="font-mono">{t.tenants?.slug}</span>
                <span className="text-slate-400">·</span>
                <span>{t.roles?.code}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
