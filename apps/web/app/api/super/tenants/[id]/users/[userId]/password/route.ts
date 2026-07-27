import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSuperAdminUser } from '../../../../../../../../lib/server/auth';
import { resetTenantUserPassword } from '../../../../../../../../lib/server/tenantUsers';
import { getSupabaseAdminClient } from '../../../../../../../../lib/server/supabaseAdmin';

const schema = z.object({
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),  // [M-1] unified to 8
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const superAdmin = await getSuperAdminUser();
  if (!superAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id: tenantId, userId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    );
  }

  try {
    await resetTenantUserPassword(userId, tenantId, parsed.data.password);

    // [M-4] Audit log: super admin password resets must always be logged
    const admin = getSupabaseAdminClient();
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;

    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: userId,                    // target user whose password was reset
      action: 'super_admin_password_reset',
      metadata: {
        performed_by: superAdmin.id,
        performed_by_email: superAdmin.email,
        ip,
        user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
        occurred_at: new Date().toISOString(),
      },
    }).then(({ error }) => {
      if (error) console.error('[super-admin-password-reset] audit log failed:', error.message);
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu' },
      { status: err instanceof Error && err.message.includes('Không thể đặt mật khẩu trực tiếp') ? 403 : 500 },
    );
  }
}
