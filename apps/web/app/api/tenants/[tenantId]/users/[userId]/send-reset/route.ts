import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '../../../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../../../lib/server/supabaseAdmin';
import { hasPermission } from '../../../../../../../lib/server/permissions';
import { checkRateLimit, rateLimitKey } from '../../../../../../../lib/server/rateLimit';

function getPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

/**
 * Build redirectTo từ host của request.
 * - tenant.oni.vn  → https://tenant.oni.vn/auth/reset-password
 * - app.oni.vn     → https://app.oni.vn/auth/reset-password
 * - localhost:3000  → http://localhost:3000/auth/reset-password
 */
function buildRedirectUrl(req: NextRequest): string {
  const host =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    '';
  const proto =
    req.headers.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https');

  if (host) return `${proto}://${host}/auth/reset-password`;
  return `${process.env.SITE_URL ?? 'https://app.oni.vn'}/auth/reset-password`;
}

/**
 * POST /api/tenants/[tenantId]/users/[userId]/send-reset
 *
 * Admin-triggered password reset email for personal/phone accounts.
 * Uses Supabase resetPasswordForEmail (→ Resend SMTP pipeline).
 *
 * - Requires users.invite (owner or admin)
 * - Rate limit: 2 sends per target userId per day
 * - Workspace accounts are rejected (fake .oni.vn email)
 * - Logs to audit_logs
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; userId: string }> },
) {
  const { tenantId, userId } = await params;

  // ── Auth ──────────────────────────────────────────────────────
  const supabase = await getSupabaseServerClient();
  const { data: { user: caller } } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // ── Permission ────────────────────────────────────────────────
  const canInvite = await hasPermission(caller.id, tenantId, 'users.invite');
  if (!canInvite) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  // ── Rate limit: 2 per target user per 24h ────────────────────
  const rlAllowed = await checkRateLimit(
    rateLimitKey('admin_send_reset', userId),
    2,
    86_400,
  );
  if (!rlAllowed) {
    return NextResponse.json(
      { message: 'Đã gửi email đặt lại mật khẩu. Vui lòng thử lại sau 24 giờ.' },
      { status: 429, headers: { 'Retry-After': '86400' } },
    );
  }

  const admin = getSupabaseAdminClient();

  // ── Fetch target user profile ─────────────────────────────────
  const { data: profile } = await admin
    .from('tenant_user_profiles')
    .select('login_email, account_type, display_name')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ message: 'Người dùng không thuộc workspace này' }, { status: 404 });
  }

  // ── Block workspace accounts ──────────────────────────────────
  if (profile.account_type === 'workspace' || profile.login_email?.endsWith('.oni.vn')) {
    return NextResponse.json(
      {
        message:
          'Tài khoản workspace sử dụng email nội bộ, không hỗ trợ gửi email đặt lại. ' +
          'Chủ sở hữu có thể đặt lại mật khẩu trực tiếp từ trang Quản lý thành viên.',
      },
      { status: 400 },
    );
  }

  if (!profile.login_email) {
    return NextResponse.json({ message: 'Không tìm thấy địa chỉ email để gửi.' }, { status: 400 });
  }

  // ── Send via Supabase email pipeline (→ Resend SMTP) ─────────
  const redirectTo = buildRedirectUrl(req);

  const { error } = await getPublicClient().auth.resetPasswordForEmail(profile.login_email, {
    redirectTo,
  });

  if (error) {
    console.error('[send-reset] resetPasswordForEmail error:', {
      message: error.message,
      target: profile.login_email,
      redirectTo,
    });
    return NextResponse.json(
      { message: 'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại.' },
      { status: 500 },
    );
  }

  console.log(`[send-reset] reset email queued for ${profile.login_email}`);

  // ── Audit log ─────────────────────────────────────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;

  admin
    .from('audit_logs')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      action: 'admin_triggered_password_reset_email',
      metadata: {
        performed_by: caller.id,
        performed_by_email: caller.email,
        target_email: profile.login_email,
        ip,
        occurred_at: new Date().toISOString(),
      },
    })
    .then(({ error: logErr }: { error: { message: string } | null }) => {
      if (logErr) console.warn('[send-reset] audit log failed:', logErr.message);
    });

  return NextResponse.json({
    ok: true,
    message: `Đã gửi email đặt lại mật khẩu đến ${profile.login_email}`,
  });
}
