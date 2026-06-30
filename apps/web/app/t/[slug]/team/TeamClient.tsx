'use client';

import { useState, useTransition, FormEvent } from 'react';
import type { Role } from '@/lib/server/roles';

const ROLE_LOCALIZATION: Record<string, { name: string; desc: string }> = {
  owner: { name: 'Chủ sở hữu / Lãnh đạo', desc: 'Có toàn quyền vĩ mô, thanh toán gói dịch vụ và xem báo cáo tài chính tổng hợp toàn chuỗi.' },
  admin: { name: 'Giám đốc điều hành / Quản lý chuỗi', desc: 'Quản trị nhân sự toàn hệ thống, tạo chi nhánh, cấu hình và đồng bộ danh mục sản phẩm chung.' },
  staff: { name: 'Nhân viên Thu ngân', desc: 'Vận hành máy POS bán hàng tại chi nhánh, tích điểm CRM cho khách. Không được tự ý hủy hóa đơn.' },
  viewer: { name: 'Cổ đông / Giám sát chi nhánh', desc: 'Chỉ xem số liệu báo cáo doanh thu chi nhánh và lịch sử đơn hàng ở chế độ Đọc.' },
};

interface UserRole {
  code: string;
  name: string;
  scope: 'workspace' | 'shop';
  shop?: { id: string; name: string; slug: string } | null;
}

interface TenantUser {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  account_type: 'workspace' | 'personal';
  login_email: string;
  created_at: string;
  role: UserRole | null;
}

interface Shop {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  tenantId: string;
  tenantSlug: string;
  initialUsers: TenantUser[];
  shops: Shop[];
  roles: Role[];
  canInvite: boolean;
  canRemove: boolean;
  currentUserId: string;
  maxUsers?: number;
}

