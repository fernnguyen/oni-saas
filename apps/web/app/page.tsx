import Link from 'next/link';
import Image from 'next/image';
import { getSupabaseAdminClient } from '../lib/server/supabaseAdmin';
import { PricingSection } from './PricingSection';
import { LoginButton } from './LoginButton';
import { HeroDashboardMock } from './HeroDashboardMock';

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
  { icon: <DatabaseIcon />, title: 'BYOD - Sở hữu dữ liệu', desc: 'Kết nối Google Sheets, Supabase hoặc database riêng. Dữ liệu luôn thuộc về bạn, chúng tôi không can thiệp.' },
  { icon: <AiIcon />, title: 'AI thông minh', desc: 'Phân tích doanh thu, dự báo hàng tồn, đề xuất giá bán - tất cả đều tự động nhờ AI.' },
  { icon: <BellIcon />, title: 'Zalo & Telegram', desc: 'Nhận thông báo đơn hàng, cảnh báo hết hàng qua Zalo OA và Telegram Bot theo thời gian thực.' },
  { icon: <ShopIcon />, title: 'POS & Kho hàng', desc: 'Bán hàng, quản lý kho, đa chi nhánh, quét barcode - mọi thứ gói gọn trong một nền tảng.' },
  { icon: <ShieldIcon />, title: 'Bảo mật cao cấp', desc: 'Xác thực 2 lớp (2FA), phân quyền chi tiết theo vai trò, audit log đầy đủ.' },
  { icon: <GlobeIcon />, title: 'Subdomain riêng', desc: 'Mỗi doanh nghiệp có gian hàng riêng tại your-shop.oni.vn - sẵn sàng trong 60 giây.' },
];

const STEPS = [
  { num: '01', title: 'Đăng ký gian hàng', desc: 'Chọn subdomain, nhập thông tin - gian hàng sẵn sàng trong 60 giây.' },
  { num: '02', title: 'Kết nối dữ liệu', desc: 'Tùy chỉnh sử dụng Google Sheets hoặc Supabase. Bạn quản lý toàn quyền dữ liệu của mình.' },
  { num: '03', title: 'Bắt đầu bán hàng', desc: 'Mở POS, nhập hàng, quản lý kho, công nợ, báo cáo - tất cả trên trình duyệt.' },
];

