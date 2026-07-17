import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { setTenantCode } from '@/lib/api-config';
import { useAuthStore } from '@/stores/auth-store';
import { getUserInfo, followOA, interactOA } from 'zmp-sdk/apis';
import { requestSendNotification } from 'zmp-sdk';
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
  type PermissionStatus = 'pending' | 'granted' | 'skipped';
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
    message?: string;
    trial_days?: number | null;
    plan?: {
      code: string;
      name: string;
      price_monthly?: number;
      price_yearly?: number;
    } | null;
  } | null>(null);
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState('plan_mini');

  // Success state (step 3)
  const [registeredInfo, setRegisteredInfo] = useState<{ slug: string; name: string } | null>(null);
  const [oaInteracted, setOaInteracted] = useState(false);
  const [oaLoading, setOaLoading] = useState(false);
  const [followStatus, setFollowStatus] = useState<PermissionStatus>('pending');
  const [interactionStatus, setInteractionStatus] = useState<PermissionStatus>('pending');
  const [notifyStatus, setNotifyStatus] = useState<PermissionStatus>('pending');

  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  // Retrieve user session info on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !profile) {
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
      const payload = {
        slug,
        name,
        industry_type: industryType,
        invitation_code: invitationCode,
        plan_code: selectedPlanCode,
      };

      const res = await apiFetch<{ tenant_id: string; slug: string }>('/api/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Save active tenant slug
      localStorage.setItem('active_tenant_code', res.slug);
      setTenantCode(res.slug);
      
      setRegisteredInfo({ slug: res.slug, name: name });
      setStep(3);
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi tạo cửa hàng');
    } finally {
      setLoading(false);
    }
  };

  const handleFollowOA = async () => {
    setOaLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        followOA({
          id: '2780444502954767948',
          success: () => {
            console.log('followOA success');
            resolve();
          },
          fail: (err) => {
            console.warn('followOA failed/denied:', err);
            reject(err);
          },
        });
      });
      setFollowStatus('granted');
      toast.success('Đã quan tâm OA thành công');
    } catch (err) {
      console.error(err);
      toast.error('Không thể hoàn tất bước quan tâm OA');
    } finally {
      setOaLoading(false);
    }
  };

  const handleGrantInteraction = async () => {
    setOaLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        interactOA({
          oaId: '2780444502954767948',
          success: () => {
            console.log('interactOA success');
            resolve();
          },
          fail: (err) => {
            console.warn('interactOA failed/denied:', err);
            reject(err);
          },
        });
      });
      setInteractionStatus('granted');
      toast.success('Đã cấp quyền tương tác với OA');
    } catch (err) {
      console.error(err);
      toast.error('Không thể hoàn tất bước cấp tương tác');
    } finally {
      setOaLoading(false);
    }
  };

  const handleGrantNotification = async () => {
    setOaLoading(true);
    try {
      await requestSendNotification();
      setNotifyStatus('granted');
      toast.success('Đã cho phép nhận thông báo OA');
    } catch (err) {
      console.error(err);
      toast.error('Không thể hoàn tất bước nhận thông báo');
    } finally {
      setOaLoading(false);
    }
  };

  const handleInteractOA = async () => {
    if (!registeredInfo) return;
    if (
      followStatus === 'pending' ||
      interactionStatus === 'pending' ||
      notifyStatus === 'pending'
    ) {
      toast.error('Vui lòng chọn cho phép hoặc bỏ qua cho từng bước trước khi tiếp tục');
      return;
    }
    setOaLoading(true);
    try {
      let idByOA = '';
      if (
        followStatus === 'granted' &&
        interactionStatus === 'granted' &&
        notifyStatus === 'granted'
      ) {
        const userInfoRes = await new Promise<any>((resolve, reject) => {
          getUserInfo({
            success: (data) => resolve(data),
            fail: (err) => reject(err),
          });
        });
        const userInfo = userInfoRes.userInfo;
        idByOA = userInfo?.idbyOA || userInfo?.idByOA || '';
        console.log('Retrieved idbyOA after interactOA:', idByOA);
      } else {
        console.log('User skipped at least one OA permission step, skipping OA message delivery.');
      }

      // Call welcome message API
      let welcomeResult: any = null;
      if (idByOA) {
        welcomeResult = await apiFetch('/api/register/send-oa-welcome', {
          method: 'POST',
          body: JSON.stringify({
            slug: registeredInfo.slug,
            name: registeredInfo.name,
            zaloIdByOA: idByOA,
          }),
        });
      }

      setOaInteracted(true);
      if (welcomeResult?.sent) {
        toast.success('Đã cấp quyền và gửi tin nhắn OA thành công!');
      } else if (idByOA) {
        const deliveryReason = welcomeResult?.reason || 'unknown';
        console.warn('OA welcome message was not delivered:', {
          deliveryReason,
          welcomeResult,
          idByOA,
        });
        toast.success('Đã lưu lựa chọn của bạn. Bạn vẫn có thể bắt đầu dùng ứng dụng ngay.');
      } else {
        toast.success('Đã lưu lựa chọn của bạn. Bạn có thể cấp quyền sau trong ứng dụng nếu cần.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Không thể hoàn tất bước thiết lập OA');
    } finally {
      setOaLoading(false);
    }
  };

  const handleComplete = () => {
    toast.success('Bắt đầu quản lý cửa hàng!');
    navigate('/select-branch', { replace: true });
  };

  const renderPermissionStatus = (status: PermissionStatus) => {
    if (status === 'granted') return 'Đã cho phép';
    if (status === 'skipped') return 'Đã bỏ qua';
    return 'Chưa chọn';
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* User Profile Header */}
        {profile && step !== 3 && (
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
          {step === 3 ? (
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgb(16, 185, 129)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
          )}
          <h1 className="text-xl font-bold text-foreground">
            {step === 3 ? 'Khởi tạo thành công!' : 'Thiết lập cửa hàng'}
          </h1>
          <p className="text-sm text-subtitle mt-1 text-center px-2">
            {step === 1 ? 'Chọn ngành nghề kinh doanh' : 
             step === 2 ? 'Đặt tên cho cửa hàng của bạn' :
             'Nhận thông báo đơn hàng và hệ thống'}
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
              <label className="block text-sm font-medium text-foreground mb-1.5">Gói dịch vụ đăng ký</label>
              
              {(() => {
                let totalOriginalPrice = 0;
                let trialDurationText = '';
                
                if (promoDetails?.valid && promoDetails.plan && promoDetails.trial_days) {
                  const days = promoDetails.trial_days;
                  if (days % 365 === 0) {
                    const years = days / 365;
                    totalOriginalPrice = (promoDetails.plan.price_yearly || (promoDetails.plan.price_monthly || 0) * 12) * years;
                    trialDurationText = `${years} năm`;
                  } else if (days % 30 === 0) {
                    const months = days / 30;
                    totalOriginalPrice = (promoDetails.plan.price_monthly || 0) * months;
                    trialDurationText = `${months} tháng`;
                  } else {
                    const monthsFraction = days / 30;
                    totalOriginalPrice = Math.round((promoDetails.plan.price_monthly || 0) * monthsFraction);
                    trialDurationText = `${days} ngày`;
                  }
                }

                const formattedTotalPrice = totalOriginalPrice ? (() => {
                  if (totalOriginalPrice >= 1000000) return `${(totalOriginalPrice / 1000000).toFixed(1).replace('.0', '')}M`;
                  if (totalOriginalPrice >= 1000) return `${totalOriginalPrice / 1000}K`;
                  return totalOriginalPrice.toString();
                })() : '';

                return (
                  <>
                    <div className="rounded-xl border border-[#ff6a00] bg-[#fff5eb] p-3.5 text-[#ff6a00] flex flex-col gap-2">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-bold text-foreground text-sm">
                            {promoDetails?.valid && promoDetails.plan ? promoDetails.plan.name : 'Tiên phong'}
                          </span>
                        </div>
                        {promoDetails?.valid && promoDetails.trial_days ? (
                          <span className="rounded bg-[#ff6a00] px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide shrink-0">
                            Dùng thử {promoDetails.trial_days} ngày
                          </span>
                        ) : (
                          <span className="rounded bg-[#ff6a00] px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide shrink-0">
                            Miễn phí vĩnh viễn
                          </span>
                        )}
                      </div>
                      
                      {promoDetails?.valid && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 106, 0, 0.1)', paddingTop: 8, marginTop: 4 }}>
                          <span className="text-[10px] font-semibold text-[#ff6a00]/80">
                            Áp dụng từ mã ưu đãi:
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {totalOriginalPrice > 0 && (
                              <span className="line-through text-slate-400 font-medium text-[10px]">
                                {formattedTotalPrice}/{trialDurationText}
                              </span>
                            )}
                            <span className="font-extrabold text-emerald-600 bg-white px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                              0đ
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {promoDetails?.valid && promoDetails.trial_days && (
                      <p className="text-[11px] text-subtitle mt-2 leading-relaxed bg-[var(--border)]/30 p-2 rounded-lg">
                        * Sau khi hết hạn dùng thử mà bạn không có nhu cầu nâng cấp, bạn vẫn được tự động chuyển về dùng gói Tiên phong miễn phí vĩnh viễn.
                      </p>
                    )}
                  </>
                );
              })()}
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

        {/* Step 3: Zalo OA interaction request */}
        {step === 3 && registeredInfo && (
          <div className="space-y-5 text-center">
            <div className="bg-slate-50 border border-[var(--border)] rounded-2xl p-4 flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 className="text-sm font-bold text-foreground mb-1">Đăng ký nhận tin nhắn từ Zalo OA</h2>
              <p className="text-xs text-subtitle leading-relaxed">
                Hệ thống có thể gửi thông tin đơn hàng, yêu cầu vận hành và thông báo hệ thống qua Zalo OA. Bạn có thể tắt các thông báo này sau trong ứng dụng.
              </p>
            </div>

            {oaInteracted ? (
              <div className="bg-emerald-50 text-emerald-700 text-xs border border-emerald-200 rounded-xl p-3 flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Đã cấp quyền nhận thông báo từ OA.</span>
              </div>
            ) : (
              <div className="space-y-3 text-left">
                {[
                  {
                    stepNo: 1,
                    title: 'Quan tâm OA',
                    description: 'Để OA có thể đồng hành cùng bạn và gửi các cập nhật cần thiết.',
                    status: followStatus,
                    onAllow: handleFollowOA,
                    onSkip: () => setFollowStatus('skipped'),
                    enabled: true,
                  },
                  {
                    stepNo: 2,
                    title: 'Cấp quyền tương tác',
                    description: 'Để hệ thống gửi các yêu cầu và thông báo vận hành liên quan tới cửa hàng.',
                    status: interactionStatus,
                    onAllow: handleGrantInteraction,
                    onSkip: () => setInteractionStatus('skipped'),
                    enabled: followStatus !== 'pending',
                  },
                  {
                    stepNo: 3,
                    title: 'Cho phép nhận thông báo',
                    description: 'Để nhận cảnh báo đơn hàng, yêu cầu và thông báo hệ thống theo thời gian thực.',
                    status: notifyStatus,
                    onAllow: handleGrantNotification,
                    onSkip: () => setNotifyStatus('skipped'),
                    enabled: interactionStatus !== 'pending',
                  },
                ].map((item) => (
                  <div
                    key={item.stepNo}
                    className={`rounded-2xl border p-4 ${
                      item.enabled ? 'border-[var(--border)] bg-white' : 'border-slate-100 bg-slate-50 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-[var(--primary)]">Bước {item.stepNo}</div>
                        <div className="mt-1 text-sm font-bold text-foreground">{item.title}</div>
                        <p className="mt-1 text-xs text-subtitle leading-relaxed">{item.description}</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                        {renderPermissionStatus(item.status)}
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={item.onAllow}
                        disabled={oaLoading || !item.enabled || item.status === 'granted'}
                        className="auth-btn auth-btn-primary flex-1 flex items-center justify-center gap-2 bg-[#ff6a00] hover:bg-[#e05d00] transition-colors disabled:opacity-60"
                      >
                        {oaLoading && item.status === 'pending' ? 'Đang xử lý...' : 'Cho phép'}
                      </button>
                      <button
                        type="button"
                        onClick={item.onSkip}
                        disabled={oaLoading || !item.enabled || item.status !== 'pending'}
                        className="auth-btn auth-btn-secondary flex-1 disabled:opacity-60"
                      >
                        Bỏ qua
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleInteractOA}
                  disabled={
                    oaLoading ||
                    followStatus === 'pending' ||
                    interactionStatus === 'pending' ||
                    notifyStatus === 'pending'
                  }
                  className="auth-btn auth-btn-primary w-full flex items-center justify-center gap-2 bg-[#ff6a00] hover:bg-[#e05d00] transition-colors disabled:opacity-60"
                >
                  {oaLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                        <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Đang xử lý...</span>
                    </>
                  ) : (
                    <span>Lưu lựa chọn và tiếp tục</span>
                  )}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleComplete}
              className="auth-btn auth-btn-secondary w-full border-dashed flex items-center justify-center gap-1.5"
            >
              <span>Bắt đầu quản lý cửa hàng</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
