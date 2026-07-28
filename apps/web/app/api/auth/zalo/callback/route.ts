import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import {
  resolveOrCreateUser,
  ZaloMobileAuthError,
} from '../../../../../lib/server/zaloMobileAuth';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  const xForwardedHost = req.headers.get('x-forwarded-host');
  const xForwardedProto = req.headers.get('x-forwarded-proto') || 'http';
  const realHost = xForwardedHost || req.headers.get('host') || '';
  const resolvedOrigin = realHost ? `${xForwardedProto}://${realHost}` : origin;

  let intent = 'login';
  let originalOrigin = resolvedOrigin;
  if (stateParam) {
    try {
      const stateObj = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'));
      if (stateObj.intent) intent = stateObj.intent;
      if (stateObj.origin) originalOrigin = stateObj.origin;
    } catch (err) {
      console.warn('Invalid state param', err);
    }
  }

  if (!code) {
    return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Missing code from Zalo`);
  }

  const codeVerifier = req.cookies.get('zalo_code_verifier')?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Missing code verifier for Zalo login`);
  }

  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Missing Zalo Config`);
  }

  try {
    const tokenRes = await fetch('https://oauth.zaloapp.com/v4/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': appSecret,
      },
      body: new URLSearchParams({
        app_id: appId,
        code,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Zalo Token Error:', tokenData);
      return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Failed to get Zalo access token`);
    }

    const profileRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
      method: 'GET',
      headers: {
        'access_token': tokenData.access_token,
      },
    });

    const profileData = await profileRes.json();
    if (!profileData.id) {
      console.error('Zalo Profile Error:', profileData);
      return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Failed to fetch Zalo profile`);
    }

    const user = await resolveOrCreateUser({
      id: String(profileData.id),
      name:
        typeof profileData.name === 'string' && profileData.name.trim()
          ? profileData.name.trim()
          : 'Người dùng Zalo',
      avatarUrl:
        typeof profileData.picture?.data?.url === 'string' && profileData.picture.data.url.trim()
          ? profileData.picture.data.url.trim()
          : null,
    });
    const resolvedEmail = user.email;
    if (!resolvedEmail) {
      throw new ZaloMobileAuthError(
        'Tài khoản Zalo chưa có email đăng nhập',
        409,
        'ZALO_EMAIL_MISSING',
      );
    }

    const admin = getSupabaseAdminClient();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: resolvedEmail,
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Supabase Generate Link Error:', linkError);
      return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Failed to generate login link`);
    }

    const actionUrl = new URL(linkData.properties.action_link);
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
    const rootProtocol = rootDomain.includes('localhost') ? 'http' : 'https';
    const rootOrigin = `${rootProtocol}://${rootDomain}`;

    actionUrl.searchParams.set(
      'redirect_to',
      `${rootOrigin}/auth/zalo-success?intent=${intent}&tenant=${encodeURIComponent(originalOrigin)}`
    );

    const response = NextResponse.redirect(actionUrl.toString());
    response.cookies.set('zalo_code_verifier', '', { maxAge: 0, path: '/' });

    return response;
  } catch (err) {
    console.error('Zalo Callback Catch Error:', err);
    const errorCode = err instanceof ZaloMobileAuthError
      ? err.code
      : 'Internal server error during callback';
    return NextResponse.redirect(
      `${resolvedOrigin}/auth/signin?error=${encodeURIComponent(errorCode)}`,
    );
  }
}