const PLAN_DETAILS: Record<string, any> = {
  'plan_mini': {
    price: 'Miễn phí', period: '', badge: '',
    features: ['1 chi nhánh', '500 sản phẩm', 'DB dùng chung (PostgreSQL)', 'POS cơ bản', 'Cộng đồng hỗ trợ'],
    cta: 'Đăng ký miễn phí', highlight: false,
  },
  'plan_pro': {
    price: '299K', period: '/tháng', badge: 'Phổ biến',
    features: ['5 chi nhánh', 'Không giới hạn sản phẩm', 'Google Sheet / BYOD (Riêng tư)', 'AI insights', 'Zalo & Telegram', '2FA & audit log', 'Hỗ trợ ưu tiên'],
    cta: 'Bắt đầu bán hàng', highlight: true,
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
            <LoginButton />
            <Link href="/register" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-primary-dark hover:shadow-lg transition-all">
              Bắt đầu bán hàng
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO (SPLIT LAYOUT VIBE) ═══ */}
      <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden bg-slate-50 border-b border-slate-200">
        {/* Dynamic Shapes for modern SaaS feel */}
        <div className="absolute top-0 left-0 right-0 bottom-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] h-[800px] w-[800px] rounded-full bg-blue-100/30 blur-[100px]" />
          <div className="absolute top-[20%] -right-[10%] h-[600px] w-[600px] rounded-full bg-cyan-100/50 blur-[100px]" />
          <div className="absolute -bottom-[20%] left-[20%] h-[500px] w-[500px] rounded-full bg-blue-200/40 blur-[80px]" />
          
          {/* Floating glassmorphism shapes */}
          <div className="hidden lg:block absolute top-[25%] right-[15%] h-[120px] w-[120px] rounded-[2rem] rotate-12 bg-white/50 backdrop-blur-2xl border border-blue-100 animate-pulse shadow-xl shadow-blue-900/5" />
          <div className="hidden lg:block absolute bottom-[30%] right-[25%] h-[80px] w-[80px] rounded-full bg-cyan-50/50 backdrop-blur-xl border border-cyan-100 animate-bounce shadow-lg shadow-cyan-900/5" style={{ animationDuration: '4s' }} />
          <div className="hidden lg:block absolute top-[40%] left-[10%] h-[150px] w-[150px] rounded-[3rem] -rotate-12 bg-blue-50/50 backdrop-blur-xl border border-blue-100 shadow-xl shadow-blue-900/5" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 text-center lg:text-left z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 backdrop-blur-md px-4 py-1.5 text-sm font-medium text-primary shadow-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Sẵn sàng kết nối BYOD
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-[3.5rem] font-extrabold leading-[1.1] tracking-tight text-slate-900 mb-6 drop-shadow-sm">
              Sở hữu dữ liệu. <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
                Làm chủ kinh doanh.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto lg:mx-0 text-lg md:text-xl text-slate-600 leading-relaxed font-medium">
              Nền tảng POS & quản lý bán hàng đa chi nhánh đột phá. Giữ toàn quyền dữ liệu với cơ chế BYOD, tích hợp AI thông minh và thông báo đa kênh.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link href="/register" className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-primary-dark transition-all hover:scale-105">
                Bắt đầu bán hàng ngay
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <a href="#how" className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/50 backdrop-blur-md px-8 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50 transition-all">
                Xem cách hoạt động
              </a>
            </div>
            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm font-medium text-slate-500">
              <div className="flex items-center gap-1.5"><ShieldIcon /><span className="opacity-90">Bảo mật AES-256</span></div>
              <div className="flex items-center gap-1.5"><DatabaseIcon /><span className="opacity-90">BYOD Database</span></div>
              <div className="flex items-center gap-1.5"><GlobeIcon /><span className="opacity-90">Uptime 99.9%</span></div>
            </div>
          </div>

          <div className="flex-1 w-full max-w-lg lg:max-w-none relative z-10 hidden md:block">
            {/* Right side Dashboard mock/illustration */}
            <div className="relative rounded-2xl bg-white/80 backdrop-blur-md border border-slate-200 p-2 shadow-2xl shadow-blue-900/10 transform rotate-2 hover:rotate-0 transition-transform duration-500">
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
                <HeroDashboardMock />
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
            <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-500 font-medium">Kiến trúc Provider-Agnostic - kết nối bất kỳ nguồn dữ liệu nào. Bạn giữ toàn quyền kiểm soát.</p>
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

      {/* ═══ UNIQUE CAPABILITIES ═══ */}
      <section className="relative py-24 md:py-32 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-24">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Vận hành thông minh</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Thiết kế cho mọi ngành hàng</h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-500 font-medium">Từ bán lẻ, F&B đến dịch vụ - ONI thích ứng với mô hình kinh doanh của riêng bạn bằng những tính năng độc quyền.</p>
          </div>
          
          <div className="grid gap-12 lg:grid-cols-2 items-center mb-24">
            <div className="order-2 lg:order-1">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Giải quyết trọn vẹn nghiệp vụ phức tạp</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Được thiết kế từ kinh nghiệm thực tiễn, hệ thống đáp ứng trơn tru các luồng vận hành chuyên sâu: từ bán hàng đa kênh, quản lý chuỗi chi nhánh, định lượng kho nguyên vật liệu, cho đến đối soát công nợ tự động.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Xử lý đơn hàng tốc độ cao, đồng bộ offline/online</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Quản lý kho, thẻ kho và định lượng chính xác</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Sổ quỹ liên kết công nợ, báo cáo P&L thời gian thực</li>
              </ul>
            </div>
            <div className="order-1 lg:order-2 rounded-3xl bg-orange-50 p-8 border border-orange-100 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-6 opacity-20"><DatabaseIcon /></div>
               <div className="relative z-10 flex gap-4 flex-col">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 hover:-translate-y-1 transition-transform">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Bán hàng POS</span>
                      <div className="font-semibold text-slate-800">Giao diện tối ưu cảm ứng & barcode</div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 hover:-translate-y-1 transition-transform">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/></svg>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Kho & Sản xuất</span>
                      <div className="font-semibold text-slate-800">Cảnh báo tồn kho & Định lượng BOM</div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 hover:-translate-y-1 transition-transform">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Tài chính</span>
                      <div className="font-semibold text-slate-800">Sổ quỹ & Đối soát công nợ tức thời</div>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          <div className="grid gap-12 lg:grid-cols-2 items-center mb-24">
            <div className="rounded-3xl bg-slate-900 p-8 border border-slate-800 relative overflow-hidden shadow-2xl">
               <div className="absolute top-0 left-0 p-6 opacity-10 text-white"><BellIcon /></div>
               <div className="relative z-10 space-y-4">
                  <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50 flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z"/></svg>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">Hóa đơn điện tử qua Zalo</div>
                      <div className="text-sm text-slate-400 mt-1">Hệ thống vừa gửi hóa đơn #1024 (345k) qua Zalo OA cho khách hàng.</div>
                    </div>
                  </div>
                  <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50 flex items-start gap-4 ml-6">
                    <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">Cảnh báo Telegram</div>
                      <div className="text-sm text-slate-400 mt-1">Sản phẩm "Cà phê máy" sắp hết. Cảnh báo tự động đẩy tới bộ phận Kho.</div>
                    </div>
                  </div>
               </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Hệ thống Thông báo Đa kênh</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Tích hợp sâu sắc với Zalo OA và Telegram, giúp bạn gửi thông báo đơn hàng tự động cho khách và nhận cảnh báo nội bộ ngay lập tức về tình trạng kinh doanh.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Gửi hóa đơn điện tử tự động qua Zalo OA</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Nhận cảnh báo doanh thu, tồn kho qua nhóm Telegram</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Tùy chỉnh bot cấu hình riêng cho từng chi nhánh</li>
              </ul>
            </div>
          </div>

          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="order-2 lg:order-1">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Trợ lý AI phân tích kinh doanh</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Không cần đọc báo cáo phức tạp. Chỉ cần &quot;chat&quot; với trợ lý AI của ONI bằng ngôn ngữ tự nhiên, bạn sẽ có ngay những thông tin quan trọng nhất để ra quyết định.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Phân tích số liệu và xu hướng bán hàng</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Tra cứu nhanh doanh thu theo ngày, theo mặt hàng</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><CheckIcon /> Hỗ trợ gợi ý các quyết định nhập kho thông minh</li>
              </ul>
            </div>
            <div className="order-1 lg:order-2 rounded-3xl bg-blue-50 p-8 border border-blue-100 relative overflow-hidden shadow-xl shadow-blue-900/5">
               <div className="absolute top-0 right-0 p-8 opacity-20 text-blue-400">
                  <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
               </div>
               <div className="relative z-10 flex flex-col gap-4">
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-4 relative">
                    <div className="flex items-start gap-3 flex-row-reverse">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 text-xs font-bold uppercase border border-slate-200">U</div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tr-none px-4 py-3 text-sm text-slate-700 shadow-sm leading-relaxed text-right">
                        Hôm nay cửa hàng bán được bao nhiêu?
                      </div>
                    </div>
                    <div className="flex items-start gap-3 mt-2">
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0 text-white text-xs font-bold shadow-md">AI</div>
                      <div className="bg-primary rounded-2xl rounded-tl-none px-4 py-3 text-sm text-white shadow-md leading-relaxed border border-primary-dark">
                        Doanh thu hôm nay là <strong>4,200,000đ</strong> (25 đơn). <br/>Mặt hàng bán chạy nhất: <span className="text-orange-200 font-semibold">Trà Sữa (10 ly)</span>.
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how" className="relative py-24 md:py-32 bg-slate-50 border-y border-slate-100">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-20">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Cách hoạt động</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Thiết lập chỉ vài click chuột</h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-orange-100 via-orange-300 to-orange-100" />
            
            {STEPS.map((s, idx) => (
              <div key={s.num} className="relative z-10 text-center flex flex-col items-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white border-4 border-slate-50 shadow-xl shadow-orange-900/5 mb-6 group-hover:border-orange-100 transition-colors">
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
      <section className="relative py-24 md:py-32 bg-slate-50 border-t border-slate-200 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-0 h-[500px] w-[500px] rounded-full bg-blue-100/30 blur-[100px]" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-cyan-100/50 blur-[80px]" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 text-center z-10">
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-6">
            Bắt đầu quản lý kinh doanh thông minh
          </h2>
          <p className="text-xl text-slate-600 font-medium mb-10 max-w-2xl mx-auto">
            Bắt đầu kinh doanh với chi phí 0đ. Thiết lập trong 60 giây. Làm chủ dữ liệu kinh doanh của bạn ngay hôm nay.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="group flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-bold text-white shadow-xl hover:bg-primary-dark transition-all hover:scale-105">
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
            <LoginButton />
          </div>
          <p className="text-sm font-medium text-slate-400">&copy; {new Date().getFullYear()} ONI.vn. Đã đăng ký bản quyền.</p>
        </div>
      </footer>
    </div>
  );
}

