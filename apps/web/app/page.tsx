import Link from 'next/link';
import Image from 'next/image';
import { getSupabaseAdminClient } from '../lib/server/supabaseAdmin';
import { PricingSection } from './PricingSection';

/* ── Inline SVG icon components ─────────────────────────────── */
const DatabaseIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
  </svg>
);
const AiIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
  </svg>
);
const BellIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
);
const ShopIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
  </svg>
);
const ShieldIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);
const GlobeIcon = () => (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 9c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 9c0-.778.099-1.533.284-2.253" />
  </svg>
);
const CheckIcon = () => (
  <svg className="h-5 w-5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

/* ── Data ────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: <DatabaseIcon />, title: 'BYOD — Sở hữu dữ liệu', desc: 'Kết nối Google Sheets, Supabase hoặc database riêng. Dữ liệu luôn thuộc về bạn, chúng tôi không can thiệp.' },
  { icon: <AiIcon />, title: 'AI thông minh', desc: 'Phân tích doanh thu, dự báo hàng tồn, đề xuất giá bán — tất cả đều tự động nhờ AI.' },
  { icon: <BellIcon />, title: 'Zalo & Telegram', desc: 'Nhận thông báo đơn hàng, cảnh báo hết hàng qua Zalo OA và Telegram Bot theo thời gian thực.' },
  { icon: <ShopIcon />, title: 'POS & Kho hàng', desc: 'Bán hàng, quản lý kho, đa chi nhánh, quét barcode — mọi thứ gói gọn trong một nền tảng.' },
  { icon: <ShieldIcon />, title: 'Bảo mật cao cấp', desc: 'Xác thực 2 lớp (2FA), phân quyền chi tiết theo vai trò, audit log đầy đủ.' },
  { icon: <GlobeIcon />, title: 'Subdomain riêng', desc: 'Mỗi doanh nghiệp có workspace riêng tại your-shop.oni.vn - sẵn sàng trong 60 giây.' },
];

const STEPS = [
  { num: '01', title: 'Đăng ký workspace', desc: 'Chọn subdomain, nhập thông tin - workspace sẵn sàng trong 60 giây.' },
  { num: '02', title: 'Kết nối dữ liệu', desc: 'Tùy chỉnh sử dụng Google Sheets hoặc Supabase. Bạn quản lý toàn quyền dữ liệu của mình.' },
  { num: '03', title: 'Bắt đầu bán hàng', desc: 'Mở POS, nhập hàng, quản lý kho, công nợ, báo cáo - tất cả trên trình duyệt.' },
];

const PLAN_DETAILS: Record<string, any> = {
  'plan_mini': {
    price: 'Miễn phí', period: '', badge: '',
    features: ['1 chi nhánh', '500 sản phẩm', 'Google Sheets adapter', 'POS cơ bản', 'Cộng đồng hỗ trợ'],
    cta: 'Bắt đầu miễn phí', highlight: false,
  },
  'plan_pro': {
    price: '299K', period: '/tháng', badge: 'Phổ biến',
    features: ['5 chi nhánh', 'Không giới hạn sản phẩm', 'Supabase DB adapter', 'AI insights', 'Zalo & Telegram', '2FA & audit log', 'Hỗ trợ ưu tiên'],
    cta: 'Dùng thử 14 ngày', highlight: true,
  },
  'plan_enterprise': {
    price: 'Liên hệ', period: '', badge: '',
    features: ['Không giới hạn chi nhánh', 'Mọi tính năng Pro', 'Custom database', 'API & webhook', 'SLA 99.9%', 'Onboarding chuyên biệt'],
    cta: 'Liên hệ tư vấn', highlight: false,
  }
};

/* ── Page ────────────────────────────────────────────────────── */
export default async function LandingPage() {
  const admin = getSupabaseAdminClient();
  const { data: dbPlans } = await admin.from('plans').select('*').order('id', { ascending: true });

  const plans = (dbPlans || []).map((p: any) => ({
    name: p.name,
    code: p.code,
    price_monthly: p.price_monthly,
    price_yearly: p.price_yearly,
    ...(PLAN_DETAILS[p.code] || PLAN_DETAILS['plan_mini'])
  }));

  // Fallback in case DB is empty
  const displayPlans = plans.length > 0 ? plans : Object.keys(PLAN_DETAILS).map((k) => ({ name: k, code: k, ...PLAN_DETAILS[k] }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ═══ NAVBAR ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg shadow-md" />
            <span className="text-xl font-extrabold tracking-tight text-primary">ONI.vn</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-primary transition-colors">Tính năng</a>
            <a href="#how" className="hover:text-primary transition-colors">Cách hoạt động</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Bảng giá</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/signin" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
              Đăng nhập
            </Link>
            <Link href="/register" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-primary-dark hover:shadow-lg transition-all">
              Dùng thử miễn phí
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO (SPLIT LAYOUT VIBE) ═══ */}
      <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden bg-primary">
        {/* Dynamic Shapes for modern SaaS feel */}
        <div className="absolute top-0 left-0 right-0 bottom-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] h-[800px] w-[800px] rounded-full bg-white/5 blur-[100px]" />
          <div className="absolute top-[20%] -right-[10%] h-[600px] w-[600px] rounded-full bg-cyan-400/20 blur-[100px]" />
          <div className="absolute -bottom-[20%] left-[20%] h-[500px] w-[500px] rounded-full bg-blue-300/20 blur-[80px]" />
          
          {/* Floating glassmorphism shapes */}
          <div className="hidden lg:block absolute top-[25%] right-[15%] h-[120px] w-[120px] rounded-[2rem] rotate-12 bg-white/10 backdrop-blur-2xl border border-white/20 animate-pulse" />
          <div className="hidden lg:block absolute bottom-[30%] right-[25%] h-[80px] w-[80px] rounded-full bg-cyan-300/20 backdrop-blur-xl border border-white/10 animate-bounce" style={{ animationDuration: '4s' }} />
          <div className="hidden lg:block absolute top-[40%] left-[10%] h-[150px] w-[150px] rounded-[3rem] -rotate-12 bg-blue-400/20 backdrop-blur-xl border border-white/10" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 text-center lg:text-left z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md px-4 py-1.5 text-sm font-medium text-white shadow-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Sẵn sàng kết nối BYOD
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-[3.5rem] font-extrabold leading-[1.1] tracking-tight text-white mb-6 drop-shadow-sm">
              Sở hữu dữ liệu. <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-cyan-200">
                Làm chủ kinh doanh.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto lg:mx-0 text-lg md:text-xl text-blue-100/90 leading-relaxed font-medium">
              Nền tảng POS & quản lý bán hàng đa chi nhánh đột phá. Giữ toàn quyền dữ liệu với cơ chế BYOD, tích hợp AI thông minh và thông báo đa kênh.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link href="/register" className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-primary shadow-xl hover:bg-blue-50 transition-all hover:scale-105">
                Bắt đầu hoàn toàn miễn phí
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <a href="#how" className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/30 bg-transparent px-8 py-4 text-base font-semibold text-white hover:bg-white/10 transition-all">
                Xem cách hoạt động
              </a>
            </div>
            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm font-medium text-blue-200">
              <div className="flex items-center gap-1.5"><ShieldIcon /><span className="opacity-90">Bảo mật AES-256</span></div>
              <div className="flex items-center gap-1.5"><DatabaseIcon /><span className="opacity-90">BYOD Database</span></div>
              <div className="flex items-center gap-1.5"><GlobeIcon /><span className="opacity-90">Uptime 99.9%</span></div>
            </div>
          </div>

          <div className="flex-1 w-full max-w-lg lg:max-w-none relative z-10 hidden md:block">
            {/* Right side Dashboard mock/illustration */}
            <div className="relative rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-2 shadow-2xl transform rotate-2 hover:rotate-0 transition-transform duration-500">
              <div className="absolute top-4 left-4 flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400/80" />
                <div className="h-3 w-3 rounded-full bg-amber-400/80" />
                <div className="h-3 w-3 rounded-full bg-green-400/80" />
              </div>
              <div className="mt-8 rounded-xl bg-white p-4 shadow-inner">
                <div className="flex gap-4 mb-4">
                  <div className="w-1/3 h-24 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-col">
                    <span className="text-2xl font-bold text-primary">4.2M</span>
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-widest mt-1">Doanh thu</span>
                  </div>
                  <div className="w-1/3 h-24 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-col">
                    <span className="text-2xl font-bold text-emerald-600">128</span>
                    <span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mt-1">Đơn hàng</span>
                  </div>
                  <div className="w-1/3 h-24 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center flex-col">
                    <span className="text-2xl font-bold text-violet-600">100%</span>
                    <span className="text-xs font-semibold text-violet-600 uppercase tracking-widest mt-1">Đồng bộ</span>
                  </div>
                </div>
                <div className="h-40 rounded-lg bg-slate-50 border border-slate-100" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="relative py-24 md:py-32 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-24">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Tính năng</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Hệ sinh thái hoàn chỉnh</h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-500 font-medium">Kiến trúc Provider-Agnostic — kết nối bất kỳ nguồn dữ liệu nào. Bạn giữ toàn quyền kiểm soát.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="group rounded-3xl border border-slate-200 bg-white p-8 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="mb-6 inline-flex items-center justify-center rounded-2xl bg-blue-50 p-4 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{f.title}</h3>
                <p className="text-slate-500 leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how" className="relative py-24 md:py-32 bg-white border-y border-slate-100">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-20">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Cách hoạt động</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Thiết lập chỉ vài click chuột</h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-blue-100 via-blue-300 to-blue-100" />
            
            {STEPS.map((s, idx) => (
              <div key={s.num} className="relative z-10 text-center flex flex-col items-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white border-4 border-slate-50 shadow-xl shadow-blue-900/5 mb-6 group-hover:border-blue-100 transition-colors">
                  <span className="text-3xl font-black text-primary">{s.num}</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{s.title}</h3>
                <p className="text-slate-500 leading-relaxed font-medium max-w-xs">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <PricingSection plans={displayPlans} />

      {/* ═══ CTA ═══ */}
      <section className="relative py-24 md:py-32 bg-primary overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-0 h-[500px] w-[500px] rounded-full bg-white/5 blur-[100px]" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-cyan-400/20 blur-[80px]" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 text-center z-10">
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-6">
            Bắt đầu quản lý kinh doanh thông minh
          </h2>
          <p className="text-xl text-blue-100/90 font-medium mb-10 max-w-2xl mx-auto">
            Bắt đầu kinh doanh với chi phí 0đ. Thiết lập trong 60 giây. Làm chủ dữ liệu kinh doanh của bạn ngay hôm nay.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="group flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-lg font-bold text-primary shadow-2xl hover:bg-blue-50 transition-all hover:scale-105">
              Đăng ký ngay
              <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-white py-16 border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="ONI.vn" width={40} height={40} className="rounded-xl shadow-md" />
            <span className="text-xl font-bold tracking-tight text-slate-900">ONI.vn</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm font-medium text-slate-500">
            <a href="#features" className="hover:text-primary transition-colors">Tính năng</a>
            <a href="#how" className="hover:text-primary transition-colors">Cách hoạt động</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Bảng giá</a>
            <Link href="/auth/signin" className="hover:text-primary transition-colors">Đăng nhập</Link>
          </div>
          <p className="text-sm font-medium text-slate-400">&copy; {new Date().getFullYear()} ONI.vn. Đã đăng ký bản quyền.</p>
        </div>
      </footer>
    </div>
  );
}

