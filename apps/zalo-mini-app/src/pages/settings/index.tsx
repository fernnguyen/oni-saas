import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useTenantStore } from '@/stores/tenant-store';
import { logout } from '@/services/auth';
import { openChat } from 'zmp-sdk/apis';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const shop = useTenantStore((s) => s.shop);
  const tenant = useTenantStore((s) => s.tenant);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const appVersion = import.meta.env.VITE_APP_VERSION || 'v0.1.0-dev';

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
            <p className="text-sm text-subtitle truncate">{profile?.email || ''}</p>
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
    </div>
  );
}
