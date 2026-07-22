import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useTenantStore } from '@/stores/tenant-store';
import { logout } from '@/services/auth';
import { openChat, getAccessToken, authorize, getUserInfo } from 'zmp-sdk/apis';
import { apiFetch } from '@/services/api';
import toast from 'react-hot-toast';

type PasswordStatusResponse = {
  hasPassword: boolean;
  phone: string;
  maskedPhone: string | null;
};

function maskPhone(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${digits.slice(0, 3)}xxx${digits.slice(-2)}`;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const shop = useTenantStore((s) => s.shop);
  const tenant = useTenantStore((s) => s.tenant);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const appVersion = import.meta.env.VITE_APP_VERSION || 'v0.1.0-dev';

  // Zalo Link States
  const [zaloLinked, setZaloLinked] = useState<boolean | null>(null);
  const [zaloProfile, setZaloProfile] = useState<{name: string; avatar: string} | null>(null);
  const [linking, setLinking] = useState(false);
  const [passwordStatusLoading, setPasswordStatusLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState<string | null>(maskPhone(profile?.phone));
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => {
    fetchZaloStatus();
    fetchPasswordStatus();
  }, []);

  const fetchZaloStatus = async () => {
    try {
      const res = await apiFetch<any>('/api/auth/zalo/status');
      if (res.linked) {
        setZaloLinked(true);
        setZaloProfile(res.profile);
      } else {
        setZaloLinked(false);
        setZaloProfile(null);
      }
    } catch (e) {
      console.warn('Failed to fetch Zalo status', e);
    }
  };

  const fetchPasswordStatus = async () => {
    setPasswordStatusLoading(true);
    try {
      const res = await apiFetch<PasswordStatusResponse>('/api/auth/password/status');
      setHasPassword(Boolean(res.hasPassword));
      setMaskedPhone(res.maskedPhone || maskPhone(res.phone) || maskPhone(profile?.phone));
    } catch (e) {
      console.warn('Failed to fetch password status', e);
    } finally {
      setPasswordStatusLoading(false);
    }
  };

  const handleLinkZalo = async () => {
    setLinking(true);
    try {
      await new Promise<void>((resolve, reject) => {
        authorize({
          scopes: ['scope.userInfo'],
          success: () => resolve(),
          fail: () => reject(new Error('Bạn cần cấp quyền để liên kết tài khoản Zalo')),
        });
      });

      const accessToken = await new Promise<string>((resolve, reject) => {
        getAccessToken({
          success: (token) => resolve(token as string),
          fail: () => reject('Cannot get access token'),
        });
      });

      let zaloProfile: { name?: string; avatar?: string } | undefined;
      try {
        const userInfoRes = await new Promise<any>((resolve) => {
          getUserInfo({
            success: (data) => resolve(data),
            fail: () => resolve(null),
          });
        });
        const userInfo = userInfoRes?.userInfo || {};
        if (userInfo.name || userInfo.avatar || userInfo.avatarUrl) {
          zaloProfile = {
            name: typeof userInfo.name === 'string' ? userInfo.name.trim() : undefined,
            avatar:
              typeof userInfo.avatar === 'string'
                ? userInfo.avatar.trim()
                : typeof userInfo.avatarUrl === 'string'
                  ? userInfo.avatarUrl.trim()
                  : undefined,
          };
        }
      } catch (e) {
        console.warn('getUserInfo in handleLinkZalo failed', e);
      }

      await apiFetch('/api/auth/zalo/link', {
        method: 'POST',
        body: JSON.stringify({
          accessToken,
          profileName: zaloProfile?.name,
          profileAvatar: zaloProfile?.avatar,
        }),
      });

      toast.success('Liên kết thành công!');
      fetchZaloStatus();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi liên kết Zalo');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkZalo = async () => {
    if (!confirm('Bạn có chắc chắn muốn hủy liên kết tài khoản Zalo này?')) return;
    setLinking(true);
    try {
      await apiFetch('/api/auth/zalo/unlink', {
        method: 'POST'
      });
      toast.success('Hủy liên kết thành công');
      fetchZaloStatus();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi hủy liên kết');
    } finally {
      setLinking(false);
    }
  };

  const triggerLogout = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      toast.error('Đăng xuất thất bại');
    }
  };

  const handleContactSupport = async () => {
    try {
      await openChat({
        type: 'oa',
        id: '2780444502954767948',
        message: 'Xin chào, tôi cần hỗ trợ với ứng dụng bán hàng ONI trên Zalo app',
      });
    } catch {
      toast.error('Không thể mở Zalo OA Chat');
    }
  };

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSubmitting(false);
  };

  const openPasswordModal = () => {
    resetPasswordForm();
    setShowPasswordModal(true);
  };

  const closePasswordModal = (force = false) => {
    if (passwordSubmitting && !force) return;
    resetPasswordForm();
    setShowPasswordModal(false);
  };

  const handleSavePassword = async () => {
    setPasswordError('');

    if (hasPassword && !currentPassword) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }

    if (!newPassword) {
      setPasswordError('Vui lòng nhập mật khẩu mới.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setPasswordSubmitting(true);
    try {
      const res = await apiFetch<{ message?: string; hasPassword?: boolean }>('/api/auth/password/update', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
          confirmPassword,
        }),
      });

      setHasPassword(res.hasPassword ?? true);
      toast.success(res.message || 'Cập nhật mật khẩu thành công.');
      await fetchPasswordStatus();
      closePasswordModal(true);
    } catch (e: any) {
      setPasswordError(e?.message || 'Không thể cập nhật mật khẩu.');
      setPasswordSubmitting(false);
    }
  };

  const phoneDisplay = maskedPhone || maskPhone(profile?.phone);
  const profileSubtitle = profile?.phone || profile?.email || '';

  return (
    <div className="min-h-full bg-background">
      {/* User Info */}
      <div className="mx-4 mt-4 bg-section rounded-xl p-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-lg font-bold">
            {(profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground truncate">
              {profile?.full_name || 'Người dùng'}
            </p>
            <p className="text-sm text-subtitle truncate">{profileSubtitle}</p>
          </div>
        </div>
      </div>

      {/* Branch Info */}
      {shop && (
        <div className="mx-4 mt-3 bg-section rounded-xl p-4">
          <p className="text-2xs text-subtitle uppercase font-medium tracking-wider mb-2">
            Chi nhánh hiện tại
          </p>
          <p className="text-sm font-semibold text-foreground">{shop.name}</p>
          {shop.address && <p className="text-2xs text-subtitle mt-0.5">{shop.address}</p>}
          {tenant?.name && (
            <p className="text-2xs text-subtitle mt-1">
              Mã cửa hàng: <span className="font-semibold">{tenant.name}.oni.vn</span>
            </p>
          )}
        </div>
      )}

      {/* Zalo Link Info */}
      <div className="mx-4 mt-3 bg-section rounded-xl p-4">
        <p className="text-2xs text-subtitle uppercase font-medium tracking-wider mb-3">
          Tài khoản Zalo
        </p>
        
        {zaloLinked === null ? (
          <p className="text-sm text-subtitle">Đang tải...</p>
        ) : zaloLinked && zaloProfile ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img src={zaloProfile.avatar} alt={zaloProfile.name} className="w-8 h-8 rounded-full border border-gray-200" />
              <span className="text-sm font-semibold text-foreground">{zaloProfile.name}</span>
            </div>
            <button
              onClick={handleUnlinkZalo}
              disabled={linking}
              className="text-sm font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
            >
              Hủy
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-subtitle">Chưa liên kết</span>
            <button
              onClick={handleLinkZalo}
              disabled={linking}
              className="text-sm font-medium text-blue-500 hover:text-blue-600 disabled:opacity-50"
            >
              Liên kết ngay
            </button>
          </div>
        )}
      </div>

      <div className="mx-4 mt-3 bg-section rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs text-subtitle uppercase font-medium tracking-wider mb-2">
              Bảo mật tài khoản
            </p>
            {passwordStatusLoading ? (
              <p className="text-sm text-subtitle">Đang kiểm tra trạng thái mật khẩu...</p>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">
                  {hasPassword ? 'Đổi mật khẩu đăng nhập' : 'Thiết lập mật khẩu đăng nhập'}
                </p>
                <p className="mt-1 text-xs leading-5 text-subtitle">
                  {phoneDisplay
                    ? `Bạn có thể dùng số điện thoại ${phoneDisplay} và mật khẩu này để đăng nhập trên web và các nền tảng khác.`
                    : 'Thiết lập mật khẩu để dùng tài khoản này đăng nhập trên web và các nền tảng khác.'}
                </p>
              </>
            )}
          </div>

          {!passwordStatusLoading && (
            <button
              onClick={openPasswordModal}
              className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
            >
              {hasPassword ? 'Đổi' : 'Thiết lập'}
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mx-4 mt-3 bg-section rounded-xl overflow-hidden">
        <button
          onClick={() => navigate('/select-branch')}
          className="settings-item w-full"
        >
          <div className="flex-none w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mr-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <span className="flex-1 text-sm text-foreground text-left">Đổi chi nhánh</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--inactive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <div className="h-px bg-[var(--border)] mx-4" />

        <button
          onClick={handleContactSupport}
          className="settings-item w-full"
        >
          <div className="flex-none w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center mr-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="flex-1 text-sm text-foreground text-left">Liên hệ hỗ trợ</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--inactive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <div className="h-px bg-[var(--border)] mx-4" />

        <button
          onClick={triggerLogout}
          className="settings-item w-full"
        >
          <div className="flex-none w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mr-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <span className="flex-1 text-sm text-danger text-left font-medium">Đăng xuất</span>
        </button>
      </div>

      {/* Version */}
      <div className="text-center mt-8 pb-8">
        <p className="text-2xs text-subtitle">ONI POS v{appVersion}</p>
        <p className="text-3xs text-inactive mt-0.5">@2026 HKD Phần mềm ONI</p>
      </div>

      {/* Confirm Logout Modal */}
      {showLogoutConfirm && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-base font-semibold text-red-600">Xác nhận đăng xuất</h3>
              <button onClick={() => setShowLogoutConfirm(false)} className="p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body space-y-4 pb-6">
              <p className="text-sm text-subtitle leading-relaxed">
                Bạn có chắc chắn muốn đăng xuất khỏi tài khoản không?
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="auth-btn border border-[var(--border)] text-foreground bg-white w-full"
                  onClick={() => setShowLogoutConfirm(false)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="auth-btn bg-red-600 text-white w-full"
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    handleLogout();
                  }}
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="modal-backdrop" style={{ zIndex: 1250, alignItems: 'center' }} onClick={closePasswordModal}>
          <div
            className="modal-content modal-content-center"
            style={{ maxWidth: 360, padding: 18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {hasPassword ? 'Đổi mật khẩu' : 'Thiết lập mật khẩu'}
                </h3>
                <p className="mt-1 text-xs leading-5 text-subtitle">
                  {phoneDisplay
                    ? `Số điện thoại đăng nhập: ${phoneDisplay}`
                    : 'Mật khẩu này sẽ dùng để đăng nhập tài khoản trên các nền tảng khác.'}
                </p>
              </div>
              <button onClick={closePasswordModal} className="p-1 text-subtitle" disabled={passwordSubmitting}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {hasPassword && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-subtitle">Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    className="auth-input"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      setPasswordError('');
                    }}
                    placeholder="Nhập mật khẩu hiện tại"
                    autoComplete="current-password"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-subtitle">Mật khẩu mới</label>
                <input
                  type="password"
                  className="auth-input"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="Tối thiểu 8 ký tự"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-subtitle">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  className="auth-input"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="Nhập lại mật khẩu mới"
                  autoComplete="new-password"
                />
              </div>

              {passwordError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">
                  {passwordError}
                </p>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="auth-btn border border-[var(--border)] bg-white text-foreground"
                onClick={closePasswordModal}
                disabled={passwordSubmitting}
              >
                Hủy
              </button>
              <button
                type="button"
                className="auth-btn bg-emerald-600 text-white"
                onClick={handleSavePassword}
                disabled={passwordSubmitting}
              >
                {passwordSubmitting
                  ? 'Đang lưu...'
                  : hasPassword
                    ? 'Đổi mật khẩu'
                    : 'Thiết lập'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
