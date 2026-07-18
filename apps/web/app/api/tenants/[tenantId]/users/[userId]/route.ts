import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../../lib/server/supabaseServer';
import { hasPermission } from '../../../../../../lib/server/permissions';
import { deleteTenantUser, resetTenantUserPassword } from '../../../../../../lib/server/tenantUsers';

const updateUserSchema = z.object({
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').optional(),
  roleCode: z.string().optional(),
  shopId: z.string().optional(),
}).refine(data => data.password || data.roleCode, {
  message: 'Vui lòng cung cấp mật khẩu hoặc vai trò để cập nhật',
});

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; userId: string }> },
) {
  const { tenantId, userId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  if (user.id === userId) {
    return NextResponse.json({ message: 'Không thể tự xóa tài khoản của mình' }, { status: 400 });
  }

  const allowed = await hasPermission(user.id, tenantId, 'users.remove');
  if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  try {
    const result = await deleteTenantUser(userId, tenantId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Không thể xóa người dùng' },
      { status: 500 },
    );
  }
}

// PATCH /api/tenants/[tenantId]/users/[userId] — update user (role or password)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; userId: string }> },
) {
  const { tenantId, userId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // For updating role, might need org.manage or users.invite
  const allowed = await hasPermission(user.id, tenantId, 'users.invite');
  if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const json = await req.json();
  const parsed = updateUserSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    );
  }

  const { password, roleCode, shopId } = parsed.data;

  try {
    if (password) {
      await resetTenantUserPassword(userId, tenantId, password);
    }
    
    if (roleCode) {
      // Import here to avoid changing the top level imports structure which could cause issues
      const { updateTenantUserRole } = await import('../../../../../../lib/server/tenantUsers');
      await updateTenantUserRole(userId, tenantId, roleCode, shopId);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Không thể cập nhật người dùng' },
      { status: 500 },
    );
  }
}

