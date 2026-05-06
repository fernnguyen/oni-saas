import { listTenantsForCurrentUser } from '../../../lib/server/tenants';
import Link from 'next/link';

export default async function TenantsPage() {
  const { tenants } = await listTenantsForCurrentUser();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gian hàng</h1>
        <Link href="/dashboard/tenants/new" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          + Tạo gian hàng
        </Link>
      </div>
      <ul className="space-y-2">
        {tenants.map((t) => (
          <li key={t.id} className="rounded border p-3">
            <div className="font-medium">{t.name}</div>
            <div className="text-xs text-slate-500">{t.primaryDomain ?? `${t.slug}.oni.vn`}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
