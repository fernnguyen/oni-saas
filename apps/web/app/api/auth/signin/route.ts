import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { buildFakeEmail } from '../../../../lib/server/tenantUsers';
import { verifyTurnstileToken } from '../../../../lib/server/turnstile';

// Blocks fake-email registration from the public domain
const ONI_EMAIL_PATTERN = /^[^@]+@[^.]+\..+$/;
const ONI_FAKE_EMAIL_PATTERN = /^[^@]+@[^.]+\.oni\.vn$/;

const schema = z.object({
  // 'identifier' is either a plain username or a full email address
  identifier: z.string().min(1),
  password: z.string().min(1),
  // Required when identifier has no '@' — tells us which tenant to resolve against
  tenant_slug: z.string().optional(),
  turnstile_token: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  const { identifier, password, tenant_slug, turnstile_token } = parsed.data;

  // Cloudflare Turnstile Verification
  const ip = req.headers.get('x-forwarded-for') || undefined;
  const isTurnstileValid = await verifyTurnstileToken(turnstile_token, ip);
  if (!isTurnstileValid) {
    return NextResponse.json(
      { message: 'Xác thực bảo mật không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.' },
      { status: 400 },
    );
  }
  const isEmail = identifier.includes('@');

  let email: string;

  if (isEmail) {
    email = identifier;
  } else {
    // Plain username — must have tenant context
    if (!tenant_slug) {
      return NextResponse.json(
        {
          message:
            'Vui lòng đăng nhập từ địa chỉ workspace của bạn (ví dụ: workspace.oni.vn) hoặc nhập email đầy đủ.',
        },
        { status: 400 },
      );
    }
    email = buildFakeEmail(identifier, tenant_slug);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const message =
      error.message.toLowerCase().includes('invalid login credentials') ||
      error.message.toLowerCase().includes('invalid email or password')
        ? 'Tên đăng nhập hoặc mật khẩu không đúng'
        : error.message;
    return NextResponse.json({ message }, { status: 400 });
  }

  // ── MFA check: if user has 2FA enrolled, require AAL2 ────────
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
    return NextResponse.json({ ok: true, mfa_required: true });
  }

  // ── Main domain guard: only superadmins allowed ─────────────
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const host = req.headers.get('host') ?? '';
  const isMainDomain =
    host === rootDomain ||
    host.replace(/:\d+$/, '') === rootDomain.replace(/:\d+$/, '');

  if (isMainDomain) {
    const { data: userData } = await supabase.auth.getUser();
    const isSuperAdmin = userData.user?.app_metadata?.role === 'super_admin';

    if (!isSuperAdmin) {
      let workspaceSlug: string | null = null;
      if (userData.user) {
        // Tenant users: extract slug from fake email
        if (ONI_FAKE_EMAIL_PATTERN.test(userData.user.email ?? '')) {
          workspaceSlug = userData.user.user_metadata?.tenant_slug ?? null;
        } else {
          const admin = getSupabaseAdminClient();
          const { data } = await admin
            .from('user_tenants')
            .select('tenants(slug)')
            .eq('user_id', userData.user.id)
            .order('is_default', { ascending: false })
            .limit(1)
            .maybeSingle();
          workspaceSlug = (data as any)?.tenants?.slug ?? null;
        }
      }

      await supabase.auth.signOut();
      return NextResponse.json(
        {
          message:
            'Trang này chỉ dành cho superadmin. Vui lòng đăng nhập tại workspace của bạn.',
          workspace_slug: workspaceSlug,
        },
        { status: 403 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
