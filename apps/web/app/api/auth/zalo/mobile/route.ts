import { NextResponse } from 'next/server';
import {
  authenticateZaloMobile,
  ZaloMobileAuthError,
} from '../../../../../lib/server/zaloMobileAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await authenticateZaloMobile({
      accessToken: typeof body?.accessToken === 'string' ? body.accessToken : undefined,
      oauthCode: typeof body?.oauthCode === 'string' ? body.oauthCode : undefined,
      codeVerifier: typeof body?.codeVerifier === 'string' ? body.codeVerifier : undefined,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof ZaloMobileAuthError) {
      console.error(`[zalo-mobile] ${error.code}:`, error.detail ?? error.message);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    console.error('[zalo-mobile] Lỗi không xác định:', error);
    return NextResponse.json(
      { error: 'Lỗi nội bộ máy chủ', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
