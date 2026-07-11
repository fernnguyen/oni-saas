import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { setTenantCode } from '@/lib/api-config';
import { useAuthStore } from '@/stores/auth-store';
import toast from 'react-hot-toast';

const INDUSTRY_TYPES = [
  { id: 'retail', label: 'Bán lẻ & Siêu thị', icon: '🏪' },
  { id: 'fnb', label: 'Nhà hàng & Cafe', icon: '☕' },
  { id: 'billiards', label: 'Billiards & Bi-a', icon: '🎱' },
  { id: 'sports_court', label: 'Sân thể thao', icon: '⚽' },
  { id: 'lodging', label: 'Khách sạn & Homestay', icon: '🏨' },
  { id: 'fashion', label: 'Thời trang & Phụ kiện', icon: '👗' },
  { id: 'service_hourly', label: 'Spa & Dịch vụ', icon: '💆‍♀️' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [industryType, setIndustryType] = useState('retail');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  // Promo code
  const [invitationCode, setInvitationCode] = useState('');
  const [promoDetails, setPromoDetails] = useState<{
    valid: boolean;
    plan?: { id: number; code: string; name: string } | null;
    trial_days?: number | null;
    message?: string;
  } | null>(null);
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState('plan_mini');

  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  // Check session and fetch profile
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate('/login', { replace: true });
      } else if (!profile) {
        setProfile({
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Người dùng',
          phone: user.phone || user.user_metadata?.phone || '',
          avatar_url: user.user_metadata?.avatar_url || '',
        });
      }
    });
  }, [navigate, profile, setProfile]);

  function slugify(val: string) {
    return val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '')
      .trim()
      .slice(0, 50);
  }

  function handleNameChange(val: string) {
    setName(val);
    if (!slugManuallyEdited) {
      setSlug(slugify(val));
    }
  }

  function handleSlugChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    setSlug(clean);
    setSlugManuallyEdited(true);
  }

  useEffect(() => {
    if (slug.length < 2) {
      setSlugStatus('idle');
      return;
    }
    
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSlugStatus('checking');
      try {
        const res = await apiFetch<{ available: boolean }>(`/api/register/check-slug?slug=${encodeURIComponent(slug)}`, {
          signal: controller.signal
        });
        setSlugStatus(res.available ? 'available' : 'taken');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setSlugStatus('idle');
        }
      }
    }, 1200);
    
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug]);

  const codeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = invitationCode.trim();
    if (!trimmed) {
      setPromoDetails(null);
      setIsCheckingCode(false);
      setSelectedPlanCode('plan_mini');
      return;
    }

    setIsCheckingCode(true);
    const controller = new AbortController();

    if (codeDebounceRef.current) clearTimeout(codeDebounceRef.current);
    codeDebounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch<any>(`/api/register/check-code?code=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        });
        if (res.valid) {
          setPromoDetails(res);
          if (res.plan && res.plan.code) setSelectedPlanCode(res.plan.code);
        } else {
          setPromoDetails({ valid: false, message: res.message });
          setSelectedPlanCode('plan_mini');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setPromoDetails(null);
        }
      } finally {
        setIsCheckingCode(false);
      }
    }, 1200);

    return () => {
      if (codeDebounceRef.current) clearTimeout(codeDebounceRef.current);
      controller.abort();
    };
  }, [invitationCode]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slugStatus !== 'available') {
      toast.error('Tên miền không khả dụng. Vui lòng chọn tên khác.');
      return;
    }
    if (!name.trim()) {
      toast.error('Vui lòng nhập tên cửa hàng');
      return;
    }

    setLoading(true);
    try {
      // Bỏ qua phone/password vì Zalo đã cấp.
      const payload = {
        slug,
        name,
        industry_type: industryType,
        invitation_code: invitationCode,
        plan_code: selectedPlanCode,
        // turnstile_token: '',
      };

      const res = await apiFetch<{ tenant_id: string; slug: string }>('/api/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Lưu lại thông tin và chuyển thẳng sang /select-branch (nó sẽ auto-select)
      localStorage.setItem('active_tenant_code', res.slug);
      setTenantCode(res.slug);
      toast.success('Khởi tạo cửa hàng thành công!');
      navigate('/select-branch', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi tạo cửa hàng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* User Profile Header */}
        {profile && (
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border)]">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-[var(--border)] shrink-0">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-subtitle">
                    {profile.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-2xs text-subtitle">Đang đăng nhập với</p>
                <p className="text-sm font-semibold text-foreground truncate">{profile.full_name}</p>
                {profile.phone && <p className="text-xs text-subtitle">{profile.phone}</p>}
              </div>
            </div>
            <button
              onClick={async () => {
                const { logout } = await import('@/services/auth');
                await logout();
                navigate('/login', { replace: true });
              }}
              className="text-xs font-semibold text-[var(--primary)] bg-[var(--primary)]/10 px-3 py-2 rounded-lg shrink-0 ml-3 hover:bg-[var(--primary)]/20 transition-colors"
            >
              Đổi
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Thiết lập cửa hàng
          </h1>
          <p className="text-sm text-subtitle mt-1 text-center">
            {step === 1 ? 'Chọn ngành nghề kinh doanh' : 'Đặt tên cho cửa hàng của bạn'}
          </p>
        </div>

        {/* Form Steps */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {INDUSTRY_TYPES.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => setIndustryType(ind.id)}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                    industryType === ind.id
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] bg-white text-foreground hover:border-[var(--primary)]/30'
                  }`}
                >
                  <span className="text-2xl mb-2">{ind.icon}</span>
                  <span className="text-xs font-semibold text-center">{ind.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="auth-btn auth-btn-primary w-full mt-4"
            >
              Tiếp tục
            </button>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Tên cửa hàng
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ví dụ: Cửa hàng Oni"
                className="auth-input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Đường dẫn truy cập (Tên miền)
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="cua-hang-oni"
                  className={`auth-input pr-[75px] ${
                    slugStatus === 'taken' ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : ''
                  }`}
                  required
                />
                <span className="absolute right-3 text-sm text-subtitle font-medium pointer-events-none">
                  .oni.vn
                </span>
              </div>
              
              <div className="mt-1.5 text-xs">
                {slugStatus === 'checking' && <span className="text-subtitle">Đang kiểm tra...</span>}
                {slugStatus === 'available' && <span className="text-green-600 font-medium">Tên miền này khả dụng</span>}
                {slugStatus === 'taken' && <span className="text-red-500 font-medium">Tên miền đã được sử dụng</span>}
                {slugStatus === 'idle' && slug.length < 2 && <span className="text-subtitle">Tối thiểu 2 ký tự (chữ không dấu, số, gạch ngang)</span>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <span>Mã mời / Mã ưu đãi</span>
                <span className="rounded-md bg-[var(--border)] px-1.5 py-0.5 text-[9px] font-semibold text-subtitle uppercase tracking-wider">Tùy chọn</span>
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="Nhập mã ưu đãi (nếu có)"
                  className={`auth-input pr-[40px] ${
                    promoDetails?.valid === false ? 'border-red-400 focus:border-red-400 focus:ring-red-200' :
                    promoDetails?.valid ? 'border-green-400 focus:border-green-400 focus:ring-green-200' : ''
                  }`}
                />
                {isCheckingCode && (
                  <div className="absolute right-3 text-subtitle">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                      <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-xs">
                {promoDetails?.valid === false && <span className="text-red-500">{promoDetails.message || 'Mã mời không hợp lệ.'}</span>}
                {promoDetails?.valid && (
                  <span className="text-green-600 font-medium">
                    {promoDetails.plan ? `Áp dụng gói ${promoDetails.plan.name}` : 'Mã ưu đãi hợp lệ'}
                    {promoDetails.trial_days ? ` (Dùng thử ${promoDetails.trial_days} ngày)` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Plan Display */}
            <div className="pt-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">Gói dịch vụ</label>
              <div className="flex items-center gap-3 rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5 px-4 py-3 text-[var(--primary)]">
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">
                      {promoDetails?.valid && promoDetails.plan ? promoDetails.plan.name : 'Tiên phong'}
                    </span>
                    {promoDetails?.valid && promoDetails.trial_days ? (
                      <span className="rounded-md bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide shrink-0">
                        Dùng thử {promoDetails.trial_days} ngày
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide shrink-0">
                        Miễn phí
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-subtitle mt-0.5">
                    {promoDetails?.valid ? 'Áp dụng từ mã ưu đãi' : 'Có thể nâng cấp sau'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="auth-btn auth-btn-secondary flex-1"
                disabled={loading}
              >
                Quay lại
              </button>
              <button
                type="submit"
                className="auth-btn auth-btn-primary flex-1"
                disabled={loading || slugStatus !== 'available'}
              >
                {loading ? 'Đang tạo...' : 'Hoàn tất'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
