import { revalidateTag } from 'next/cache';
import { decryptConnectorField, encryptConnectorField } from '@/lib/crypto';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

const SETTINGS_ROW_ID = 'global';
const SETTINGS_KEY = 'zalo_oa_auth';
const ZALO_OA_TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
const ZALO_OA_MESSAGE_URL = 'https://openapi.zalo.me/v3.0/oa/message/cs';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 25 * 60 * 60;
const MIN_REFRESH_BUFFER_SECONDS = 30 * 60;

type ZaloOAuthGrantType = 'authorization_code' | 'refresh_token';

type StoredZaloOAState = {
  encrypted_access_token?: string;
  encrypted_refresh_token?: string;
  access_token_expires_at?: string | null;
  refresh_token_expires_at?: string | null;
  last_synced_at?: string | null;
  last_error?: string | null;
  last_error_at?: string | null;
  token_source?: 'authorization_code' | 'refresh_token' | null;
  oa_id?: string | null;
};

type TokenRequestOptions = {
  grantType: ZaloOAuthGrantType;
  authorizationCode?: string;
  refreshToken?: string;
  codeVerifier?: string;
};

type ExchangeOptions = {
  codeVerifier?: string;
  oaId?: string;
};

type ManualTokenOptions = {
  accessToken: string;
  refreshToken: string;
  oaId?: string;
  expiresInSeconds?: number;
  refreshExpiresInSeconds?: number | null;
};

type SendMessageResult = {
  sent: boolean;
  reason:
    | 'sent'
    | 'disabled_by_setting'
    | 'missing_oa_access_token'
    | 'zalo_api_error'
    | 'zalo_fetch_failed'
    | 'token_refresh_failed';
  zaloResponse?: any;
};

function addSecondsToNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function secondsUntil(iso?: string | null) {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
}

async function getSystemSettingsConfig() {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('system_settings')
    .select('config')
    .eq('id', SETTINGS_ROW_ID)
    .single();

  if (error) throw error;
  return (data?.config || {}) as Record<string, any>;
}

async function saveZaloOAState(nextState: StoredZaloOAState) {
  const admin = getSupabaseAdminClient();
  const currentConfig = await getSystemSettingsConfig();
  const config = {
    ...currentConfig,
    [SETTINGS_KEY]: nextState,
  };

  const { error } = await admin
    .from('system_settings')
    .upsert({
      id: SETTINGS_ROW_ID,
      config,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
  // @ts-ignore - Next.js 16 signature mismatch
  revalidateTag('system_settings');
}

async function readStoredState() {
  const config = await getSystemSettingsConfig();
  return (config[SETTINGS_KEY] || {}) as StoredZaloOAState;
}

export async function isZaloOAMessageEnabled() {
  const config = await getSystemSettingsConfig();
  return config.sendOAMsg === true;
}

function normalizeTokenPayload(raw: any, fallbackRefreshToken?: string) {
  const accessToken = raw?.access_token as string | undefined;
  const refreshToken = (raw?.refresh_token as string | undefined) || fallbackRefreshToken;
  const expiresIn = Number(raw?.expires_in || DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
  const refreshExpiresInRaw = raw?.refresh_token_expires_in ?? raw?.refresh_expires_in ?? null;
  const refreshExpiresIn = refreshExpiresInRaw != null ? Number(refreshExpiresInRaw) : null;

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessToken ? addSecondsToNow(expiresIn) : null,
    refreshTokenExpiresAt:
      refreshToken && refreshExpiresIn && Number.isFinite(refreshExpiresIn)
        ? addSecondsToNow(refreshExpiresIn)
        : null,
  };
}

async function recordTokenError(message: string) {
  const current = await readStoredState().catch(() => ({} as StoredZaloOAState));
  await saveZaloOAState({
    ...current,
    last_error: message,
    last_error_at: new Date().toISOString(),
  });
}

async function requestZaloOAuthToken(options: TokenRequestOptions) {
  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('Missing ZALO_APP_ID or ZALO_APP_SECRET');
  }

  const body = new URLSearchParams({
    app_id: appId,
    grant_type: options.grantType,
  });

  if (options.authorizationCode) {
    body.set('code', options.authorizationCode);
  }
  if (options.refreshToken) {
    body.set('refresh_token', options.refreshToken);
  }
  if (options.codeVerifier) {
    body.set('code_verifier', options.codeVerifier);
  }

  const response = await fetch(ZALO_OA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      secret_key: appSecret,
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.message || payload?.error_name || payload?.error || 'Failed to exchange Zalo OA token');
  }

  return payload;
}

export async function exchangeAuthorizationCodeForZaloOA(
  authorizationCode: string,
  options: ExchangeOptions = {}
) {
  const raw = await requestZaloOAuthToken({
    grantType: 'authorization_code',
    authorizationCode,
    codeVerifier: options.codeVerifier,
  });

  const normalized = normalizeTokenPayload(raw);
  if (!normalized.accessToken || !normalized.refreshToken) {
    throw new Error('Zalo OA token response missing access_token or refresh_token');
  }

  await saveZaloOAState({
    encrypted_access_token: encryptConnectorField(normalized.accessToken),
    encrypted_refresh_token: encryptConnectorField(normalized.refreshToken),
    access_token_expires_at: normalized.accessTokenExpiresAt,
    refresh_token_expires_at: normalized.refreshTokenExpiresAt,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    last_error_at: null,
    token_source: 'authorization_code',
    oa_id: options.oaId || null,
  });

  return getZaloOAStatus();
}

