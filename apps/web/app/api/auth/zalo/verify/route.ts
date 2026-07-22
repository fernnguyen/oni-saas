import { NextResponse } from 'next/server';
import { resolveLinkedZaloSession } from '../../../../../lib/server/zaloLinkedSession';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';
    const profileName = typeof body?.profileName === 'string' ? body.profileName.trim() : undefined;
    const profileAvatar = typeof body?.profileAvatar === 'string' ? body.profileAvatar.trim() : undefined;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing access_token' },
        { status: 400 }
      );
    }

    const result = await resolveLinkedZaloSession(accessToken, { name: profileName, avatar: profileAvatar });
    if (result.status !== 'LOGGED_IN') {
      return NextResponse.json({
        status: 'NOT_LINKED',
        zaloProfile: result.zaloProfile,
      });
    }

    return NextResponse.json({
      status: 'LOGGED_IN',
      session: result.session,
      zaloProfile: result.zaloProfile,
    });
  } catch (err: any) {
    console.error('Zalo Verify API Error:', err);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: err?.message || String(err)
    }, { status: 500 });
  }
}
