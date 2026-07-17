import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';

async function findAuthUserByEmail(admin: ReturnType<typeof getSupabaseAdminClient>, email: string) {
  let page = 1;

  while (page <= 5) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const users = data?.users || [];
    const matchedUser = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (matchedUser) return matchedUser;
    if (users.length < 200) break;
    page += 1;
  }

  return null;
}

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

    const zaloId = profileData.id;
    const zaloEmail = `zalo_${zaloId}@oni.vn`;
    const admin = getSupabaseAdminClient();

    let resolvedEmail = zaloEmail;
    let resolvedUserId: string | null = null;

    const { data: linkedIdentity } = await admin
      .from('user_identities')
      .select('user_id')
      .eq('provider', 'zalo')
      .eq('provider_id', zaloId)
      .maybeSingle();

    if (linkedIdentity?.user_id) {
      const { data: linkedUser } = await admin.auth.admin.getUserById(linkedIdentity.user_id);
      if (linkedUser.user?.email) {
        resolvedEmail = linkedUser.user.email;
        resolvedUserId = linkedUser.user.id;
      }
    }

    if (!resolvedUserId) {
      const canonicalUser = await findAuthUserByEmail(admin, zaloEmail);
      if (canonicalUser?.email) {
        resolvedEmail = canonicalUser.email;
        resolvedUserId = canonicalUser.id;
      }
    }

    if (!resolvedUserId) {
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email: zaloEmail,
        email_confirm: true,
        user_metadata: {
          full_name: profileData.name,
          avatar_url: profileData.picture?.data?.url || '',
          zalo_id: zaloId,
        }
      });

      if (createError || !createdUser.user) {
        console.error('Supabase Create User Error:', createError);
        return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Failed to create auth user`);
      }

      resolvedEmail = createdUser.user.email || zaloEmail;
      resolvedUserId = createdUser.user.id;
    }

    const { data: existingIdentity } = await admin
      .from('user_identities')
      .select('id')
      .eq('provider', 'zalo')
      .eq('provider_id', zaloId)
      .maybeSingle();

    if (!existingIdentity && resolvedUserId) {
      const { error: insertIdentityError } = await admin.from('user_identities').insert({
        id: `zalo_${zaloId}`,
        user_id: resolvedUserId,
        provider: 'zalo',
        provider_id: zaloId,
        name: profileData.name || null,
        avatar: profileData.picture?.data?.url || null,
      });

      if (insertIdentityError) {
        console.error('Failed to insert Zalo identity:', insertIdentityError);
      }
    }

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
    return NextResponse.redirect(`${resolvedOrigin}/auth/signin?error=Internal server error during callback`);
  }
}
