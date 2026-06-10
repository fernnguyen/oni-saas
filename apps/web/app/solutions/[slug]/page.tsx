import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getVerticalConfig, IndustryType } from '../../../../../packages/core/src/verticals';
import { IndustryDropdown } from '../../components/layout/IndustryDropdown';
import { INDUSTRIES_LIST, ALL_SECTORS } from '../../components/layout/industriesData';
import { IndustryInteractiveDemo } from './IndustryInteractiveDemo';
import { LoginButton } from '../../LoginButton';
import { 
  Store, 
  Utensils, 
  Target, 
  Trophy, 
  Hotel, 
  Shirt, 
  Clock, 
  Check, 
  Shield, 
  Database, 
  Sparkles, 
  ArrowRight,
  ChevronRight,
  Info,
  Calendar,
  AlertTriangle
} from 'lucide-react';

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

const slugMap: Record<string, IndustryType> = {
  'retail': 'retail',
  'fnb': 'fnb',
  'billiards': 'billiards',
  'sports-court': 'sports_court',
  'lodging': 'lodging',
  'fashion': 'fashion',
  'service-hourly': 'service_hourly'
};

// Generate Static Params for Next.js SSG
export async function generateStaticParams() {
  return Object.keys(slugMap).map((slug) => ({
    slug: slug,
  }));
}

// Generate Dynamic Metadata for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const indType = slugMap[slug];
  if (!indType) return {};

  const config = getVerticalConfig(indType);
  const indInfo = INDUSTRIES_LIST.find(i => i.slug === slug);
  const name = indInfo?.label || config.label;

  return {
    title: `Phần mềm quản lý ${name} chuyên sâu - ONI ${config.label}`,
    description: `Giải pháp quản lý ${config.label.toLowerCase()} chuyên biệt của ONI: ${config.description}. Hỗ trợ POS ${config.posLabel.toLowerCase()}, tự động tính toán, BYOD bảo mật dữ liệu tuyệt đối.`,
    openGraph: {
      title: `Phần mềm quản lý ${name} chuyên sâu - ONI ${config.label}`,
      description: `Giải pháp quản lý ${config.label.toLowerCase()} chuyên biệt của ONI: ${config.description}. Hỗ trợ POS ${config.posLabel.toLowerCase()}, tự động tính toán, BYOD bảo mật dữ liệu tuyệt đối.`,
    }
  };
}