export async function saveManualZaloOATokens(options: ManualTokenOptions) {
  const accessToken = options.accessToken.trim();
  const refreshToken = options.refreshToken.trim();

  if (!accessToken || !refreshToken) {
    throw new Error('Missing access token or refresh token');
  }

  await saveZaloOAState({
    encrypted_access_token: encryptConnectorField(accessToken),
    encrypted_refresh_token: encryptConnectorField(refreshToken),
    access_token_expires_at: addSecondsToNow(options.expiresInSeconds || DEFAULT_ACCESS_TOKEN_TTL_SECONDS),
    refresh_token_expires_at:
      options.refreshExpiresInSeconds && Number.isFinite(options.refreshExpiresInSeconds)
        ? addSecondsToNow(options.refreshExpiresInSeconds)
        : null,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    last_error_at: null,
    token_source: 'authorization_code',
    oa_id: options.oaId || null,
  });

  return getZaloOAStatus();
}

export async function refreshStoredZaloOAAccessToken() {
  const state = await readStoredState();
  if (!state.encrypted_refresh_token) {
    throw new Error('Missing stored Zalo OA refresh token');
  }

  const refreshToken = decryptConnectorField(state.encrypted_refresh_token);
  const raw = await requestZaloOAuthToken({
    grantType: 'refresh_token',
    refreshToken,
  });

  const normalized = normalizeTokenPayload(raw, refreshToken);
  if (!normalized.accessToken) {
    throw new Error('Zalo OA refresh response missing access_token');
  }

  await saveZaloOAState({
    encrypted_access_token: encryptConnectorField(normalized.accessToken),
    encrypted_refresh_token: normalized.refreshToken
      ? encryptConnectorField(normalized.refreshToken)
      : state.encrypted_refresh_token,
    access_token_expires_at: normalized.accessTokenExpiresAt,
    refresh_token_expires_at: normalized.refreshTokenExpiresAt || state.refresh_token_expires_at || null,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    last_error_at: null,
    token_source: 'refresh_token',
    oa_id: state.oa_id || null,
  });

  return normalized.accessToken;
}

export async function ensureValidZaloOAAccessToken(minValiditySeconds = MIN_REFRESH_BUFFER_SECONDS) {
  const state = await readStoredState();

  if (state.encrypted_access_token && state.access_token_expires_at) {
    const remaining = secondsUntil(state.access_token_expires_at);
    if (remaining != null && remaining > minValiditySeconds) {
      try {
        return decryptConnectorField(state.encrypted_access_token);
      } catch (error: any) {
        await recordTokenError(`decrypt_access_token_failed:${error?.message || String(error)}`);
      }
    }
  }

  if (!state.encrypted_refresh_token) {
    return null;
  }

  try {
    return await refreshStoredZaloOAAccessToken();
  } catch (error: any) {
    await recordTokenError(`refresh_failed:${error?.message || String(error)}`);
    return null;
  }
}

export async function sendZaloOAMessageToUser(zaloIdByOA: string, message: string): Promise<SendMessageResult> {
  const accessToken = await ensureValidZaloOAAccessToken();
  if (!accessToken) {
    const state = await readStoredState().catch(() => ({} as StoredZaloOAState));
    return {
      sent: false,
      reason: state.encrypted_refresh_token ? 'token_refresh_failed' : 'missing_oa_access_token',
    };
  }

  try {
    const response = await fetch(ZALO_OA_MESSAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: accessToken,
      },
      body: JSON.stringify({
        recipient: { user_id: zaloIdByOA },
        message: { text: message },
      }),
    });

    const zaloResponse = await response.json().catch(() => null);
    if (response.ok && zaloResponse?.error === 0) {
      return { sent: true, reason: 'sent', zaloResponse };
    }

    return {
      sent: false,
      reason: 'zalo_api_error',
      zaloResponse,
    };
  } catch (error) {
    console.error('[ZaloOA] sendZaloOAMessageToUser failed:', error);
    return {
      sent: false,
      reason: 'zalo_fetch_failed',
    };
  }
}

export async function getZaloOAStatus() {
  const state = await readStoredState();
  const accessTokenSecondsLeft = secondsUntil(state.access_token_expires_at);
  const refreshTokenSecondsLeft = secondsUntil(state.refresh_token_expires_at);

  return {
    configured: !!state.encrypted_access_token || !!state.encrypted_refresh_token,
    hasAccessToken: !!state.encrypted_access_token,
    hasRefreshToken: !!state.encrypted_refresh_token,
    accessTokenExpiresAt: state.access_token_expires_at || null,
    refreshTokenExpiresAt: state.refresh_token_expires_at || null,
    accessTokenSecondsLeft,
    refreshTokenSecondsLeft,
    isAccessTokenExpiringSoon:
      accessTokenSecondsLeft != null ? accessTokenSecondsLeft <= MIN_REFRESH_BUFFER_SECONDS : false,
    lastSyncedAt: state.last_synced_at || null,
    lastError: state.last_error || null,
    lastErrorAt: state.last_error_at || null,
    tokenSource: state.token_source || null,
    oaId: state.oa_id || null,
  };
}
