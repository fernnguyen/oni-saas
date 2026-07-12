import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantStore } from '@/stores/tenant-store';
import { useAuthStore } from '@/stores/auth-store';
import { getApiBaseUrl, getApiHeaders } from '@/lib/api-config';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface Shop {
  id: string;
  name: string;
  slug?: string;
  address?: string;
  industry_type?: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry_type?: string;
}

export default function SelectBranchPage() {
  const navigate = useNavigate();
  const setTenant = useTenantStore((s) => s.setTenant);
  const setShop = useTenantStore((s) => s.setShop);
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState(false);

  // Check session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }
      loadTenants();
    });
  }, []);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const headers = await getApiHeaders();

      // Retrieve and save user profile info
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setProfile({
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Người dùng',
          phone: user.phone || user.user_metadata?.phone || '',
          avatar_url: user.user_metadata?.avatar_url || '',
        });
      }

      // 1. Fetch all tenants of this user via /api/tenants/list
      const listRes = await fetch(`${baseUrl}/api/tenants/list`, { headers });
      if (!listRes.ok) {
        throw new Error(`Không thể lấy danh sách cửa hàng. Mã lỗi: ${listRes.status}`);
      }
      const listData = await listRes.json();
      const userTenants: Tenant[] = listData.tenants || [];
      setTenants(userTenants);

      if (userTenants.length === 0) {
        // No tenants -> Redirect to onboarding
        navigate('/onboarding', { replace: true });
        return;
      }

      // If active tenant slug exists in localStorage, auto select it
      const activeTenantCode = localStorage.getItem('active_tenant_code');
      const foundTenant = userTenants.find((t) => t.slug === activeTenantCode);
      if (foundTenant) {
        await handleSelectTenant(foundTenant);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      console.error('loadTenants error:', err);
      toast.error(err?.message || 'Có lỗi xảy ra khi tải dữ liệu');
      setLoading(false);
    }
  };

  const handleSelectTenant = async (tenant: Tenant) => {
    setLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      
      // Save tenant info in localStorage
      localStorage.setItem('active_tenant_code', tenant.slug);
      localStorage.removeItem('custom_api_base_url');
      
      // Save in store
      setTenant({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      });
      
      setSelectedTenant(tenant);

      // Re-fetch headers since active_tenant_code changed
      const headers = await getApiHeaders();

      // 2. Fetch shops/branches for the selected tenant
      const shopsRes = await fetch(`${baseUrl}/api/shops?tenant_id=${tenant.id}`, { headers });
      if (!shopsRes.ok) {
        throw new Error(`Không thể tải danh sách chi nhánh. Mã lỗi: ${shopsRes.status}`);
      }
      const shopsData = await shopsRes.json();
      const rawShops: Shop[] = shopsData.shops || [];

      setShops(rawShops);

      // Auto-select if only 1 branch
      if (rawShops.length === 1) {
        handleSelectBranch(rawShops[0]);
        return;
      }
    } catch (err: any) {
      console.error('handleSelectTenant error:', err);
      toast.error(err?.message || 'Có lỗi xảy ra khi chọn cửa hàng');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBranch = (shop: Shop) => {
    setShop({
      id: shop.id,
      name: shop.name || 'Chi nhánh',
      slug: shop.slug || shop.id,
      address: shop.address,
      industry_type: shop.industry_type,
    });
    navigate('/', { replace: true });
  };

  const handleLogout = async () => {
    const { logout } = await import('@/services/auth');
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {accessError ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-red-600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2">Không có quyền truy cập</h2>
            <p className="text-sm text-subtitle mb-6 px-4">
              Tài khoản của bạn chưa được cấp quyền truy cập vào cửa hàng này. Vui lòng liên hệ chủ cửa hàng hoặc thử lại với tài khoản khác.
            </p>
            <button
              onClick={handleLogout}
              className="auth-btn auth-btn-secondary w-full"
            >
              Đăng xuất và thử lại
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center mb-6">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              <p className="text-xs text-subtitle mt-2">Đang tải dữ liệu...</p>
            </div>
          </div>
        ) : !selectedTenant ? (
          // ── Tenant Selection Screen ──
          <div>
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-3">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--primary)"
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
              <h1 className="text-xl font-bold text-foreground">Chọn cửa hàng</h1>
              <p className="text-sm text-subtitle mt-1">Chọn cửa hàng của bạn hoặc tạo mới</p>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => handleSelectTenant(tenant)}
                  className="branch-card w-full text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex-none w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                      <svg
                        width="20"
                        height="20"
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

            <button
              onClick={() => {
                localStorage.removeItem('active_tenant_code');
                navigate('/onboarding');
              }}
              className="auth-btn auth-btn-primary w-full mt-4 flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Tạo cửa hàng mới
            </button>

            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 mt-6 block text-center w-full hover:text-[var(--primary)] font-medium"
            >
              Đăng xuất tài khoản
            </button>
          </div>
        ) : (
          // ── Branch Selection Screen ──
          <div>
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-3">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-foreground">Chọn chi nhánh</h1>
              <p className="text-sm text-subtitle mt-1">Cửa hàng: {selectedTenant.name}</p>
            </div>

            {shops.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-subtitle text-sm">Cửa hàng này chưa cấu hình chi nhánh.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {shops.map((shop) => (
                  <button
                    key={shop.id}
                    onClick={() => handleSelectBranch(shop)}
                    className="branch-card w-full text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-none w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--primary)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{shop.name}</p>
                        {shop.address && (
                          <p className="text-2xs text-subtitle truncate mt-0.5">{shop.address}</p>
                        )}
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
            )}

            <div className="space-y-2 mt-4">
              <button
                onClick={() => {
                  localStorage.removeItem('active_tenant_code');
                  setSelectedTenant(null);
                  setShops([]);
                }}
                className="auth-btn auth-btn-secondary w-full"
              >
                Quay lại chọn cửa hàng
              </button>
              
              <button
                onClick={handleLogout}
                className="text-xs text-slate-400 pt-3 block text-center w-full hover:text-[var(--primary)] font-medium"
              >
                Đăng xuất tài khoản
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
