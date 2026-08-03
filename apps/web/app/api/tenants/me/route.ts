import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { getTenantCreationStatus } from '../../../../lib/server/tenantCreationPolicy';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Dùng admin sau khi đã xác thực JWT để kết quả không phụ thuộc RLS của
  // user_tenants. Social login không có tenant code, vì vậy client cần toàn bộ
  // membership để người dùng chọn tenant trước khi chọn chi nhánh.
  const admin = getSupabaseAdminClient();
  const [membershipResult, tenantCreationStatus] = await Promise.all([
    admin
      .from('user_tenants')
      .select('tenant_id, is_default, tenants(id, name, slug, industry_type)')
      .eq('user_id', auth.user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    getTenantCreationStatus(auth.user.id, admin).catch((err) => {
      console.error('[tenants/me] Failed to get tenant creation status:', err.message);
      return {
        ownedCount: 0,
        maxPerAccount: 1,
        canCreate: true,
        message: null,
      };
    }),
  ]);

  const { data, error } = membershipResult;
  if (error) {
    console.error('[tenants/me] Failed to resolve membership:', error.message);
    return NextResponse.json({ message: 'Unable to resolve tenant membership' }, { status: 500 });
  }

  const metadata = auth.user.user_metadata ?? {};
  const mappedTenants = (data ?? []).flatMap((membership: any) => {
    const tenant = Array.isArray(membership.tenants)
      ? membership.tenants[0]
      : membership.tenants;
    if (!tenant) return [];
    return [{
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      industry_type: tenant.industry_type,
      was_default: membership.is_default === true,
    }];
  });

  // Defensive normalization for databases that have not run the repair migration yet:
  // expose exactly one default tenant instead of rendering every legacy row as default.
  const storedDefaultIndex = mappedTenants.findIndex((tenant) => tenant.was_default);
  const defaultIndex = storedDefaultIndex >= 0 ? storedDefaultIndex : 0;
  const tenants = mappedTenants.map(({ was_default: _wasDefault, ...tenant }, index) => ({
    ...tenant,
    is_default: index === defaultIndex,
  }));

  return NextResponse.json({
    // Giữ field cũ cho client chưa nâng cấp; client mới dùng tenants[].
    tenant_id: tenants.find((tenant) => tenant.is_default)?.id ?? tenants[0]?.id ?? null,
    tenants,
    membership_count: tenants.length,
    tenant_creation: {
      owned_count: tenantCreationStatus.ownedCount,
      max_per_account: tenantCreationStatus.maxPerAccount,
      can_create: tenantCreationStatus.canCreate,
      message: tenantCreationStatus.message,
    },
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
      name: metadata.full_name || metadata.name || auth.user.email?.split('@')[0] || 'Người dùng',
      avatar_url: metadata.avatar_url || metadata.picture || null,
      provider: metadata.provider || (metadata.zalo_id ? 'zalo' : null),
    },
  });
}
