import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { env } from '../../../../../lib/env';

const bodySchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự.'),
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu mới.'),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Mật khẩu xác nhận không khớp.',
      });
    }
  });

function getReadableError(message: string) {
  const lowered = message.toLowerCase();
  if (
    lowered.includes('invalid login credentials') ||
    lowered.includes('invalid email or password')
  ) {
    return 'Mật khẩu hiện tại không đúng.';
  }

  return message;
}

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  return req.headers.get('x-real-ip') || null;
}

function buildSafeUserAgent(userAgent: string | null) {
  if (!userAgent) return null;
  return userAgent.slice(0, 300);
}

export async function POST(req: NextRequest) {
  try {
    const payload = bodySchema.safeParse(await req.json());
    if (!payload.success) {
      const message = payload.error.issues[0]?.message || 'Dữ liệu không hợp lệ.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();
    const { data: hasPassword, error: passwordStateError } = await admin.rpc(
      'get_auth_user_has_password',
      { p_user_id: user.id }
    );

    if (passwordStateError) {
      console.error('Password status RPC error:', passwordStateError);
      return NextResponse.json(
        { error: 'Không thể kiểm tra trạng thái mật khẩu' },
        { status: 500 }
      );
    }

    const { currentPassword, newPassword } = payload.data;
    const passwordAction = hasPassword ? 'password_changed' : 'password_set';

    if (hasPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Vui lòng nhập mật khẩu hiện tại.' },
          { status: 400 }
        );
      }

      const verifyClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { error: verifyError } = await verifyClient.auth.signInWithPassword({
        email: user.email || '',
        password: currentPassword,
      });

      if (verifyError) {
        return NextResponse.json(
          { error: getReadableError(verifyError.message) },
          { status: 400 }
        );
      }
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateError) {
      return NextResponse.json(
        { error: 'Không thể cập nhật mật khẩu. Vui lòng thử lại.' },
        { status: 400 },
      );
    }

    const tenantSlug = req.headers.get('x-tenant-slug');
    let tenantId: string | null = null;

    if (tenantSlug) {
      const { data: tenant } = await admin
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .maybeSingle();
      tenantId = tenant?.id ?? null;
    }

    const { error: auditError } = await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: passwordAction,
      metadata: {
        source: 'zalo-mini-app',
        tenant_slug: tenantSlug,
        has_previous_password: Boolean(hasPassword),
        auth_provider: user.app_metadata?.provider ?? null,
        auth_providers: Array.isArray(user.app_metadata?.providers)
          ? user.app_metadata.providers
          : null,
        phone_masked: user.phone ? `${user.phone.slice(0, 3)}xxx${user.phone.slice(-2)}` : null,
        user_agent: buildSafeUserAgent(req.headers.get('user-agent')),
        ip: getClientIp(req),
        occurred_at: new Date().toISOString(),
      },
    });

    if (auditError) {
      console.warn('Password audit log insert failed:', auditError);
    }

    return NextResponse.json({
      success: true,
      hasPassword: true,
      message: hasPassword ? 'Đổi mật khẩu thành công.' : 'Thiết lập mật khẩu thành công.',
    });
  } catch (error: any) {
    console.error('Password update API error:', error);
    return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 });
  }
}
