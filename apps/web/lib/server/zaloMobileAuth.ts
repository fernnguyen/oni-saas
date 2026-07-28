import { createClient, type User } from '@supabase/supabase-js';
import { env } from '../env';
import { getSupabaseAdminClient } from './supabaseAdmin';
import { toVNPhonePlus84 } from '../utils/phone';

type ZaloAuthInput = {
  accessToken?: string;
  oauthCode?: string;
  codeVerifier?: string;
};

export type ZaloProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type ZaloUserResolutionOptions = {
  trustedPhone?: string | null;
};

export class ZaloMobileAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ZaloMobileAuthError';
  }
}

async function exchangeOAuthCode(oauthCode: string, codeVerifier?: string): Promise<string> {
  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;

  if (!appId || !appSecret) {
    throw new ZaloMobileAuthError('Zalo chưa được cấu hình trên máy chủ', 500, 'ZALO_CONFIG_MISSING');
  }

  const body = new URLSearchParams({
    app_id: appId,
    grant_type: 'authorization_code',
    code: oauthCode,
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const response = await fetch('https://oauth.zaloapp.com/v4/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: appSecret,
    },
    body,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || typeof data?.access_token !== 'string' || !data.access_token) {
    throw new ZaloMobileAuthError(
      'Không đổi được mã xác thực Zalo',
      401,
      'ZALO_TOKEN_EXCHANGE_FAILED',
      data,
    );
  }

  return data.access_token;
}

async function fetchZaloProfile(accessToken: string): Promise<ZaloProfile> {
  const response = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
    headers: { access_token: accessToken },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || typeof data?.id !== 'string' || !data.id) {
    throw new ZaloMobileAuthError(
      'Không lấy được thông tin người dùng từ Zalo',
      401,
      'ZALO_PROFILE_FAILED',
      data,
    );
  }

  return {
    id: data.id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Người dùng Zalo',
    avatarUrl:
      typeof data.picture?.data?.url === 'string' && data.picture.data.url.trim()
        ? data.picture.data.url.trim()
        : null,
  };
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  email: string,
): Promise<User | null> {
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const matched = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (matched) return matched;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function findAuthUsersByEmails(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  emails: string[],
): Promise<Map<string, User>> {
  const targets = new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  const matched = new Map<string, User>();
  if (targets.size === 0) return matched;

  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    for (const user of users) {
      const normalizedEmail = user.email?.trim().toLowerCase();
      if (normalizedEmail && targets.has(normalizedEmail)) {
        matched.set(normalizedEmail, user);
      }
    }

    if (matched.size === targets.size || users.length < perPage) return matched;
    page += 1;
  }
}

async function findAuthUserByPhone(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  normalizedPhone: string,
): Promise<User | null> {
  const { data, error } = await admin.rpc('get_user_by_phone', { p_phone: normalizedPhone });
  if (error) {
    throw new ZaloMobileAuthError(
      'Không thể đối chiếu số điện thoại Zalo',
      503,
      'ZALO_PHONE_LOOKUP_FAILED',
      error,
    );
  }
  if (!data?.id) return null;

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(data.id);
  if (userError || !userData.user) {
    throw new ZaloMobileAuthError(
      'Không tìm thấy tài khoản khớp số điện thoại Zalo',
      409,
      'ZALO_PHONE_USER_MISSING',
      userError,
    );
  }
  return userData.user;
}

function buildLegacyZaloEmails(phone: string | null, canonicalEmail: string) {
  if (!phone) return [];

  const phone84 = phone.replace(/^\+/, '');
  const localPhone = phone84.startsWith('84') ? `0${phone84.slice(2)}` : phone84;
  const candidates = [
    `zalo_${phone}@oni.vn`,
    `zalo_${phone84}@oni.vn`,
    `zalo_${localPhone}@oni.vn`,
  ];

  return Array.from(new Set(candidates.map((email) => email.toLowerCase())))
    .filter((email) => email !== canonicalEmail.toLowerCase());
}

