import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { setTenantCode } from '@/lib/api-config';
import toast from 'react-hot-toast';
import { getAccessToken, getSetting } from 'zmp-sdk/apis';
import { apiFetch } from '@/services/api';

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
  const [isTenantLocked, setIsTenantLocked] = useState(false);
  
  // Login Gate states
  const [isCheckingZalo, setIsCheckingZalo] = useState(true);
  const [zaloSession, setZaloSession] = useState<any>(null);
  const [zaloUser, setZaloUser] = useState<any>(null); // To store name/avatar

  useEffect(() => {
    const savedTenant = localStorage.getItem('saved_tenant_code');
    const savedEmail = localStorage.getItem('saved_email');
    if (savedTenant) {
      setTenantCodeInput(savedTenant);
      setIsTenantLocked(true);
    }
    if (savedEmail) setEmail(savedEmail);

    checkZaloLinked();
  }, []);

  const checkZaloLinked = async () => {
    try {
      // Check if user has granted permission before
      const hasPermission = await new Promise<boolean>((resolve) => {
        getSetting({
          success: (data) => {
            resolve(!!data.authSetting['scope.userInfo']);
          },
          fail: () => resolve(false),
        });
      });

      if (!hasPermission) {
        setIsCheckingZalo(false);
        return;
      }

      const accessToken = await new Promise<string>((resolve, reject) => {
        getAccessToken({
          success: (token) => resolve(token as string),
          fail: () => reject('Cannot get access token'),
        });
      });

      const res = await apiFetch<any>('/api/auth/zalo/verify', {
        method: 'POST',
        body: JSON.stringify({ accessToken }),
      });

      if (res.status === 'LOGGED_IN' && res.session) {
        // They are linked, show the gate
        setZaloSession(res.session);
        setZaloUser({
           name: res.session.user?.user_metadata?.full_name || 'Người dùng Zalo',
           avatar: res.session.user?.user_metadata?.avatar_url
        });
      }
    } catch (e) {
      console.warn('Check Zalo linked failed', e);
    } finally {
      setIsCheckingZalo(false);
    }
  };

  const handleContinueWithZalo = async () => {
    if (!zaloSession) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.setSession({
        access_token: zaloSession.access_token,
        refresh_token: zaloSession.refresh_token,
      });
      if (error) throw error;
      
      // Re-initialize API config with tenant if known (tenant is chosen later or from saved)
      const savedTenant = localStorage.getItem('saved_tenant_code');
      if (savedTenant) {
        setTenantCode(savedTenant);
      }
      navigate('/select-branch', { replace: true });
    } catch (e: any) {
      toast.error('Lỗi khi đăng nhập bằng Zalo: ' + e.message);
      setZaloSession(null);
    } finally {
      setLoading(false);
    }
  };

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
      setTenantCode(slug);
      localStorage.setItem('saved_email', identifier);
      localStorage.setItem('saved_tenant_code', slug);
      setIsTenantLocked(true);

      const authEmail = buildAuthEmail(identifier, slug);

      const { error, data } = await supabase.auth.signInWithPassword({
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

      // Login OK → check if we should link Zalo
      navigate('/link-zalo', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingZalo) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4" />
        <p className="text-subtitle">Đang kiểm tra tài khoản...</p>
      </div>
    );
  }

  if (zaloSession && zaloUser) {
    return (
      <div className="auth-page">
        <div className="auth-card flex flex-col items-center text-center">
          <div className="w-20 h-20 mb-4 rounded-full overflow-hidden shadow-md">
            <img 
              src={zaloUser.avatar || '/avatar-placeholder.png'} 
              alt={zaloUser.name} 
              className="w-full h-full object-cover" 
            />
          </div>
          <h2 className="text-xl font-bold mb-2">Xin chào, {zaloUser.name}</h2>
          <p className="text-subtitle mb-8">Bạn muốn tiếp tục đăng nhập với tài khoản này?</p>
          
          <button 
            onClick={handleContinueWithZalo} 
            disabled={loading}
            className="auth-btn auth-btn-primary w-full mb-3"
          >
            {loading ? 'Đang đăng nhập...' : 'Tiếp tục'}
          </button>
          
          <button 
            onClick={() => {
              setZaloSession(null);
              setZaloUser(null);
            }}
            className="auth-btn bg-[var(--border)]/30 text-foreground w-full hover:bg-[var(--border)]/50"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

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
          <p className="text-sm text-subtitle mt-1">Đăng nhập để quản lý bán hàng</p>
          <div className="mt-3 px-3 py-2 bg-blue-50/50 rounded-lg border border-blue-100 max-w-xs text-center">
            <p className="text-[11px] text-blue-600 font-medium">
              Ứng dụng nội bộ dành riêng cho chủ cửa hàng và nhân viên. Vui lòng đăng nhập bằng tài khoản được cấp.
            </p>
          </div>
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
