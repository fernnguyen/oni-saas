import { getSupabaseAdminClient } from './supabaseAdmin';

export type QrLoginRequestStatus = 'pending' | 'confirmed' | 'expired';

export type QrLoginSessionPayload = {
  access_token: string;
  refresh_token: string;
};

export type QrLoginRequestRecord = {
  token: string;
  requested_origin: string;
  requested_host: string;
  tenant_slug: string | null;
  status: QrLoginRequestStatus;
  session_payload: QrLoginSessionPayload | null;
  confirmed_user_id: string | null;
  confirmed_name: string | null;
  confirmed_avatar: string | null;
  confirmed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type CreateQrLoginRequestInput = {
  token: string;
  requested_origin: string;
  requested_host: string;
  tenant_slug: string | null;
  expires_at: string;
};

type UpdateQrLoginRequestInput = Partial<
  Pick<
    QrLoginRequestRecord,
    | 'status'
    | 'session_payload'
    | 'confirmed_user_id'
    | 'confirmed_name'
    | 'confirmed_avatar'
    | 'confirmed_at'
    | 'updated_at'
  >
>;

export class QrLoginStoreNotReadyError extends Error {
  constructor() {
    super('Supabase table auth_qr_login_requests chưa tồn tại. Hãy chạy migration trước khi dùng QR login.');
    this.name = 'QrLoginStoreNotReadyError';
  }
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === '42P01' || candidate.message?.includes('auth_qr_login_requests') === true;
}

function normalizeRecord(row: Partial<QrLoginRequestRecord> & Pick<QrLoginRequestRecord, 'token' | 'requested_origin' | 'requested_host' | 'status' | 'expires_at'>): QrLoginRequestRecord {
  const now = new Date().toISOString();
  return {
    token: row.token,
    requested_origin: row.requested_origin,
    requested_host: row.requested_host,
    tenant_slug: row.tenant_slug ?? null,
    status: row.status,
    session_payload: row.session_payload ?? null,
    confirmed_user_id: row.confirmed_user_id ?? null,
    confirmed_name: row.confirmed_name ?? null,
    confirmed_avatar: row.confirmed_avatar ?? null,
    confirmed_at: row.confirmed_at ?? null,
    expires_at: row.expires_at,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  };
}

function rethrowStoreError(error: unknown): never {
  if (isMissingTableError(error)) {
    throw new QrLoginStoreNotReadyError();
  }
  throw error;
}

export async function createQrLoginRequest(input: CreateQrLoginRequestInput) {
  const record = normalizeRecord({
    ...input,
    status: 'pending',
  });

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from('auth_qr_login_requests').insert(record);

  if (error) {
    rethrowStoreError(error);
  }

  return record;
}

export async function getQrLoginRequest(token: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('auth_qr_login_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle<QrLoginRequestRecord>();

  if (error) {
    rethrowStoreError(error);
  }

  return data ?? null;
}

export async function updateQrLoginRequest(token: string, updates: UpdateQrLoginRequestInput) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('auth_qr_login_requests')
    .update(updates)
    .eq('token', token);

  if (error) {
    rethrowStoreError(error);
  }

  return getQrLoginRequest(token);
}
