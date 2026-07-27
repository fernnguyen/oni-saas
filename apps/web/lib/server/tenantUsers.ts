import { getSupabaseAdminClient } from './supabaseAdmin';
import { normalizeVNPhone, toVNPhone84, toVNPhonePlus84 } from '../utils/phone';

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
// Strip port (e.g. localhost:3000 → localhost) so the fake email is always valid RFC 5321
const ONI_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'oni.vn').replace(/:\d+$/, '');

export function buildFakeEmail(username: string, tenantSlug: string): string {
  return `${username}@${tenantSlug}.${ONI_DOMAIN}`;
}

export function parseFakeEmail(email: string): { username: string; tenantSlug: string } | null {
  const match = email.match(/^([^@]+)@([^.]+)\..+$/);
  if (!match) return null;
  return { username: match[1], tenantSlug: match[2] };
}

function buildPhoneAuthEmail(phone: string, tenantSlug: string): string {
  return buildFakeEmail(phone, tenantSlug);
}

type AuthUserIdentity = {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown>;
};

async function findAuthUserByEmail(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  email: string,
): Promise<AuthUserIdentity | null> {
  const normalizedEmail = email.toLowerCase();

  // ── Fast path (M-2 fix): query tenant_user_profiles first ─────────────────
  // Covers ~99% of cases: existing users already have a login_email record.
  // This avoids scanning up to 100k auth.users for every lookup.
  const { data: profileByLoginEmail } = await admin
    .from('tenant_user_profiles')
    .select('user_id, login_email')
    .ilike('login_email', normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (profileByLoginEmail?.user_id) {
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(profileByLoginEmail.user_id);
    if (authError || !authData.user) {
      // Auth user may have been deleted — return profile data as fallback
      return {
        id: profileByLoginEmail.user_id,
        email: profileByLoginEmail.login_email,
        phone: null,
        user_metadata: {},
      };
    }
    return {
      id: authData.user.id,
      email: authData.user.email ?? profileByLoginEmail.login_email,
      phone: authData.user.phone ?? null,
      user_metadata: authData.user.user_metadata,
    };
  }

  // ── Slow path: scan auth.users for users not yet in any tenant ─────────────
  // Reduced from 100 pages (100k users) to 5 pages (5k users) to limit latency.
  // This handles the case of a user who signed up directly but has no tenant yet.
  const perPage = 1000;
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const users = data?.users ?? [];
    const existingUser = users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (existingUser) {
      return {
        id: existingUser.id,
        email: existingUser.email ?? null,
        phone: existingUser.phone ?? null,
        user_metadata: existingUser.user_metadata,
      };
    }
    if (users.length < perPage) break;
  }

  return null;
}

export type TenantUserRole = 'owner' | 'admin' | 'staff' | 'viewer';

// ─── Create workspace account (username + fake email) ─────────────────────────

export interface CreateWorkspaceUserParams {
  accountType: 'workspace';
  tenantId: string;
  tenantSlug: string;
  username: string;
  password: string;
  displayName?: string;
  roleCode: string;
  shopId?: string;
}

// ─── Create personal email account ────────────────────────────────────────────

export interface CreatePersonalUserParams {
  accountType: 'personal';
  tenantId: string;
  email: string;
  password?: string;
  displayName?: string;
  roleCode: string;
  shopId?: string;
}

export interface CreatePhoneUserParams {
  accountType: 'phone';
  tenantId: string;
  phone: string;
  password?: string;
  displayName?: string;
  roleCode: string;
  shopId?: string;
}

export type CreateTenantUserParams = CreateWorkspaceUserParams | CreatePersonalUserParams | CreatePhoneUserParams;

export async function createTenantUser(params: CreateTenantUserParams) {
  const admin = getSupabaseAdminClient();

  // ── Plan limit check ────────────────────────────────────────
  const { enforceLimit } = await import('./planLimits');
  await enforceLimit('create_shop_user', { tenantId: params.tenantId }, params.tenantId);

  if (params.accountType === 'workspace') {
    return _createWorkspaceUser(params);
  }
  if (params.accountType === 'phone') {
    return _createPhoneUser(params);
  }
  return _createPersonalUser(params);
}

