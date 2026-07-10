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
        id: '4318657068771012646',
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
              Doanh nghiệp: {tenant.name}
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
          onClick={handleLogout}
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
        <p className="text-2xs text-subtitle">ONI Business v1.0.0</p>
        <p className="text-3xs text-inactive mt-0.5">Powered by ONI Platform</p>
      </div>
    </div>
  );
}
