import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPhoneNumber, getAccessToken } from 'zmp-sdk/apis';
import toast from 'react-hot-toast';
import { loginWithZaloMiniApp } from '@/services/auth';
import { getApiBaseUrl, getApiHeaders } from '@/lib/api-config';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry_type?: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [existingTenants, setExistingTenants] = useState<Tenant[] | null>(null);

  const handleRegisterWithZalo = async () => {
    setLoading(true);
    try {
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
            
            // Call our backend API to authenticate and get session
            await loginWithZaloMiniApp(token, accessToken);
            
            // Fetch their tenants list to see if they already have shops
            const baseUrl = getApiBaseUrl();
            const headers = await getApiHeaders();
            const listRes = await fetch(`${baseUrl}/api/tenants/list`, { headers });
            if (!listRes.ok) {
              // Fallback to onboarding if cannot fetch list
              navigate('/onboarding', { replace: true });
              return;
            }
            const listData = await listRes.json();
            const userTenants: Tenant[] = listData.tenants || [];
            
            if (userTenants.length === 0) {
              // No existing tenants -> Go straight to onboarding
              toast.success('Đăng nhập thành công!');
              navigate('/onboarding', { replace: true });
            } else {
              // Store existing tenants list to show choice view
              setExistingTenants(userTenants);
            }
          } catch (error: any) {
            console.error('Lỗi khi gọi API:', error);
            toast.error(error?.message || 'Có lỗi xảy ra khi xác thực');
          } finally {
            setLoading(false);
          }
        },
        fail: (error) => {
          console.error('Từ chối cấp quyền số điện thoại', error);
          toast.error('Vui lòng cấp quyền số điện thoại để tiếp tục');
          setLoading(false);
        }
      });
    } catch (err) {
      console.error('Lỗi zmp-sdk:', err);
      toast.error('Không thể kết nối Zalo');
      setLoading(false);
    }
  };

  const handleSelectTenant = async (tenant: Tenant) => {
    setLoading(true);
    try {
      localStorage.setItem('active_tenant_code', tenant.slug);
      localStorage.removeItem('custom_api_base_url');
      
      toast.success(`Đang vào cửa hàng ${tenant.name}...`);
      navigate('/select-branch', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {existingTenants ? (
          // ── Tenant Selection View inside Register Flow ──
          <div>
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center mb-3">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ff6a00"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="9" />
                  <rect x="14" y="3" width="7" height="5" />
                  <rect x="14" y="12" width="7" height="9" />
                  <rect x="3" y="16" width="7" height="5" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-foreground text-center">Tài khoản đã tồn tại</h1>
              <p className="text-sm text-subtitle mt-1.5 text-center">
                Số điện thoại của bạn đã đăng ký cửa hàng. Chọn cửa hàng để đăng nhập hoặc tiếp tục tạo mới:
              </p>
            </div>

            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 mb-4">
              {existingTenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => handleSelectTenant(tenant)}
                  className="branch-card w-full text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex-none w-9 h-9 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{tenant.name}</p>
                      <p className="text-2xs text-subtitle truncate mt-0.5">{tenant.slug}.oni.vn</p>
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--inactive)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('active_tenant_code');
                  navigate('/onboarding', { replace: true });
                }}
                className="auth-btn auth-btn-primary w-full flex items-center justify-center gap-2"
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Tạo cửa hàng mới
              </button>

              <button
                type="button"
                onClick={async () => {
                  const { logout } = await import('@/services/auth');
                  await logout();
                  setExistingTenants(null);
                }}
                className="auth-btn auth-btn-secondary w-full"
                disabled={loading}
              >
                Quay lại
              </button>
            </div>
          </div>
        ) : (
          // ── Normal Registration Form ──
          <div>
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
              <h1 className="text-xl font-bold text-foreground">Bắt đầu hành trình số hóa</h1>
              <p className="text-sm text-subtitle mt-1 text-center">Thiết lập hệ thống quản lý chuyên nghiệp cho cửa hàng của bạn.</p>
            </div>

            {/* Actions */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleRegisterWithZalo}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-all shadow-sm disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" opacity="0.25" />
                      <path d="M4 12a8 8 0 018-8" opacity="0.75" />
                    </svg>
                    <span>Đang kết nối...</span>
                  </span>
                ) : (
                  <>
                    <img src="/zalo.svg" alt="Zalo" className="w-5 h-5" />
                    <span>Đăng ký qua Zalo</span>
                  </>
                )}
              </button>
              
              <p className="mt-6 text-center text-sm text-subtitle">
                Bằng việc tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của chúng tôi.
              </p>

              <p className="mt-8 text-center text-sm text-subtitle">
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-[var(--primary)] font-semibold"
                >
                  Đăng nhập ngay
                </button>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer branding */}
      <p className="mt-6 text-xs text-white/60">Phát triển bởi ONI Software</p>
    </div>
  );
}
