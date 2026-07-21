import { NextRequest, NextResponse } from 'next/server';
import {
  getQrLoginRequest,
  QrLoginStoreNotReadyError,
  updateQrLoginRequest,
} from '../../../../../lib/server/qrLoginStore';
import { resolveLinkedZaloSession } from '../../../../../lib/server/zaloLinkedSession';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';

    // ── Auth path A: Zalo Mini App (accessToken = Zalo OAuth token)
    const zaloAccessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';

    // ── Auth path B: ONI Mobile App (supabaseToken = Supabase JWT from Bearer header)
    // Mobile sends its Supabase Bearer via Authorization header OR explicit body field
    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (typeof body?.supabaseToken === 'string' ? body.supabaseToken : '');

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    if (!zaloAccessToken && !bearerToken) {
      return NextResponse.json(
        { error: 'Missing token or accessToken' },
        { status: 400 },
      );
    }

    // ── Validate QR request row ──
    const requestRow = await getQrLoginRequest(token);
    if (!requestRow) {
      return NextResponse.json({ error: 'Mã QR không hợp lệ hoặc không tồn tại' }, { status: 404 });
    }

    if (requestRow.status !== 'pending') {
      return NextResponse.json({ error: 'Mã QR này đã được xử lý hoặc hết hạn' }, { status: 409 });
    }

    const expiresAt = requestRow.expires_at ? new Date(requestRow.expires_at) : null;
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      await updateQrLoginRequest(token, {
        status: 'expired',
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ error: 'Mã QR đã hết hạn, vui lòng tạo mã mới' }, { status: 410 });
    }

    // ── Resolve user identity ──
    let confirmedUserId: string;
    let confirmedName: string | null;
    let confirmedAvatar: string | null;
    let sessionPayload: { access_token: string; refresh_token: string };

    if (zaloAccessToken) {
      // Path A — Zalo Mini App (original flow, unchanged)
      const result = await resolveLinkedZaloSession(zaloAccessToken);
      if (result.status !== 'LOGGED_IN') {
        return NextResponse.json({
          error: 'Tài khoản Zalo này chưa được liên kết để đăng nhập nhanh',
          zaloProfile: result.zaloProfile,
        }, { status: 409 });
      }
      confirmedUserId = result.userId;
      confirmedName = result.zaloProfile.name;
      confirmedAvatar = result.zaloProfile.avatar;
      sessionPayload = {
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      };
    } else {
      // Path B — ONI Mobile App (Supabase Bearer JWT)
      const admin = getSupabaseAdminClient();

      // Verify the Supabase JWT by getting the user from it
      const { data: userData, error: userError } = await admin.auth.getUser(bearerToken);
      if (userError || !userData?.user) {
        return NextResponse.json(
          { error: 'Token xác thực không hợp lệ hoặc đã hết hạn' },
          { status: 401 },
        );
      }

      const user = userData.user;
      confirmedUserId = user.id;
      confirmedName = (user.user_metadata?.full_name as string | null)
        ?? (user.user_metadata?.name as string | null)
        ?? user.email
        ?? null;
      confirmedAvatar = (user.user_metadata?.avatar_url as string | null) ?? null;

      // Generate a fresh magic-link session so the web browser can sign in
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: user.email!,
      });

      if (linkError || !linkData?.properties) {
        throw new Error('Failed to generate session for mobile user');
      }

      const actionUrl = new URL(
        linkData.properties.action_link,
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oni.vn',
      );
      const otpToken = actionUrl.searchParams.get('token');
      const tokenHash = linkData.properties.hashed_token || otpToken;

      if (!tokenHash) {
        throw new Error('No token in action link');
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      });

      const { data: sessionData, error: verifyError } = await authClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      });

      if (verifyError || !sessionData.session) {
        throw new Error('Failed to verify session for mobile user');
      }

      sessionPayload = {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      };
    }

    // ── Persist confirmed state ──
    await updateQrLoginRequest(token, {
      status: 'confirmed',
      session_payload: sessionPayload,
      confirmed_user_id: confirmedUserId,
      confirmed_name: confirmedName,
      confirmed_avatar: confirmedAvatar,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      requestedHost: requestRow.requested_host,
      requestedOrigin: requestRow.requested_origin,
      requestedTenantSlug: requestRow.tenant_slug,
    });
  } catch (error) {
    console.error('[QR Login][Confirm]', error);
    if (error instanceof QrLoginStoreNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Không thể xác nhận đăng nhập bằng QR' }, { status: 500 });
  }
}