export function TeamClient({ tenantId, tenantSlug, initialUsers, shops, roles, canInvite, canRemove, currentUserId, maxUsers }: Props) {
  const [users, setUsers] = useState<TenantUser[]>(initialUsers);
  const [showModal, setShowModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<TenantUser | null>(null);
  const [editRoleTarget, setEditRoleTarget] = useState<TenantUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function flash(msg: string, type: 'ok' | 'err' = 'ok') {
    if (type === 'ok') { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else { setError(msg); setTimeout(() => setError(null), 4000); }
  }

  async function refreshUsers() {
    const res = await fetch(`/api/tenants/${tenantId}/users`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }

  async function handleDelete(user: TenantUser) {
    const res = await fetch(`/api/tenants/${tenantId}/users/${user.user_id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { flash(data.message || 'Không thể xóa người dùng', 'err'); return; }
    setDeleteTarget(null);
    flash('Đã xóa thành viên');
    startTransition(() => { refreshUsers(); });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Thành viên</h1>
          <p className="mt-0.5 text-sm text-slate-500">{users.length} thành viên trong workspace này</p>
        </div>
        {canInvite && (
          <button
            onClick={() => {
              if (maxUsers && maxUsers > -1 && users.length >= maxUsers) {
                flash(`Đã đạt giới hạn tối đa ${maxUsers} thành viên của gói hiện tại.`, 'err');
                window.dispatchEvent(new CustomEvent('open-plan-modal'));
                return;
              }
              setShowModal(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Thêm thành viên
          </button>
        )}
      </div>

      {/* Flash messages */}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* User table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {users.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">Chưa có thành viên nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Thành viên</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vai trò</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Phạm vi</th>
                {(canInvite || canRemove) && (
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Thao tác</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                        {(u.display_name ?? u.login_email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{u.display_name ?? u.username ?? u.login_email}</div>
                        <div className="text-xs text-slate-400">
                          {u.account_type === 'workspace'
                            ? <span className="font-mono">{u.username}</span>
                            : u.login_email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <RoleBadge code={u.role?.code ?? ''} name={u.role?.name} />
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-500">
                    {u.role?.scope === 'workspace'
                      ? 'Tất cả chi nhánh'
                      : u.role?.shop
                        ? <span>{u.role.shop.name}</span>
                        : '—'}
                  </td>
                  {(canInvite || canRemove) && (
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canInvite && (
                          <button
                            onClick={() => setEditRoleTarget(u)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors"
                          >
                            Phân quyền
                          </button>
                        )}
                        {canInvite && u.account_type === 'workspace' && (
                          <button
                            onClick={() => setResetTarget(u)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                          >
                            Mật khẩu
                          </button>
                        )}
                        {canRemove && u.user_id !== currentUserId && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add member modal */}
      {showModal && (
        <AddMemberModal
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          shops={shops}
          roles={roles}
          onClose={() => setShowModal(false)}
          onSuccess={(msg) => {
            setShowModal(false);
            flash(msg);
            startTransition(() => { refreshUsers(); });
          }}
          onError={(msg) => flash(msg, 'err')}
        />
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <ResetPasswordModal
          tenantId={tenantId}
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={() => { setResetTarget(null); flash('Đã đặt lại mật khẩu'); }}
          onError={(msg) => flash(msg, 'err')}
        />
      )}

      {/* Edit role modal */}
      {editRoleTarget && (
        <EditRoleModal
          tenantId={tenantId}
          user={editRoleTarget}
          roles={roles}
          shops={shops}
          onClose={() => setEditRoleTarget(null)}
          onSuccess={() => {
            setEditRoleTarget(null);
            flash('Đã cập nhật vai trò');
            startTransition(() => { refreshUsers(); });
          }}
          onError={(msg) => flash(msg, 'err')}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Xóa thành viên"
          message={`Bạn có chắc muốn xóa "${deleteTarget.display_name ?? deleteTarget.username}"? Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa thành viên"
          danger
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({ tenantId, tenantSlug, shops, roles, onClose, onSuccess, onError }: {
  tenantId: string;
  tenantSlug: string;
  shops: Shop[];
  roles: Role[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [tab, setTab] = useState<'workspace' | 'personal'>('workspace');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<string>('staff');
  const [shopId, setShopId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const selectedRole = roles.find((r) => r.code === role);
  const isShopScoped = selectedRole?.scope === 'shop';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

    const body =
      tab === 'workspace'
        ? { account_type: 'workspace', username, display_name: displayName || undefined, password, role, tenant_slug: tenantSlug, shop_id: isShopScoped && shopId ? shopId : undefined }
        : { account_type: 'personal', email, display_name: displayName || undefined, password, role, shop_id: isShopScoped && shopId ? shopId : undefined };

    const res = await fetch(`/api/tenants/${tenantId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { onError(data.message || 'Không thể tạo thành viên'); return; }
    onSuccess('Đã thêm thành viên thành công');
  }

  return (
    <Modal title="Thêm thành viên" onClose={onClose}>
      {/* Tab toggle */}
      <div className="flex rounded-xl border border-slate-200 p-1 gap-1 mb-5">
        {(['workspace', 'personal'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t === 'workspace' ? 'Tài khoản workspace' : 'Email cá nhân'}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Identifier */}
        {tab === 'workspace' ? (
          <Field label="Tên đăng nhập" hint="Chữ thường, số, dấu _  (3–30 ký tự)">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
              placeholder="john_store"
              required
              className={inputCls}
            />
          </Field>
        ) : (
          <Field label="Email cá nhân">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              placeholder="nguyen@gmail.com"
              required
              className={inputCls}
            />
          </Field>
        )}

        <Field label="Tên hiển thị" hint="Tùy chọn">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nguyễn Văn A"
            className={inputCls}
          />
        </Field>

        <Field label="Mật khẩu">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              required
              minLength={6}
              className={inputCls + ' pr-10'}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </Field>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Vai trò & phạm vi</label>
          <div className="space-y-2">
            {roles.map((r) => {
              const localization = ROLE_LOCALIZATION[r.code];
              const displayName = localization ? localization.name : r.name;
              const displayDesc = localization ? localization.desc : `Vai trò tùy chỉnh được thiết lập cho chi nhánh hoặc hệ thống.`;
              return (
                <label key={r.code} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  role === r.code ? 'border-primary bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="role"
                    value={r.code}
                    checked={role === r.code}
                    onChange={() => setRole(r.code)}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{displayName}</span>
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
                        r.scope === 'workspace' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.scope === 'workspace' ? 'Workspace' : 'Chi nhánh'}
                      </span>
                      {r.is_system && <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded uppercase font-bold tracking-wider">Hệ thống</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-normal">{displayDesc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Shop selector — only for shop-scoped roles */}
        {isShopScoped && shops.length > 0 && (
          <Field label="Chi nhánh được phân công">
            <select
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              required
              className={inputCls}
            >
              <option value="">— Chọn chi nhánh —</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">Nếu không chọn, sẽ không có quyền truy cập chi nhánh nào.</p>
          </Field>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {loading ? 'Đang tạo...' : 'Thêm thành viên'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Reset password modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ tenantId, user, onClose, onSuccess, onError }: {
  tenantId: string;
  user: TenantUser;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/users/${user.user_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { onError(data.message || 'Không thể đổi mật khẩu'); return; }
    onSuccess();
  }

  return (
    <Modal title={`Đặt lại mật khẩu — ${user.display_name ?? user.username}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Mật khẩu mới">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              required
              minLength={6}
              className={inputCls + ' pr-10'}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </Field>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Hủy</button>
          <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
            {loading ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Role Modal ──────────────────────────────────────────────────────────

function EditRoleModal({ tenantId, user, roles, shops, onClose, onSuccess, onError }: {
  tenantId: string;
  user: TenantUser;
  roles: Role[];
  shops: Shop[];
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [role, setRole] = useState<string>(user.role?.code ?? 'staff');
  const [shopId, setShopId] = useState<string>(user.role?.shop?.id ?? (shops[0]?.id || ''));
  const [loading, setLoading] = useState(false);

  const selectedRole = roles.find((r) => r.code === role);
  const isShopScoped = selectedRole?.scope === 'shop';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const body = { roleCode: role, shopId: isShopScoped ? shopId : undefined };
    const res = await fetch(`/api/tenants/${tenantId}/users/${user.user_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { onError(data.message || 'Không thể cập nhật vai trò'); return; }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-[480px] rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">Sửa vai trò thành viên</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 flex flex-col gap-6 overflow-y-auto">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <p className="text-sm font-medium text-slate-900">{user.display_name || user.username || user.login_email}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user.login_email}</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Vai trò & phạm vi</label>
            <div className="space-y-2">
              {roles.map((r) => {
                const localization = ROLE_LOCALIZATION[r.code];
                const displayName = localization ? localization.name : r.name;
                const displayDesc = localization ? localization.desc : `Vai trò tùy chỉnh được thiết lập cho chi nhánh hoặc hệ thống.`;
                return (
                  <label key={r.code} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    role === r.code ? 'border-primary bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input
                      type="radio" name="edit_role" value={r.code} checked={role === r.code} onChange={() => setRole(r.code)}
                      className="mt-1 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">{displayName}</span>
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${
                          r.scope === 'workspace' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {r.scope === 'workspace' ? 'Workspace' : 'Chi nhánh'}
                        </span>
                        {r.is_system && <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded uppercase font-bold tracking-wider">Hệ thống</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-normal">{displayDesc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {isShopScoped && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Chi nhánh làm việc</label>
              <select
                required value={shopId} onChange={e => setShopId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary appearance-none bg-white"
              >
                {shops.length === 0 && <option value="">Chưa có chi nhánh nào</option>}
                {shops.length > 0 && <option value="" disabled>-- Chọn chi nhánh --</option>}
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="mt-2 flex gap-3 pt-4 border-t border-slate-100 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors">Hủy</button>
            <button type="submit" disabled={loading || (isShopScoped && !shopId)} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50 flex justify-center items-center">
              {loading ? <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : 'Cập nhật'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
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
        <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Hủy</button>
        <button
          onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); }}
          disabled={loading}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-dark'}`}
        >
          {loading ? 'Đang xử lý...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function RoleBadge({ code, name }: { code: string, name?: string }) {
  const map: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-blue-100 text-blue-700',
    staff: 'bg-amber-100 text-amber-700',
    viewer: 'bg-slate-100 text-slate-600',
  };
  const localizedName = ROLE_LOCALIZATION[code]?.name || name || code;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[code] ?? 'bg-slate-100 text-slate-500'}`}>
      {localizedName}
    </span>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function IconEye() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
function IconEyeOff() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}
