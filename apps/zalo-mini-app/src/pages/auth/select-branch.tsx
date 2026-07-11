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

export default function SelectBranchPage() {
  const navigate = useNavigate();
  const setTenant = useTenantStore((s) => s.setTenant);
  const setShop = useTenantStore((s) => s.setShop);
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }
      loadBranches();
    });
  }, []);

  const loadBranches = async () => {
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

      // 1. Lấy tenant_id qua /api/tenants/me (giống mobile app)
      const meRes = await fetch(`${baseUrl}/api/tenants/me`, { headers });
      if (!meRes.ok) {
        throw new Error(`Không thể xác thực Tenant. Mã lỗi: ${meRes.status}`);
      }
      const meData = await meRes.json();
      const tenantId = meData.tenant_id;

      if (!tenantId) {
        toast.error('Tài khoản này chưa được liên kết với doanh nghiệp nào');
        navigate('/login', { replace: true });
        return;
      }

      // Lưu tenant info
      const slug = localStorage.getItem('active_tenant_code') || '';
      setTenant({
        id: tenantId,
        name: slug,
        slug: slug,
      });

      // 2. Lấy danh sách shops (giống mobile app)
      const shopsRes = await fetch(`${baseUrl}/api/shops?tenant_id=${tenantId}`, { headers });
      if (!shopsRes.ok) {
        throw new Error(`Không thể tải danh sách chi nhánh. Mã lỗi: ${shopsRes.status}`);
      }
      const shopsData = await shopsRes.json();
      const rawShops: Shop[] = shopsData.shops || [];

      setShops(rawShops);

      // Auto-select nếu chỉ có 1 branch
      if (rawShops.length === 1) {
        handleSelectBranch(rawShops[0]);
        return;
      }
    } catch (err: any) {
      console.error('loadBranches error:', err);
      toast.error(err?.message || 'Có lỗi xảy ra khi tải dữ liệu');
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

  return (
    <div className="auth-page">
      <div className="auth-card">
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
          <p className="text-sm text-subtitle mt-1">Vui lòng chọn chi nhánh làm việc</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="branch-card animate-pulse">
                <div className="h-5 w-3/4 bg-skeleton rounded mb-2" />
                <div className="h-4 w-full bg-skeleton rounded" />
              </div>
            ))}
          </div>
        ) : shops.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-subtitle text-sm">Không tìm thấy chi nhánh nào</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="mt-4 text-sm text-[var(--primary)] font-semibold"
            >
              Quay lại đăng nhập
            </button>
          </div>
        ) : (
          <div className="space-y-3">
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
      </div>
    </div>
  );
}
