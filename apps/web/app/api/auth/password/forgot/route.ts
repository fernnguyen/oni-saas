import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { isValidVNPhone, normalizeVNPhone, toVNPhonePlus84 } from '../../../../../lib/utils/phone';
import { checkRateLimit, rateLimitKey } from '../../../../../lib/server/rateLimit';
import { verifyTurnstileToken } from '../../../../../lib/server/turnstile';

const schema = z.object({
  identifier: z.string().min(1, 'Vui lòng nhập email hoặc số điện thoại'),
  turnstile_token: z.string().optional(),
});

// Supabase public client dùng để trigger resetPasswordForEmail
function getPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

/**
 * Build redirectTo từ host của request hiện tại.
 * - tenant.oni.vn  → https://tenant.oni.vn/auth/reset-password
 * - app.oni.vn     → https://app.oni.vn/auth/reset-password
 * - localhost:3000  → http://localhost:3000/auth/reset-password
 *
 * Cần thêm vào Supabase > Auth > URL Configuration > Redirect URLs:
 *   http://localhost:3000/auth/reset-password
 *   https://app.oni.vn/auth/reset-password
 *   https://*.oni.vn/auth/reset-password
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

  // Fallback — không xảy ra trên production
  return `${process.env.SITE_URL ?? 'https://app.oni.vn'}/auth/reset-password`;
}

/**
 * POST /api/auth/password/forgot
 *
 * Public endpoint — no auth required.
 * Looks up the user's login email, then calls Supabase resetPasswordForEmail
 * which triggers the recovery email via Supabase email pipeline (Resend SMTP).
 *
 * Security:
 *  - Turnstile CAPTCHA (optional — mobile callers may omit token)
 *  - Rate limit per identifier hash (1/5 min)
 *  - Rate limit per IP (5/min)
 *  - ALWAYS returns 200 { ok: true } — never reveals if identifier exists
 *  - Silently skips workspace (.oni.vn) accounts
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  // ── 1. Parse & validate ───────────────────────────────────────
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    );
  }

  const { identifier, turnstile_token } = parsed.data;

  // ── 2. Turnstile (optional — mobile callers may not send token) ─
  if (turnstile_token) {
    const valid = await verifyTurnstileToken(turnstile_token, ip);
    if (!valid) {
      return NextResponse.json(
        { message: 'Xác thực bảo mật không hợp lệ. Vui lòng thử lại.' },
        { status: 400 },
      );
    }
  }

  // ── 3. Rate limit IP (5/min) ───────────────────────────────────
  const ipOk = await checkRateLimit(rateLimitKey('forgot_pw_ip', ip), 5, 60);
  if (!ipOk) return NextResponse.json({ ok: true });

  // ── 4. Rate limit per identifier (1/5 min) ────────────────────
  const hash = createHash('sha256').update(identifier.toLowerCase().trim()).digest('hex');
  const idOk = await checkRateLimit(rateLimitKey('forgot_pw_id', hash), 1, 300);
  if (!idOk) return NextResponse.json({ ok: true });

  // ── 5. Fire-and-forget: resolve email → send via Supabase ─────
  resolveAndSend(identifier, ip, req).catch((err) =>
    console.error('[forgot-password] unhandled:', err),
  );

  return NextResponse.json({ ok: true });
}

async function resolveAndSend(identifier: string, ip: string, req: NextRequest): Promise<void> {
  const admin = getSupabaseAdminClient();
  const isPhone = isValidVNPhone(identifier);
  const isEmail = !isPhone && identifier.includes('@');
  let loginEmail: string | null = null;

  // ── Resolve login email ────────────────────────────────────────
  if (isEmail) {
    const normalizedEmail = identifier.toLowerCase().trim();

    // Fast path: tenant_user_profiles
    const { data: profile } = await admin
      .from('tenant_user_profiles')
      .select('login_email')
      .ilike('login_email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (profile?.login_email) {
      if (profile.login_email.endsWith('.oni.vn')) return; // workspace fake email
      loginEmail = profile.login_email;
    } else {
      // Fallback: scan auth.users
      const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = page?.users?.find(
        (u: { email?: string }) => u.email?.toLowerCase() === normalizedEmail,
      );
      if (!found?.email || found.email.endsWith('.oni.vn')) return;
      loginEmail = found.email;
    }
  } else if (isPhone) {
    const normalized = normalizeVNPhone(identifier);
    const plus84 = normalized ? toVNPhonePlus84(normalized) : null;
    if (plus84) {
      const { data: phoneUser } = await admin.rpc('get_user_by_phone', { p_phone: plus84 });
      if (phoneUser?.email && !phoneUser.email.endsWith('.oni.vn')) {
        loginEmail = phoneUser.email;
      }
    }
    if (!loginEmail) return;
  }

  if (!loginEmail) return;

  // ── Send via Supabase email pipeline (→ Resend SMTP) ─────────
  // SITE_URL phải là production URL để redirectTo được Supabase chấp nhận.
  const redirectTo = buildRedirectUrl(req);

  const { error } = await getPublicClient().auth.resetPasswordForEmail(loginEmail, {
    redirectTo,
  });

  if (error) {
    console.error('[forgot-password] resetPasswordForEmail error:', {
      message: error.message,
      loginEmail,
      redirectTo,
    });
    return;
  }

  console.log(`[forgot-password] reset email queued for ${loginEmail} (redirectTo: ${redirectTo})`);

  // ── Audit log ─────────────────────────────────────────────────
  admin
    .from('audit_logs')
    .insert({
      tenant_id: null,
      user_id: null,
      action: 'password_reset_requested',
      metadata: {
        identifier_type: identifier.includes('@') ? 'email' : 'phone',
        ip,
        occurred_at: new Date().toISOString(),
      },
    })
    .then(({ error: logErr }: { error: { message: string } | null }) => {
      if (logErr) console.warn('[forgot-password] audit log failed:', logErr.message);
    });
}
