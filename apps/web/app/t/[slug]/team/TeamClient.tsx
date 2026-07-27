'use client';

import { useEffect, useState, useTransition, FormEvent } from 'react';
import type { Role } from '@/lib/server/roles';
import { isValidVNPhone } from '@/lib/utils/phone';

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
  canResetAuth: boolean; // requires tenants.manage (owner only)
  currentUserId: string;
  maxUsers?: number;
}

export function TeamClient({ tenantId, initialUsers, shops, roles, canInvite, canRemove, canResetAuth, currentUserId, maxUsers }: Props) {
  const [users, setUsers] = useState<TenantUser[]>(initialUsers);
  const [showModal, setShowModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<TenantUser | null>(null);
  const [editRoleTarget, setEditRoleTarget] = useState<TenantUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUser | null>(null);
  const [sendResetTarget, setSendResetTarget] = useState<TenantUser | null>(null);
  const [sendResetLoading, setSendResetLoading] = useState(false);
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
    if (!res.ok) { flash(data.message || 'Không thể gỡ thành viên', 'err'); return; }
    setDeleteTarget(null);
    flash(data.deletedAuthUser ? 'Đã gỡ thành viên và xóa tài khoản không còn liên kết nào khác' : 'Đã gỡ thành viên khỏi workspace hiện tại');
    startTransition(() => { refreshUsers(); });
  }

  async function handleSendReset(user: TenantUser) {
    setSendResetLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/users/${user.user_id}/send-reset`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    setSendResetLoading(false);
    setSendResetTarget(null);
    if (!res.ok) {
      flash(data.message || 'Không thể gửi email đặt lại mật khẩu', 'err');
    } else {
      flash(data.message || 'Đã gửi email đặt lại mật khẩu');
    }
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
                        {/* Workspace: owner can reset password directly */}
                        {canResetAuth && u.account_type === 'workspace' && (
                          <button
                            onClick={() => setResetTarget(u)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                          >
                            Đặt lại mật khẩu
                          </button>
                        )}
                        {/* Personal/phone: anyone with users.invite can trigger email reset */}
                        {canInvite && u.account_type !== 'workspace' && (
                          <button
                            onClick={() => setSendResetTarget(u)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-violet-600 border border-violet-100 bg-violet-50 hover:bg-violet-100 transition-colors"
                          >
                            Đặt lại mật khẩu
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
          shops={shops}
          roles={roles}
          onClose={() => setShowModal(false)}
          onSuccess={(msg) => {
            setShowModal(false);
            flash(msg);
            startTransition(() => { refreshUsers(); });
          }}
        />
      )}

      {/* Send reset email confirm dialog */}
      {sendResetTarget && (
        <SendResetConfirmDialog
          user={sendResetTarget}
          loading={sendResetLoading}
          onConfirm={() => handleSendReset(sendResetTarget)}
          onClose={() => setSendResetTarget(null)}
        />
      )}

      {/* Reset password modal (workspace only) */}
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
          title="Gỡ thành viên"
          message={`Bạn có chắc muốn gỡ "${deleteTarget.display_name ?? deleteTarget.username ?? deleteTarget.login_email}" khỏi workspace hiện tại? Tài khoản global sẽ được giữ nếu còn liên kết ở nơi khác.`}
          confirmLabel="Gỡ thành viên"
          danger
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({ tenantId, shops, roles, onClose, onSuccess }: {
  tenantId: string;
  shops: Shop[];
  roles: Role[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  type IdentityLookup = {
    exists: boolean;
    alreadyMember: boolean;
    normalizedIdentifier: string;
    user?: { id: string; display_name?: string | null; email?: string | null; phone?: string | null };
  };

  const [accountMethod, setAccountMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [identityLookup, setIdentityLookup] = useState<IdentityLookup | null>(null);
  const [checkedIdentifier, setCheckedIdentifier] = useState('');
  const [checking, setChecking] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<string>('staff');
  const [shopId, setShopId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const selectedRole = roles.find((r) => r.code === role);
  const isShopScoped = selectedRole?.scope === 'shop';
  const identifier = accountMethod === 'email' ? email.trim() : phone.trim();
  const lookupKey = `${accountMethod}:${identifier}`;
  const hasFreshLookup = Boolean(identityLookup && checkedIdentifier === lookupKey);
  const needsPassword = hasFreshLookup && identityLookup?.exists === false;

  function resetLookup() {
    setIdentityLookup(null);
    setCheckedIdentifier('');
  }

  function setIdentifierError(message: string) {
    setModalError(message);
    resetLookup();
  }

  function validateIdentifier() {
    if (accountMethod === 'email') {
      if (isValidVNPhone(identifier)) {
        return 'Bạn đang chọn tạo bằng email. Vui lòng nhập email hợp lệ, không nhập số điện thoại.';
      }
      if (!identifier.includes('@')) {
        return 'Email không hợp lệ';
      }
      return null;
    }

    if (!isValidVNPhone(identifier)) {
      return 'Số điện thoại không hợp lệ';
    }
    return null;
  }

  async function lookupIdentity() {
    if (!identifier || checking || loading) return null;
    if (hasFreshLookup) return identityLookup;

    const validationError = validateIdentifier();
    if (validationError) {
      setIdentifierError(validationError);
      return null;
    }

    setChecking(true);
    setModalError(null);
    const params = new URLSearchParams({ lookup_account_type: accountMethod, identifier });
    const res = await fetch(`/api/tenants/${tenantId}/users?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    setChecking(false);

    if (!res.ok) {
      setModalError(data.message || 'Không thể kiểm tra tài khoản');
      return null;
    }

    const result = data as IdentityLookup;
    setIdentityLookup(result);
    setCheckedIdentifier(lookupKey);
    if (result.alreadyMember) {
      setModalError('Tài khoản này đã là thành viên của workspace');
    }
    return result;
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden' && identifier && !hasFreshLookup) {
        void lookupIdentity();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [accountMethod, identifier, hasFreshLookup, checking, loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const lookup = hasFreshLookup ? identityLookup : await lookupIdentity();
    if (!lookup) return;
    if (lookup.alreadyMember) {
      setModalError('Tài khoản này đã là thành viên của workspace');
      return;
    }
    if (!lookup.exists && password.length < 6) {
      setModalError('Mật khẩu tối thiểu 6 ký tự');
      return;
    }

    setLoading(true);
    setModalError(null);

    const body =
      accountMethod === 'email'
        ? { account_type: 'email', email: identifier, display_name: displayName || undefined, password: lookup.exists ? undefined : password, role, shop_id: isShopScoped && shopId ? shopId : undefined }
        : { account_type: 'phone', phone: identifier, display_name: displayName || undefined, password: lookup.exists ? undefined : password, role, shop_id: isShopScoped && shopId ? shopId : undefined };

    const res = await fetch(`/api/tenants/${tenantId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setModalError(data.message || 'Không thể tạo thành viên'); return; }
    onSuccess(lookup.exists ? 'Đã liên kết thành viên vào shop hiện tại' : 'Đã thêm thành viên thành công');
  }

  return (
    <Modal title="Thêm thành viên" onClose={onClose}>
      <div className="flex rounded-xl border border-slate-200 p-1 gap-1 mb-5">
        {(['email', 'phone'] as const).map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => {
              setAccountMethod(method);
              setPassword('');
              setModalError(null);
              resetLookup();
            }}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
              accountMethod === method ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {method === 'email' ? 'Email' : 'Số điện thoại'}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {modalError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</div>
        )}

        {accountMethod === 'email' ? (
          <Field label="Email đăng nhập">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onBlur={() => { void lookupIdentity(); }}
                onChange={(e) => { setEmail(e.target.value.trim()); setModalError(null); resetLookup(); }}
                placeholder="nguyen@gmail.com"
                required
                className={inputCls}
              />
              <button
                type="button"
                onClick={lookupIdentity}
                disabled={checking || !identifier}
                className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {checking ? 'Đang kiểm tra...' : 'Kiểm tra'}
              </button>
            </div>
          </Field>
        ) : (
          <Field label="Số điện thoại đăng nhập" hint="Hỗ trợ định dạng 039..., 8439..., +8439...">
            <div className="flex gap-2">
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onBlur={() => { void lookupIdentity(); }}
                onChange={(e) => { setPhone(e.target.value.trim()); setModalError(null); resetLookup(); }}
                placeholder="0395591769"
                required
                className={inputCls}
              />
              <button
                type="button"
                onClick={lookupIdentity}
                disabled={checking || !identifier}
                className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                {checking ? 'Đang kiểm tra...' : 'Kiểm tra'}
              </button>
            </div>
          </Field>
        )}

        {hasFreshLookup && identityLookup?.exists && (
          <div className={`rounded-xl border px-3 py-2 text-sm ${identityLookup.alreadyMember ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            <p className="font-medium">{identityLookup.alreadyMember ? 'Tài khoản đã là thành viên' : 'Tìm thấy tài khoản hiện có'}</p>
            <p className="mt-0.5 text-xs">
              {identityLookup.user?.display_name || identityLookup.user?.email || identityLookup.user?.phone || identityLookup.normalizedIdentifier}
            </p>
            {(identityLookup.user?.email || identityLookup.user?.phone) && (
              <p className="mt-0.5 text-xs text-slate-500">{[identityLookup.user.email, identityLookup.user.phone].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        )}

        {hasFreshLookup && identityLookup?.exists === false && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <p className="font-medium">Chưa có tài khoản global</p>
            <p className="mt-0.5 text-xs">Hệ thống sẽ tạo tài khoản mới với thông tin này.</p>
          </div>
        )}

        <Field label="Tên hiển thị" hint={identityLookup?.exists ? 'Tùy chọn, để trống sẽ dùng tên hiện có' : 'Tùy chọn'}>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nguyễn Văn A"
            className={inputCls}
          />
        </Field>

        {needsPassword && (
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
        )}

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
            disabled={loading || checking || !hasFreshLookup || Boolean(identityLookup?.alreadyMember)}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {loading ? 'Đang xử lý...' : identityLookup?.exists ? 'Liên kết thành viên' : 'Thêm thành viên'}
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const displayLabel = user.display_name || user.username || 'Thành viên';
  const passwordsMatch = password === confirmPassword || confirmPassword === '';
  const isValid = password.length >= 8 && password === confirmPassword;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) return;
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
    <Modal title="Đặt lại mật khẩu" onClose={onClose}>
      <div className="space-y-4">

        {/* Account info card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
              <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{displayLabel}</p>
              {user.username && (
                <p className="text-xs text-slate-500 truncate">@{user.username}</p>
              )}
            </div>
          </div>

          {/* Full login email (fake email visible for audit) */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tài khoản đăng nhập</p>
            <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2">
              <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <code className="text-xs text-slate-700 break-all">{user.login_email}</code>
            </div>
          </div>
        </div>

        {/* Workspace authority banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex gap-3">
          <svg className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-amber-800">Tài khoản workspace</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Tài khoản này được tạo trong workspace của bạn với email nội bộ. Với tư cách chủ sở hữu, bạn có quyền đặt lại mật khẩu trực tiếp. Thao tác này sẽ được ghi vào nhật ký hệ thống.
            </p>
          </div>
        </div>

        {/* Password form */}
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Mật khẩu mới">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                required
                minLength={8}
                className={inputCls + ' pr-10'}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </Field>

          <Field label="Xác nhận mật khẩu">
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              required
              minLength={8}
              className={inputCls + (!passwordsMatch && confirmPassword ? ' border-red-300 focus:border-red-400' : '')}
            />
            {!passwordsMatch && confirmPassword && (
              <p className="mt-1 text-xs text-red-500">Mật khẩu không khớp</p>
            )}
          </Field>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Hủy</button>
            <button
              type="submit"
              disabled={loading || !isValid}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {loading ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}


// ─── Send Reset Email Confirm Dialog ─────────────────────────────────────────

function SendResetConfirmDialog({ user, loading, onConfirm, onClose }: {
  user: TenantUser;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const displayLabel = user.display_name || user.username || 'thành viên này';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
        {/* Icon */}
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 mx-auto">
          <svg className="h-6 w-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>

        {/* Content */}
        <div className="text-center space-y-1.5">
          <h2 className="text-base font-semibold text-slate-900">Gửi email đặt lại mật khẩu?</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Sẽ gửi hướng dẫn đặt lại mật khẩu đến{' '}
            <span className="font-medium text-slate-700">{displayLabel}</span>
            {user.login_email && (
              <>
                {' '}tại{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">
                  {user.login_email}
                </code>
              </>
            )}
            .
          </p>
          <p className="text-xs text-slate-400">
            Đây là tài khoản cá nhân — người dùng sẽ tự đặt lại mật khẩu bằng link trong email.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang gửi...
              </>
            ) : (
              'Gửi email'
            )}
          </button>
        </div>
      </div>
    </div>
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
