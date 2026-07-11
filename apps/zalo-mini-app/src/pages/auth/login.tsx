import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { setTenantCode } from '@/lib/api-config';
import toast from 'react-hot-toast';
import { getPhoneNumber, getAccessToken } from 'zmp-sdk/apis';
import { loginWithZaloMiniApp } from '@/services/auth';

/**
 * Build email cho Supabase auth dựa theo identifier + tenant:
 * - Nếu identifier chứa '@' → dùng luôn (là email thật)
 * - Nếu không (là username) → build fake email: {username}@{tenantSlug}.oni.vn
 */
function buildAuthEmail(identifier: string, tenantSlug: string): string {
  if (identifier.includes('@')) return identifier;
  return `${identifier}@${tenantSlug}.oni.vn`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [tenantCodeInput, setTenantCodeInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [zaloLoading, setZaloLoading] = useState(false);
  const [isTenantLocked, setIsTenantLocked] = useState(false);

  // Auto-fill from localStorage
  useEffect(() => {
    const savedTenant = localStorage.getItem('saved_tenant_code');
    const savedEmail = localStorage.getItem('saved_email');
    if (savedTenant) {
      setTenantCodeInput(savedTenant);
      setIsTenantLocked(true);
    }
    if (savedEmail) setEmail(savedEmail);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const slug = tenantCodeInput.trim().toLowerCase();
    const identifier = email.trim();

    if (!slug) {
      toast.error('Vui lòng nhập mã doanh nghiệp');
      return;
    }
    if (!identifier) {
      toast.error('Vui lòng nhập email hoặc tên đăng nhập');
      return;
    }
    if (!password.trim()) {
      toast.error('Vui lòng nhập mật khẩu');
      return;
    }

    setLoading(true);
    try {
      // 1. Set tenant code → build base URL https://{slug}.oni.vn
      setTenantCode(slug);

      // 2. Lưu email và tenant để auto-fill lần sau
      localStorage.setItem('saved_email', identifier);
      localStorage.setItem('saved_tenant_code', slug);
      setIsTenantLocked(true);

      // 3. Build email cho Supabase auth
      const authEmail = buildAuthEmail(identifier, slug);

      // 4. Login qua Supabase
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (error) {
        const message =
          error.message.toLowerCase().includes('invalid login credentials') ||
          error.message.toLowerCase().includes('invalid email or password')
            ? 'Tên đăng nhập hoặc mật khẩu không đúng'
            : error.message;
        toast.error(message);
        return;
      }

      // 5. Login OK → chuyển sang select branch
      navigate('/select-branch', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleZaloLogin = async () => {
    const slug = tenantCodeInput.trim().toLowerCase();
    if (!slug) {
      toast.error('Vui lòng nhập mã cửa hàng trước khi đăng nhập');
      return;
    }

    setZaloLoading(true);
    try {
      // Khóa cứng tenant code
      localStorage.setItem('saved_tenant_code', slug);
      setIsTenantLocked(true);

      getPhoneNumber({
        success: async (data) => {
          try {
            const { token } = data;
            if (!token) throw new Error('Không nhận được token từ Zalo');
            
            const accessToken = await new Promise<string>((resolve, reject) => {
              getAccessToken({
                success: (token) => resolve(token as string),
                fail: (err) => reject(new Error('Không thể lấy access token')),
              });
            });
            
            await loginWithZaloMiniApp(token, accessToken, slug);
            
            toast.success('Đăng nhập thành công!');
            navigate('/select-branch', { replace: true });
          } catch (error: any) {
            console.error('Lỗi khi gọi API:', error);
            toast.error(error?.message || 'Có lỗi xảy ra khi xác thực');
          } finally {
            setZaloLoading(false);
          }
        },
        fail: (error) => {
          console.error('Từ chối cấp quyền số điện thoại', error);
          toast.error('Vui lòng cấp quyền số điện thoại để tiếp tục');
          setZaloLoading(false);
        }
      });
    } catch (err) {
      console.error('Lỗi zmp-sdk:', err);
      toast.error('Không thể kết nối Zalo');
      setZaloLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 mb-3 shadow-lg rounded-2xl overflow-hidden flex items-center justify-center">
            <img
              src="/logo.png"
              alt="ONI"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML =
                  '<div class="w-full h-full bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_70%,#000)] flex items-center justify-center rounded-2xl"><span class="text-xl font-black text-white">ONI</span></div>';
              }}
            />
          </div>
          <h1 className="text-xl font-bold text-foreground">Đăng nhập</h1>
          <p className="text-sm text-subtitle mt-1">Đăng nhập để bán hàng</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Tenant Code */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Mã cửa hàng
            </label>
            
            {isTenantLocked ? (
              <div className="flex items-center justify-between bg-[var(--border)]/30 rounded-xl pl-4 pr-2.5 py-2.5 border border-[var(--border)]">
                <div className="flex items-center overflow-hidden min-w-0">
                  <span className="font-semibold text-foreground truncate">{tenantCodeInput}</span>
                  <span className="text-subtitle font-medium whitespace-nowrap">.oni.vn</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsTenantLocked(false);
                    localStorage.removeItem('saved_tenant_code');
                  }}
                  className="text-xs text-[var(--primary)] font-semibold bg-[var(--primary)]/10 px-2.5 py-1.5 rounded-lg ml-2 shrink-0 hover:bg-[var(--primary)]/20 transition-colors"
                >
                  Thay đổi
                </button>
              </div>
            ) : (
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={tenantCodeInput}
                  onChange={(e) => setTenantCodeInput(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  onBlur={() => {
                    if (tenantCodeInput.trim()) {
                      setIsTenantLocked(true);
                      localStorage.setItem('saved_tenant_code', tenantCodeInput.trim());
                    }
                  }}
                  placeholder="myshop"
                  className="auth-input pr-[85px]"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <span className="absolute right-3 text-sm text-subtitle font-medium pointer-events-none">
                  .oni.vn
                </span>
              </div>
            )}
          </div>

          {/* Email / Username */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Email / Tên đăng nhập
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin hoặc email@example.com"
              className="auth-input"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Mật khẩu</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                className="auth-input pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-subtitle p-1"
                tabIndex={-1}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Login Button */}
          <button type="submit" className="auth-btn auth-btn-primary mt-2" disabled={loading}>
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M4 12a8 8 0 018-8" opacity="0.75" />
                </svg>
                <span>Đang đăng nhập...</span>
              </span>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="px-3 text-sm text-subtitle">hoặc</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* Zalo Login */}
        <button
          type="button"
          onClick={handleZaloLogin}
          className="auth-btn auth-btn-zalo flex items-center justify-center space-x-2"
          disabled={zaloLoading}
        >
          <img src="/zalo.svg" alt="Zalo" className="w-5 h-5" />
          <span>{zaloLoading ? 'Đang kết nối...' : 'Đăng nhập bằng Zalo'}</span>
        </button>

        {/* Register link */}
        <p className="text-center mt-6 text-sm text-subtitle">
          Chưa có tài khoản?{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="text-[var(--primary)] font-semibold"
          >
            Đăng ký tài khoản mới
          </button>
        </p>
      </div>

      {/* Footer branding */}
      <p className="mt-6 text-xs text-white/60">Phát triển bởi ONI Software</p>
    </div>
  );
}
