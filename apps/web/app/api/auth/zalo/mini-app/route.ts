import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';
import { toVNPhonePlus84 } from '../../../../../lib/utils/phone';
import {
  resolveOrCreateUser,
  ZaloMobileAuthError,
} from '../../../../../lib/server/zaloMobileAuth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';
    const fallbackProfileName = typeof body?.profileName === 'string' ? body.profileName.trim() : '';
    const fallbackProfileAvatar = typeof body?.profileAvatar === 'string' ? body.profileAvatar.trim() : '';

    if (!token || !accessToken) {
      return NextResponse.json({ error: 'Missing token or accessToken' }, { status: 400 });
    }

    const appId = process.env.ZALO_APP_ID;
    const appSecret = process.env.ZALO_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json({ error: 'Missing Zalo Config' }, { status: 500 });
    }

    const infoRes = await fetch('https://graph.zalo.me/v2.0/me/info', {
      method: 'GET',
      headers: {
        'access_token': accessToken,
        'code': token,
        'secret_key': appSecret,
      },
    });

    const infoData = await infoRes.json();
    if (infoData.error) {
      console.error('Zalo API Error:', infoData);
      return NextResponse.json({ error: 'Failed to fetch Zalo info', details: infoData }, { status: 400 });
    }

    const phoneNumberStr = infoData.data?.number;
    if (!phoneNumberStr) {
      return NextResponse.json({ error: 'Phone number not returned by Zalo' }, { status: 400 });
    }

    const authPhone = toVNPhonePlus84(phoneNumberStr);
    if (!authPhone) {
      return NextResponse.json({ error: 'Invalid phone number returned by Zalo' }, { status: 400 });
    }

    let profileData: any = {};
    try {
      const profileRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
        headers: { 'access_token': accessToken }
      });
      profileData = await profileRes.json();
    } catch (e) {
      console.warn('Failed to fetch profile', e);
    }

    const zaloId = typeof profileData.id === 'string' ? profileData.id : '';
    if (!zaloId) {
      return NextResponse.json({ error: 'Missing Zalo profile id' }, { status: 400 });
    }

    const resolvedProfileName =
      (typeof profileData.name === 'string' && profileData.name.trim()) ||
      fallbackProfileName ||
      'Người dùng Zalo';
    const resolvedAvatarUrl =
      (typeof profileData.picture?.data?.url === 'string' && profileData.picture.data.url.trim()) ||
      fallbackProfileAvatar ||
      '';

    const user = await resolveOrCreateUser(
      {
        id: zaloId,
        name: resolvedProfileName,
        avatarUrl: resolvedAvatarUrl || null,
      },
      { trustedPhone: authPhone },
    );
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
      return NextResponse.json({ error: 'Failed to generate auth link', details: linkError }, { status: 500 });
    }

    const actionUrl = new URL(
      linkData.properties.action_link,
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oni.vn'
    );
    const otpToken = actionUrl.searchParams.get('token');
    const tokenHash = linkData.properties?.hashed_token || otpToken;

    if (!tokenHash) {
      return NextResponse.json({ error: 'No token in action link' }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase public environment variables');
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    });

    const { data: sessionData, error: verifyError } = await authClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink'
    });

    if (verifyError || !sessionData.session) {
      console.error('Supabase Verify OTP Error:', verifyError);
      return NextResponse.json({ error: 'Failed to verify session', details: verifyError }, { status: 500 });
    }

    return NextResponse.json({ session: sessionData.session });
  } catch (err: any) {
    console.error('Zalo Mini App Route Error:', err);
    if (err instanceof ZaloMobileAuthError) {
      return NextResponse.json({
        error: err.code,
        details: err.message,
      }, { status: err.status });
    }
    return NextResponse.json({
      error: 'Internal server error',
      details: err?.message || String(err),
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    }, { status: 500 });
  }
}
