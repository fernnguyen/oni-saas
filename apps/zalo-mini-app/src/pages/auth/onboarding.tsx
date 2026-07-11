import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { setTenantCode } from '@/lib/api-config';
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

  // Check session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login', { replace: true });
      }
    });
  }, [navigate]);

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
    const timer = setTimeout(async () => {
      setSlugStatus('checking');
      try {
        const res = await apiFetch<{ available: boolean }>(`/api/register/check-slug?slug=${encodeURIComponent(slug)}`);
        setSlugStatus(res.available ? 'available' : 'taken');
      } catch (err) {
        setSlugStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [slug]);

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

            <div className="flex space-x-3 pt-2">
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
