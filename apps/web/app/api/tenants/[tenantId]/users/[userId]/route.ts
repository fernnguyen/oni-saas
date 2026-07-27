import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../../lib/server/supabaseServer';
import { hasPermission } from '../../../../../../lib/server/permissions';
import { deleteTenantUser, resetTenantUserPassword } from '../../../../../../lib/server/tenantUsers';
import { checkRateLimit, rateLimitKey } from '../../../../../../lib/server/rateLimit';

// Role change  : requires users.invite  (owner or admin)
// Password reset: requires tenants.manage (owner only) + account_type === 'workspace'
const updateUserSchema = z.object({
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').optional(),
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

  // [H-2] Rate limit: 10 PATCH requests per caller per minute
  const rlAllowed = await checkRateLimit(rateLimitKey('user_patch', user.id), 10, 60);
  if (!rlAllowed) {
    return NextResponse.json(
      { message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

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
      // [H-1] Password reset requires owner-level permission (tenants.manage).
      // Prevents shop admin (users.invite) from resetting global auth credentials.
      // resetTenantUserPassword() also enforces account_type === 'workspace' internally [C-1].
      const isOwner = await hasPermission(user.id, tenantId, 'tenants.manage');
      if (!isOwner) {
        return NextResponse.json(
          { message: 'Chỉ chủ sở hữu workspace mới có thể đặt lại mật khẩu cho thành viên' },
          { status: 403 },
        );
      }
      await resetTenantUserPassword(userId, tenantId, password);
    }

    if (roleCode) {
      // Role update: users.invite is sufficient (owner or admin)
      const canInvite = await hasPermission(user.id, tenantId, 'users.invite');
      if (!canInvite) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
      const { updateTenantUserRole } = await import('../../../../../../lib/server/tenantUsers');
      await updateTenantUserRole(userId, tenantId, roleCode, shopId);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể cập nhật người dùng';
    // C-1 guard and similar 403-level business errors
    const is403 =
      message.includes('Không thể đặt mật khẩu trực tiếp') ||
      message.includes('Người dùng không thuộc workspace');
    return NextResponse.json({ message }, { status: is403 ? 403 : 500 });
  }
}
