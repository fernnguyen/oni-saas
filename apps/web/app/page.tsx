import Link from 'next/link';
import Image from 'next/image';
import { getSupabaseAdminClient } from '../lib/server/supabaseAdmin';
import { PricingSection } from './PricingSection';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { HeroDashboardMock } from './HeroDashboardMock';
import { INDUSTRY_GROUPS, INDUSTRIES_LIST } from './components/layout/industriesData';
import { FloatingZalo } from './components/layout/FloatingZalo';
import { AppDownloadButtons } from './components/layout/AppDownloadButtons';
import { FREE_TRIAL_YEARS } from '../lib/constants/pricing';
import { 
  Database, 
  Sparkles, 
  MessageSquare, 
  Store, 
  Shield, 
  Globe, 
  Check, 
  FileSpreadsheet, 
  ArrowRight,
  Clock,
  QrCode,
  Calendar,
  AlertCircle,
  ShoppingCart,
  Coins,
  Users,
  Server
} from 'lucide-react';

/* ── Data ────────────────────────────────────────────────────── */
const FEATURES = [
  { 
    icon: <Database className="h-6 w-6 text-blue-600" />, 
    title: 'BYOD - Sở hữu dữ liệu', 
    desc: 'Kết nối cơ sở dữ liệu riêng tư (Supabase, PostgreSQL, MySQL) hoặc bảng tính cá nhân. Dữ liệu là tài sản riêng của doanh nghiệp.' 
  },
  { 
    icon: <ShoppingCart className="h-6 w-6 text-emerald-600" />, 
    title: 'Nghiệp vụ Mua hàng & P2P', 
    desc: 'Chuỗi quy trình Mua hàng chuyên nghiệp: Yêu cầu mua (PR) → Đơn mua (PO) → Nhập kho (GRN) giúp kiểm soát chặt chẽ giá vốn và nhà cung cấp.' 
  },
  { 
    icon: <Coins className="h-6 w-6 text-amber-600" />, 
    title: 'Quản lý Tài sản & Khấu hao', 
    desc: 'Lập lịch khấu hao tài sản cố định, quản lý phân bổ chi phí hoạt động chi tiết giúp tính toán điểm hòa vốn doanh nghiệp cực kỳ khoa học.' 
  },
  { 
    icon: <Users className="h-6 w-6 text-indigo-650" />, 
    title: 'Hệ quản trị Mini CRM', 
    desc: 'Quản lý thông tin khách hàng, phân hạng thẻ hội viên, theo dõi công nợ nhắc nợ tự động qua Zalo OA và Telegram.' 
  },
  { 
    icon: <Sparkles className="h-6 w-6 text-violet-600" />, 
    title: 'Trợ lý AI Phân tích', 
    desc: 'Hỏi đáp bằng ngôn ngữ tự nhiên để tóm tắt tài chính cuối ngày, phân tích hiệu suất mặt hàng và dự báo dòng tiền thông minh.' 
  },
  { 
    icon: <Server className="h-6 w-6 text-cyan-600" />, 
    title: 'Triển khai Private Cloud', 
    desc: 'Đóng gói cài đặt, tùy biến mã nguồn và triển khai dedicated trên máy chủ riêng (AWS, GCP...) dành cho doanh nghiệp và chuỗi lớn.' 
  },
];

const STEPS = [
  { num: '01', title: 'Đăng ký gian hàng', desc: 'Chọn subdomain của bạn, nhập thông tin - gian hàng sẵn sàng trong 60 giây.' },
  { num: '02', title: 'Thiết lập lưu trữ', desc: 'Lựa chọn cơ sở dữ liệu riêng biệt của doanh nghiệp (BYOD) như Supabase, PostgreSQL độc lập hoặc sử dụng CSDL đám mây an toàn của ONI.' },
  { num: '03', title: 'Bắt đầu bán hàng', desc: 'Mở POS chuyên ngành, quản lý kho, công nợ, báo cáo - tất cả trên mọi thiết bị.' },
];

