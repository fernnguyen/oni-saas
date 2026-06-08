export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { assertUserShopAccess } from '../../../../../lib/server/shops';
import { getUserPermissions } from '../../../../../lib/server/permissions';
import { getTenantForUser } from '../../../../../lib/server/tenants';

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;

    // 1. Xác thực Supabase session
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Kiểm tra quyền truy cập chi nhánh
    const hasAccess = await assertUserShopAccess(auth.user.id, shopId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Phân giải Tenant ID của User
    const tenant = await getTenantForUser(auth.user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tenantId = (tenant as any)?.id as string | undefined;
    if (!tenantId) {
      const admin = getSupabaseAdminClient();
      const { data: shop } = await admin
        .from('shops')
        .select('tenant_id')
        .eq('id', shopId)
        .maybeSingle();
      tenantId = shop?.tenant_id;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
    }

    // 4. Lấy toàn bộ quyền hạn từ DB (đã bao gồm phân cấp Tenant-scoped & Shop-scoped)
    const permissions = await getUserPermissions(auth.user.id, tenantId, shopId);
    
    // 5. Lấy thông tin vai trò (role) của user
    const admin = getSupabaseAdminClient();
    const { data: userTenant } = await admin
      .from('user_tenants')
      .select('role_id, roles:role_id(code, name)')
      .eq('user_id', auth.user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    let roleCode = 'staff';
    let roleName = 'Nhân viên';

    if (userTenant && (userTenant as any).roles) {
      roleCode = (userTenant as any).roles.code;
      roleName = (userTenant as any).roles.name;
    } else {
      // Fallback lấy shop-level role
      const { data: userShop } = await admin
        .from('user_shops')
        .select('role_id, roles:role_id(code, name)')
        .eq('user_id', auth.user.id)
        .eq('shop_id', shopId)
        .maybeSingle();
      if (userShop && (userShop as any).roles) {
        roleCode = (userShop as any).roles.code;
        roleName = (userShop as any).roles.name;
      }
    }

    return NextResponse.json({ 
      permissions,
      role: {
        code: roleCode,
        name: roleName
      }
    });
  } catch (error: any) {
    console.error('[API GET permissions error]', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
