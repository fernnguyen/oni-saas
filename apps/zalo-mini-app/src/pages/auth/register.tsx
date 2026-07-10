import { useNavigate } from 'react-router-dom';
import { openChat } from 'zmp-sdk/apis';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const navigate = useNavigate();

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
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_70%,#000)] flex items-center justify-center mb-3 shadow-lg">
            <img
              src="/logo.png"
              alt="ONI"
              className="w-10 h-10 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML =
                  '<span class="text-2xl font-black text-white">ONI</span>';
              }}
            />
          </div>
          <h1 className="text-xl font-bold text-foreground">Đăng ký tài khoản</h1>
        </div>

        {/* Info message */}
        <div className="bg-[var(--muted)] rounded-xl p-5 mb-6">
          <div className="flex items-start space-x-3">
            <div className="flex-none w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center mt-0.5">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Tính năng đang phát triển</p>
              <p className="text-sm text-subtitle leading-relaxed">
                Tính năng đăng ký đang được phát triển. Vui lòng liên hệ quản trị viên để được cấp
                tài khoản.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleContactSupport}
            className="auth-btn auth-btn-primary flex items-center justify-center space-x-2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Liên hệ hỗ trợ qua Zalo</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="auth-btn auth-btn-outline"
          >
            ← Quay lại đăng nhập
          </button>
        </div>
      </div>

      {/* Footer branding */}
      <p className="mt-6 text-xs text-white/60">Powered by ONI Platform</p>
    </div>
  );
}
