import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getShopsForTenant } from '@/lib/server/shops';
import { SignInForm } from '@/app/components/auth/SignInForm';

interface Props {
  params: Promise<{ slug: string }>;
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500 text-sm">Workspace không tồn tại.</p>
        </div>
      </div>
    );
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

  // Branch selector for tenants with multiple branches
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#0268FF] text-white font-bold text-sm">
            {tenant.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{tenant.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Chọn chi nhánh để tiếp tục</p>
        </div>
        <div className="space-y-3">
          {branches.map((branch) => (
            <a
              key={branch.id}
              href={`/${branch.slug}`}
              className="block rounded-2xl border border-slate-200 bg-white px-5 py-4 hover:border-[#0268FF] hover:bg-blue-50/40 transition-colors"
            >
              <div className="text-sm font-semibold text-slate-900">{branch.name}</div>
              <div className="mt-0.5 text-xs text-slate-400 font-mono">{branch.slug}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