type StoredUserIdentity = {
  id: string;
  user_id: string;
};

async function ensureUserIdentity(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    id: string;
    provider: 'zalo' | 'phone';
    providerId: string;
    userId: string;
    name: string | null;
    avatar: string | null;
  },
  knownIdentity?: StoredUserIdentity | null,
) {
  let identity = knownIdentity;
  if (identity === undefined) {
    const { data, error } = await admin
      .from('user_identities')
      .select('id, user_id')
      .eq('provider', input.provider)
      .eq('provider_id', input.providerId)
      .maybeSingle();
    if (error) throw error;
    identity = data;
  }

  const identityPayload = {
    name: input.name,
    avatar: input.avatar,
    updated_at: new Date().toISOString(),
  };

  if (identity) {
    if (identity.user_id !== input.userId) {
      throw new ZaloMobileAuthError(
        `Identity ${input.provider} đã liên kết với người dùng khác`,
        409,
        input.provider === 'phone' ? 'ZALO_PHONE_IDENTITY_CONFLICT' : 'ZALO_ALREADY_LINKED',
      );
    }
    const { error } = await admin
      .from('user_identities')
      .update(identityPayload)
      .eq('id', identity.id);
    if (error) throw error;
    return;
  }

  const { error: insertError } = await admin.from('user_identities').insert({
    id: input.id,
    user_id: input.userId,
    provider: input.provider,
    provider_id: input.providerId,
    ...identityPayload,
  });
  if (!insertError) return;

  // The unique(provider, provider_id) index arbitrates concurrent channel logins.
  const { data: racedIdentity, error: racedIdentityError } = await admin
    .from('user_identities')
    .select('user_id')
    .eq('provider', input.provider)
    .eq('provider_id', input.providerId)
    .maybeSingle();
  if (racedIdentityError || racedIdentity?.user_id !== input.userId) {
    throw new ZaloMobileAuthError(
      `Identity ${input.provider} vừa được liên kết với người dùng khác`,
      409,
      input.provider === 'phone'
        ? 'ZALO_PHONE_IDENTITY_RACE_CONFLICT'
        : 'ZALO_IDENTITY_RACE_CONFLICT',
      insertError,
    );
  }
}

