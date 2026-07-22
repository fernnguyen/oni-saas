import { createClient, type User } from '@supabase/supabase-js';
import { env } from '../env';
import { getSupabaseAdminClient } from './supabaseAdmin';

type ZaloAuthInput = {
  accessToken?: string;
  oauthCode?: string;
  codeVerifier?: string;
};

type ZaloProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
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

async function resolveOrCreateUser(profile: ZaloProfile): Promise<User> {
  const admin = getSupabaseAdminClient();
  const placeholderEmail = `zalo_${profile.id}@oni.vn`;

  const [{ data: identity, error: identityError }, emailUser] = await Promise.all([
    admin
      .from('user_identities')
      .select('id, user_id')
      .eq('provider', 'zalo')
      .eq('provider_id', profile.id)
      .maybeSingle(),
    findAuthUserByEmail(admin, placeholderEmail),
  ]);

  if (identityError) throw identityError;

  let user: User | null = null;
  if (identity?.user_id) {
    const { data, error } = await admin.auth.admin.getUserById(identity.user_id);
    if (error || !data.user) throw error ?? new Error('Không tìm thấy tài khoản đã liên kết');
    user = data.user;
  }

  if (user && emailUser && user.id !== emailUser.id) {
    throw new ZaloMobileAuthError(
      'Tài khoản Zalo đang trỏ tới hai người dùng khác nhau',
      409,
      'ZALO_IDENTITY_CONFLICT',
    );
  }
  user ??= emailUser;

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: placeholderEmail,
      email_confirm: true,
      user_metadata: {
        full_name: profile.name,
        name: profile.name,
        avatar_url: profile.avatarUrl,
        zalo_id: profile.id,
        provider: 'zalo',
      },
    });
    if (error || !data.user) throw error ?? new Error('Không thể tạo tài khoản Zalo');
    user = data.user;
  } else {
    const currentFullName =
      typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name.trim()
        : '';
    const shouldUseZaloName =
      !currentFullName || currentFullName === 'Người dùng Zalo' || currentFullName === 'Người dùng';
    const currentAvatar =
      typeof user.user_metadata?.avatar_url === 'string'
        ? user.user_metadata.avatar_url.trim()
        : '';
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        full_name: shouldUseZaloName ? profile.name : currentFullName,
        name: user.user_metadata?.name || profile.name,
        avatar_url: profile.avatarUrl || currentAvatar || null,
        zalo_id: profile.id,
        provider: 'zalo',
      },
    });
    if (error || !data.user) throw error ?? new Error('Không thể cập nhật tài khoản Zalo');
    user = data.user;
  }

  if (identity) {
    if (identity.user_id !== user.id) {
      throw new ZaloMobileAuthError(
        'Tài khoản Zalo đã liên kết với người dùng khác',
        409,
        'ZALO_ALREADY_LINKED',
      );
    }
    const { error } = await admin
      .from('user_identities')
      .update({ name: profile.name, avatar: profile.avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', identity.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from('user_identities').insert({
      id: `zalo_${profile.id}`,
      user_id: user.id,
      provider: 'zalo',
      provider_id: profile.id,
      name: profile.name,
      avatar: profile.avatarUrl,
    });
    if (error) throw error;
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