export default async function IndustrySolutionPage({ params }: Props) {
  const { slug } = await params;
  const indType = slugMap[slug];
  if (!indType) {
    notFound();
  }

  const config = getVerticalConfig(indType);
  const indInfo = INDUSTRIES_LIST.find(i => i.slug === slug);
  
  if (!indInfo) {
    notFound();
  }

  const Icon = indInfo.icon;

  // Custom colors for themes based on industry type
  const themeColors: Record<string, { bgGrad: string; textPrimary: string; badge: string; iconBg: string }> = {
    retail: { 
      bgGrad: 'from-blue-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-blue-600', 
      badge: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400',
      iconBg: 'bg-blue-500 text-white'
    },
    fnb: { 
      bgGrad: 'from-emerald-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-emerald-600', 
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400',
      iconBg: 'bg-emerald-500 text-white'
    },
    billiards: { 
      bgGrad: 'from-violet-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-violet-600', 
      badge: 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/20 dark:text-violet-400',
      iconBg: 'bg-violet-500 text-white'
    },
    'sports-court': { 
      bgGrad: 'from-amber-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-amber-600', 
      badge: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400',
      iconBg: 'bg-amber-500 text-white'
    },
    lodging: { 
      bgGrad: 'from-indigo-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-indigo-600', 
      badge: 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400',
      iconBg: 'bg-indigo-500 text-white'
    },
    fashion: { 
      bgGrad: 'from-rose-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-rose-600', 
      badge: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400',
      iconBg: 'bg-rose-500 text-white'
    },
    'service-hourly': { 
      bgGrad: 'from-cyan-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-cyan-600', 
      badge: 'bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-950/20 dark:text-cyan-400',
      iconBg: 'bg-cyan-500 text-white'
    }
  };

  const currentTheme = themeColors[slug] || themeColors.retail;

  // Features list to display based on core configs in packages/core/src/verticals.ts
  const featureHighlights = [
    { 
      key: 'barcode_scan', 
      title: 'Quét mã vạch & Barcode', 
      desc: 'Hỗ trợ quét mã vạch siêu tốc tại quầy thu ngân, quản lý sản phẩm thông minh bằng mã vạch camera/thiết bị chuyên dụng.',
      active: config.features.barcode_scan 
    },
    { 
      key: 'location_resource', 
      title: `Sơ đồ ${config.resourceLabel || 'Bàn/Phòng'} trực quan`, 
      desc: `Hiển thị trạng thái sơ đồ ${config.resourceLabel?.toLowerCase() || 'bàn/phòng'} theo tầng/khu vực. Nhận diện phòng trống, bàn đang phục vụ bằng màu sắc sinh động.`,
      active: config.features.location_resource 
    },
    { 
      key: 'hourly_billing', 
      title: 'Tính tiền giờ tự động', 
      desc: 'Tích hợp bộ tính giờ chạy ngầm thời gian thực. Tự động tính toán chi phí theo block giờ, qua đêm, phụ thu cực kỳ linh hoạt và chính xác.',
      active: config.features.hourly_billing 
    },
    { 
      key: 'kitchen_display', 
      title: 'In bếp & Kitchen Display (KDS)', 
      desc: 'Chuyển đơn đặt món trực tiếp xuống bộ phận chế biến (bếp/bar) tức thời, loại bỏ sai sót gọi món thủ công của nhân viên.',
      active: config.features.kitchen_display 
    },
    { 
      key: 'reservation', 
      title: 'Đăng ký đặt lịch trước', 
      desc: 'Quản lý lịch đặt bàn, đặt sân hoặc đặt phòng của khách hàng trước nhiều ngày, tránh trùng lịch và tối ưu hóa công suất khai thác.',
      active: config.features.reservation 
    },
    { 
      key: 'product_variants', 
      title: 'Biến thể sản phẩm (Size/Màu)', 
      desc: 'Phân loại sản phẩm thông minh theo nhiều thuộc tính (kích thước, màu sắc, chất liệu...). Phục vụ hoàn hảo cho ngành hàng thời trang.',
      active: config.features.product_variants 
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ═══ NAVBAR ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg" />
            <span className="text-xl font-extrabold tracking-tight text-primary">ONI.vn</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-650">
            <IndustryDropdown />
            <a href="#features" className="hover:text-primary transition-colors">Tính năng nghiệp vụ</a>
            <a href="#demo" className="hover:text-primary transition-colors">Trải nghiệm Demo</a>
            <Link href="/#pricing" className="hover:text-primary transition-colors">Bảng giá</Link>
          </div>
          <div className="flex items-center gap-3">
            <LoginButton />
            <Link href={`/register?industry=${slug}`} id={`nav-cta-${slug}`} className="whitespace-nowrap rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-primary-dark hover:shadow-lg transition-all">
              Dùng thử miễn phí
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO SECTION ═══ */}
      <section className={`relative pt-32 pb-24 overflow-hidden bg-gradient-to-b ${currentTheme.bgGrad} border-b border-slate-200/60`}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[20%] -right-[10%] h-[500px] w-[500px] rounded-full bg-slate-200/40 blur-[80px]" />
          <div className="absolute bottom-0 left-[10%] h-[300px] w-[300px] rounded-full bg-slate-100/60 blur-[60px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
            <div className={`mb-6 inline-flex items-center gap-2 rounded-full border px-4.5 py-1.5 text-xs font-bold ${currentTheme.badge} uppercase tracking-wider shadow-xs`}>
              <Icon className="h-4 w-4" /> Giải pháp chuyên sâu
            </div>
            
            <h1 className="text-4xl md:text-5.5xl font-black leading-tight tracking-tight text-slate-900 mb-6" id="solution-title">
              Phần mềm quản lý <br/>
              <span className={`text-transparent bg-clip-text bg-gradient-to-r ${slug === 'lodging' ? 'from-indigo-600 to-violet-500' : 'from-primary to-orange-400'}`}>
                {indInfo.label}
              </span> chuyên biệt
            </h1>
            
            <p className="text-lg text-slate-650 font-medium leading-relaxed mb-10">
              {config.description}. Thiết kế tinh tế dành riêng cho chủ {config.workspaceLabel.toLowerCase()}, tối ưu giao diện quầy {config.posLabel.toLowerCase()} và hệ thống quản trị chuyên ngành của bạn.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
              <Link 
                href={`/register?industry=${slug}`} 
                id={`hero-cta-btn-${slug}`}
                className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-primary-dark transition-all hover:scale-105"
              >
                Khởi tạo {config.workspaceLabel.toLowerCase()} của bạn
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a 
                href="#demo" 
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/60 backdrop-blur-md px-8 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50 transition-all"
              >
                Trải nghiệm Demo trực quan
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SUB-INDUSTRIES DETAILED PREVIEW ═══ */}
      <section className="relative py-16 bg-white border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12 max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight" id="sub-ind-section-title">
              Cơ chế Tùy biến Thích ứng (Adaptive Engine)
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm font-medium mt-3 leading-relaxed">
              Kiến trúc lõi của ONI không cố định cứng nhắc. Khi bạn lựa chọn mô hình kinh doanh cụ thể dưới đây, hệ thống sẽ **tự động tùy biến 100%** từ giao diện quầy thu ngân (POS), danh mục trường thông tin hàng hóa, mẫu in hóa đơn cho đến các chỉ số báo cáo tài chính phù hợp hoàn hảo với phân khúc đó.
            </p>
          </div>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 justify-center">
            {indInfo.subIndustries.map((sub, idx) => {
              const SubIcon = sub.icon;
              return (
                <div 
                  key={idx} 
                  className="flex flex-col items-center justify-center p-5 rounded-2xl border border-slate-200/80 bg-slate-50/20 hover:bg-white hover:border-primary/20 hover:shadow-lg hover:shadow-slate-900/5 transition-all duration-300 text-center"
                >
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-150 ${currentTheme.textPrimary} transition-transform`}>
                    <SubIcon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800 leading-snug">{sub.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ INTERACTIVE SANDBOX DEMO ═══ */}
      <section id="demo" className="relative py-24 bg-white border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-20">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Demo thực tế</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Trải nghiệm vận hành thực tế</h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-500 font-medium">
              Không cần đăng ký tài khoản. Tương tác trực tiếp với giao diện giả lập nghiệp vụ cốt lõi ngay bên dưới để thấy cách hệ thống hoạt động thực tế.
            </p>
          </div>

          {/* Interactive Playground Sandbox */}
          <div id="interactive-demo-container">
            <IndustryInteractiveDemo slug={slug} />
          </div>
        </div>
      </section>

      {/* ═══ FEATURE CHECKLISTS ═══ */}
      <section id="features" className="relative py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-20">
            <p className="text-sm font-bold uppercase tracking-widest text-primary mb-3">Tính năng nghiệp vụ</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Nghiệp vụ sâu sắc, vận hành trơn tru</h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-500 font-medium">
              ONI sở hữu các tính năng nghiệp vụ đầy đủ để giải quyết triệt để từng bài toán quản lý cửa hàng của bạn.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {featureHighlights.map((feat) => (
              <div 
                key={feat.key} 
                className={`rounded-3xl border p-8 bg-white transition-all shadow-xs relative overflow-hidden ${
                  feat.active 
                    ? 'border-primary/20 bg-gradient-to-br from-white to-orange-50/10 shadow-sm' 
                    : 'border-slate-200/80 opacity-75'
                }`}
              >
                {feat.active && (
                  <div className="absolute top-0 right-0 bg-primary/10 text-primary text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                    Cốt lõi
                  </div>
                )}
                
                <div className={`mb-6 inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                  feat.active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  <Check className="h-5 w-5" />
                </div>
                
                <h3 className="text-base font-extrabold text-slate-900 mb-3">{feat.title}</h3>
                <p className="text-slate-500 text-xs sm:text-sm leading-relaxed font-medium">{feat.desc}</p>
                
                {!feat.active && (
                  <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg w-max">
                    <Info className="h-3.5 w-3.5" /> Có thể cấu hình bật thêm
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SPECIFIC BENEFIT SECTION ═══ */}
      <section className="relative py-24 bg-white border-t border-slate-200/50">
        <div className="mx-auto max-w-7xl px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 space-y-6">
            <h3 className="text-2.5xl font-extrabold text-slate-900">Tại sao nên chọn hệ thống ONI cho {config.workspaceLabel.toLowerCase()} của bạn?</h3>
            <p className="text-lg text-slate-650 leading-relaxed font-medium">
              Khác biệt hoàn toàn với các phần mềm truyền thống ép buộc bạn phải đẩy dữ liệu lên máy chủ của họ. ONI đem lại cơ chế BYOD (Bring Your Own Database) cách mạng:
            </p>
            <ul className="space-y-4 text-sm font-semibold">
              <li className="flex items-start gap-3 text-slate-700">
                <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 text-sm">Sở hữu dữ liệu tuyệt đối</strong>
                  <span className="text-slate-500 text-xs block mt-0.5 leading-relaxed">Dữ liệu đơn hàng và khách hàng được lưu trữ an toàn trên cơ sở dữ liệu biệt lập (PostgreSQL, Supabase) hoặc database riêng của bạn.</span>
                </div>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 text-sm">Hoạt động mượt mà ngoại tuyến</strong>
                  <span className="text-slate-500 text-xs block mt-0.5 leading-relaxed">Mất kết nối Internet đột ngột tại quầy thu ngân? Hệ thống vẫn lưu hóa đơn offline và tự động đồng bộ lại khi có mạng.</span>
                </div>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 text-sm">Tiết kiệm tối đa chi phí vận hành</strong>
                  <span className="text-slate-500 text-xs block mt-0.5 leading-relaxed">Bắt đầu miễn phí 3 năm, bán hàng ngay. Nâng cấp chi phí cực rẻ cho quy mô chuỗi nhiều chi nhánh.</span>
                </div>
              </li>
            </ul>
          </div>
          <div className="flex-1 w-full max-w-md mx-auto rounded-3xl bg-slate-900 p-8 text-white relative overflow-hidden shadow-2xl">
             <div className="absolute top-0 right-0 p-8 opacity-10"><Database className="h-24 w-24" /></div>
             <div className="relative z-10 space-y-6">
                <div className="border-b border-slate-800 pb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cơ chế quản trị dữ liệu linh hoạt</span>
                  <h4 className="font-extrabold text-white text-lg mt-1">Kiến trúc đa nguồn dữ liệu</h4>
                </div>
                
                <div className="space-y-3">
                  <div className="bg-slate-800 border border-slate-700/55 rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Gói Tiên phong (Free):</span>
                      <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/25">Shared PostgreSQL</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal font-semibold">Cơ sở dữ liệu đám mây dùng chung do ONI lưu trữ, bảo mật mã hóa cao.</p>
                  </div>
                  
                  <div className="bg-slate-800 border border-slate-700/55 rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Gói Pro/Enterprise:</span>
                      <span className="text-[10px] font-extrabold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/25">BYOD (Sở hữu dữ liệu)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal font-semibold">Tự do kết nối các cổng lưu trữ dữ liệu an toàn như Supabase riêng, dedicated PostgreSQL hoặc MySQL biệt lập của khách hàng.</p>
                  </div>
                </div>

                <div className="bg-slate-850/80 rounded-2xl p-3.5 border border-slate-800 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-500 shrink-0" />
                  <span className="text-[10px] text-slate-400 font-semibold leading-normal">ONI cam kết tôn trọng quyền sở hữu dữ liệu của doanh nghiệp. Bạn có thể xuất và chuyển đổi dữ liệu bất kỳ lúc nào.</span>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* ═══ CALL TO ACTION ═══ */}
      <section className="relative py-24 md:py-32 bg-slate-50 border-t border-slate-200 overflow-hidden text-center">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-100/30 blur-[80px]" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-orange-100/30 blur-[80px]" />
        </div>
        
        <div className="relative mx-auto max-w-4xl px-6 z-10">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-6">
            Bắt đầu số hóa {config.workspaceLabel.toLowerCase()} của bạn hôm nay
          </h2>
          <p className="text-lg text-slate-600 font-medium mb-10 max-w-2xl mx-auto">
            Khởi động dễ dàng chỉ trong 60 giây. Trải nghiệm hệ sinh thái POS & quản trị dữ liệu riêng tư tối ưu nhất hiện nay.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href={`/register?industry=${slug}`} 
              id={`cta-bottom-btn-${slug}`}
              className="group flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-primary-dark transition-all hover:scale-105"
            >
              Đăng ký dùng thử miễn phí
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-slate-900 text-slate-400 py-20 border-t border-slate-850">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 md:grid-cols-4 lg:grid-cols-5 mb-16 pb-12 border-b border-slate-800">
            <div className="lg:col-span-2 space-y-4">
              <Link href="/" className="flex items-center gap-3 text-left">
                <Image src="/logo.png" alt="ONI.vn" width={44} height={44} className="rounded-xl border border-slate-800" />
                <span className="text-xl font-black tracking-tight text-white">ONI.vn</span>
              </Link>
              <p className="text-sm text-slate-500 font-medium max-w-sm leading-relaxed text-left">
                Nền tảng Mini ERP &amp; quản lý bán hàng đa chi nhánh đột phá. Cơ chế kết nối cơ sở dữ liệu riêng tư BYOD biệt lập, tích hợp AI phân tích thông minh và Zalo/Telegram.
              </p>
              <div className="text-xs text-slate-500 font-bold text-left">
                &copy; {new Date().getFullYear()} ONI.vn. Đã đăng ký bản quyền.
              </div>
            </div>
            
            {ALL_SECTORS.map((group) => (
              <div key={group.groupId} className="space-y-4 text-left">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 border-b border-slate-800 pb-2">{group.groupLabel}</h4>
                <ul className="space-y-2.5 text-xs font-semibold">
                  {group.items.map((item, idx) => (
                    <li key={idx}>
                      <Link href={item.href} className="hover:text-primary transition-colors hover:underline">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-500">
            <div className="flex flex-wrap gap-x-8 gap-y-2 justify-center">
              <Link href="/" className="hover:text-white transition-colors">Trang chủ chính</Link>
              <a href="#features" className="hover:text-white transition-colors">Tính năng nghiệp vụ</a>
              <Link href="/#pricing" className="hover:text-white transition-colors">Bảng giá gói cước</Link>
              <Link href={`/register?industry=${slug}`} className="hover:text-white transition-colors">Đăng ký dùng thử miễn phí 3 năm</Link>
            </div>
            <div className="text-[10px] text-slate-600">
              Sản phẩm phục vụ Chuyển đổi số Hộ kinh doanh &amp; Doanh nghiệp Việt Nam.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