async function _createWorkspaceUser(params: CreateWorkspaceUserParams) {
  const { tenantId, tenantSlug, username, password, displayName, roleCode, shopId } = params;
  const admin = getSupabaseAdminClient();

  if (!USERNAME_REGEX.test(username)) {
    throw new Error('Tên đăng nhập chỉ được dùng chữ thường, số, dấu gạch dưới (_), 3–30 ký tự');
  }

  // Duplicate username check
  const { data: existing } = await admin
    .from('tenant_user_profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('username', username)
    .maybeSingle();
  if (existing) throw new Error('Tên đăng nhập đã tồn tại trong workspace này');

  const email = buildFakeEmail(username, tenantSlug);
  const name = displayName ?? username;

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, tenant_slug: tenantSlug, display_name: name, is_tenant_user: true },
  });
  if (authError || !authData.user) throw new Error(authError?.message ?? 'Không thể tạo tài khoản');

  return _finalizeUser({ admin, userId: authData.user.id, tenantId, roleCode, shopId, profile: {
    username, display_name: name, account_type: 'workspace', login_email: email,
  }});
}

async function _createPersonalUser(params: CreatePersonalUserParams) {
  const { tenantId, email, password, displayName, roleCode, shopId } = params;
  const admin = getSupabaseAdminClient();

  // Block fake ONI emails from being used as personal email
  if (email.endsWith('.oni.vn') || email.endsWith('.oni.local')) {
    throw new Error('Không thể dùng email này cho tài khoản cá nhân');
  }

  // Check if email already registered — add to tenant without re-creating
  const existingUser = await findAuthUserByEmail(admin, email);

  if (existingUser) {
    // User already exists — just add to this tenant (if not already a member)
    const { data: alreadyMember } = await admin
      .from('tenant_user_profiles')
      .select('id')
      .eq('user_id', existingUser.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (alreadyMember) throw new Error('Email này đã là thành viên của workspace');

    const existingDisplayName =
      typeof existingUser.user_metadata?.display_name === 'string'
        ? existingUser.user_metadata.display_name
        : typeof existingUser.user_metadata?.full_name === 'string'
          ? existingUser.user_metadata.full_name
          : email;

    return _finalizeUser({ admin, userId: existingUser.id, tenantId, roleCode, shopId, deleteAuthOnFailure: false, profile: {
      username: null, display_name: displayName ?? existingDisplayName, account_type: 'personal', login_email: email,
    }});
  }

  if (!password) {
    throw new Error('Mật khẩu tối thiểu 6 ký tự');
  }

  // New user — create auth account
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName ?? email },
  });
  if (authError || !authData.user) throw new Error(authError?.message ?? 'Không thể tạo tài khoản');

  return _finalizeUser({ admin, userId: authData.user.id, tenantId, roleCode, shopId, profile: {
    username: null, display_name: displayName ?? email, account_type: 'personal', login_email: email,
  }});
}

