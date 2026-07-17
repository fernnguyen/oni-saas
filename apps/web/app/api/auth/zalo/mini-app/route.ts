import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';
import { toVNPhonePlus84 } from '../../../../../lib/utils/phone';

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

    const canonicalZaloEmail = `zalo_${zaloId}@oni.vn`;
    const legacyPhoneEmail = `zalo_${phoneNumberStr}@oni.vn`;
    const admin = getSupabaseAdminClient();

    let resolvedEmail = canonicalZaloEmail;
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
      const canonicalUser = await findAuthUserByEmail(admin, canonicalZaloEmail);
      if (canonicalUser?.email) {
        resolvedEmail = canonicalUser.email;
        resolvedUserId = canonicalUser.id;
      }
    }

    if (!resolvedUserId) {
      const legacyPhoneUser = await findAuthUserByEmail(admin, legacyPhoneEmail);
      if (legacyPhoneUser?.email) {
        resolvedEmail = legacyPhoneUser.email;
        resolvedUserId = legacyPhoneUser.id;
      }
    }

    if (!resolvedUserId) {
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email: canonicalZaloEmail,
        email_confirm: true,
        user_metadata: {
          full_name: resolvedProfileName,
          avatar_url: resolvedAvatarUrl,
          phone: phoneNumberStr,
          zalo_id: zaloId,
        }
      });

      if (createError || !createdUser.user) {
        console.error('Supabase Create User Error:', createError);
        return NextResponse.json({ error: 'Failed to create user', details: createError }, { status: 500 });
      }

      resolvedEmail = createdUser.user.email || canonicalZaloEmail;
      resolvedUserId = createdUser.user.id;
    }

    const authPhone = toVNPhonePlus84(phoneNumberStr);
    if (resolvedUserId && authPhone) {
      await admin.auth.admin.updateUserById(resolvedUserId, {
        phone: authPhone,
        phone_confirm: true,
        user_metadata: {
          full_name: resolvedProfileName,
          avatar_url: resolvedAvatarUrl,
          phone: phoneNumberStr,
          zalo_id: zaloId,
        },
      }).catch((error) => {
        console.warn('Failed to sync auth phone for Zalo user', error);
      });
    }

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

    const userId = sessionData.session.user.id;
    const { data: existingIdentity } = await admin
      .from('user_identities')
      .select('id')
      .eq('provider', 'zalo')
      .eq('provider_id', zaloId)
      .maybeSingle();

    if (!existingIdentity) {
      await admin.from('user_identities').insert({
        id: `zalo_${zaloId}`,
        user_id: userId,
        provider: 'zalo',
        provider_id: zaloId,
        name: resolvedProfileName || null,
        avatar: resolvedAvatarUrl || null,
      });
    }

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