const PLAN_DETAILS: Record<string, any> = {
  'plan_mini': {
    price: 'Miễn phí', period: '', badge: '',
    features: ['1 chi nhánh', '500 sản phẩm', 'DB dùng chung (Shared PostgreSQL)', 'POS cơ bản', 'Cộng đồng hỗ trợ'],
    cta: 'Đăng ký miễn phí', highlight: false,
  },
  'plan_pro': {
    price: '299K', period: '/tháng', badge: 'Phổ biến',
    features: ['5 chi nhánh', 'Không giới hạn sản phẩm', 'Cơ sở dữ liệu riêng (BYOD - Supabase, DB riêng)', 'AI insights', 'Zalo & Telegram Alerts', '2FA & audit log', 'Hỗ trợ ưu tiên'],
    cta: 'Bắt đầu bán hàng', highlight: true,
  },
  'plan_enterprise': {
    price: 'Liên hệ', period: '', badge: '',
    features: ['Không giới hạn chi nhánh', 'Mọi tính năng Pro', 'Doanh nghiệp BYOD (Dedicated PostgreSQL)', 'API & webhook', 'SLA 99.9%', 'Onboarding chuyên biệt'],
    cta: 'Liên hệ tư vấn', highlight: false,
  }
};

/* ── Page ────────────────────────────────────────────────────── */
export default async function LandingPage() {
  const admin = getSupabaseAdminClient();
  const { data: dbPlans } = await admin.from('plans').select('*').order('id', { ascending: true });
  const plans = (dbPlans || [])
    .filter((p: any) => p.metadata?.show_public !== false)
    .map((p: any) => ({
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
      <Navbar />

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
              Sở hữu cơ sở dữ liệu riêng biệt (BYOD)
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-[3.5rem] font-extrabold leading-[1.1] tracking-tight text-slate-900 mb-6 drop-shadow-sm">
              Bán hàng dễ dàng. <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
                Quản lý gọn gàng.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto lg:mx-0 text-lg md:text-xl text-slate-650 leading-relaxed font-medium">
              Hệ thống bán hàng và Mini ERP thông minh, tin cậy. Bảo mật tuyệt đối dữ liệu kinh doanh với kiến trúc CSDL ổn định cao, hỗ trợ kết nối DB riêng tư (BYOD) giúp doanh nghiệp làm chủ 100% tài sản số của mình.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link href="/register" id="hero-cta-register" className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-primary-dark transition-all hover:scale-105">
                Bắt đầu bán hàng ngay
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#solutions" className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/50 backdrop-blur-md px-8 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50 transition-all">
                Xem giải pháp ngành nghề
              </a>
            </div>
            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm font-medium text-slate-550">
              <div className="flex items-center gap-1.5"><Shield className="h-4 w-4 text-emerald-600" /><span className="opacity-90">Bảo mật cao</span></div>
              <div className="flex items-center gap-1.5"><Database className="h-4 w-4 text-blue-600" /><span className="opacity-90">Kết nối DB riêng (BYOD)</span></div>
              <div className="flex items-center gap-1.5"><Globe className="h-4 w-4 text-cyan-600" /><span className="opacity-90">Độ tin cậy SLA 99.9%</span></div>
            </div>
          </div>

          <div className="flex-1 w-full max-w-lg lg:max-w-none relative z-10 mt-12 lg:mt-0">
            {/* Right side Dashboard mock/illustration */}
            <div className="hidden lg:block relative rounded-2xl bg-white/80 backdrop-blur-md border border-slate-200 p-2 shadow-2xl shadow-blue-900/10 transform rotate-2 hover:rotate-0 transition-transform duration-500">
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

            {/* App Download Links */}
            <div className="mt-10 text-center">
              <p className="text-base md:text-lg font-bold text-slate-500 mb-5">Bán hàng nhanh chóng trên di động</p>
              <AppDownloadButtons />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION NGÀNH NGHỀ KINH DOANH (NEW!) ═══ */}
      <section id="solutions" className="relative py-24 bg-white border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-20">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Phân khúc ngành nghề</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Giải pháp tối ưu cho từng lĩnh vực</h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-500 font-medium">
              Không ép buộc tất cả sử dụng chung một giao diện. ONI phân loại giao diện POS, cách tính bill và báo cáo tài chính phù hợp hoàn hảo cho từng phân khúc kinh doanh đặc thù.
            </p>
          </div>

          <div className="space-y-12">
            {INDUSTRY_GROUPS.map((group) => {
              const groupVerticals = INDUSTRIES_LIST.filter(ind => ind.group === group.id);
              
              return (
                <div key={group.id} className="rounded-3xl border border-slate-200/65 bg-slate-50/30 p-8 shadow-xs hover:shadow-md transition-all duration-300">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200/70 mb-8">
                    <div className="max-w-2xl">
                      <h3 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full bg-primary animate-pulse" />
                        {group.title}
                      </h3>
                      <p className="text-sm text-slate-500 font-medium mt-1">{group.description}</p>
                    </div>
                    <Link 
                      href={`/register?industry=${
                        group.id === 'retail' ? 'retail' : group.id === 'fnb_ent' ? 'fnb' : 'lodging'
                      }`} 
                      className="whitespace-nowrap rounded-xl bg-white border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:shadow-sm transition-all text-center"
                    >
                      Đăng ký dùng thử phân khúc này &rarr;
                    </Link>
                  </div>

                  <div className={`grid gap-6 justify-center ${
                    groupVerticals.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' :
                    groupVerticals.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto' :
                    'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 max-w-7xl mx-auto'
                  }`}>
                    {groupVerticals.map((ind) => {
                      const Icon = ind.icon;
                      return (
                        <Link 
                          key={ind.slug} 
                          href={`/solutions/${ind.slug}`}
                          id={`home-ind-card-${ind.slug}`}
                          className={`group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 hover:border-primary/20 hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${ind.color}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-primary transition-colors">Xem chi tiết &rarr;</span>
                            </div>
                            
                            <h4 className="text-base font-extrabold text-slate-900 mb-2 group-hover:text-primary transition-colors">{ind.label}</h4>
                            <p className="text-slate-500 text-xs leading-relaxed font-semibold mb-6">{ind.description}</p>
                            
                            {/* Sub-industries tags */}
                            <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Hỗ trợ các nghiệp vụ:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {ind.subIndustries.map((sub, idx) => {
                                  const SubIcon = sub.icon;
                                  return (
                                    <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-500/5 border border-slate-200/80 text-[10px] font-bold text-slate-650 hover:bg-slate-100/70 hover:text-slate-950 transition-colors">
                                      <SubIcon className="h-3 w-3 text-slate-450 shrink-0" />
                                      {sub.label}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
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
            {FEATURES.map((f, idx) => (
              <div key={idx} className="group rounded-3xl border border-slate-200 bg-white p-8 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300 transform hover:-translate-y-1">
                <div className="mb-6 inline-flex items-center justify-center rounded-2xl bg-blue-50 p-4 transition-colors duration-300">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{f.title}</h3>
                <p className="text-slate-500 leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ UNIQUE CAPABILITIES (UPGRADED WITH DETAILED VISUALS) ═══ */}
      <section className="relative py-24 md:py-32 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-24">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Vận hành thông minh</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Công cụ nâng cao thúc đẩy doanh số</h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-500 font-medium">Giải quyết triệt để các bài toán vận hành phức tạp nhất của cửa hàng bằng các công nghệ dẫn đầu.</p>
          </div>
          
          {/* Section: VietQR & Sổ Quỹ */}
          <div className="grid gap-12 lg:grid-cols-2 items-center mb-28">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider bg-orange-50 px-3 py-1 rounded-full border border-orange-100 mb-4">
                <QrCode className="h-3.5 w-3.5" /> Mới cập nhật
              </div>
              <h3 className="text-2.5xl font-extrabold text-slate-900 mb-4">Thanh toán VietQR động liên kết Sổ Quỹ</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Khi thanh toán hóa đơn, hệ thống tự động tạo mã VietQR động chứa chính xác số tiền và mô tả đơn hàng. Tiền được chuyển thẳng vào số tài khoản ngân hàng liên kết với <strong className="font-bold text-slate-900">Sổ quỹ chuyên biệt</strong> của chi nhánh, giúp tự động đối soát tài chính mà không cần kế toán thủ công.
              </p>
              <ul className="space-y-3.5">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Tự động điền số tiền và mã hóa đơn, tránh sai sót chuyển khoản</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Phân luồng dòng tiền về đúng tài khoản ngân hàng của từng chi nhánh/sổ quỹ</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Đối soát tự động (reconciliation), tự động cập nhật trạng thái đơn Đã thanh toán</li>
              </ul>
            </div>
            <div className="order-1 lg:order-2 rounded-3xl bg-gradient-to-br from-orange-50 to-amber-50/50 p-8 border border-orange-100 relative overflow-hidden shadow-sm">
               <div className="absolute top-0 right-0 p-6 opacity-10 text-orange-600"><QrCode className="h-24 w-24" /></div>
               <div className="relative z-10 flex gap-4 flex-col max-w-sm mx-auto">
                  <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex flex-col gap-3.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase block">Thanh toán đơn hàng</span>
                        <span className="font-extrabold text-slate-800 text-sm">Đơn hàng #DH-1025</span>
                      </div>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">Chờ quét mã</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-500">Sổ quỹ đích:</span>
                      <span className="text-sm font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-150">Quỹ Ngân hàng (ACB)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-500">Số tiền:</span>
                      <span className="text-lg font-extrabold text-primary">185,000đ</span>
                    </div>

                    <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/80 flex items-center justify-center flex-col gap-2">
                      {/* Visual QR Simulator */}
                      <div className="w-32 h-32 bg-white rounded-lg border border-slate-200/80 p-2 flex items-center justify-center relative">
                        <div className="grid grid-cols-4 gap-1 w-full h-full opacity-80">
                          {Array.from({ length: 16 }).map((_, i) => (
                            <div 
                              key={i} 
                              className={`rounded-sm ${(i * 3 + 1) % 2 === 0 ? 'bg-slate-800' : 'bg-transparent'} 
                                ${[0, 1, 4, 12, 13, 15].includes(i) ? 'bg-slate-800' : ''}`} 
                            />
                          ))}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="bg-primary text-white text-[9px] font-black tracking-tighter px-1 rounded-sm border border-white uppercase shadow-sm">ACB</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold tracking-wide mt-1">Quét mã bằng ứng dụng Ngân hàng để thanh toán</p>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Section: Batch & Expiry Management */}
          <div className="grid gap-12 lg:grid-cols-2 items-center mb-28">
            <div className="rounded-3xl bg-gradient-to-br from-slate-550/5 to-slate-900/5 p-8 border border-slate-200 relative overflow-hidden shadow-xs">
               <div className="absolute top-0 left-0 p-6 opacity-10 text-slate-650"><Calendar className="h-24 w-24" /></div>
               <div className="relative z-10 flex gap-4 flex-col">
                  <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                      <span className="font-extrabold text-slate-800 text-sm">Quản lý Lô & Hạn sử dụng</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Cảnh báo tồn kho</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-semibold">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400">
                            <th className="pb-2 font-bold">Tên sản phẩm</th>
                            <th className="pb-2 font-bold">Lô nhập</th>
                            <th className="pb-2 font-bold">Hạn sử dụng</th>
                            <th className="pb-2 font-bold text-right">Tồn kho</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          <tr className="text-red-650 bg-red-50/50">
                            <td className="py-2.5 font-bold">Amoxicillin 500</td>
                            <td className="py-2.5">L-AMX01</td>
                            <td className="py-2.5 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0 text-red-500" /> 10/06/2026</td>
                            <td className="py-2.5 text-right font-bold">120 hộp</td>
                          </tr>
                          <tr className="text-orange-655 bg-orange-50/30">
                            <td className="py-2.5 font-bold">Paracetamol 500</td>
                            <td className="py-2.5">L-PCT05</td>
                            <td className="py-2.5">28/11/2026</td>
                            <td className="py-2.5 text-right font-bold">340 hộp</td>
                          </tr>
                          <tr className="text-slate-700">
                            <td className="py-2.5 font-bold">Vitamin C 1000</td>
                            <td className="py-2.5">L-VTC12</td>
                            <td className="py-2.5">15/09/2027</td>
                            <td className="py-2.5 text-right font-bold">500 hộp</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
               </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider bg-blue-50 px-3 py-1 rounded-full border border-blue-100 mb-4">
                <Calendar className="h-3.5 w-3.5" /> Kiểm soát hạn dùng
              </div>
              <h3 className="text-2.5xl font-extrabold text-slate-900 mb-4">Quản lý Lô & Hạn sử dụng chuyên sâu</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Tuyệt đối quan trọng đối với các ngành hàng Dược phẩm, Thực phẩm và Mỹ phẩm. Hệ thống giúp theo dõi chi tiết từng lô sản phẩm nhập vào, tự động tính toán và tô đỏ các sản phẩm sắp hết hạn để bộ phận bán hàng kịp thời xử lý, giảm thiểu tối đa tổn thất hàng hóa.
              </p>
              <ul className="space-y-3.5">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Quản lý xuất nhập tồn theo nguyên tắc FEFO (Hết hạn trước - Xuất trước)</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Tự động đẩy cảnh báo các lô hàng cận date lên màn hình POS bán lẻ</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Báo cáo chi tiết tuổi hàng tồn kho giúp hoạch định nguồn cung chính xác</li>
              </ul>
            </div>
          </div>

          {/* Section: Zalo & Telegram Alerts */}
          <div className="grid gap-12 lg:grid-cols-2 items-center mb-28">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 mb-4">
                <MessageSquare className="h-3.5 w-3.5" /> Truyền thông đa kênh
              </div>
              <h3 className="text-2.5xl font-extrabold text-slate-900 mb-4">Hệ thống thông báo đẩy Zalo & Telegram Bot</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Tăng tính kết nối với khách hàng và tự động hóa vận hành nội bộ. Gửi hóa đơn điện tử tự động cho khách qua Zalo OA ngay khi thanh toán đơn. Đồng thời, cảnh báo tức thì về tồn kho tối thiểu, doanh số ngày và biến động quỹ qua Telegram nhóm quản trị.
              </p>
              <ul className="space-y-3.5">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Gửi tin nhắn chăm sóc khách hàng và hóa đơn Zalo không tốn phí giấy in</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Nhận tin nhắn cảnh báo tồn kho cận date, doanh thu chi nhánh qua Telegram</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Phân quyền gửi thông báo linh hoạt đến từng nhóm nhân viên phụ trách</li>
              </ul>
            </div>
            <div className="order-1 lg:order-2 rounded-3xl bg-slate-900 p-8 border border-slate-800 relative overflow-hidden shadow-2xl">
               <div className="absolute top-0 left-0 p-6 opacity-10 text-white"><MessageSquare className="h-24 w-24" /></div>
               <div className="relative z-10 space-y-4 max-w-sm mx-auto">
                  <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z"/></svg>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 text-xs sm:text-sm">Hóa đơn điện tử qua Zalo</div>
                      <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">Hệ thống vừa tự động gửi hóa đơn số #1025 trị giá 185,000đ thành công qua Zalo OA cho khách hàng <strong>Nguyễn Văn A</strong>.</div>
                    </div>
                  </div>
                  <div className="bg-slate-800/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50 flex items-start gap-3 ml-6">
                    <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <span className="text-amber-400 font-bold text-xs">Bot</span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 text-xs sm:text-sm">Cảnh báo tồn kho (Telegram)</div>
                      <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">Sản phẩm <strong>&quot;Amoxicillin 500&quot;</strong> tại Chi nhánh 1 đã chạm mốc tồn tối thiểu (còn 120 hộp). Đề xuất nhập thêm hàng!</div>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Section: AI Assistant */}
          <div className="grid gap-12 lg:grid-cols-2 items-center mb-28">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider bg-violet-50 px-3 py-1 rounded-full border border-violet-100 mb-4">
                <Sparkles className="h-3.5 w-3.5" /> Trí tuệ nhân tạo
              </div>
              <h3 className="text-2.5xl font-extrabold text-slate-900 mb-4">Trợ lý AI phân tích kinh doanh</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Không cần phải tự lập báo cáo doanh số phức tạp trên Excel. Chỉ cần trò chuyện với trợ lý trí tuệ nhân tạo (AI) của ONI bằng ngôn ngữ tự nhiên, bạn sẽ được trả lời ngay tức thì về hiệu quả kinh doanh, mặt hàng bán chạy và dự báo dòng tiền chính xác.
              </p>
              <ul className="space-y-3.5">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Hỏi đáp bằng giọng nói hoặc văn bản về mọi số liệu kinh doanh</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Phân tích tự động điểm hòa vốn và dự phóng hàng hóa lỗi thời</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Tự động tóm tắt hoạt động kinh doanh vào mỗi cuối ngày</li>
              </ul>
            </div>
            <div className="order-1 lg:order-2 rounded-3xl bg-blue-50/50 p-8 border border-blue-100 relative overflow-hidden shadow-sm">
               <div className="absolute top-0 right-0 p-8 opacity-10 text-primary">
                  <Sparkles className="h-24 w-24" />
               </div>
               <div className="relative z-10 flex flex-col gap-4 max-w-sm mx-auto">
                  <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex flex-col gap-4 relative">
                    <div className="flex items-start gap-3 flex-row-reverse">
                      <div className="h-8 w-8 rounded-full bg-slate-155 border border-slate-200 flex items-center justify-center shrink-0 text-slate-600 text-[10px] font-bold uppercase">U</div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tr-none px-4 py-2.5 text-xs text-slate-700 shadow-xs leading-relaxed text-right">
                        Hôm nay cửa hàng bán được bao nhiêu và mặt hàng nào chạy nhất?
                      </div>
                    </div>
                    <div className="flex items-start gap-3 mt-2">
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0 text-white text-[10px] font-bold shadow-md">AI</div>
                      <div className="bg-primary rounded-2xl rounded-tl-none px-4 py-2.5 text-xs text-white shadow-md leading-relaxed border border-primary-dark">
                        Tính đến 11:20, tổng doanh thu hôm nay là <strong>4,200,000đ</strong> (25 đơn hàng). Mặt hàng bán tốt nhất là <span className="text-orange-200 font-bold">Cà phê sữa đá (15 ly)</span>. Dòng tiền hôm nay tăng 12% so với hôm qua.
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          {/* ═══ ERP procurement, Fixed Assets & Private Cloud Deployments ═══ */}
          <div className="grid gap-12 lg:grid-cols-2 items-center mb-28">
            <div className="rounded-3xl bg-gradient-to-br from-indigo-50/50 to-blue-50/50 p-8 border border-indigo-100 relative overflow-hidden shadow-sm">
               <div className="absolute top-0 right-0 p-6 opacity-10 text-indigo-650"><Server className="h-24 w-24" /></div>
               <div className="relative z-10 space-y-5 max-w-lg mx-auto">
                  {/* Visual P2P Flow Tracker */}
                  <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-extrabold text-slate-800 text-xs sm:text-sm">Quy trình Cung ứng Mua hàng (P2P)</span>
                      <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md uppercase">Đồng bộ Kho</span>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-slate-200 border border-slate-300 text-[10px] font-black flex items-center justify-center text-slate-655 font-mono">PR</span>
                          <span className="font-bold text-slate-700">Yêu cầu Mua hàng #PR-102</span>
                        </div>
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">Đã Duyệt</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-xl text-xs ml-4">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-primary/20 border border-primary/30 text-[10px] font-black flex items-center justify-center text-primary font-mono">PO</span>
                          <span className="font-bold text-slate-700">Đơn đặt hàng NCC #PO-589</span>
                        </div>
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">Đã Gửi</span>
                      </div>
                      
                      <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-xl text-xs ml-8">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-emerald-100 border border-emerald-200 text-[10px] font-black flex items-center justify-center text-emerald-700 font-mono">GRN</span>
                          <span className="font-bold text-slate-700">Phiếu nhập kho hàng #GRN-845</span>
                        </div>
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">Đã Nhập Kho</span>
                      </div>
                    </div>
                  </div>

                  {/* Fixed Assets Allocation */}
                  <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-extrabold text-slate-800 text-xs sm:text-sm">Tài sản Cố định & Khấu hao</span>
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md uppercase">Định kỳ tháng</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-650">
                        <span>Máy pha cafe Nuova Simonelli</span>
                        <span className="font-bold text-slate-800">85,000,000đ</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                        <div className="bg-amber-500 h-full" style={{ width: '60%' }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                        <span>Đã khấu hao: 24 tháng (51M)</span>
                        <span className="text-amber-600">Còn lại: 34M</span>
                      </div>
                    </div>
                  </div>
               </div>
            </div>
            
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 mb-4">
                <ShoppingCart className="h-3.5 w-3.5 animate-pulse" /> Quản lý mua hàng & Kho bãi
              </div>
              <h3 className="text-2.5xl font-extrabold text-slate-900 mb-4">Nhập hàng thông minh, kiểm kho chặt chẽ</h3>
              <p className="text-lg text-slate-655 mb-6 leading-relaxed">
                Khi cửa hàng lớn lên, bạn cần kiểm soát nguồn hàng nhập và chi phí thiết bị. ONI hỗ trợ bạn quản lý từ yêu cầu mua hàng, đặt hàng nhà cung cấp cho đến khi hàng vào kho. Mọi tài sản lớn nhỏ của quán đều được theo dõi giá trị khấu hao rõ ràng để bạn luôn biết dòng tiền đi về đâu.
              </p>
              <ul className="space-y-3.5">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Theo dõi quy trình nhập hàng (PR → PO → GRN) để kiểm soát giá vốn</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Quản lý tài sản của quán, tự động tính khấu hao tài sản cố định</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Phân bổ chi phí vận hành giúp bạn tính toán điểm hòa vốn dễ dàng</li>
              </ul>
            </div>
          </div>

          {/* Section: Dedicated Server Deployments & On-Premise for Enterprises */}
          <div className="grid gap-12 lg:grid-cols-2 items-center mb-28">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider bg-cyan-50 px-3 py-1 rounded-full border border-cyan-100 mb-4">
                <Server className="h-3.5 w-3.5" /> Giải pháp cho chuỗi lớn
              </div>
              <h3 className="text-2.5xl font-extrabold text-slate-900 mb-4">Cài đặt trên máy chủ riêng của bạn</h3>
              <p className="text-lg text-slate-655 mb-6 leading-relaxed">
                Nếu bạn đang vận hành chuỗi nhiều chi nhánh hoặc muốn tự kiểm soát 100% hệ thống của mình, ONI sẵn sàng hỗ trợ cài đặt và tùy biến phần mềm chạy trên máy chủ riêng của bạn. Đảm bảo tính riêng tư, bảo mật dữ liệu tuyệt đối và hoạt động độc lập không phụ thuộc vào bên thứ ba.
              </p>
              <ul className="space-y-3.5">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Sở hữu 100% cơ sở dữ liệu biệt lập, không chia sẻ với ai</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Tự do kết nối các hệ thống nội bộ của bạn thông qua API và Webhook</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Đội ngũ kỹ sư ONI hỗ trợ lắp đặt, bàn giao và bảo trì hệ thống định kỳ</li>
              </ul>
            </div>
            
            <div className="order-1 lg:order-2 rounded-3xl bg-slate-900 p-8 border border-slate-800 relative overflow-hidden shadow-2xl">
               <div className="absolute top-0 right-0 p-6 opacity-10 text-white"><Server className="h-24 w-24" /></div>
               <div className="relative z-10 space-y-4 max-w-sm mx-auto">
                  <div className="bg-slate-800/80 backdrop-blur-md p-5 rounded-2xl border border-slate-700/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                      <span className="font-extrabold text-slate-200 text-xs">Cơ sở Hạ tầng Máy chủ Riêng</span>
                      <span className="text-[9px] font-black text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md uppercase">Dedicated</span>
                    </div>
                    
                    <div className="space-y-2.5 text-xs text-slate-400 font-semibold">
                      <div className="flex items-center justify-between">
                        <span>Máy chủ lưu trữ:</span>
                        <span className="text-slate-200">AWS EC2 Dedicated</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>IP Máy chủ:</span>
                        <span className="text-slate-200 font-mono select-all">103.85.24.12</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Mã nguồn:</span>
                        <span className="text-slate-200 font-mono text-[10px]">oni-erp-custom.git</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Trạng thái:</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                          Đang chạy ổn định
                        </span>
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Section: Excel Data Importer */}
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50/30 p-8 border border-emerald-100 relative overflow-hidden shadow-xs">
               <div className="absolute top-0 left-0 p-6 opacity-10 text-emerald-600"><FileSpreadsheet className="h-24 w-24" /></div>
               <div className="relative z-10 flex gap-4 flex-col max-w-sm mx-auto">
                  <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-150 flex flex-col items-center text-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                      <FileSpreadsheet className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Nhập dữ liệu 1-Click</h4>
                      <p className="text-xs text-slate-450 mt-1 leading-relaxed">Tải lên file Excel mẫu của cửa hàng cũ để chuyển đổi ngay sang ONI</p>
                    </div>
                    <div className="w-full border border-dashed border-slate-200 rounded-xl p-6 bg-slate-50/50 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100/50 transition-colors">
                      <span className="text-xs font-bold text-primary">Kéo & thả file Excel vào đây</span>
                      <span className="text-[10px] text-slate-400 mt-1 font-semibold">Hỗ trợ tệp XLS, XLSX lên tới 10MB</span>
                    </div>
                    <div className="w-full flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-left">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="text-[10px] text-emerald-800 font-bold leading-normal">Tự động nhận diện cột: Mã hàng, Tên sản phẩm, Giá bán, Tồn kho, Nhóm hàng</span>
                    </div>
                  </div>
               </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 mb-4">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Chuyển đổi dữ liệu
              </div>
              <h3 className="text-2.5xl font-extrabold text-slate-900 mb-4">Nhập khẩu dữ liệu 1-Click thông minh</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                Đừng ngần ngại thay đổi hệ thống quản lý cũ vì sợ tốn công gõ lại dữ liệu. ONI cung cấp bộ công cụ nhập khẩu Excel thông minh. Bạn chỉ cần tải file xuất kho, danh sách sản phẩm hay danh mục khách hàng cũ lên, hệ thống AI sẽ tự động phân tích định dạng cột và sắp xếp dữ liệu vào đúng vị trí chỉ trong vài giây.
              </p>
              <ul className="space-y-3.5">
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Tự động nhận diện cấu trúc file Excel từ bất kỳ phần mềm cũ nào</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Xử lý trùng lặp mã sản phẩm và lọc dữ liệu rác thông minh</li>
                <li className="flex items-center gap-3 text-slate-700 font-medium"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Sẵn sàng mở bán ngay lập tức mà không gián đoạn hoạt động kinh doanh</li>
              </ul>
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
              <div key={idx} className="relative z-10 text-center flex flex-col items-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white border-4 border-slate-50 shadow-xl shadow-orange-900/5 mb-6 hover:border-orange-100 transition-colors">
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
          <p className="text-xl text-slate-650 font-medium mb-10 max-w-2xl mx-auto">
            Bắt đầu bán hàng ngay với gói Tiên phong miễn phí {FREE_TRIAL_YEARS} năm. Nâng cấp chi phí cực rẻ cho quy mô chuỗi nhiều chi nhánh.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" id="cta-bottom-register" className="group flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-bold text-white shadow-xl hover:bg-primary-dark transition-all hover:scale-105">
              Đăng ký ngay
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <Footer />

      <FloatingZalo />
    </div>
  );
}
