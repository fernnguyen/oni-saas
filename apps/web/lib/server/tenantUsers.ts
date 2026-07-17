import { getSupabaseAdminClient } from './supabaseAdmin';

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
  password: string;
  displayName?: string;
  roleCode: string;
  shopId?: string;
}

export type CreateTenantUserParams = CreateWorkspaceUserParams | CreatePersonalUserParams;

export async function createTenantUser(params: CreateTenantUserParams) {
  const admin = getSupabaseAdminClient();

  // ── Plan limit check ────────────────────────────────────────
  const { enforceLimit } = await import('./planLimits');
  await enforceLimit('create_shop_user', { tenantId: params.tenantId }, params.tenantId);

  if (params.accountType === 'workspace') {
    return _createWorkspaceUser(params);
  } else {
    return _createPersonalUser(params);
  }
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
  const { data: existingAuth } = await admin.auth.admin.listUsers();
  const existingUser = existingAuth?.users?.find((u) => u.email === email);

  if (existingUser) {
    // User already exists — just add to this tenant (if not already a member)
    const { data: alreadyMember } = await admin
      .from('tenant_user_profiles')
      .select('id')
      .eq('user_id', existingUser.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (alreadyMember) throw new Error('Email này đã là thành viên của workspace');

    return _finalizeUser({ admin, userId: existingUser.id, tenantId, roleCode, shopId, profile: {
      username: null, display_name: displayName ?? email, account_type: 'personal', login_email: email,
    }});
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

async function _finalizeUser({
  admin, userId, tenantId, roleCode, shopId, profile,
}: {
  admin: ReturnType<typeof import('./supabaseAdmin').getSupabaseAdminClient>;
  userId: string;
  tenantId: string;
  roleCode: string;
  shopId?: string;
  profile: { username: string | null; display_name: string; account_type: string; login_email: string };
}) {
  try {
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
    await admin.auth.admin.deleteUser(userId).catch(() => {});
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

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
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