async function _createPhoneUser(params: CreatePhoneUserParams) {
  const { tenantId, phone, password, displayName, roleCode, shopId } = params;
  const admin = getSupabaseAdminClient();
  const normalizedPhone = normalizeVNPhone(phone);
  const phonePlus84 = normalizedPhone ? toVNPhonePlus84(normalizedPhone) : null;
  const phone84 = normalizedPhone ? toVNPhone84(normalizedPhone) : null;

  if (!normalizedPhone || !phonePlus84 || !phone84) {
    throw new Error('Số điện thoại không hợp lệ');
  }

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantError || !tenant?.slug) {
    throw new Error('Workspace không hợp lệ');
  }

  const maskedEmail = buildPhoneAuthEmail(normalizedPhone, tenant.slug);

  let existingUser: { id: string; email?: string | null; phone?: string | null; user_metadata?: Record<string, unknown> } | null = null;
  const { data: existingPlus84, error: plus84Error } = await admin.rpc('get_user_by_phone', { p_phone: phonePlus84 });
  if (!plus84Error && existingPlus84?.id) {
    existingUser = existingPlus84;
  }

  if (!existingUser) {
    const { data: existing84, error: phone84Error } = await admin.rpc('get_user_by_phone', { p_phone: phone84 });
    if (!phone84Error && existing84?.id) {
      existingUser = existing84;
    }
  }

  const maskedEmailUser = await findAuthUserByEmail(admin, maskedEmail);
  if (maskedEmailUser?.id && (!existingUser || maskedEmailUser.id !== existingUser.id)) {
    throw new Error('Email kỹ thuật của số điện thoại này đã thuộc tài khoản khác');
  }

  if (existingUser) {
    const { data: alreadyMember } = await admin
      .from('tenant_user_profiles')
      .select('id')
      .eq('user_id', existingUser.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (alreadyMember) throw new Error('Số điện thoại này đã là thành viên của workspace');

    const existingDisplayName =
      typeof existingUser.user_metadata?.display_name === 'string'
        ? existingUser.user_metadata.display_name
        : typeof existingUser.user_metadata?.full_name === 'string'
          ? existingUser.user_metadata.full_name
          : normalizedPhone;

    if (!existingUser.email) {
      const { error: emailSyncError } = await admin.auth.admin.updateUserById(existingUser.id, {
        email: maskedEmail,
        email_confirm: true,
      });
      if (emailSyncError) throw new Error(emailSyncError.message);
    }

    return _finalizeUser({ admin, userId: existingUser.id, tenantId, roleCode, shopId, deleteAuthOnFailure: false, profile: {
      username: null, display_name: displayName ?? existingDisplayName, account_type: 'personal', login_email: normalizedPhone,
    }});
  }

  if (!password) {
    throw new Error('Mật khẩu tối thiểu 6 ký tự');
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: maskedEmail,
    phone: phonePlus84,
    password,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { display_name: displayName ?? normalizedPhone, phone: normalizedPhone },
  });
  if (authError || !authData.user) throw new Error(authError?.message ?? 'Không thể tạo tài khoản');

  return _finalizeUser({ admin, userId: authData.user.id, tenantId, roleCode, shopId, profile: {
    username: null, display_name: displayName ?? normalizedPhone, account_type: 'personal', login_email: normalizedPhone,
  }});
}

