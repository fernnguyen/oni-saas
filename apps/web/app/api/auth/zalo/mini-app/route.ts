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

async function findAuthUserByPhone(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  phone: string,
) {
  const authPhone = toVNPhonePlus84(phone);
  if (!authPhone) return null;

  const { data: phoneUser, error: phoneError } = await admin.rpc('get_user_by_phone', { p_phone: authPhone });
  if (!phoneError && phoneUser?.id) {
    return phoneUser as { id: string; email?: string | null; phone?: string | null; user_metadata?: Record<string, unknown> };
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

    const phoneUser = await findAuthUserByPhone(admin, phoneNumberStr);
    const canonicalUser = await findAuthUserByEmail(admin, canonicalZaloEmail);
    const legacyPhoneUser = await findAuthUserByEmail(admin, legacyPhoneEmail);
    let shouldSyncCanonicalEmail = false;

    if (phoneUser?.id && canonicalUser?.id && canonicalUser.id !== phoneUser.id) {
      return NextResponse.json({
        error: 'Zalo email conflicts with trusted phone user',
        details: 'Zalo này và số điện thoại Zalo đang trỏ tới hai tài khoản khác nhau. Vui lòng liên hệ hỗ trợ để gộp tài khoản.',
      }, { status: 409 });
    }

    if (phoneUser?.id && legacyPhoneUser?.id && legacyPhoneUser.id !== phoneUser.id) {
      return NextResponse.json({
        error: 'Legacy Zalo phone account conflicts with trusted phone user',
        details: 'Số điện thoại Zalo đang có dữ liệu lịch sử trên tài khoản khác. Vui lòng liên hệ hỗ trợ để gộp tài khoản.',
      }, { status: 409 });
    }

    if (linkedIdentity?.user_id) {
      if (phoneUser?.id && phoneUser.id !== linkedIdentity.user_id) {
        return NextResponse.json({
          error: 'Zalo identity conflicts with trusted phone user',
          details: 'Số điện thoại Zalo đã thuộc một tài khoản khác. Vui lòng liên hệ hỗ trợ để gộp tài khoản.',
        }, { status: 409 });
      }
      if (canonicalUser?.id && canonicalUser.id !== linkedIdentity.user_id) {
        return NextResponse.json({
          error: 'Zalo identity conflicts with canonical Zalo email user',
          details: 'Zalo này đã liên kết với tài khoản khác với email Zalo canonical. Vui lòng liên hệ hỗ trợ.',
        }, { status: 409 });
      }
      if (legacyPhoneUser?.id && legacyPhoneUser.id !== linkedIdentity.user_id) {
        return NextResponse.json({
          error: 'Zalo identity conflicts with legacy phone user',
          details: 'Zalo này đã liên kết với tài khoản khác với dữ liệu phone lịch sử. Vui lòng liên hệ hỗ trợ.',
        }, { status: 409 });
      }

      const { data: linkedUser } = await admin.auth.admin.getUserById(linkedIdentity.user_id);
      if (linkedUser.user) {
        shouldSyncCanonicalEmail = !linkedUser.user.email;
        resolvedEmail = linkedUser.user.email || canonicalZaloEmail;
        resolvedUserId = linkedUser.user.id;
      }
    }

    if (!resolvedUserId && phoneUser?.id) {
      shouldSyncCanonicalEmail = !phoneUser.email;
      resolvedEmail = phoneUser.email || canonicalZaloEmail;
      resolvedUserId = phoneUser.id;
    }

    if (!resolvedUserId && canonicalUser?.id) {
      resolvedEmail = canonicalUser.email || canonicalZaloEmail;
      resolvedUserId = canonicalUser.id;
    }

    if (!resolvedUserId && legacyPhoneUser?.id) {
      resolvedEmail = legacyPhoneUser.email || legacyPhoneEmail;
      resolvedUserId = legacyPhoneUser.id;
    }

    if (!resolvedUserId) {
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email: canonicalZaloEmail,
        email_confirm: true,
        phone: authPhone,
        phone_confirm: true,
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

    const { data: existingUserData } = await admin.auth.admin.getUserById(resolvedUserId);
    const existingMetadata = existingUserData?.user?.user_metadata || {};
    const currentFullName = typeof existingMetadata.full_name === 'string' ? existingMetadata.full_name.trim() : '';
    const currentAvatar = typeof existingMetadata.avatar_url === 'string' ? existingMetadata.avatar_url.trim() : '';

    const isFallbackName = !currentFullName || currentFullName === 'Người dùng Zalo' || currentFullName === 'Người dùng';

    let finalFullName = currentFullName;
    if (isFallbackName && resolvedProfileName && resolvedProfileName !== 'Người dùng Zalo' && resolvedProfileName !== 'Người dùng') {
      finalFullName = resolvedProfileName;
    } else if (!isFallbackName) {
      finalFullName = currentFullName;
    } else {
      finalFullName = resolvedProfileName || 'Người dùng Zalo';
    }

    const finalAvatarUrl = resolvedAvatarUrl || currentAvatar || '';

    const updatePayload: {
      phone?: string;
      phone_confirm: boolean;
      email?: string;
      email_confirm?: boolean;
      user_metadata: Record<string, string>;
    } = {
      phone: authPhone,
      phone_confirm: true,
      user_metadata: {
        ...existingMetadata,
        full_name: finalFullName,
        avatar_url: finalAvatarUrl,
        phone: phoneNumberStr,
        zalo_id: zaloId,
      },
    };

    if (shouldSyncCanonicalEmail || !resolvedEmail) {
      updatePayload.email = canonicalZaloEmail;
      updatePayload.email_confirm = true;
      resolvedEmail = canonicalZaloEmail;
    }

    const { error: syncError } = await admin.auth.admin.updateUserById(resolvedUserId, updatePayload);
    if (syncError) {
      console.error('Failed to sync auth phone for Zalo user', syncError);
      return NextResponse.json({ error: 'Failed to sync trusted Zalo phone', details: syncError }, { status: 409 });
    }

    const { data: existingIdentity } = await admin
      .from('user_identities')
      .select('id, user_id')
      .eq('provider', 'zalo')
      .eq('provider_id', zaloId)
      .maybeSingle();

    if (existingIdentity) {
      if (existingIdentity.user_id !== resolvedUserId) {
        return NextResponse.json({
          error: 'Zalo identity conflicts with resolved user',
          details: 'Zalo này đã liên kết với tài khoản khác. Vui lòng liên hệ hỗ trợ.',
        }, { status: 409 });
      }

      await admin.from('user_identities').update({
        name: finalFullName !== 'Người dùng Zalo' ? finalFullName : null,
        avatar: finalAvatarUrl || null,
        updated_at: new Date().toISOString(),
      }).eq('id', existingIdentity.id);
    } else {
      const { error: identityError } = await admin.from('user_identities').insert({
        id: `zalo_${zaloId}`,
        user_id: resolvedUserId,
        provider: 'zalo',
        provider_id: zaloId,
        name: finalFullName !== 'Người dùng Zalo' ? finalFullName : null,
        avatar: finalAvatarUrl || null,
      });

      if (identityError) {
        console.error('Failed to insert Zalo identity:', identityError);
        return NextResponse.json({ error: 'Failed to link Zalo identity', details: identityError }, { status: 500 });
      }
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
