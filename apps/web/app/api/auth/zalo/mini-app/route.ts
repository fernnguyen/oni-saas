import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { token, accessToken } = await req.json();

    if (!token || !accessToken) {
      return NextResponse.json({ error: 'Missing token or accessToken' }, { status: 400 });
    }

    const appId = process.env.ZALO_APP_ID;
    const appSecret = process.env.ZALO_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json({ error: 'Missing Zalo Config' }, { status: 500 });
    }

    // 1. Fetch phone number from Zalo
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

    // 2. Fetch Zalo profile for name and avatar
    let profileData: any = {};
    try {
      const profileRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
        headers: { 'access_token': accessToken }
      });
      profileData = await profileRes.json();
    } catch (e) {
      console.warn('Failed to fetch profile', e);
    }

    const zaloEmail = `zalo_${phoneNumberStr}@oni.vn`;
    const admin = getSupabaseAdminClient();

    // 3. Create user if they don't exist
    const { error: createError } = await admin.auth.admin.createUser({
      email: zaloEmail,
      email_confirm: true,
      user_metadata: {
        full_name: profileData.name || 'Người dùng Zalo',
        avatar_url: profileData.picture?.data?.url || '',
        phone: phoneNumberStr,
        zalo_id: profileData.id,
      }
    });

    if (createError) {
      const isAlreadyExists = 
        (createError.message && createError.message.toLowerCase().includes('already')) || 
        createError.status === 422;
        
      if (!isAlreadyExists) {
        console.error('Supabase Create User Error:', createError);
        return NextResponse.json({ error: 'Failed to create user', details: createError }, { status: 500 });
      }
    }

    // 4. Generate magic link to get OTP token
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: zaloEmail,
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Supabase Generate Link Error:', linkError);
      return NextResponse.json({ error: 'Failed to generate auth link', details: linkError }, { status: 500 });
    }

    // Pass the base URL in case action_link is relative
    const actionUrl = new URL(linkData.properties.action_link, process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oni.vn');
    const otpToken = actionUrl.searchParams.get('token');

    if (!otpToken) {
      return NextResponse.json({ error: 'No token in action link' }, { status: 500 });
    }

    // 5. Verify OTP using an anonymous client (to get session JSON without setting cookies on backend)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase public environment variables');
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { 
      auth: { persistSession: false } 
    });

    const { data: sessionData, error: verifyError } = await authClient.auth.verifyOtp({
      email: zaloEmail,
      token: otpToken,
      type: 'magiclink'
    });

    if (verifyError || !sessionData.session) {
      console.error('Supabase Verify OTP Error:', verifyError);
      return NextResponse.json({ error: 'Failed to verify session', details: verifyError }, { status: 500 });
    }

    // Return the session to the Mini App
    return NextResponse.json({ session: sessionData.session });
  } catch (err: any) {
    console.error('Zalo Mini App Route Error:', err);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: err?.message || String(err),
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    }, { status: 500 });
  }
}
