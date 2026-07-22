import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Dùng admin sau khi đã xác thực JWT để kết quả không phụ thuộc RLS của
  // user_tenants. Social login không có tenant code, vì vậy client cần toàn bộ
  // membership để người dùng chọn tenant trước khi chọn chi nhánh.
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('user_tenants')
    .select('tenant_id, is_default, tenants(id, name, slug, industry_type)')
    .eq('user_id', auth.user.id)
    .order('is_default', { ascending: false });

  if (error) {
    console.error('[tenants/me] Failed to resolve membership:', error.message);
    return NextResponse.json({ message: 'Unable to resolve tenant membership' }, { status: 500 });
  }

  const metadata = auth.user.user_metadata ?? {};
  const tenants = (data ?? []).flatMap((membership: any) => {
    const tenant = Array.isArray(membership.tenants)
      ? membership.tenants[0]
      : membership.tenants;
    if (!tenant) return [];
    return [{
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      industry_type: tenant.industry_type,
      is_default: membership.is_default === true,
    }];
  });

  return NextResponse.json({
    // Giữ field cũ cho client chưa nâng cấp; client mới dùng tenants[].
    tenant_id: tenants.find((tenant) => tenant.is_default)?.id ?? tenants[0]?.id ?? null,
    tenants,
    membership_count: tenants.length,
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
      name: metadata.full_name || metadata.name || auth.user.email?.split('@')[0] || 'Người dùng',
      avatar_url: metadata.avatar_url || metadata.picture || null,
      provider: metadata.provider || (metadata.zalo_id ? 'zalo' : null),
    },
  });
}
