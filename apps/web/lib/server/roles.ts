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
  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('id, code, name, is_system, scope, tenant_id')
    .or(`is_system.eq.true,tenant_id.eq.${tenantId}`)
    .order('id', { ascending: true });

  if (rolesError) throw rolesError;

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

export async function createCustomRole(tenantId: string, input: { name: string, scope: 'workspace' | 'shop', permissionCodes: string[] }) {
  const supabase = getSupabaseAdminClient();
  
  // Generate unique code
  const code = `custom_${tenantId}_${Date.now()}`;

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .insert({
      code,
      name: input.name,
      is_system: false,
      scope: input.scope,
      tenant_id: tenantId
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

export async function updateCustomRole(tenantId: string, roleId: number, input: { name?: string, permissionCodes?: string[] }) {
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

  if (input.name) {
    await supabase.from('roles').update({ name: input.name }).eq('id', roleId);
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

  // role_permissions and user_shops / user_tenants might have foreign keys.
  // if ON DELETE CASCADE is set, it will be fine. Otherwise we might need to handle it or block deletion if users are assigned.
  
  // Check if any users have this role
  const { count: utCount } = await supabase.from('user_tenants').select('id', { count: 'exact', head: true }).eq('role_id', roleId);
  const { count: usCount } = await supabase.from('user_shops').select('id', { count: 'exact', head: true }).eq('role_id', roleId);
  
  if ((utCount && utCount > 0) || (usCount && usCount > 0)) {
    throw new Error('Không thể xóa vai trò đang có thành viên sử dụng. Vui lòng chuyển thành viên sang vai trò khác trước.');
  }

  const { error } = await supabase.from('roles').delete().eq('id', roleId);
  if (error) throw error;
  return true;
}
