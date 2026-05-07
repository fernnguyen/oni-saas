import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function TenantSettingsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/settings')}`);
  }

  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (!tenant) redirect('/auth/signin');

  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('role')
    .eq('user_id', authData.user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (!tenantAccess) redirect('/');

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Cài đặt workspace</h1>
          <p className="mt-1 text-sm text-slate-500">{tenant.name} · {tenant.slug}</p>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">Cài đặt workspace sẽ có ở Phase 3.</p>
        </div>
      </div>
    </div>
  );
}
