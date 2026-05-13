import { Fragment } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUserWithTenant } from '../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { buildCan, getUserPermissions } from '../../../lib/server/permissions';

interface Permission {
  id: number;
  code: string;
  name: string;
  group_code: string;
  group_name: string;
  sort_order: number;
}

interface Role {
  id: number;
  code: string;
  name: string;
  is_system: boolean;
  scope: string;
}

interface RolePerm {
  role_id: number;
  permission_id: number;
}

export default async function RolesPage() {
  const ctx = await getSessionUserWithTenant();
  if (!ctx?.tenant) redirect('/onboarding/step-1');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = ctx.tenant as unknown as { id: string; name: string };

  const userPerms = await getUserPermissions(ctx.user.id, tenant.id);
  const can = buildCan(userPerms);

  if (!can('roles.view')) {
    return (
      <div className="p-6 text-slate-500 text-sm">
        Bạn không có quyền xem trang phân quyền.
      </div>
    );
  }

  const admin = getSupabaseAdminClient();

  const [{ data: allPerms }, { data: allRoles }, { data: rolePerms }] = await Promise.all([
    admin.from('permissions').select('*').order('group_code').order('sort_order'),
    admin.from('roles')
      .select('id, code, name, is_system, scope')
      .or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`)
      .order('id'),
    admin.from('role_permissions').select('role_id, permission_id'),
  ]);

  const permissions = (allPerms ?? []) as Permission[];
  const roles       = (allRoles ?? []) as Role[];
  const mapping     = (rolePerms ?? []) as RolePerm[];

  // Build lookup: "roleId-permId" → true
  const grantSet = new Set(mapping.map((m) => `${m.role_id}-${m.permission_id}`));
  const isGranted = (roleId: number, permId: number) => grantSet.has(`${roleId}-${permId}`);

  // Group permissions
  const groups: Record<string, { label: string; perms: Permission[] }> = {};
  for (const p of permissions) {
    if (!groups[p.group_code]) {
      groups[p.group_code] = { label: p.group_name, perms: [] };
    }
    groups[p.group_code].perms.push(p);
  }

  const isOwnerCanManage = can('roles.manage');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Phân quyền</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ma trận quyền hạn theo từng vai trò trong hệ thống
          </p>
        </div>
        {isOwnerCanManage && (
          <button
            disabled
            title="Tính năng sắp ra mắt"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white opacity-50 cursor-not-allowed"
          >
            + Thêm vai trò
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded bg-primary/10 border border-primary/30 text-primary text-center leading-4">✓</span>
          Được phép
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded bg-slate-100 border border-slate-200 text-slate-300 text-center leading-4">—</span>
          Không có quyền
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-300" />
          Vai trò hệ thống (không sửa được)
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left px-5 py-3.5 font-semibold text-slate-700 w-64 bg-slate-50 rounded-tl-2xl">
                Quyền hạn
              </th>
              {roles.map((role) => (
                <th key={role.id} className="px-4 py-3.5 text-center font-semibold text-slate-700 bg-slate-50 last:rounded-tr-2xl">
                  <div className="flex flex-col items-center gap-1">
                    <span>{role.name}</span>
                    {role.is_system ? (
                      <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        Hệ thống
                      </span>
                    ) : (
                      <span className="text-[10px] font-normal text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        Tùy chỉnh
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([groupCode, group], gi) => (
              <Fragment key={groupCode}>
                {/* Group header row */}
                <tr className={gi > 0 ? 'border-t border-slate-100' : ''}>
                  <td
                    colSpan={roles.length + 1}
                    className="px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 bg-slate-50/60"
                  >
                    {group.label}
                  </td>
                </tr>
                {/* Permission rows */}
                {group.perms.map((perm, pi) => (
                  <tr
                    key={perm.id}
                    className={`border-t border-slate-100 hover:bg-slate-50/50 transition-colors ${
                      pi === group.perms.length - 1 ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-slate-700">{perm.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{perm.code}</div>
                    </td>
                    {roles.map((role) => {
                      const granted = role.code === 'owner' || isGranted(role.id, perm.id);
                      return (
                        <td key={role.id} className="px-4 py-2.5 text-center">
                          {role.is_system ? (
                            // System role: display only
                            granted ? (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold mx-auto">
                                ✓
                              </span>
                            ) : (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-300 text-xs mx-auto">
                                —
                              </span>
                            )
                          ) : (
                            // Custom role: toggle (UI only for now — API coming)
                            <input
                              type="checkbox"
                              defaultChecked={granted}
                              disabled={!isOwnerCanManage}
                              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Vai trò hệ thống không thể xóa hoặc thay đổi quyền.
        Để tùy chỉnh, hãy tạo vai trò mới và gán quyền phù hợp.
      </p>
    </div>
  );
}
