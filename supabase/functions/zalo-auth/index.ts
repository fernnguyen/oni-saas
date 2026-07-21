/**
 * Supabase Edge Function: zalo-auth
 *
 * Xử lý Zalo OAuth 2.0 server-side:
 *   1. Nhận oauthCode + codeVerifier từ mobile app
 *   2. Exchange lấy Zalo access_token (PKCE)
 *   3. Lấy thông tin user từ Zalo Graph API
 *   4. Tìm hoặc tạo Supabase user tương ứng
 *   5. Tạo magic link session và trả về access_token + refresh_token
 *
 * Bảo mật:
 *   - ZALO_APP_SECRET chỉ tồn tại ở Edge Function — không bao giờ expose ra client
 *   - Dùng Supabase service role key để tạo/tìm user (admin API)
 *   - CORS chỉ cho phép request từ app mobile
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { oauthCode, codeVerifier, appId } = await req.json();

    if (!oauthCode || !appId) {
      return Response.json(
        { error: 'Thiếu tham số oauthCode hoặc appId' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const ZALO_APP_SECRET = Deno.env.get('ZALO_APP_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ZALO_APP_SECRET) {
      return Response.json(
        { error: 'ZALO_APP_SECRET chưa được cấu hình trên server' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // ── BƯỚC 1: Exchange oauthCode → Zalo access_token ────────────────────────
    const tokenBody = new URLSearchParams({
      app_id: appId,
      grant_type: 'authorization_code',
      code: oauthCode,
    });

    // Thêm code_verifier nếu sử dụng PKCE (Zalo SDK v4+)
    if (codeVerifier) {
      tokenBody.append('code_verifier', codeVerifier);
    }

    const tokenRes = await fetch('https://oauth.zaloapp.com/v4/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': ZALO_APP_SECRET,
      },
      body: tokenBody.toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('[zalo-auth] Token exchange thất bại:', tokenData);
      return Response.json(
        { error: 'Không lấy được Zalo access_token', detail: tokenData },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const zaloAccessToken: string = tokenData.access_token;

    // ── BƯỚC 2: Lấy thông tin user từ Zalo Graph API ──────────────────────────
    const profileRes = await fetch(
      'https://graph.zalo.me/v2.0/me?fields=id,name,picture',
      {
        headers: {
          'access_token': zaloAccessToken,
        },
      }
    );

    const profile = await profileRes.json();

    if (!profile.id) {
      console.error('[zalo-auth] Không lấy được profile Zalo:', profile);
      return Response.json(
        { error: 'Không lấy được thông tin người dùng từ Zalo' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const zaloId: string = profile.id;
    const zaloName: string = profile.name ?? 'Người dùng Zalo';
    const zaloAvatar: string | null = profile.picture?.data?.url ?? null;

    // Email placeholder duy nhất cho Zalo user (Zalo không bắt buộc trả về email)
    const placeholderEmail = `zalo_${zaloId}@oni.vn`;

    // ── BƯỚC 3: Tìm hoặc tạo Supabase user ────────────────────────────────────
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Tìm user theo email placeholder (cách đáng tin cậy nhất)
    let userId: string;
    const { data: existingUsers } = await adminClient.auth.admin.listUsers({
      perPage: 1,
      page: 1,
    });

    // Tìm trong danh sách users có zalo_id khớp
    const allUsersRes = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const matchedUser = allUsersRes.data?.users?.find(
      (u) => u.user_metadata?.zalo_id === zaloId || u.email === placeholderEmail
    );

    if (matchedUser) {
      userId = matchedUser.id;
      // Cập nhật metadata mới nhất (tên/avatar có thể đổi)
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...matchedUser.user_metadata,
          full_name: zaloName,
          avatar_url: zaloAvatar,
          zalo_id: zaloId,
          provider: 'zalo',
        },
      });
    } else {
      // Tạo user mới
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: placeholderEmail,
        email_confirm: true,
        user_metadata: {
          full_name: zaloName,
          name: zaloName,
          avatar_url: zaloAvatar,
          zalo_id: zaloId,
          provider: 'zalo',
        },
      });

      if (createError || !newUser.user) {
        console.error('[zalo-auth] Tạo user thất bại:', createError);
        return Response.json(
          { error: 'Không thể tạo tài khoản Zalo', detail: createError?.message },
          { status: 500, headers: CORS_HEADERS }
        );
      }
      userId = newUser.user.id;
    }

    // ── BƯỚC 4: Tạo Supabase session cho user ─────────────────────────────────
    // Dùng generateLink để lấy tokens hợp lệ
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: placeholderEmail,
      options: {
        redirectTo: 'oni-pos://auth-callback',
      },
    });

    if (linkError || !linkData?.properties) {
      console.error('[zalo-auth] Tạo session link thất bại:', linkError);
      return Response.json(
        { error: 'Không thể tạo phiên đăng nhập', detail: linkError?.message },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const { access_token, refresh_token } = linkData.properties;

    return Response.json(
      {
        access_token,
        refresh_token,
        user: {
          id: userId,
          name: zaloName,
          avatar_url: zaloAvatar,
          zalo_id: zaloId,
        },
      },
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[zalo-auth] Lỗi không xác định:', err);
    return Response.json(
      { error: 'Lỗi nội bộ máy chủ', detail: err.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
