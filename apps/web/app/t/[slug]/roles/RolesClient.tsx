'use client';

import { useState, useTransition, FormEvent } from 'react';
import type { Role, Permission } from '@/lib/server/roles';

const ROLE_LOCALIZATION: Record<string, { name: string; desc: string }> = {
  owner: { name: 'Chủ sở hữu / Lãnh đạo', desc: 'Có toàn quyền vĩ mô, thanh toán gói dịch vụ và xem báo cáo tài chính tổng hợp toàn chuỗi.' },
  admin: { name: 'Giám đốc điều hành / Quản lý chuỗi', desc: 'Quản trị nhân sự toàn hệ thống, tạo chi nhánh, cấu hình và đồng bộ danh mục sản phẩm chung.' },
  staff: { name: 'Nhân viên Thu ngân', desc: 'Vận hành máy POS bán hàng tại chi nhánh, tích điểm CRM cho khách. Không được tự ý hủy hóa đơn.' },
  viewer: { name: 'Cổ đông / Giám sát chi nhánh', desc: 'Chỉ xem số liệu báo cáo doanh thu chi nhánh và lịch sử đơn hàng ở chế độ Đọc.' },
};

function getFriendlyCode(code: string): string {
  if (['owner', 'admin', 'staff', 'viewer'].includes(code)) return code;

  // New format: nhan-vien-bep_9f2d7cd3 -> nhan-vien-bep
  if (code.includes('_') && !code.startsWith('custom_')) {
    return code.split('_')[0];
  }

  // Old format: custom_uuid_timestamp -> show vai-tro-tuy-chinh
  if (code.startsWith('custom_')) {
    const parts = code.split('_');
    if (parts.length >= 3) {
      return 'tuy-chinh';
    }
  }

  return code;
}


interface Props {
  tenantId: string;
  initialRoles: Role[];
  permissions: Permission[];
  canManage: boolean;
}

