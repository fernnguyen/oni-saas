import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '@/lib/server/auth';
import {
  exchangeAuthorizationCodeForZaloOA,
  getZaloOAStatus,
  refreshStoredZaloOAAccessToken,
  saveManualZaloOATokens,
} from '@/lib/server/zaloOA';

export async function GET() {
  const user = await getSuperAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const status = await getZaloOAStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load Zalo OA status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getSuperAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const authorizationCode = typeof body.authorizationCode === 'string' ? body.authorizationCode.trim() : '';
    const codeVerifier = typeof body.codeVerifier === 'string' ? body.codeVerifier.trim() : '';
    const oaId = typeof body.oaId === 'string' ? body.oaId.trim() : '';
    const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';
    const expiresInSeconds = Number(body.expiresInSeconds || 25 * 60 * 60);
    const refreshExpiresInSecondsRaw = body.refreshExpiresInSeconds;
    const refreshExpiresInSeconds =
      refreshExpiresInSecondsRaw == null || refreshExpiresInSecondsRaw === ''
        ? null
        : Number(refreshExpiresInSecondsRaw);
    const forceRefresh = body.forceRefresh === true;

    if (forceRefresh) {
      await refreshStoredZaloOAAccessToken();
      return NextResponse.json(await getZaloOAStatus());
    }

    if (!authorizationCode) {
      if (!accessToken || !refreshToken) {
        return NextResponse.json(
          { error: 'Missing authorizationCode or manual access/refresh token pair' },
          { status: 400 }
        );
      }

      const status = await saveManualZaloOATokens({
        accessToken,
        refreshToken,
        oaId: oaId || undefined,
        expiresInSeconds,
        refreshExpiresInSeconds,
      });
      return NextResponse.json(status);
    }

    const status = await exchangeAuthorizationCodeForZaloOA(authorizationCode, {
      codeVerifier: codeVerifier || undefined,
      oaId: oaId || undefined,
    });
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update Zalo OA token' },
      { status: 500 }
    );
  }
}
