import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const intent = searchParams.get('intent') || 'login';
  const redirectBack = searchParams.get('redirect_back');
  
  const xForwardedHost = req.headers.get('x-forwarded-host');
  const xForwardedProto = req.headers.get('x-forwarded-proto') || 'http';
  const realHost = xForwardedHost || req.headers.get('host') || '';
  const resolvedOrigin = realHost ? `${xForwardedProto}://${realHost}` : origin;
  
  const originalOrigin = redirectBack || resolvedOrigin;
  
  const appId = process.env.ZALO_APP_ID;
  if (!appId) {
    return NextResponse.redirect(`${resolvedOrigin}/auth/signin?error=Missing Zalo App ID`);
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  const rootProtocol = rootDomain.includes('localhost') ? 'http' : 'https';
  const rootOrigin = `${rootProtocol}://${rootDomain}`;

  // Generate a random state string to prevent CSRF, append our intent, AND original origin
  const state = Buffer.from(JSON.stringify({ 
    intent, 
    origin: originalOrigin, // Save where they came from (tenant subdomain or root)
    nonce: Math.random().toString(36).substring(2) 
  })).toString('base64');
  
  // ALWAYS use root domain for the OAuth callback to satisfy Zalo's strict redirect_uri check
  const redirectUri = `${rootOrigin}/api/auth/zalo/callback`;
  
  // PKCE standard for Zalo v4
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const zaloAuthUrl = new URL('https://oauth.zaloapp.com/v4/permission');
  zaloAuthUrl.searchParams.set('app_id', appId);
  zaloAuthUrl.searchParams.set('redirect_uri', redirectUri);
  zaloAuthUrl.searchParams.set('state', state);
  zaloAuthUrl.searchParams.set('code_challenge', codeChallenge);

  const response = NextResponse.redirect(zaloAuthUrl.toString());
  
  // Store code_verifier in cookie for the callback route
  response.cookies.set('zalo_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
    sameSite: 'lax',
  });

  return response;
}
