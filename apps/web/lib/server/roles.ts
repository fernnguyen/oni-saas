import { getSupabaseServerClient } from './supabaseServer';
import { getSupabaseAdminClient } from './supabaseAdmin';

export interface Role {
  id: number;
  code: string;
  name: string;
  is_system: boolean;
  scope: 'any' | 'tenant' | 'shop' | 'workspace';
  tenant_id: string | null;
  permissions?: string[];
  description?: string | null;
}

export interface Permission {
  id: number;
  code: string;
  name: string;
  group_code: string;
  group_name: string;
  sort_order: number;
}

export async function listRoles(tenantId: string): Promise<Role[]> {
  const supabase = await getSupabaseServerClient();
  
  // Get roles available for this tenant
  const queryResult = await supabase
    .from('roles')
    .select('id, code, name, is_system, scope, tenant_id, description')
    .or(`is_system.eq.true,tenant_id.eq.${tenantId}`)
    .order('id', { ascending: true });

  let roles: any[] | null = queryResult.data;
  let rolesError = queryResult.error;

  // Resilient fallback: if description column does not exist yet (e.g. migration hasn't been pushed)
  if (rolesError && (rolesError.code === 'PGRST204' || rolesError.message?.includes('description'))) {
    console.warn('[listRoles] Falling back to query without description column');
    const fallback = await supabase
      .from('roles')
      .select('id, code, name, is_system, scope, tenant_id')
      .or(`is_system.eq.true,tenant_id.eq.${tenantId}`)
      .order('id', { ascending: true });
    
    roles = fallback.data;
    rolesError = fallback.error;
  }

  if (rolesError) throw rolesError;
  if (!roles) return [];

  // Get permissions for these roles
  const roleIds = roles.map(r => r.id);
  const { data: rolePerms, error: permsError } = await supabase
    .from('role_permissions')
    .select('role_id, permissions!inner(code)')
    .in('role_id', roleIds);

  if (permsError) throw permsError;

  // Group permissions by role
  const permsMap = new Map<number, string[]>();
  for (const rp of rolePerms) {
    const list = permsMap.get(rp.role_id) || [];
    list.push((rp.permissions as any).code);
    permsMap.set(rp.role_id, list);
  }

  return roles.map(r => ({
    ...r,
    scope: r.scope === 'any' ? 'workspace' : r.scope as 'workspace' | 'shop',
    permissions: permsMap.get(r.id) || []
  }));
}

export async function listPermissions(): Promise<Permission[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('permissions')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[đĐ]/g, 'd')
    .replace(/([^0-9a-z-\s])/g, '') // keep alphanumeric, hyphen, spaces
    .trim()
    .replace(/\s+/g, '-') // spaces to hyphen
    .replace(/-+/g, '-'); // collapse multiple hyphens
}

export async function createCustomRole(tenantId: string, input: { name: string, scope: 'workspace' | 'shop', permissionCodes: string[], description?: string }) {
  const supabase = getSupabaseAdminClient();
  
  // Generate unique clean code: e.g., nhan-vien-bep_9f2d7cd3
  const baseCode = slugify(input.name) || 'custom-role';
  const shortTenantId = tenantId.substring(0, 8);
  const code = `${baseCode}_${shortTenantId}`;

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .insert({
      code,
      name: input.name,
      is_system: false,
      scope: input.scope,
      tenant_id: tenantId,
      description: input.description || null
    })
    .select('id')
    .single();

  if (roleError) throw roleError;

  // Find permission IDs for the provided codes
  if (input.permissionCodes.length > 0) {
    const { data: perms } = await supabase
      .from('permissions')
      .select('id')
      .in('code', input.permissionCodes);

    if (perms && perms.length > 0) {
      const rolePerms = perms.map(p => ({ role_id: role.id, permission_id: p.id }));
      const { error: insertError } = await supabase
        .from('role_permissions')
        .insert(rolePerms);

      if (insertError) throw insertError;
    }
  }

  return role;
}

export async function updateCustomRole(tenantId: string, roleId: number, input: { name?: string, permissionCodes?: string[], description?: string }) {
  const supabase = getSupabaseAdminClient();

  // Ensure role belongs to tenant
  const { data: existingRole, error: checkError } = await supabase
    .from('roles')
    .select('id, is_system, tenant_id')
    .eq('id', roleId)
    .single();

  if (checkError || !existingRole) throw new Error('Role not found');
  if (existingRole.is_system) throw new Error('Cannot edit system role');
  if (existingRole.tenant_id !== tenantId) throw new Error('Forbidden');

  const updateData: Record<string, any> = {};
  if (input.name) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description || null;

  if (Object.keys(updateData).length > 0) {
    await supabase.from('roles').update(updateData).eq('id', roleId);
  }

  if (input.permissionCodes) {
    // Delete existing permissions
    await supabase.from('role_permissions').delete().eq('role_id', roleId);

    // Insert new permissions
    if (input.permissionCodes.length > 0) {
      const { data: perms } = await supabase
        .from('permissions')
        .select('id')
        .in('code', input.permissionCodes);

      if (perms && perms.length > 0) {
        const rolePerms = perms.map(p => ({ role_id: roleId, permission_id: p.id }));
        await supabase.from('role_permissions').insert(rolePerms);
      }
    }
  }

  return true;
}

export async function deleteCustomRole(tenantId: string, roleId: number) {
  const supabase = getSupabaseAdminClient();
  
  const { data: existingRole, error: checkError } = await supabase
    .from('roles')
    .select('id, is_system, tenant_id')
    .eq('id', roleId)
    .single();

  if (checkError || !existingRole) throw new Error('Role not found');
  if (existingRole.is_system) throw new Error('Cannot delete system role');
  if (existingRole.tenant_id !== tenantId) throw new Error('Forbidden');

  // Check if any users have this role in user_tenants (tenant scope) or user_shops (shop scope)
  const { data: utMembers } = await supabase
    .from('user_tenants')
    .select('user_id')
    .eq('role_id', roleId);
    
  const { data: tenantShops } = await supabase
    .from('shops')
    .select('id')
    .eq('tenant_id', tenantId);
  const shopIds = (tenantShops ?? []).map(s => s.id);
  
  const { data: usMembers } = shopIds.length > 0
    ? await supabase.from('user_shops').select('user_id').eq('role_id', roleId).in('shop_id', shopIds)
    : { data: [] };
    
  const userIds = Array.from(new Set([
    ...(utMembers ?? []).map(m => m.user_id),
    ...(usMembers ?? []).map(m => m.user_id)
  ]));

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('tenant_user_profiles')
      .select('display_name, username, login_email')
      .eq('tenant_id', tenantId)
      .in('user_id', userIds);
      
    const users = (profiles ?? []).map(p => ({
      displayName: p.display_name || p.username || p.login_email,
      username: p.username || p.login_email
    }));

    const errorPayload = JSON.stringify({
      code: 'ROLE_IN_USE',
      message: 'Không thể xóa vai trò đang có thành viên sử dụng. Vui lòng chuyển thành viên sang vai trò khác trước.',
      users
    });
    throw new Error(errorPayload);
  }

  const { error } = await supabase.from('roles').delete().eq('id', roleId);
  if (error) throw error;
  return true;
}