export async function resolveOrCreateUser(
  profile: ZaloProfile,
  options: ZaloUserResolutionOptions = {},
): Promise<User> {
  const admin = getSupabaseAdminClient();
  const zaloId = profile.id.trim();
  if (!zaloId) {
    throw new ZaloMobileAuthError('Thiếu định danh người dùng Zalo', 400, 'ZALO_ID_MISSING');
  }

  const canonicalEmail = `zalo_${zaloId}@oni.vn`.toLowerCase();
  const suppliedPhone = options.trustedPhone?.trim() || '';
  const normalizedPhone = suppliedPhone ? toVNPhonePlus84(suppliedPhone) : null;
  if (suppliedPhone && !normalizedPhone) {
    throw new ZaloMobileAuthError(
      'Số điện thoại do Zalo trả về không hợp lệ',
      400,
      'ZALO_PHONE_INVALID',
    );
  }

  const legacyEmails = buildLegacyZaloEmails(normalizedPhone, canonicalEmail);
  const emailCandidates = [canonicalEmail, ...legacyEmails];
  const [zaloIdentityResult, phoneIdentityResult, emailUsers, phoneUser] = await Promise.all([
    admin
      .from('user_identities')
      .select('id, user_id')
      .eq('provider', 'zalo')
      .eq('provider_id', zaloId)
      .maybeSingle(),
    normalizedPhone
      ? admin
          .from('user_identities')
          .select('id, user_id')
          .eq('provider', 'phone')
          .eq('provider_id', normalizedPhone)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    findAuthUsersByEmails(admin, emailCandidates),
    normalizedPhone ? findAuthUserByPhone(admin, normalizedPhone) : Promise.resolve(null),
  ]);

  if (zaloIdentityResult.error) throw zaloIdentityResult.error;
  if (phoneIdentityResult.error) throw phoneIdentityResult.error;
  const zaloIdentity = zaloIdentityResult.data as StoredUserIdentity | null;
  const phoneIdentity = phoneIdentityResult.data as StoredUserIdentity | null;

  const identityUsers: Array<{ source: string; user: User }> = [];
  for (const item of [
    { source: 'zalo_identity', identity: zaloIdentity },
    { source: 'phone_identity', identity: phoneIdentity },
  ]) {
    if (!item.identity?.user_id) continue;
    const { data, error } = await admin.auth.admin.getUserById(item.identity.user_id);
    if (error || !data.user) {
      throw new ZaloMobileAuthError(
        `Không tìm thấy tài khoản đã liên kết với ${item.source}`,
        409,
        item.source === 'phone_identity'
          ? 'ZALO_PHONE_LINKED_USER_MISSING'
          : 'ZALO_LINKED_USER_MISSING',
        error,
      );
    }
    identityUsers.push({ source: item.source, user: data.user });
  }

  const candidates: Array<{ source: string; user: User }> = [...identityUsers];
  if (phoneUser) candidates.push({ source: 'trusted_phone', user: phoneUser });
  for (const email of emailCandidates) {
    const emailUser = emailUsers.get(email.toLowerCase());
    if (emailUser) {
      candidates.push({
        source: email === canonicalEmail ? 'canonical_zalo_email' : 'legacy_zalo_phone_email',
        user: emailUser,
      });
    }
  }

  const usersById = new Map<string, User>();
  for (const candidate of candidates) usersById.set(candidate.user.id, candidate.user);
  if (usersById.size > 1) {
    throw new ZaloMobileAuthError(
      'Định danh Zalo, email Zalo và số điện thoại đang trỏ tới các tài khoản khác nhau. Vui lòng liên hệ hỗ trợ để gộp tài khoản.',
      409,
      'ZALO_IDENTITY_CONFLICT',
      { sources: candidates.map((candidate) => candidate.source) },
    );
  }

  let user = usersById.values().next().value as User | undefined;
  let createdUserIdByRequest: string | null = null;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: canonicalEmail,
      email_confirm: true,
      ...(normalizedPhone ? { phone: normalizedPhone, phone_confirm: true } : {}),
      user_metadata: {
        full_name: profile.name,
        name: profile.name,
        avatar_url: profile.avatarUrl,
        phone: normalizedPhone,
        zalo_id: zaloId,
        provider: 'zalo',
      },
    });

    if (error || !data.user) {
      // A concurrent login from another channel may have created the canonical
      // auth user after our lookup. Resolve it once more instead of creating a duplicate.
      const [racedEmailUser, racedPhoneUser] = await Promise.all([
        findAuthUserByEmail(admin, canonicalEmail),
        normalizedPhone ? findAuthUserByPhone(admin, normalizedPhone) : Promise.resolve(null),
      ]);
      if (racedEmailUser && racedPhoneUser && racedEmailUser.id !== racedPhoneUser.id) {
        throw new ZaloMobileAuthError(
          'Email Zalo và số điện thoại vừa được liên kết với hai tài khoản khác nhau',
          409,
          'ZALO_CONCURRENT_IDENTITY_CONFLICT',
        );
      }
      user = racedEmailUser || racedPhoneUser || undefined;
      if (!user) {
        throw new ZaloMobileAuthError(
          'Không thể tạo tài khoản Zalo',
          500,
          'ZALO_USER_CREATE_FAILED',
          error,
        );
      }
    } else {
      user = data.user;
      createdUserIdByRequest = data.user.id;
    }
  }

  const currentMetadata = user.user_metadata || {};
  const currentFullName =
    typeof currentMetadata.full_name === 'string' ? currentMetadata.full_name.trim() : '';
  const currentAvatar =
    typeof currentMetadata.avatar_url === 'string' ? currentMetadata.avatar_url.trim() : '';
  const currentZaloId =
    typeof currentMetadata.zalo_id === 'string' ? currentMetadata.zalo_id.trim() : '';
  const shouldUseZaloName =
    !currentFullName || currentFullName === 'Người dùng Zalo' || currentFullName === 'Người dùng';
  const currentEmail = user.email?.trim().toLowerCase() || '';
  const shouldCanonicalizeEmail = !currentEmail || legacyEmails.includes(currentEmail);

  const updatePayload: {
    email?: string;
    email_confirm?: boolean;
    phone?: string;
    phone_confirm?: boolean;
    user_metadata: Record<string, unknown>;
  } = {
    user_metadata: {
      ...currentMetadata,
      full_name: shouldUseZaloName ? profile.name : currentFullName,
      name: currentMetadata.name || profile.name,
      avatar_url: profile.avatarUrl || currentAvatar || null,
      phone: normalizedPhone || currentMetadata.phone || null,
      zalo_id: currentZaloId || zaloId,
      provider: 'zalo',
    },
  };

  if (normalizedPhone) {
    updatePayload.phone = normalizedPhone;
    updatePayload.phone_confirm = true;
  }
  if (shouldCanonicalizeEmail) {
    updatePayload.email = canonicalEmail;
    updatePayload.email_confirm = true;
  }

  const { data: updatedUserData, error: updateError } = await admin.auth.admin.updateUserById(
    user.id,
    updatePayload,
  );
  if (updateError || !updatedUserData.user) {
    if (createdUserIdByRequest) {
      await admin.auth.admin.deleteUser(createdUserIdByRequest).catch(() => {});
    }
    throw new ZaloMobileAuthError(
      'Không thể đồng bộ định danh tài khoản Zalo',
      409,
      'ZALO_USER_SYNC_FAILED',
      updateError,
    );
  }
  user = updatedUserData.user;

  const identityProfile = {
    name: profile.name || null,
    avatar: profile.avatarUrl || null,
  };
  try {
    await ensureUserIdentity(
      admin,
      {
        id: `zalo_${zaloId}`,
        provider: 'zalo',
        providerId: zaloId,
        userId: user.id,
        ...identityProfile,
      },
      zaloIdentity,
    );

    if (normalizedPhone) {
      await ensureUserIdentity(
        admin,
        {
          id: `phone_${normalizedPhone.replace(/\D/g, '')}`,
          provider: 'phone',
          providerId: normalizedPhone,
          userId: user.id,
          ...identityProfile,
        },
        phoneIdentity,
      );
    }
  } catch (error) {
    // Only roll back a user created inside this unresolved login attempt.
    // Existing linked users and their tenant data are never deleted here.
    if (createdUserIdByRequest) {
      await admin.auth.admin.deleteUser(createdUserIdByRequest).catch(() => {});
    }
    throw error;
  }

  return user;
}

async function createSupabaseSession(user: User) {
  if (!user.email) throw new Error('Tài khoản Zalo không có email hệ thống');

  const admin = getSupabaseAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) throw linkError ?? new Error('Không thể tạo mã đăng nhập');

  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (error || !data.session) throw error ?? new Error('Không thể tạo phiên đăng nhập');

  return data.session;
}

export async function authenticateZaloMobile(input: ZaloAuthInput) {
  const accessToken = input.accessToken || (
    input.oauthCode ? await exchangeOAuthCode(input.oauthCode, input.codeVerifier) : ''
  );
  if (!accessToken) {
    throw new ZaloMobileAuthError(
      'Thiếu accessToken hoặc oauthCode',
      400,
      'ZALO_CREDENTIAL_MISSING',
    );
  }

  const profile = await fetchZaloProfile(accessToken);
  const user = await resolveOrCreateUser(profile);
  const session = await createSupabaseSession(user);

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user: {
      id: user.id,
      name: profile.name,
      avatar_url: profile.avatarUrl,
      zalo_id: profile.id,
    },
  };
}