export async function lookupTenantUserIdentity({
  tenantId,
  accountType,
  identifier,
}: {
  tenantId: string;
  accountType: 'email' | 'phone';
  identifier: string;
}) {
  const admin = getSupabaseAdminClient();
  const trimmedIdentifier = identifier.trim();

  let existingUser: {
    id: string;
    email?: string | null;
    phone?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null = null;
  let normalizedIdentifier = trimmedIdentifier;

  if (accountType === 'email') {
    existingUser = await findAuthUserByEmail(admin, trimmedIdentifier);
  } else {
    const normalizedPhone = normalizeVNPhone(trimmedIdentifier);
    const phonePlus84 = normalizedPhone ? toVNPhonePlus84(normalizedPhone) : null;
    const phone84 = normalizedPhone ? toVNPhone84(normalizedPhone) : null;

    if (!normalizedPhone || !phonePlus84 || !phone84) {
      throw new Error('Số điện thoại không hợp lệ');
    }

    normalizedIdentifier = normalizedPhone;

    const { data: existingPlus84, error: plus84Error } = await admin.rpc('get_user_by_phone', { p_phone: phonePlus84 });
    if (!plus84Error && existingPlus84?.id) {
      existingUser = existingPlus84;
    }

    if (!existingUser) {
      const { data: existing84, error: phone84Error } = await admin.rpc('get_user_by_phone', { p_phone: phone84 });
      if (!phone84Error && existing84?.id) {
        existingUser = existing84;
      }
    }
  }

  if (!existingUser) {
    return { exists: false, alreadyMember: false, normalizedIdentifier };
  }

  const { data: profile } = await admin
    .from('tenant_user_profiles')
    .select('display_name')
    .eq('user_id', existingUser.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const metadataDisplayName =
    typeof existingUser.user_metadata?.display_name === 'string'
      ? existingUser.user_metadata.display_name
      : typeof existingUser.user_metadata?.full_name === 'string'
        ? existingUser.user_metadata.full_name
        : null;

  return {
    exists: true,
    alreadyMember: Boolean(profile),
    normalizedIdentifier,
    user: {
      id: existingUser.id,
      display_name: profile?.display_name ?? metadataDisplayName,
      email: existingUser.email ?? null,
      phone: existingUser.phone ?? null,
    },
  };
}

async function _finalizeUser({
  admin, userId, tenantId, roleCode, shopId, profile, deleteAuthOnFailure = true,
}: {
  admin: ReturnType<typeof import('./supabaseAdmin').getSupabaseAdminClient>;
  userId: string;
  tenantId: string;
  roleCode: string;
  shopId?: string;
  profile: { username: string | null; display_name: string; account_type: string; login_email: string };
  deleteAuthOnFailure?: boolean;
}) {
  try {
    const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(userId);
    if (authLookupError || !authUser.user) {
      throw new Error('Không tìm thấy tài khoản Auth tương ứng để liên kết thành viên');
    }

    const { error: profileErr } = await admin.from('tenant_user_profiles').insert({
      user_id: userId, tenant_id: tenantId, ...profile,
    });
    if (profileErr) throw new Error(profileErr.message);

    const { data: role, error: roleErr } = await admin
      .from('roles').select('id').eq('code', roleCode).single();
    if (roleErr || !role) throw new Error('Role không hợp lệ');

    if (shopId) {
      const { error: e } = await admin.from('user_shops').insert({ user_id: userId, shop_id: shopId, role_id: role.id });
      if (e) throw new Error(e.message);
    } else {
      const { error: e } = await admin.from('user_tenants').insert({
        user_id: userId, tenant_id: tenantId, role_id: role.id, is_default: true,
      });
      if (e) throw new Error(e.message);
    }

    return { userId, loginEmail: profile.login_email, username: profile.username };
  } catch (err) {
    if (deleteAuthOnFailure) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
    throw err;
  }
}

// ─── List all users in a tenant ───────────────────────────────────────────────

export async function listTenantUsers(tenantId: string) {
  const admin = getSupabaseAdminClient();

  // All users with a profile in this tenant (workspace + personal)
  const { data: profiles, error } = await admin
    .from('tenant_user_profiles')
    .select('id, user_id, username, display_name, account_type, login_email, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const userIds = (profiles ?? []).map((p) => p.user_id);

  // Tenant-level memberships
  const { data: tenantMemberships } = await admin
    .from('user_tenants')
    .select('user_id, roles(id, code, name)')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds);

  // Shop-level memberships (for users NOT in user_tenants)
  const tenantUserIds = new Set((tenantMemberships ?? []).map((m) => m.user_id));
  const shopOnlyUserIds = userIds.filter((id) => !tenantUserIds.has(id));

  const { data: shopMemberships } = shopOnlyUserIds.length > 0
    ? await admin
        .from('user_shops')
        .select('user_id, shop_id, roles(id, code, name), shops(id, name, slug)')
        .eq('shops.tenant_id', tenantId)
        .in('user_id', shopOnlyUserIds)
    : { data: [] };

  const tenantRoleByUserId = Object.fromEntries(
    (tenantMemberships ?? []).map((m) => [m.user_id, { ...(m as any).roles, scope: 'workspace' as const }]),
  );
  const shopRoleByUserId = Object.fromEntries(
    (shopMemberships ?? []).map((m) => [
      m.user_id,
      { ...(m as any).roles, scope: 'shop' as const, shop: (m as any).shops },
    ]),
  );

  return (profiles ?? []).map((p) => ({
    ...p,
    role: tenantRoleByUserId[p.user_id] ?? shopRoleByUserId[p.user_id] ?? null,
  }));
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTenantUser(userId: string, tenantId: string) {
  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from('tenant_user_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!profile) throw new Error('Người dùng không thuộc workspace này');

  const { data: tenantShops } = await admin.from('shops').select('id').eq('tenant_id', tenantId);
  const shopIds = (tenantShops ?? []).map((shop) => shop.id);

  if (shopIds.length > 0) {
    const { error: shopErr } = await admin.from('user_shops').delete().eq('user_id', userId).in('shop_id', shopIds);
    if (shopErr) throw new Error(shopErr.message);
  }

  const { error: tenantErr } = await admin.from('user_tenants').delete().eq('user_id', userId).eq('tenant_id', tenantId);
  if (tenantErr) throw new Error(tenantErr.message);

  const { error: profileErr } = await admin.from('tenant_user_profiles').delete().eq('id', profile.id);
  if (profileErr) throw new Error(profileErr.message);

  const { count: remainingProfiles } = await admin
    .from('tenant_user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const { count: remainingTenantMemberships } = await admin
    .from('user_tenants')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const { count: remainingShopMemberships } = await admin
    .from('user_shops')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const isOrphan =
    (remainingProfiles ?? 0) === 0 &&
    (remainingTenantMemberships ?? 0) === 0 &&
    (remainingShopMemberships ?? 0) === 0;

  if (isOrphan) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { unlinked: true, deletedAuthUser: true };
  }

  return { unlinked: true, deletedAuthUser: false };
}

// ─── Reset password ───────────────────────────────────────────────────────────

async function assertUserBelongsToTenant(userId: string, tenantId: string) {
  const admin = getSupabaseAdminClient();

  const { data: profile } = await admin
    .from('tenant_user_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (profile) return;

  const { data: tenantMembership } = await admin
    .from('user_tenants')
    .select('user_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (tenantMembership) return;

  const { data: tenantShops } = await admin
    .from('shops')
    .select('id')
    .eq('tenant_id', tenantId);

  const shopIds = (tenantShops ?? []).map((shop) => shop.id);
  if (shopIds.length > 0) {
    const { data: shopMembership } = await admin
      .from('user_shops')
      .select('user_id')
      .eq('user_id', userId)
      .in('shop_id', shopIds)
      .maybeSingle();

    if (shopMembership) return;
  }

  throw new Error('Người dùng không thuộc workspace này');
}

export async function resetTenantUserPassword(userId: string, tenantId: string, newPassword: string) {
  const admin = getSupabaseAdminClient();
  await assertUserBelongsToTenant(userId, tenantId);

  // [C-1] Security guard: only workspace accounts (fake email) may have their
  // password set directly by a tenant admin. Personal and phone accounts are
  // global auth identities — only the user themselves can change their own
  // password (via forgot-password email flow).
  const { data: profile } = await admin
    .from('tenant_user_profiles')
    .select('account_type')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!profile) {
    throw new Error('Người dùng không thuộc workspace này');
  }

  if (profile.account_type !== 'workspace') {
    throw new Error(
      'Không thể đặt mật khẩu trực tiếp cho tài khoản cá nhân (email/số điện thoại). ' +
      'Hãy dùng tính năng gửi email đặt lại mật khẩu để user tự cập nhật.',
    );
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new Error(error.message);
}

// ─── Update Role ──────────────────────────────────────────────────────────────

export async function updateTenantUserRole(userId: string, tenantId: string, roleCode: string, shopId?: string) {
  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from('tenant_user_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!profile) throw new Error('Người dùng không thuộc workspace này');

  const { data: role } = await admin.from('roles').select('id, scope').eq('code', roleCode).maybeSingle();
  if (!role) throw new Error('Vai trò không tồn tại');

  // Xóa các phân quyền cũ trong tenant này
  await admin.from('user_tenants').delete().eq('user_id', userId).eq('tenant_id', tenantId);
  const { data: tenantShops } = await admin.from('shops').select('id').eq('tenant_id', tenantId);
  if (tenantShops && tenantShops.length > 0) {
    const shopIds = tenantShops.map((s) => s.id);
    await admin.from('user_shops').delete().eq('user_id', userId).in('shop_id', shopIds);
  }

  // Thêm phân quyền mới
  if (shopId && role.scope === 'shop') {
    const { error: e } = await admin.from('user_shops').insert({ user_id: userId, shop_id: shopId, role_id: role.id });
    if (e) throw new Error(e.message);
  } else {
    const { error: e } = await admin.from('user_tenants').insert({
      user_id: userId, tenant_id: tenantId, role_id: role.id, is_default: true,
    });
    if (e) throw new Error(e.message);
  }
}
