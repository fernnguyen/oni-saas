import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  
  const xForwardedHost = req.headers.get('x-forwarded-host');
  const xForwardedProto = req.headers.get('x-forwarded-proto') || 'http';
  const realHost = xForwardedHost || req.headers.get('host') || '';
  const resolvedOrigin = realHost ? `${xForwardedProto}://${realHost}` : origin;
  const redirectUri = `${resolvedOrigin}/api/auth/zalo/callback`;

  // Parse state to get intent
  let intent = 'login';
  let originalOrigin = resolvedOrigin; // Fallback to current origin
  if (stateParam) {
    try {
      const stateObj = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'));
      if (stateObj.intent) intent = stateObj.intent;
      if (stateObj.origin) originalOrigin = stateObj.origin;
    } catch (err) {
      console.warn("Invalid state param", err);
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
    // 1. Exchange code for Zalo Access Token
    const tokenRes = await fetch('https://oauth.zaloapp.com/v4/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': appSecret,
      },
      body: new URLSearchParams({
        app_id: appId,
        code: code,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Zalo Token Error:', tokenData);
      return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Failed to get Zalo access token`);
    }

    // 2. Get User Profile from Zalo Graph API
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

    // 3. Find or Create User via Supabase Admin
    // Using email lookup directly. We try to generate a link first, which acts as a check if user exists.
    // Or we can just createUser and ignore the 'already exists' error.
    let userRecord = null;
    
    // First, try to create the user. If they exist, it will fail gracefully (with User already exists error).
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email: zaloEmail,
      email_confirm: true,
      user_metadata: {
        full_name: profileData.name,
        avatar_url: profileData.picture?.data?.url || '',
      }
    });

    if (createError && (createError.message.toLowerCase().includes('already') || createError.status === 422)) {
      // User exists, that's perfectly fine. We will generate a link for them.
      console.log("Zalo user already exists, proceeding to login.");
    } else if (createError) {
      console.error('Supabase Create User Error:', createError);
      return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Failed to create auth user`);
    }

    // 4. Generate Magic Link to securely log the user in via client-side cookie exchange
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: zaloEmail,
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Supabase Generate Link Error:', linkError);
      return NextResponse.redirect(`${originalOrigin}/auth/signin?error=Failed to generate login link`);
    }

    // 5. Build the final redirect URL (Supabase's action_link already sets cookies)
    // We add a 'next' param to guide the user after successful login
    let nextPath = '/super/dashboard';
    
    // Custom routing based on intent and tenant check will be handled in middleware or frontend.
    // But since `action_link` is a Supabase internal URL, we append `&next=/auth/callback-routing?intent=...` 
    // Actually, action_link structure: /auth/v1/verify?token=...&type=magiclink&redirect_to=...
    // Let's parse and append redirect_to
    
    const actionUrl = new URL(linkData.properties.action_link);
    
    // Use the root domain for redirect_to to ensure it's always allowed by Supabase's whitelist.
    // We pass the tenant origin so the root domain can forward the hash token to the tenant.
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
    const rootProtocol = rootDomain.includes('localhost') ? 'http' : 'https';
    const rootOrigin = `${rootProtocol}://${rootDomain}`;
    
    actionUrl.searchParams.set('redirect_to', `${rootOrigin}/auth/zalo-success?intent=${intent}&tenant=${encodeURIComponent(originalOrigin)}`);

    const response = NextResponse.redirect(actionUrl.toString());
    response.cookies.set('zalo_code_verifier', '', { maxAge: 0, path: '/' });
    
    return response;

  } catch (err) {
    console.error('Zalo Callback Catch Error:', err);
    return NextResponse.redirect(`${resolvedOrigin}/auth/signin?error=Internal server error during callback`);
  }
}
