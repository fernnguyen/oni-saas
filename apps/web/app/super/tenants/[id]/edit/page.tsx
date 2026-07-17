import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { getSuperAdminUser } from '../../../../../lib/server/auth';
import { TenantMembersAdminCard } from '../TenantMembersAdminCard';
import { loadTenantMemberSummaries } from '../memberDirectory';

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSuperAdminUser();
  if (!user) redirect('/auth/signin');

  const { id } = await params;
  const admin = getSupabaseAdminClient();

  const [{ data: tenant, error }, memberSummaries] = await Promise.all([
    admin.from('tenants').select('*').eq('id', id).single(),
    loadTenantMemberSummaries(id),
  ]);
  if (error || !tenant) notFound();

  async function handleUpdate(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    const slug = formData.get('slug') as string;
    if (!name || !slug) return;

    const a = getSupabaseAdminClient();
    await a.from('tenants').update({ name, slug, updated_at: new Date().toISOString() }).eq('id', id);
    redirect(`/super/tenants/${id}`);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/super/tenants" className="hover:text-slate-600">Tenants</Link>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <Link href={`/super/tenants/${id}`} className="hover:text-slate-600 truncate max-w-xs">{tenant.name}</Link>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-slate-500">Edit</span>
      </div>

      <div>
        <h1 className="text-xl font-bold text-slate-900">Chỉnh sửa tenant</h1>
        <p className="text-sm text-slate-500 mt-0.5">Cập nhật thông tin tổ chức</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form action={handleUpdate} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tên doanh nghiệp</label>
            <input
              name="name"
              defaultValue={tenant.name}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Slug (subdomain)</label>
            <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-primary">
              <input
                name="slug"
                defaultValue={tenant.slug}
                required
                pattern="[a-z0-9-]+"
                className="flex-1 px-3 py-2.5 text-sm outline-none"
              />
              <span className="pr-3 text-sm text-slate-400">.oni.vn</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Chỉ dùng chữ thường, số, dấu gạch ngang. Thay đổi slug sẽ làm hỏng link cũ.</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-800">Thông tin nhanh</p>
            <p className="mt-2">Tenant ID: <span className="font-mono text-xs">{tenant.id}</span></p>
            <p className="mt-1">Số thành viên: {memberSummaries.length}</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
            >
              Lưu thay đổi
            </button>
            <Link
              href={`/super/tenants/${id}`}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Huỷ
            </Link>
          </div>
        </form>

        <TenantMembersAdminCard tenantId={id} members={memberSummaries} />
      </div>
    </div>
  );
}
