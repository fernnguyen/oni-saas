import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getVerticalConfig } from '../../../../../../packages/core/src/verticals';
import { IndustryDropdown } from '../../../components/layout/IndustryDropdown';
import { INDUSTRIES_LIST, ALL_SECTORS } from '../../../components/layout/industriesData';
import { SUB_INDUSTRIES_DETAILS, getSubIndustryDetail } from '../../../components/layout/subIndustriesData';
import { IndustryInteractiveDemo } from '../IndustryInteractiveDemo';
import { LoginButton } from '../../../LoginButton';
import { 
  Check, 
  Shield, 
  Database, 
  ArrowRight,
  AlertTriangle,
  Sparkles,
  Info
} from 'lucide-react';

interface Props {
  params: Promise<{
    slug: string;
    sub: string;
  }>;
}

// Slugifier helper
function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/ & /g, '-')
    .replace(/ /g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9-]/g, '');
}

// Generate Static Params for Next.js SSG
export async function generateStaticParams() {
  const paths: { slug: string; sub: string }[] = [];
  
  INDUSTRIES_LIST.forEach((ind) => {
    ind.subIndustries.forEach((sub) => {
      paths.push({
        slug: ind.slug,
        sub: slugify(sub.label)
      });
    });
  });
  
  // Make sure we include all explicit details keys
  Object.keys(SUB_INDUSTRIES_DETAILS).forEach((key) => {
    const detail = SUB_INDUSTRIES_DETAILS[key];
    if (!paths.some(p => p.sub === detail.slug)) {
      paths.push({
        slug: detail.parentSlug,
        sub: detail.slug
      });
    }
  });

  return paths;
}

// Helper to resolve detailed metadata
function resolveSubIndustry(slug: string, sub: string) {
  // 1. Check direct registry
  const detail = SUB_INDUSTRIES_DETAILS[sub];
  if (detail && detail.parentSlug === slug) {
    return detail;
  }
  
  // 2. Scan list to find matching slugified label
  const indInfo = INDUSTRIES_LIST.find(i => i.slug === slug);
  if (!indInfo) return null;
  
  const subMatch = indInfo.subIndustries.find(s => slugify(s.label) === sub);
  if (!subMatch) return null;
  
  return getSubIndustryDetail(slug, sub, subMatch.label);
}

// Generate Metadata for Dynamic sub-industries SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, sub } = await params;
  const detail = resolveSubIndustry(slug, sub);
  if (!detail) return {};

  const canonicalUrl = `https://oni.vn/solutions/${slug}/${sub}`;

  return {
    title: `Phần mềm quản lý ${detail.label} chuyên sâu - ONI ERP`,
    description: `${detail.highlight} Giải pháp chuyển đổi số bán lẻ và quản trị dòng tiền tự động, kết nối đa nguồn dữ liệu BYOD bảo mật tuyệt đối.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Phần mềm quản lý ${detail.label} chuyên sâu - ONI ERP`,
      description: `${detail.highlight} Giải pháp chuyển đổi số bán lẻ và quản trị dòng tiền tự động, kết nối đa nguồn dữ liệu BYOD bảo mật tuyệt đối.`,
      url: canonicalUrl,
      siteName: 'ONI.vn',
      locale: 'vi_VN',
      type: 'website',
    }
  };
}