export function RolesClient({ tenantId, initialRoles, permissions, canManage }: Props) {
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | Partial<Role> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const [blockedDeleteUsers, setBlockedDeleteUsers] = useState<{ displayName: string; username: string }[] | null>(null);
  const [blockedDeleteRole, setBlockedDeleteRole] = useState<Role | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function flash(msg: string, type: 'ok' | 'err' = 'ok') {
    if (type === 'ok') { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else { setError(msg); setTimeout(() => setError(null), 4000); }
  }

  async function refreshRoles() {
    const res = await fetch(`/api/tenants/${tenantId}/roles`);
    if (res.ok) {
      const data = await res.json();
      setRoles(data.roles);
    }
  }

  async function handleDelete(role: Role) {
    const res = await fetch(`/api/tenants/${tenantId}/roles/${role.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === 'ROLE_IN_USE') {
        setDeleteTarget(null); // Close the confirmation dialog
        setBlockedDeleteRole(role);
        setBlockedDeleteUsers(data.users || []);
        return;
      }
      flash(data.message || 'Không thể xóa vai trò', 'err');
      return;
    }
    setDeleteTarget(null);
    flash('Đã xóa vai trò');
    startTransition(() => { refreshRoles(); });
  }

  function handleAdd() {
    setEditingRole(null);
    setShowModal(true);
  }

  function handleEdit(role: Role) {
    setEditingRole(role);
    setShowModal(true);
  }

  function handleDuplicate(role: Role) {
    setEditingRole({
      name: `Bản sao của ${role.name}`,
      scope: role.scope,
      permissions: role.permissions,
      is_system: false,
    });
    setShowModal(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Phân quyền</h1>
          <p className="mt-0.5 text-sm text-slate-500">Quản lý các vai trò và quyền hạn trong hệ thống</p>
        </div>
        {canManage && (
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Tạo vai trò
          </button>
        )}
      </div>

      {/* Flash messages */}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {roles.map(role => {
          const localization = ROLE_LOCALIZATION[role.code];
          const displayName = localization ? localization.name : role.name;
          const displayDesc = localization ? localization.desc : `Vai trò tùy chỉnh được thiết lập cho chi nhánh hoặc hệ thống.`;
          const friendlyCode = getFriendlyCode(role.code);

          return (
            <div key={role.id} className="relative rounded-2xl border border-slate-200 bg-white p-5 flex flex-col hover:border-slate-300 transition-colors">
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {displayName}
                </h3>

                {/* Badges & Meta Row */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${role.scope === 'workspace' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                    {role.scope === 'workspace' ? 'Workspace' : 'Chi nhánh'}
                  </span>

                  {role.is_system && (
                    <span className="text-[10px] font-bold tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase">
                      Hệ thống
                    </span>
                  )}

                  <span className="text-[10px] font-bold tracking-wider text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full uppercase">
                    {friendlyCode}
                  </span>
                </div>
              </div>

              <div className="flex-1">
                <p className="text-xs text-slate-500 mb-3 leading-normal">{displayDesc}</p>
                <p className="text-sm text-slate-600 mb-2">Được cấp <span className="font-semibold text-slate-900">{role.permissions?.length || 0}</span> quyền.</p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                {canManage && (
                  <button
                    onClick={() => handleDuplicate(role)}
                    className="text-xs font-medium text-blue-600 border border-blue-100 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Sao chép
                  </button>
                )}
                <button
                  onClick={() => handleEdit(role)}
                  className="text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {canManage && !role.is_system ? 'Chỉnh sửa' : 'Xem chi tiết'}
                </button>

                {canManage && !role.is_system && (
                  <button
                    onClick={() => setDeleteTarget(role)}
                    className="text-xs font-medium text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <RoleModal
          tenantId={tenantId}
          role={editingRole}
          permissions={permissions}
          onClose={() => setShowModal(false)}
          onSuccess={(msg) => {
            setShowModal(false);
            flash(msg);
            startTransition(() => { refreshRoles(); });
          }}
          onError={(msg) => flash(msg, 'err')}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Xóa vai trò"
          message={`Bạn có chắc muốn xóa vai trò "${deleteTarget.name}"? Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa"
          danger
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {blockedDeleteUsers && blockedDeleteRole && (
        <Modal
          title="Không thể xóa vai trò"
          onClose={() => { setBlockedDeleteUsers(null); setBlockedDeleteRole(null); }}
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-800 leading-normal flex items-start gap-2.5">
              <svg className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-900">Vai trò đang được sử dụng</p>
                <p className="mt-1 text-xs text-amber-700">
                  Không thể xóa vai trò <span className="font-bold">"{blockedDeleteRole.name}"</span> vì đang có {blockedDeleteUsers.length} người dùng đang sử dụng vai trò này. Vui lòng chuyển người dùng dưới đây sang vai trò khác trước khi thực hiện xóa.
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-800 mb-2">Danh sách người dùng:</p>
              <div className="max-h-[220px] overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100 bg-slate-50/50 custom-scrollbar">
                {blockedDeleteUsers.map((u, i) => (
                  <div key={i} className="px-4 py-2.5 text-xs text-slate-700 flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{u.displayName}</span>
                    <span className="font-mono text-slate-400">({u.username})</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => { setBlockedDeleteUsers(null); setBlockedDeleteRole(null); }}
                className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Role Form Modal ──────────────────────────────────────────────────────────

function RoleModal({ tenantId, role, permissions, onClose, onSuccess, onError }: {
  tenantId: string;
  role: Role | Partial<Role> | null;
  permissions: Permission[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isReadOnly = role?.is_system;
  const systemLocalization = role?.code ? ROLE_LOCALIZATION[role.code] : null;

  const [name, setName] = useState(systemLocalization ? systemLocalization.name : (role?.name || ''));
  const [description, setDescription] = useState(
    systemLocalization ? systemLocalization.desc : (role?.description || '')
  );
  const [scope, setScope] = useState<'workspace' | 'shop'>(
    (role?.scope as 'workspace' | 'shop') || 'workspace'
  );

  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    new Set(role?.permissions || [])
  );

  const [loading, setLoading] = useState(false);

  // Group permissions
  const groupsMap = new Map<string, { groupName: string, perms: Permission[] }>();
  for (const p of permissions) {
    if (!groupsMap.has(p.group_code)) {
      groupsMap.set(p.group_code, { groupName: p.group_name, perms: [] });
    }
    groupsMap.get(p.group_code)!.perms.push(p);
  }
  const groups = Array.from(groupsMap.values());

  function togglePerm(code: string) {
    if (isReadOnly) return;
    const newSet = new Set(selectedPerms);
    if (newSet.has(code)) newSet.delete(code);
    else newSet.add(code);
    setSelectedPerms(newSet);
  }

  function toggleGroup(groupPerms: Permission[]) {
    if (isReadOnly) return;
    const allSelected = groupPerms.every(p => selectedPerms.has(p.code));
    const newSet = new Set(selectedPerms);
    if (allSelected) {
      groupPerms.forEach(p => newSet.delete(p.code));
    } else {
      groupPerms.forEach(p => newSet.add(p.code));
    }
    setSelectedPerms(newSet);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isReadOnly) { onClose(); return; }

    setLoading(true);
    const body = {
      name: name.trim(),
      scope,
      permissionCodes: Array.from(selectedPerms),
      description: description.trim()
    };

    const isEdit = role && 'id' in role && role.id;
    const url = isEdit
      ? `/api/tenants/${tenantId}/roles/${role.id}`
      : `/api/tenants/${tenantId}/roles`;

    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) { onError(data.message || 'Không thể lưu vai trò'); return; }
    onSuccess(isEdit ? 'Đã lưu vai trò' : 'Đã tạo vai trò mới');
  }

  return (
    <Modal title={role ? (isReadOnly ? 'Chi tiết vai trò' : 'Chỉnh sửa vai trò') : 'Tạo vai trò mới'} onClose={onClose} size="lg">
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tên vai trò</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="VD: Quản lý kho, Kế toán..."
              required
              disabled={isReadOnly}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Phạm vi áp dụng</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as any)}
              disabled={!!role} // scope cannot be changed after creation
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="workspace">Toàn bộ Workspace (Tất cả chi nhánh)</option>
              <option value="shop">Chi nhánh cụ thể (Được gán sau)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Mô tả vai trò</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Mô tả ngắn gọn chức năng, quyền hạn của vai trò này..."
            disabled={isReadOnly}
            rows={2}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-slate-500 resize-none"
          />
        </div>

        <div>
          <label className="mb-3 block text-sm font-medium text-slate-700">Phân quyền chi tiết</label>
          <div className="space-y-4">
            {groups.map(g => {
              const allChecked = g.perms.every(p => selectedPerms.has(p.code));
              const someChecked = g.perms.some(p => selectedPerms.has(p.code));

              return (
                <div key={g.groupName} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-200">
                    <span className="font-medium text-sm text-slate-800">{g.groupName}</span>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.perms)}
                      disabled={isReadOnly}
                      className="text-xs font-semibold text-primary hover:text-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                  </div>
                  <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {g.perms.map(p => (
                      <label key={p.code} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedPerms.has(p.code)}
                          onChange={() => togglePerm(p.code)}
                          disabled={isReadOnly}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-50"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-700">{p.name}</p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{p.code}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            {isReadOnly ? 'Đóng' : 'Hủy'}
          </button>
          {!isReadOnly && (
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-colors">
              {loading ? 'Đang lưu...' : 'Lưu vai trò'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Modal({ title, onClose, size = 'md', children }: { title: string; onClose: () => void; size?: 'md' | 'lg'; children: React.ReactNode }) {
  const maxWidthClass = size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`w-full ${maxWidthClass} rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Hủy</button>
        <button
          onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); }}
          disabled={loading}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-dark'}`}
        >
          {loading ? 'Đang xử lý...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