export default async function SubIndustrySolutionPage({ params }: Props) {
  const { slug, sub } = await params;
  const detail = resolveSubIndustry(slug, sub);
  if (!detail) {
    notFound();
  }

  const parentConfig = getVerticalConfig(detail.parentSlug === 'fashion' ? 'fashion' : detail.parentSlug === 'sports-court' ? 'sports_court' : detail.parentSlug === 'service-hourly' ? 'service_hourly' : detail.parentSlug as any);
  const indInfo = INDUSTRIES_LIST.find(i => i.slug === slug);
  if (!indInfo) notFound();

  const Icon = detail.icon || indInfo.icon;

  // Custom theme coloring
  const themeColors: Record<string, { bgGrad: string; textPrimary: string; border: string; badge: string; iconBg: string }> = {
    retail: { 
      bgGrad: 'from-blue-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-blue-600', 
      border: 'border-blue-100',
      badge: 'bg-blue-50 text-blue-700 border-blue-100',
      iconBg: 'bg-blue-500 text-white'
    },
    fashion: { 
      bgGrad: 'from-rose-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-rose-600', 
      border: 'border-rose-100',
      badge: 'bg-rose-50 text-rose-700 border-rose-100',
      iconBg: 'bg-rose-500 text-white'
    },
    fnb: { 
      bgGrad: 'from-emerald-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-emerald-600', 
      border: 'border-emerald-100',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      iconBg: 'bg-emerald-500 text-white'
    },
    billiards: { 
      bgGrad: 'from-violet-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-violet-600', 
      border: 'border-violet-100',
      badge: 'bg-violet-50 text-violet-700 border-violet-100',
      iconBg: 'bg-violet-500 text-white'
    },
    'sports-court': { 
      bgGrad: 'from-amber-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-amber-600', 
      border: 'border-amber-100',
      badge: 'bg-amber-50 text-amber-700 border-amber-100',
      iconBg: 'bg-amber-500 text-white'
    },
    lodging: { 
      bgGrad: 'from-indigo-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-indigo-600', 
      border: 'border-indigo-100',
      badge: 'bg-indigo-50 text-indigo-700 border-indigo-100',
      iconBg: 'bg-indigo-500 text-white'
    },
    'service-hourly': { 
      bgGrad: 'from-cyan-500/10 via-slate-50 to-slate-50', 
      textPrimary: 'text-cyan-600', 
      border: 'border-cyan-100',
      badge: 'bg-cyan-50 text-cyan-700 border-cyan-100',
      iconBg: 'bg-cyan-500 text-white'
    }
  };
  const currentTheme = themeColors[slug] || themeColors.retail;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': `ONI - Phần mềm quản lý ${detail.label}`,
    'operatingSystem': 'All',
    'applicationCategory': 'BusinessApplication',
    'description': `${detail.highlight} Giải pháp chuyển đổi số và quản lý dòng tiền tự động chuyên biệt cho ${detail.label.toLowerCase()}.`,
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'VND',
      'description': 'Miễn phí dùng thử 3 năm'
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'ONI.vn',
      'url': 'https://oni.vn'
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* JSON-LD Structured Data for Google SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ═══ NAVBAR ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg" />
            <span className="text-xl font-extrabold tracking-tight text-primary">ONI.vn</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-650">
            <IndustryDropdown />
            <a href="#visual" className="hover:text-primary transition-colors">Visual Minh họa</a>
            <a href="#problems" className="hover:text-primary transition-colors">Nỗi đau &amp; Giải pháp</a>
            <a href="#demo" className="hover:text-primary transition-colors">Dùng thử Sandbox</a>
            <Link href="/#pricing" className="hover:text-primary transition-colors">Bảng giá</Link>
          </div>
          <div className="flex items-center gap-3">
            <LoginButton />
            <Link href={`/register?industry=${detail.slug}`} id={`sub-nav-cta-${detail.slug}`} className="whitespace-nowrap rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-primary-dark hover:shadow-lg transition-all">
              Đăng ký dùng thử &rarr;
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO SECTION (CUSTOM WITH SUB-INDUSTRY PREVIEW) ═══ */}
      <section className={`relative pt-32 pb-24 overflow-hidden bg-gradient-to-b ${currentTheme.bgGrad} border-b border-slate-200/60`}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[20%] -right-[10%] h-[500px] w-[500px] rounded-full bg-slate-200/40 blur-[80px]" />
          <div className="absolute bottom-0 left-[10%] h-[300px] w-[300px] rounded-full bg-slate-100/60 blur-[60px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 text-center lg:text-left space-y-6">
            <div className={`inline-flex items-center gap-2 rounded-full border px-4.5 py-1.5 text-xs font-bold ${currentTheme.badge} uppercase tracking-wider shadow-xs`}>
              <Icon className="h-4 w-4" /> Nghiệp vụ chuyên biệt
            </div>
            
            <h1 className="text-3.5xl md:text-5xl font-black leading-tight tracking-tight text-slate-900" id="sub-title">
              Phần mềm quản lý <br/>
              <span className={`text-transparent bg-clip-text bg-gradient-to-r ${slug === 'lodging' ? 'from-indigo-600 to-violet-500' : 'from-primary to-orange-400'}`}>
                {detail.label}
              </span>
            </h1>
            
            <p className="text-base text-slate-650 font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
              {detail.highlight} Được đóng gói và tối ưu hoàn hảo dựa trên cơ chế Tùy biến thích ứng (Adaptive Engine) của ONI, đem lại hiệu quả vận hành vượt trội và loại bỏ thất thoát.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center lg:justify-start pt-2">
              <Link 
                href={`/register?industry=${detail.slug}`} 
                id={`hero-sub-cta-btn-${detail.slug}`}
                className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-primary-dark transition-all hover:scale-105"
              >
                Khởi tạo gian hàng {detail.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a 
                href="#demo" 
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/60 backdrop-blur-md px-8 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50 transition-all"
              >
                Trải nghiệm Mockup &amp; Demo
              </a>
            </div>
          </div>

          {/* HIGH-FIDELITY LIVE VISUAL PREVIEW MOCKUP */}
          <div className="flex-1 w-full max-w-md mx-auto relative z-10" id="visual">
            <div className="relative rounded-[2rem] bg-white/95 backdrop-blur-md border border-slate-200 p-6 shadow-2xl shadow-slate-900/10">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{detail.visualMock.badgeText}</span>
                  <h4 className="font-extrabold text-slate-800 text-sm mt-0.5">{detail.visualMock.title}</h4>
                </div>
                <span className={`px-2.5 py-0.5 rounded-md border text-[10px] font-bold uppercase ${currentTheme.badge}`}>
                  ONI Adaptive Active
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {detail.visualMock.metrics.map((metric, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex flex-col justify-center items-center text-center">
                    <span className="text-[10px] text-slate-450 font-bold block mb-1">{metric.label}</span>
                    <span className={`text-base font-black ${metric.color}`}>{metric.value}</span>
                  </div>
                ))}
              </div>

              {/* Data Rows */}
              <div className="space-y-3">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dữ liệu thời gian thực:</span>
                {detail.visualMock.dataList.map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:shadow-xs transition-shadow">
                    <div className="min-w-0">
                      <span className="block text-xs font-extrabold text-slate-800 truncate">{row.label}</span>
                      <span className="block text-[10px] text-slate-400 font-semibold mt-0.5">{row.sub}</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border shrink-0 ${row.statusColor}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400 font-semibold">
                <Info className={`h-4 w-4 shrink-0 ${currentTheme.textPrimary}`} />
                <span>Số liệu giả định theo quy mô vận hành chuẩn của {detail.label.toLowerCase()}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PAIN POINTS & SOLUTIONS SECTION ═══ */}
      <section id="problems" className="relative py-24 bg-white border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-20">
            <p className={`text-xs font-black uppercase tracking-widest mb-3 ${currentTheme.textPrimary}`}>Phân tích nghiệp vụ</p>
            <h2 className="text-3xl md:text-4.5xl font-black text-slate-900 tracking-tight">Giải pháp tối ưu giải quyết triệt để nỗi đau</h2>
            <p className="mt-4 max-w-2xl mx-auto text-base text-slate-500 font-medium">
              Chúng tôi hiểu rõ những vấn đề khó khăn nhất của một chủ {detail.label.toLowerCase()} đang vận hành thực tế.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Column 1: Pain Points */}
            <div className="bg-red-50/20 border border-red-100 rounded-3xl p-8 space-y-6">
              <h3 className="text-lg font-black text-red-750 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                Vấn đề nhức nhối hiện tại
              </h3>
              
              <div className="space-y-4">
                {detail.painPoints.map((pain, idx) => (
                  <div key={idx} className="flex gap-3 bg-white p-4.5 rounded-2xl border border-red-100/50 shadow-xs">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-black">
                      0{idx + 1}
                    </span>
                    <p className="text-xs sm:text-sm text-slate-650 font-medium leading-relaxed">
                      {pain}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: ONI Solutions */}
            <div className="bg-emerald-50/20 border border-emerald-100 rounded-3xl p-8 space-y-6">
              <h3 className="text-lg font-black text-emerald-800 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600 shrink-0" />
                Giải pháp đột phá của ONI
              </h3>
              
              <div className="space-y-4">
                {detail.solutions.map((sol, idx) => (
                  <div key={idx} className="flex gap-3 bg-white p-4.5 rounded-2xl border border-emerald-150/40 shadow-xs">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-black">
                      ✓
                    </span>
                    <p className="text-xs sm:text-sm text-slate-650 font-medium leading-relaxed">
                      {sol}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CORE IN-DEPTH FEATURES ═══ */}
      <section className="relative py-24 bg-slate-50 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-20">
            <p className={`text-xs font-black uppercase tracking-widest mb-3 ${currentTheme.textPrimary}`}>Tính năng cốt lõi</p>
            <h2 className="text-3xl md:text-4.5xl font-black text-slate-900 tracking-tight">Hệ sinh thái tính năng chi tiết</h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {detail.features.map((feat, idx) => (
              <div key={idx} className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex items-start gap-3 hover:border-primary/20 hover:shadow-md transition-all">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100`}>
                  <Check className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 leading-snug">{feat}</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal font-semibold">Tự động cấu hình chuẩn chỉnh trên cơ sở dữ liệu và màn hình bán lẻ POS.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DATABASE OPTIONS (SHARED PG & BYOD) ═══ */}
      <section className="relative py-24 bg-white border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 space-y-6">
            <h3 className="text-2.5xl font-black text-slate-900">Kiến trúc dữ liệu an toàn cho {detail.label.toLowerCase()}</h3>
            <p className="text-base text-slate-650 leading-relaxed font-medium">
              Không gò bó và ép buộc như các phần mềm truyền thống. ONI đem lại sự tự do dữ liệu tuyệt đối thông qua cơ chế đa nguồn và BYOD (Bring Your Own Database) cách mạng:
            </p>
            <ul className="space-y-4 text-xs sm:text-sm font-semibold">
              <li className="flex items-start gap-3 text-slate-700">
                <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 text-sm">Gói Tiên phong (Miễn phí): Shared PostgreSQL</strong>
                  <span className="text-slate-500 text-xs block mt-0.5 leading-relaxed">Được khởi tạo sẵn trên hạ tầng cơ sở dữ liệu PostgreSQL dùng chung của ONI, đảm bảo hoạt động cực nhanh và bảo mật mã hóa cao.</span>
                </div>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 text-sm">Gói Nâng cao (BYOD): Sở hữu dữ liệu tuyệt đối</strong>
                  <span className="text-slate-500 text-xs block mt-0.5 leading-relaxed">Tự do kết nối các cổng lưu trữ dữ liệu của riêng bạn như database PostgreSQL riêng, private Supabase, MySQL độc lập để bảo vệ tối đa tài sản thông tin của doanh nghiệp.</span>
                </div>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 text-sm">Đồng bộ ngoại tuyến mượt mà</strong>
                  <span className="text-slate-500 text-xs block mt-0.5 leading-relaxed">Khi quầy thu ngân mất mạng, hệ thống vẫn ghi nhận bill offline và tự động đồng bộ lại cơ sở dữ liệu ngay khi Internet kết nối lại.</span>
                </div>
              </li>
            </ul>
          </div>
          
          <div className="flex-1 w-full max-w-md mx-auto rounded-3xl bg-slate-900 p-8 text-white relative overflow-hidden shadow-2xl">
             <div className="absolute top-0 right-0 p-8 opacity-10"><Database className="h-24 w-24" /></div>
             <div className="relative z-10 space-y-6">
                <div className="border-b border-slate-800 pb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mô phỏng Quản trị dữ liệu</span>
                  <h4 className="font-extrabold text-white text-lg mt-1">Cấu hình Đa cổng kết nối</h4>
                </div>
                
                <div className="space-y-3">
                  <div className="bg-slate-800 border border-slate-700/55 rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Kết nối cơ sở dữ liệu:</span>
                      <span className="text-[10px] font-extrabold text-emerald-450 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Hoạt động (Active)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal font-semibold">Tự động cấu hình chuẩn theo bảng biểu schema của {detail.label.toLowerCase()}.</p>
                  </div>
                  
                  <div className="bg-slate-800 border border-slate-700/55 rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Cổng dữ liệu được chọn:</span>
                      <span className="text-[10px] font-extrabold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-md border border-blue-500/20">PostgreSQL / Supabase / Dedicated DB</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-850/80 rounded-2xl p-3.5 border border-slate-800 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-500 shrink-0" />
                  <span className="text-[10px] text-slate-400 font-semibold leading-normal">Chỉ bạn nắm giữ khóa giải mã (AES-256). Hệ thống ONI tôn trọng quyền sở hữu dữ liệu của khách hàng.</span>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* ═══ INTERACTIVE SIMULATOR PLAYGROUND ═══ */}
      <section id="demo" className="relative py-24 bg-white border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16 lg:mb-20">
            <p className={`text-xs font-black uppercase tracking-widest mb-3 ${currentTheme.textPrimary}`}>Trải nghiệm thực tế</p>
            <h2 className="text-3xl md:text-4.5xl font-black text-slate-900 tracking-tight">Thử nghiệm vận hành quầy POS Sandbox</h2>
            <p className="mt-4 max-w-2xl mx-auto text-base text-slate-500 font-medium">
              Không cần cài đặt, không cần đăng ký tài khoản. Bấm thử các phím nghiệp vụ ở quầy POS mô phỏng phía dưới để trải nghiệm ngay.
            </p>
          </div>

          <div id="interactive-demo-container">
            <IndustryInteractiveDemo slug={detail.parentSlug} />
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
            Bắt đầu số hóa {detail.label.toLowerCase()} của bạn ngay hôm nay
          </h2>
          <p className="text-base sm:text-lg text-slate-600 font-medium mb-10 max-w-2xl mx-auto">
            Bắt đầu bán hàng ngay với gói Tiên phong miễn phí 3 năm. Nâng cấp chi phí cực rẻ cho quy mô chuỗi nhiều chi nhánh.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href={`/register?industry=${detail.slug}`} 
              id={`sub-cta-bottom-btn-${detail.slug}`}
              className="group flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-primary-dark transition-all hover:scale-105"
            >
              Đăng ký dùng thử miễn phí 3 năm
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
              <Link href={`/register?industry=${detail.slug}`} className="hover:text-white transition-colors">Đăng ký dùng thử miễn phí 3 năm</Link>
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
