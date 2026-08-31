'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SetupModal } from '../../components/connectors/SetupModal';
import { getPaymentMethodLabel, getVerticalConfig } from '@oni/core';
import { 
  Sparkles, 
  Lightbulb, 
  Package, 
  Edit, 
  Check, 
  Receipt, 
  Wallet, 
  Smartphone, 
  MessageCircle, 
  Rocket, 
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  HelpCircle
} from 'lucide-react';

interface Props {
  shop: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    tenantSlug?: string;
    address?: string | null;
  };
  connectorStatus: string | null;
  connectorId: string | null;
  homePath: string;
}

// ── Types for Reporting ──────────────────────────────────────────────────────
interface KpiPeriod   { orders: number; revenue: number; debt?: number }
interface RevenueDay  { date: string; revenue: number }
interface TopProduct  { id: string; name: string; revenue: number; qty: number }
interface TopResource { id: string; name: string; count: number; revenue: number }
interface ResourceStats {
  enabled: boolean;
  resourceLabel: string;
  totalResources: number;
  activeResources: number;
  occupancyRate: number;
  mostProductiveToday: { id: string; name: string; revenue: number; count: number } | null;
  mostProductiveMonth: { id: string; name: string; revenue: number; count: number } | null;
  activeResourcesList: Array<{ id: string; name: string; zone: string }>;
}

interface OverviewData {
  kpi: { today: KpiPeriod; month: KpiPeriod; returns: { count: number; refund: number } }
  revenueSeries: RevenueDay[]
  topProducts: TopProduct[]
  statusBreakdown: Record<string, number>
  paymentRevenue: Record<string, number>
  topResources: TopResource[]
  resourceStats?: ResourceStats
}

// ── Formatting Helpers ───────────────────────────────────────────────────────
function fmtVND(v: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v).replace('₫', 'đ');
}

function fmtShort(v: number) {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B';
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + 'K';
  return String(v);
}

function getGreeting() {
  const hr = new Date().getHours();
  if (hr < 12) return 'Chào buổi sáng';
  if (hr < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// ── Elegant SVG Icons for Modules & Cards ────────────────────────────────────
function IconPOS() {
  return (
    <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function IconCustomers() {
  return (
    <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconProducts() {
  return (
    <svg className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function IconCategories() {
  return (
    <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 6v12a2 2 0 002 2h12a2 2 0 002-2V6M4 6l2-2h12l2 2M10 12h4m-2-2v4" />
    </svg>
  );
}

function IconSuppliers() {
  return (
    <svg className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1" />
    </svg>
  );
}

function IconEmployees() {
  return (
    <svg className="h-5 w-5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconInventory() {
  return (
    <svg className="h-5 w-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function IconReports() {
  return (
    <svg className="h-5 w-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

const shopModules = [
  { href: '/channels/pos', label: 'Bán tại quầy', description: 'Giao diện POS bán hàng nhanh.', icon: IconPOS },
  { href: '/orders', label: 'Đơn hàng', description: 'Theo dõi và xử lý đơn bán.', icon: IconOrders },
  { href: '/customers', label: 'Khách hàng', description: 'Thông tin và lịch sử mua.', icon: IconCustomers },
  { href: '/products', label: 'Sản phẩm', description: 'Quản lý giá, kho và SKU.', icon: IconProducts },
  { href: '/categories', label: 'Danh mục', description: 'Sắp xếp phân nhóm hàng hóa.', icon: IconCategories },
  { href: '/suppliers', label: 'Nhà cung cấp', description: 'Quản lý đầu mối nhập hàng.', icon: IconSuppliers },
  { href: '/settings/employees', label: 'Nhân viên', description: 'Quản lý hồ sơ doanh số.', icon: IconEmployees },
  { href: '/inventory', label: 'Kho', description: 'Quản lý tồn và nhập xuất kho.', icon: IconInventory },
  { href: '/reports/overview', label: 'Báo cáo', description: 'Xem chi tiết doanh số & đối soát.', icon: IconReports },
];

// ── Realistic Mock Data for Demo Mode ────────────────────────────────────────
const generateMockData = (): OverviewData => {
  const tzOffset = 7 * 60 * 60 * 1000;
  const now = new Date();
  const localNow = new Date(now.getTime() + tzOffset);
  const todayMs = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())).getTime() - tzOffset;
  const monthStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1)).getTime() - tzOffset;
  const day30 = todayMs - 29 * 86_400_000;
  const seriesStartMs = Math.min(monthStart, day30);

  const series: RevenueDay[] = [];
  let curr = seriesStartMs;
  let idx = 0;
  while (curr <= todayMs + 1000) {
    const d = new Date(curr + tzOffset);
    const dayOfWeek = d.getUTCDay();
    // Weekends have 1.6x sales, upward monthly trend
    const base = 2500000 + (idx % 30) * 70000;
    const factor = dayOfWeek === 0 || dayOfWeek === 6 ? 1.6 : 1.0;
    const noise = 0.85 + Math.random() * 0.3;
    series.push({
      date: d.toISOString().slice(0, 10),
      revenue: Math.round(base * factor * noise),
    });
    curr += 86_400_000;
    idx++;
  }

  return {
    kpi: {
      today: { orders: 18, revenue: 5420000, debt: 450000 },
      month: { orders: 412, revenue: 124850000, debt: 12500000 },
      returns: { count: 6, refund: 2150000 },
    },
    revenueSeries: series,
    topProducts: [
      { id: 'p1', name: 'Áo Polo Nam Premium Cotton', revenue: 24500000, qty: 70 },
      { id: 'p2', name: 'Quần Khaki Slimfit Hàn Quốc', revenue: 19800000, qty: 44 },
      { id: 'p3', name: 'Đầm Lụa Dáng Xòe Dự Tiệc', revenue: 16500000, qty: 22 },
      { id: 'p4', name: 'Áo Khoác Bomber Chống Gió', revenue: 12400000, qty: 20 },
      { id: 'p5', name: 'Giày Tây Oxford Da Thật', revenue: 9500000, qty: 8 },
    ],
    statusBreakdown: {
      completed: 378,
      processing: 22,
      confirmed: 12,
      cancelled: 6,
    },
    paymentRevenue: {
      bank_transfer: 68500000,
      cash: 36200000,
      momo: 14750000,
      card: 5400000,
    },
    topResources: [
      { id: 'r1', name: 'Phòng 201', count: 28, revenue: 34800000 },
      { id: 'r2', name: 'Phòng 203', count: 22, revenue: 21000000 },
      { id: 'r3', name: 'Bàn 101', count: 18, revenue: 8400000 },
      { id: 'r4', name: 'Phòng 205', count: 15, revenue: 7200000 },
      { id: 'r5', name: 'Bàn 102', count: 10, revenue: 5600000 },
    ],
    resourceStats: {
      enabled: true,
      resourceLabel: 'Phòng',
      totalResources: 15,
      activeResources: 4,
      occupancyRate: 26.7,
      mostProductiveToday: { id: 'r1', name: 'Phòng 201', revenue: 1200000, count: 2 },
      mostProductiveMonth: { id: 'r1', name: 'Phòng 201', revenue: 34800000, count: 28 },
      activeResourcesList: [
        { id: 'r1', name: 'Phòng 201', zone: 'Tầng 2' },
        { id: 'r2', name: 'Phòng 203', zone: 'Tầng 2' },
        { id: 'r4', name: 'Phòng 205', zone: 'Tầng 2' },
        { id: 'r12', name: 'Phòng 302', zone: 'Tầng 3' },
      ]
    }
  };
};


const STATUS_LABELS: Record<string, string> = {
  completed: 'Hoàn thành',
  processing: 'Đang xử lý',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã hủy',
  in_progress: 'Đang sử dụng',
};

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Chuyển khoản',
  cash: 'Tiền mặt',
  momo: 'Ví MoMo',
  card: 'Thẻ ATM/Visa',
  unknown: 'Khác',
};

export function ShopDashboard({ shop, connectorStatus, homePath }: Props) {
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(connectorStatus !== 'active');
  const [connected, setConnected] = useState(connectorStatus === 'active' || searchParams.get('success') === 'connected');
  const [demoMode, setDemoMode] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | '30days'>('month');

  const errorParam = searchParams.get('error');
  const successParam = searchParams.get('success');

  // Onboarding States
  const [onboardModalOpen, setOnboardModalOpen] = useState(false);
  const [onboardStep, setOnboardStep] = useState(1); // 1: Welcome/Info, 2: Seed/Choice, 3: Success
  const [seedingLoading, setSeedingLoading] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);
  const [seedingError, setSeedingError] = useState<string | null>(null);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState(1);

  // Trigger demo mode automatically if there's no data source connected
  useEffect(() => {
    if (!connected) {
      setDemoMode(true);
    } else {
      setDemoMode(false);
    }
  }, [connected]);

  // Fetch real data via React Query when connected and demo mode is off
  const { data: realData, isLoading, error: apiError, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ['reports-overview', shop.id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shop.id}/reports/overview`);
      if (!res.ok) throw new Error('Không thể lấy dữ liệu tổng quan');
      return res.json();
    },
    enabled: connected && !demoMode,
    staleTime: 120_000,
  });

  // Fetch products to check if we need onboarding
  const { data: productsData, refetch: refetchProducts } = useQuery({
    queryKey: ['products-list-count', shop.id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shop.id}/products?limit=10`);
      if (!res.ok) return { data: [], total: 0 };
      return res.json();
    },
    enabled: connected && !demoMode,
  });

  // Check if shop settings allow negative stock
  const { data: shopSettings, refetch: refetchSettings } = useQuery({
    queryKey: ['shop-settings-onboard', shop.id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shop.id}/settings`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: connected && !demoMode,
  });

  // Auto-open onboarding modal logic
  useEffect(() => {
    if (productsData && connected && !demoMode) {
      const dismissed = localStorage.getItem(`oni_onboard_dismissed_${shop.id}`);
      const userProducts = productsData.data?.filter(
        (p: any) =>
          !p.id?.toLowerCase().startsWith('time_charge') &&
          !p.product_id?.toLowerCase().startsWith('time_charge') &&
          !p.sku?.toLowerCase().startsWith('time_charge')
      ) || [];
      const hasUserProducts = userProducts.length > 0 || productsData.total > 5;

      if (!hasUserProducts && !dismissed) {
        setOnboardModalOpen(true);
        setOnboardStep(1);
      }
    }
  }, [productsData, connected, demoMode, shop.id]);

  const handleSeedPresets = async () => {
    setSeedingLoading(true);
    setSeedingError(null);
    try {
      const res = await fetch(`/api/shops/${shop.id}/onboarding/seed`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi khởi tạo dữ liệu mẫu');
      
      setSeedSuccess(true);
      setOnboardStep(3); // success slide
      
      // Refetch queries to populate dashboard
      refetchProducts();
      refetchSettings();
      refetchOverview();
    } catch (err: any) {
      setSeedingError(err.message || 'Có lỗi xảy ra khi nạp dữ liệu. Vui lòng thử lại.');
    } finally {
      setSeedingLoading(false);
    }
  };

  const mockData = generateMockData();
  const activeData = demoMode ? mockData : realData;

  // Render loading state if loading active real data
  const isDataLoading = isLoading && connected && !demoMode;

  // Process data based on active period filter
  const displayKpi = activeData?.kpi;
  let chartSeries = activeData?.revenueSeries ?? [];

  const verticalConfig = getVerticalConfig(shopSettings?.industry_type || 'retail');
  const userProducts = productsData?.data?.filter(
    (p: any) =>
      !p.id?.toLowerCase().startsWith('time_charge') &&
      !p.product_id?.toLowerCase().startsWith('time_charge') &&
      !p.sku?.toLowerCase().startsWith('time_charge')
  ) || [];
  const hasUserProducts = userProducts.length > 0 || (productsData?.total ?? 0) > 5;
  const showOnboardBanner = connected && !demoMode && productsData && !hasUserProducts;

  if (activeData) {
    const tzOffset = 7 * 60 * 60 * 1000;
    const now = new Date();
    const localNow = new Date(now.getTime() + tzOffset);
    const todayString = localNow.toISOString().slice(0, 10);
    const currentMonthPrefix = localNow.toISOString().slice(0, 7);

    if (timeFilter === 'today') {
      const todayEntry = chartSeries.find((s) => s.date === todayString);
      chartSeries = todayEntry ? [todayEntry] : chartSeries.slice(-1);
    } else if (timeFilter === 'week') {
      chartSeries = chartSeries.slice(-7);
    } else if (timeFilter === 'month') {
      const monthEntries = chartSeries.filter((s) => s.date.startsWith(currentMonthPrefix));
      chartSeries = monthEntries.length > 0 ? monthEntries : chartSeries;
    } else if (timeFilter === '30days') {
      chartSeries = chartSeries.slice(-30);
    }
  }


  const handleConnectedSuccess = () => {
    setConnected(true);
    setDemoMode(false);
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header and Store Status ──────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 bg-white rounded-3xl border border-slate-100 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.01)]">
        {/* Left Side: Shop identity and details */}
        <div className="flex items-start">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-650 bg-indigo-50/60 px-2 py-0.5 rounded-md">
              {getGreeting()}
            </span>
            
            <div className="flex items-center flex-wrap gap-2.5 mt-1">
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">{shop.name}</h1>
              
              {/* Connector status pill - behind the shop name */}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border transition-all ${
                connected
                  ? 'bg-emerald-50/50 text-emerald-700 border-emerald-100'
                  : 'bg-amber-50/50 text-amber-700 border-amber-100'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {connected ? 'Dữ liệu trực tuyến' : 'Chưa kết nối dữ liệu'}
              </span>

              {/* Demo mode status pill */}
              {demoMode && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50/50 text-indigo-700 border border-indigo-100/50 px-2.5 py-1 text-[11px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  Chế độ Demo
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mt-2 text-xs text-slate-500 font-medium">
              {/* Physical Address of the shop */}
              {shop.address && (
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.01)] text-slate-655">
                  <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{shop.address}</span>
                </div>
              )}

              {/* Website URL showing subdomain */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.01)] text-slate-655">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <span className="font-semibold">{shop.tenantSlug || 'tenant'}.oni.vn/{shop.slug}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Action triggers, Support links and App download links */}
        <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Zalo Support button replacing status pill */}
            <a
              href="https://zalo.me/g/owlxjd9bqfhocunnrjos"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-650 hover:text-blue-800 text-xs font-bold border border-blue-100/50 transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              <img src="/partners/zalo.svg" alt="Zalo" className="w-4 h-4 shrink-0 rounded-md" />
              <span>Tham gia nhóm Zalo hỗ trợ</span>
            </a>

            {/* Welcome / prep instructions button behind Zalo support, using HelpCircle */}
            <button
              onClick={() => {
                setOnboardStep(1);
                setOnboardModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-655 hover:text-indigo-800 text-xs font-bold border border-indigo-100/50 transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
              title="Hướng dẫn chuẩn bị ban đầu"
            >
              <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Hướng dẫn chuẩn bị</span>
            </button>

            {/* Configuration Actions if not connected */}
            {!connected && (
              <button
                onClick={() => setShowModal(true)}
                className="cursor-pointer rounded-xl px-4 py-1.5 text-xs font-bold transition-all shadow-sm bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Cấu hình Sheet dữ liệu
              </button>
            )}

            {!connected && (
              <button
                onClick={() => setDemoMode(!demoMode)}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-655 hover:bg-slate-50 transition-all"
              >
                {demoMode ? 'Tắt bản thử' : 'Bật bản thử'}
              </button>
            )}
          </div>

          {/* App download links */}
          <div className="flex items-center gap-2 mt-0.5">
            <a 
              href="https://apps.apple.com/vn/app/oni-pos/id6779038675" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:opacity-85 transition-opacity"
            >
              <img src="/partners/app-store.svg" alt="App Store" className="h-[21px] w-auto" />
            </a>
            <a 
              href="https://play.google.com/store/apps/details?id=vn.oni.pos" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:opacity-85 transition-opacity"
            >
              <img src="/partners/google-play.svg" alt="Google Play" className="h-[21px] w-auto" />
            </a>
          </div>
        </div>
      </div>

      {/* ── Banners & Status Notices ─────────────────────────────────────────── */}
      {/* Onboarding / Welcome Banner */}
      {showOnboardBanner && (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-100 px-6 py-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚀</span>
              <h3 className="font-bold text-emerald-950 text-base">Khởi động nhanh chi nhánh mới của bạn!</h3>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed max-w-2xl">
              Cửa hàng của bạn đã sẵn sàng hoạt động với chế độ <strong>Cho phép bán khi hết hàng (Bán âm)</strong> được kích hoạt mặc định. Hãy nạp dữ liệu mẫu phù hợp với ngành hàng <strong>{verticalConfig.label}</strong> để trải nghiệm thử bán hàng tại POS ngay lập tức, hoặc tự tạo sản phẩm của riêng bạn.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setOnboardStep(2); // Skip straight to the seeding choice page
                setOnboardModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-xl transition-all shadow-sm shadow-emerald-100 cursor-pointer"
            >
              Nạp dữ liệu mẫu
            </button>
            <Link
              href={`${homePath === '/' ? '' : homePath}/products`}
              className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs px-5 py-3 rounded-xl border border-slate-200 transition-all text-center"
            >
              Tự thêm sản phẩm
            </Link>
            <button
              onClick={() => {
                setOnboardStep(1); // Welcome slide
                setOnboardModalOpen(true);
              }}
              className="text-slate-550 hover:text-slate-800 font-semibold text-xs px-3 py-2 cursor-pointer"
            >
              Xem hướng dẫn
            </button>
          </div>
        </div>
      )}

      {successParam === 'connected' && (

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-5 py-4 text-sm text-emerald-800 flex items-center gap-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">✓</span>
          <p className="font-medium">Chúc mừng! Bạn đã kết nối Google Sheet thành công cho chi nhánh này.</p>
        </div>
      )}
      {errorParam && (
        <div className="rounded-2xl border border-red-100 bg-red-50/50 px-5 py-4 text-sm text-red-700 flex items-center gap-3">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">!</span>
          <p className="font-medium">Kết nối chưa hoàn tất hoặc gặp lỗi. Hãy mở lại cấu hình dữ liệu và thử lại.</p>
        </div>
      )}

      {/* Demo Warning Banner */}
      {demoMode && (
        <div className="rounded-2xl bg-gradient-to-r from-indigo-500/10 via-blue-500/5 to-transparent border border-indigo-100/50 px-5 py-4 text-sm text-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 backdrop-blur-sm">
          <div>
            <p className="font-semibold text-indigo-950">Đang hiển thị Dữ liệu mẫu (Demo Mode)</p>
            <p className="text-slate-500 text-xs mt-0.5">Vui lòng kết nối Google Sheet để bắt đầu lấy thông tin thực tế từ cửa hàng của bạn.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="shrink-0 bg-indigo-600 text-white font-semibold text-xs px-4.5 py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100 w-fit"
          >
            Bắt đầu cấu hình ngay →
          </button>
        </div>
      )}

      {/* ── Main Dashboard Content ───────────────────────────────────────────── */}
      {activeData && displayKpi && (
        <div className="space-y-6">
            
            {/* Timeframe Filter Selector */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700 tracking-wide uppercase">Chỉ số báo cáo chính</h2>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/50">
                <button
                  onClick={() => setTimeFilter('today')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    timeFilter === 'today' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Hôm nay
                </button>
                <button
                  onClick={() => setTimeFilter('week')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    timeFilter === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  7 ngày qua
                </button>
                <button
                  onClick={() => setTimeFilter('month')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    timeFilter === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Tháng này
                </button>
                <button
                  onClick={() => setTimeFilter('30days')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    timeFilter === '30days' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  30 ngày qua
                </button>
              </div>
            </div>

            {/* 1. KPIs Grid */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              
              {/* KPI Card 1: Today Revenue */}
              <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-300 hover:shadow-[0_12px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5">
                <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-[#FA5907] to-[#ff7e3d]" />
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-slate-400">Doanh thu hôm nay <span className="text-[10px] font-normal text-slate-400 ml-0.5">(Gồm nợ)</span></span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#FA5907]/10 text-[#FA5907]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">{fmtVND(displayKpi.today.revenue)}</p>
                  {displayKpi.today.debt ? (
                    <p className="text-[11px] font-medium text-orange-600 mt-0.5">Nợ: {fmtVND(displayKpi.today.debt)}</p>
                  ) : null}
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">{displayKpi.today.orders} đơn hàng thành công</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">+5.4%</span>
                  </div>
                </div>
              </div>

              {/* KPI Card 2: Month Revenue */}
              <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-300 hover:shadow-[0_12px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5">
                <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-slate-400">Doanh thu tháng này <span className="text-[10px] font-normal text-slate-400 ml-0.5">(Gồm nợ)</span></span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">{fmtVND(displayKpi.month.revenue)}</p>
                  {displayKpi.month.debt ? (
                    <p className="text-[11px] font-medium text-orange-600 mt-0.5">Nợ: {fmtVND(displayKpi.month.debt)}</p>
                  ) : null}
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">{displayKpi.month.orders} đơn tích lũy</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">+12.8%</span>
                  </div>
                </div>
              </div>

              {/* KPI Card 3: AOV (Average Order Value) */}
              <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-300 hover:shadow-[0_12px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5">
                <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-violet-500 to-purple-500" />
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-slate-400">Giá trị đơn trung bình (AOV)</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
                    {fmtVND(displayKpi.month.orders > 0 ? displayKpi.month.revenue / displayKpi.month.orders : 0)}
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">Trung bình tháng</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">+4.2%</span>
                  </div>
                </div>
              </div>

              {/* KPI Card 4: Returns Refund */}
              <div className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-300 hover:shadow-[0_12px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5">
                <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-rose-400 to-pink-500" />
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-slate-400">Trả hàng & hoàn tiền</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-6a4 4 0 00-4-4H4m0 0l4 4m-4-4l4-4m-4 10h12a4 4 0 014 4v1" />
                    </svg>
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">{fmtVND(displayKpi.returns.refund)}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">{displayKpi.returns.count} phiếu trả lại</p>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                      {displayKpi.month.revenue > 0
                        ? ((displayKpi.returns.refund / displayKpi.month.revenue) * 100).toFixed(1) + '%'
                        : '0%'}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* 1.5. Thống kê tài nguyên Phòng/Bàn/Sân (nếu có kích hoạt) */}
            {activeData?.resourceStats?.enabled && (
              <div className="grid gap-6 md:grid-cols-3">
                {/* Cột 1: Trạng thái & Tỷ lệ sử dụng */}
                <div className="md:col-span-1 rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-300 hover:shadow-[0_12px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800 tracking-tight">Trạng thái {activeData.resourceStats.resourceLabel}</h3>
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </span>
                  </div>
                  
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-extrabold text-slate-800 tracking-tight">
                      {activeData.resourceStats.activeResources}
                    </span>
                    <span className="text-slate-400 text-xs font-semibold">
                      / {activeData.resourceStats.totalResources} {activeData.resourceStats.resourceLabel.toLowerCase()} đang sử dụng
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1.5">
                      <span>Hiệu suất sử dụng</span>
                      <span>{Math.round(activeData.resourceStats.occupancyRate)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-50 overflow-hidden border border-slate-100">
                      <div
                        style={{ width: `${Math.min(100, activeData.resourceStats.occupancyRate)}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Cột 2: Năng suất nhất trong ngày */}
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold text-slate-800 tracking-tight">Hiệu quả nhất hôm nay</h3>
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </span>
                    </div>

                    {activeData.resourceStats.mostProductiveToday ? (
                      <div className="space-y-3 mt-4">
                        <p className="text-xl font-extrabold text-slate-800 tracking-tight truncate">
                          {activeData.resourceStats.mostProductiveToday.name}
                        </p>
                        <div className="flex justify-between text-xs text-slate-500 font-semibold border-t border-slate-50 pt-3">
                          <span>Doanh thu ngày</span>
                          <span className="text-slate-800 font-bold">{fmtVND(activeData.resourceStats.mostProductiveToday.revenue)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 font-semibold">
                          <span>Số lượt sử dụng</span>
                          <span className="text-slate-800 font-bold">{activeData.resourceStats.mostProductiveToday.count} lượt</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-xs text-slate-400 italic">Chưa phát sinh doanh thu hôm nay</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cột 3: Năng suất nhất trong tháng */}
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold text-slate-800 tracking-tight">Năng suất nhất tháng</h3>
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                      </span>
                    </div>

                    {activeData.resourceStats.mostProductiveMonth ? (
                      <div className="space-y-3 mt-4">
                        <p className="text-xl font-extrabold text-slate-800 tracking-tight truncate">
                          {activeData.resourceStats.mostProductiveMonth.name}
                        </p>
                        <div className="flex justify-between text-xs text-slate-500 font-semibold border-t border-slate-50 pt-3">
                          <span>Doanh thu tháng</span>
                          <span className="text-slate-800 font-bold">{fmtVND(activeData.resourceStats.mostProductiveMonth.revenue)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 font-semibold">
                          <span>Số lượt sử dụng</span>
                          <span className="text-slate-800 font-bold">{activeData.resourceStats.mostProductiveMonth.count} lượt</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-xs text-slate-400 italic">Chưa phát sinh doanh thu tháng này</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* 2. Beautiful Custom CSS Bar Chart for Revenue Series */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight">Xu hướng doanh thu</h3>
                <p className="text-xs text-slate-400 mt-0.5">Biểu đồ thống kê chi tiết biến động doanh số hàng ngày</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-t from-indigo-600 to-indigo-400" />
                  <span>Doanh thu ngày</span>
                </div>
              </div>
            </div>

            {/* Chart Graphic Area */}
            {chartSeries.length === 0 ? (
              <div className="flex h-44 items-center justify-center rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                <p className="text-sm text-slate-400">Không có dữ liệu trong khoảng thời gian này</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex h-48 items-end gap-1.5 md:gap-2 px-2 pt-2 select-none">
                  {chartSeries.map((d, idx) => {
                    const maxVal = Math.max(...chartSeries.map((s) => s.revenue), 1);
                    const percent = (d.revenue / maxVal) * 100;
                    
                    const dateParts = d.date.split('-');
                    const labelDay = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : d.date;

                    return (
                      <div
                        key={idx}
                        className="group relative flex flex-1 h-full items-end justify-center cursor-pointer"
                      >
                        {/* Bar Pillar */}
                        <div
                          style={{ height: `${Math.max(4, percent)}%` }}
                          className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 via-indigo-500 to-indigo-400 group-hover:from-indigo-700 group-hover:to-indigo-500 transition-all duration-300 shadow-[0_2px_4px_rgba(99,102,241,0.1)] group-hover:shadow-[0_4px_12px_rgba(99,102,241,0.25)] relative"
                        >
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 rounded-t-lg transition-all" />
                        </div>

                        {/* High fidelity dark glass tooltip */}
                        <div className="absolute bottom-full mb-2 hidden -translate-y-1 rounded-xl bg-slate-950/95 px-3 py-2 text-[10px] text-white whitespace-nowrap shadow-xl border border-slate-800 group-hover:block z-30 transition-all duration-200 backdrop-blur-md pointer-events-none">
                          <p className="font-semibold text-slate-300 tracking-wider uppercase text-[8px]">{d.date}</p>
                          <p className="font-bold text-white text-xs mt-0.5">{fmtVND(d.revenue)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Chart date markers */}
                <div className="flex justify-between border-t border-slate-100 pt-2 px-1 text-[10px] font-bold text-slate-400 tracking-wider">
                  <span>{chartSeries[0]?.date}</span>
                  {chartSeries.length > 2 && <span>{chartSeries[Math.floor(chartSeries.length / 2)]?.date}</span>}
                  <span>{chartSeries[chartSeries.length - 1]?.date}</span>
                </div>
              </div>
            )}
          </div>

          {/* 3. Splits layout for products, resources and payment breakdown */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            
            {/* Top Products */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
              <h3 className="text-base font-bold text-slate-800 tracking-tight mb-4">Sản phẩm bán chạy hàng đầu</h3>
              {(!activeData.topProducts || activeData.topProducts.length === 0) ? (
                <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu sản phẩm</p>
              ) : (
                <div className="space-y-4">
                  {activeData.topProducts.slice(0, 5).map((p, idx) => {
                    const maxRev = activeData.topProducts[0].revenue || 1;
                    const percent = (p.revenue / maxRev) * 100;
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-600 select-none">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                            <p className="truncate mr-2">{p.name}</p>
                            <p className="shrink-0 font-bold">{fmtShort(p.revenue)}đ</p>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-50 overflow-hidden border border-slate-100">
                              <div
                                style={{ width: `${percent}%` }}
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                              />
                            </div>
                            <span className="shrink-0 text-[10px] text-slate-400 font-bold tracking-wider">{Math.round(p.qty)} sp</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top Resources (Rooms / Tables) */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
              <h3 className="text-base font-bold text-slate-800 tracking-tight mb-4">Phòng / Bàn sử dụng nhiều</h3>
              {(!activeData.topResources || activeData.topResources.length === 0) ? (
                <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu phòng/bàn</p>
              ) : (
                <div className="space-y-4">
                  {activeData.topResources.slice(0, 5).map((r, idx) => {
                    const maxCount = activeData.topResources[0].count || 1;
                    const percent = (r.count / maxCount) * 100;
                    return (
                      <div key={r.id} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold text-indigo-600 select-none">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                            <p className="truncate mr-2">{r.name}</p>
                            <p className="shrink-0 font-bold">{fmtShort(r.revenue)}đ</p>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-50 overflow-hidden border border-slate-100">
                              <div
                                style={{ width: `${percent}%` }}
                                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-600"
                              />
                            </div>
                            <span className="shrink-0 text-[10px] text-slate-400 font-bold tracking-wider">{r.count} lượt</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payment Method Breakdown */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
              <h3 className="text-base font-bold text-slate-800 tracking-tight mb-4">Phương thức thanh toán</h3>
              {!activeData.paymentRevenue || Object.keys(activeData.paymentRevenue).length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu thanh toán</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(activeData.paymentRevenue).map(([method, amount]) => {
                    const totalPayments = Object.values(activeData.paymentRevenue).reduce((a, b) => a + b, 0) || 1;
                    const percent = (amount / totalPayments) * 100;
                    return (
                      <div key={method} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-600">{getPaymentMethodLabel(method)}</span>
                          <span className="font-bold text-slate-800">{fmtVND(amount)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-slate-50 overflow-hidden border border-slate-100">
                            <div
                              style={{ width: `${percent}%` }}
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                            />
                          </div>
                          <span className="shrink-0 text-[10px] text-slate-400 font-bold tracking-wider">{percent.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Render fallback state when no data and not loading (e.g. error) */}
      {!activeData && connected && !isDataLoading && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-[0_8px_30px_rgb(0,0,0,0.01)]">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500 mb-4">!</span>
          <p className="font-semibold text-slate-800">Không thể tải dữ liệu hoạt động</p>
          <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">Vui lòng kiểm tra lại quyền truy cập hoặc làm mới trang để thiết lập lại kết nối dữ liệu.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Làm mới trang
          </button>
        </div>
      )}

      {/* Loading Skeleton during real fetch */}
      {isDataLoading && (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-slate-100/80 border border-slate-100" />
            ))}
          </div>
          <div className="h-60 rounded-3xl bg-slate-100/80 border border-slate-100" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="h-56 rounded-3xl bg-slate-100/80 border border-slate-100" />
            <div className="h-56 rounded-3xl bg-slate-100/80 border border-slate-100" />
          </div>
        </div>
      )}

      {/* ── Unconfigured Setup State Panel ─────────────────────────────────── */}
      {!connected && !demoMode && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 px-6 text-center shadow-[0_8px_30px_rgb(0,0,0,0.01)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 mb-6">
            <svg className="h-6 w-6 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Chi nhánh chưa cấu hình nguồn dữ liệu</h2>
          <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            Kết nối chi nhánh này với một Google Sheet dữ liệu mẫu hoặc thực tế của bạn để mở khóa các phân tích báo cáo nâng cao và POS.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 text-white font-bold text-xs px-6 py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              Bắt đầu kết nối dữ liệu ngay
            </button>
            <button
              onClick={() => setDemoMode(true)}
              className="border border-slate-200 bg-white text-slate-700 font-semibold text-xs px-6 py-3 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
            >
              Dùng thử dữ liệu mẫu
            </button>
          </div>
        </div>
      )}

      {/* ── Compact Navigation & Module Shortcuts ───────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 tracking-wide uppercase mb-4">Các tính năng nghiệp vụ</h2>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shopModules.map((module) => (
            <Link
              key={module.href}
              href={`${homePath === '/' ? '' : homePath}${module.href}`}
              className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.01)] hover:shadow-[0_12px_30px_rgb(0,0,0,0.04)] hover:border-indigo-100 hover:bg-indigo-50/10 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 group-hover:bg-indigo-50 transition-all">
                  <module.icon />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800 group-hover:text-indigo-900 transition-colors">
                      {module.label}
                    </span>
                    <span className="text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all text-xs">
                      →
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 group-hover:text-slate-500 transition-colors truncate">
                    {module.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>

      {/* ── Onboarding Welcome Modal ────────────────────────────────────────── */}
      {onboardModalOpen && (
        <div
          onClick={() => {
            setOnboardModalOpen(false);
            localStorage.setItem(`oni_onboard_dismissed_${shop.id}`, 'true');
          }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/75 backdrop-blur-md p-3 sm:items-center sm:p-4 overflow-y-auto"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.15)] max-w-lg w-full max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2rem)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col"
          >
            
            {/* Modal Header */}
            <div className="shrink-0 p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Hướng dẫn chuẩn bị</span>
              </div>
              <button
                onClick={() => {
                  setOnboardModalOpen(false);
                  localStorage.setItem(`oni_onboard_dismissed_${shop.id}`, 'true');
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors rounded-lg p-1 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="min-h-0 p-6 md:p-8 flex-1 overflow-y-auto space-y-6">
              {onboardStep === 1 && (
                <div className="space-y-4 text-center sm:text-left">
                  <div className="flex items-center justify-center gap-3 sm:justify-start">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                      <img src="/logo.png" alt="ONI Logo" className="h-10 w-10 object-contain" />
                    </div>
                    <h3 className="text-xl font-extrabold text-primary tracking-tight">
                      Cảm ơn bạn đã sử dụng phần mềm ONI!
                    </h3>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed font-medium">
                    Hệ thống quản lý bán lẻ & dịch vụ của bạn đã được thiết lập thành công. Hãy bắt đầu trải nghiệm đầy đủ các tính năng của ONI.
                  </p>
                  
                  {/* Basic selling workflow guide (vertical collapse / accordion stepper) */}
                  <div className="space-y-3.5 text-left border border-slate-100 bg-slate-50/50 rounded-2xl p-5 shadow-3xs">
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Quy trình bán hàng cơ bản</p>
                    
                    <div className="space-y-2">
                      {/* Step 1 */}
                      <div className="border border-slate-200/60 rounded-xl bg-white overflow-hidden transition-all duration-200">
                        <div className="w-full flex items-center justify-between p-3 hover:bg-slate-50/80 transition-colors">
                          <button
                            type="button"
                            onClick={() => setActiveWorkflowTab(activeWorkflowTab === 1 ? 0 : 1)}
                            className="flex-1 flex items-center gap-2 text-left font-bold text-xs text-slate-800 cursor-pointer"
                          >
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border transition-all ${
                              activeWorkflowTab === 1
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                              1
                            </span>
                            <span>Tạo sản phẩm & dịch vụ</span>
                          </button>
                          
                          <div className="flex items-center gap-2">
                            <Link
                              href={`${homePath === '/' ? '' : homePath}/products`}
                              onClick={() => setOnboardModalOpen(false)}
                              className="text-primary hover:text-primary-dark font-extrabold text-[10px] hover:underline"
                            >
                              Đi tới
                            </Link>
                            <button
                              type="button"
                              onClick={() => setActiveWorkflowTab(activeWorkflowTab === 1 ? 0 : 1)}
                              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0"
                            >
                              <span className={`inline-block transition-transform duration-250 text-[10px] ${activeWorkflowTab === 1 ? 'rotate-180' : ''}`}>
                                ▼
                              </span>
                            </button>
                          </div>
                        </div>
                        {activeWorkflowTab === 1 && (
                          <div className="p-3 pt-0 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed font-normal animate-in slide-in-from-top-1 duration-200 space-y-1">
                            <p>
                              {verticalConfig.features.location_resource
                                ? 'Tạo dịch vụ tính tiền chính (tiền giờ, tiền phòng) cùng các mặt hàng đồ ăn, nước uống bán kèm.'
                                : 'Thêm hàng hóa, dịch vụ và danh mục kinh doanh của bạn.'}
                            </p>
                            <Link
                              href={`${homePath === '/' ? '' : homePath}/products`}
                              onClick={() => setOnboardModalOpen(false)}
                              className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline mt-1"
                            >
                              <span>Đi đến Quản lý sản phẩm</span>
                              <span>→</span>
                            </Link>
                          </div>
                        )}
                      </div>

                      {/* Step 2 */}
                      <div className="border border-slate-200/60 rounded-xl bg-white overflow-hidden transition-all duration-200">
                        <div className="w-full flex items-center justify-between p-3 hover:bg-slate-50/80 transition-colors">
                          <button
                            type="button"
                            onClick={() => setActiveWorkflowTab(activeWorkflowTab === 2 ? 0 : 2)}
                            className="flex-1 flex items-center gap-2 text-left font-bold text-xs text-slate-800 cursor-pointer"
                          >
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border transition-all ${
                              activeWorkflowTab === 2
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                              2
                            </span>
                            <span>Nhập & kiểm kho hàng</span>
                          </button>
                          
                          <div className="flex items-center gap-2">
                            <Link
                              href={`${homePath === '/' ? '' : homePath}/inventory`}
                              onClick={() => setOnboardModalOpen(false)}
                              className="text-primary hover:text-primary-dark font-extrabold text-[10px] hover:underline"
                            >
                              Đi tới
                            </Link>
                            <button
                              type="button"
                              onClick={() => setActiveWorkflowTab(activeWorkflowTab === 2 ? 0 : 2)}
                              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0"
                            >
                              <span className={`inline-block transition-transform duration-250 text-[10px] ${activeWorkflowTab === 2 ? 'rotate-180' : ''}`}>
                                ▼
                              </span>
                            </button>
                          </div>
                        </div>
                        {activeWorkflowTab === 2 && (
                          <div className="p-3 pt-0 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed font-normal animate-in slide-in-from-top-1 duration-200 space-y-1">
                            <p>
                              {verticalConfig.features.location_resource
                                ? 'Khai báo số lượng tồn kho thực tế của các đồ ăn, nước ngọt hoặc hàng hóa bán kèm.'
                                : 'Khai báo số lượng tồn kho thực tế của hàng hóa trong kho.'}
                            </p>
                            <Link
                              href={`${homePath === '/' ? '' : homePath}/inventory`}
                              onClick={() => setOnboardModalOpen(false)}
                              className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline mt-1"
                            >
                              <span>Đi đến Quản lý kho hàng</span>
                              <span>→</span>
                            </Link>
                          </div>
                        )}
                      </div>

                      {/* Step 3 (Only for Service/Accommodation verticals) */}
                      {verticalConfig.features.location_resource && (
                        <div className="border border-slate-200/60 rounded-xl bg-white overflow-hidden transition-all duration-200">
                          <div className="w-full flex items-center justify-between p-3 hover:bg-slate-50/80 transition-colors">
                            <button
                              type="button"
                              onClick={() => setActiveWorkflowTab(activeWorkflowTab === 3 ? 0 : 3)}
                              className="flex-1 flex items-center gap-2 text-left font-bold text-xs text-slate-800 cursor-pointer"
                            >
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border transition-all ${
                                activeWorkflowTab === 3
                                  ? 'bg-primary/10 text-primary border-primary/20'
                                  : 'bg-slate-50 text-slate-500 border-slate-200'
                              }`}>
                                3
                              </span>
                              <span>Thiết lập {verticalConfig.resourceTemplate?.label.toLowerCase() || 'phòng/bàn/sân'}</span>
                            </button>
                            
                            <div className="flex items-center gap-2">
                              <Link
                                href={`${homePath === '/' ? '' : homePath}/resources`}
                                onClick={() => setOnboardModalOpen(false)}
                                className="text-primary hover:text-primary-dark font-extrabold text-[10px] hover:underline"
                              >
                                Đi tới
                              </Link>
                              <button
                                type="button"
                                onClick={() => setActiveWorkflowTab(activeWorkflowTab === 3 ? 0 : 3)}
                                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0"
                              >
                                <span className={`inline-block transition-transform duration-250 text-[10px] ${activeWorkflowTab === 3 ? 'rotate-180' : ''}`}>
                                  ▼
                                </span>
                              </button>
                            </div>
                          </div>
                          {activeWorkflowTab === 3 && (
                            <div className="p-3 pt-0 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed font-normal animate-in slide-in-from-top-1 duration-200 space-y-1">
                              <p>
                                Cấu hình sơ đồ khu vực và danh sách các {verticalConfig.resourceTemplate?.label.toLowerCase() || 'phòng/bàn/sân'} hoạt động của chi nhánh.
                              </p>
                              <Link
                                href={`${homePath === '/' ? '' : homePath}/resources`}
                                onClick={() => setOnboardModalOpen(false)}
                                className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline mt-1"
                              >
                                <span>Thiết lập sơ đồ khu vực</span>
                                <span>→</span>
                              </Link>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Last Step (Step 3 or 4) */}
                      <div className="border border-slate-200/60 rounded-xl bg-white overflow-hidden transition-all duration-200">
                        <div className="w-full flex items-center justify-between p-3 hover:bg-slate-50/80 transition-colors">
                          <button
                            type="button"
                            onClick={() => {
                              const stepNum = verticalConfig.features.location_resource ? 4 : 3;
                              setActiveWorkflowTab(activeWorkflowTab === stepNum ? 0 : stepNum);
                            }}
                            className="flex-1 flex items-center gap-2 text-left font-bold text-xs text-slate-800 cursor-pointer"
                          >
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border transition-all ${
                              activeWorkflowTab === (verticalConfig.features.location_resource ? 4 : 3)
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                              {verticalConfig.features.location_resource ? 4 : 3}
                            </span>
                            <span>Bán hàng (POS)</span>
                          </button>
                          
                          <div className="flex items-center gap-2">
                            <Link
                              href={`${homePath === '/' ? '' : homePath}/channels/pos`}
                              onClick={() => setOnboardModalOpen(false)}
                              className="text-primary hover:text-primary-dark font-extrabold text-[10px] hover:underline"
                            >
                              Đi tới
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                const stepNum = verticalConfig.features.location_resource ? 4 : 3;
                                setActiveWorkflowTab(activeWorkflowTab === stepNum ? 0 : stepNum);
                              }}
                              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer shrink-0"
                            >
                              <span className={`inline-block transition-transform duration-250 text-[10px] ${activeWorkflowTab === (verticalConfig.features.location_resource ? 4 : 3) ? 'rotate-180' : ''}`}>
                                ▼
                              </span>
                            </button>
                          </div>
                        </div>
                        {activeWorkflowTab === (verticalConfig.features.location_resource ? 4 : 3) && (
                          <div className="p-3 pt-0 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed font-normal animate-in slide-in-from-top-1 duration-200 space-y-1">
                            <p>
                              {verticalConfig.features.location_resource
                                ? 'Mở màn hình POS để lên đơn dịch vụ giờ/phòng, gọi thêm đồ uống kèm và thanh toán.'
                                : 'Mở màn hình POS để lên đơn hàng, quét mã vạch và thanh toán nhanh chóng.'}
                            </p>
                            <Link
                              href={`${homePath === '/' ? '' : homePath}/channels/pos`}
                              onClick={() => setOnboardModalOpen(false)}
                              className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline mt-1"
                            >
                              <span>Mở màn hình bán hàng POS</span>
                              <span>→</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Negative stock notice */}
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-primary/10 bg-primary/5 text-left text-[11px] leading-relaxed">
                    <span className="text-primary shrink-0 mt-0.5">
                      <Lightbulb className="w-4 h-4" />
                    </span>
                    <p className="text-slate-600 font-medium">
                      <strong>Mách nhỏ:</strong> Hệ thống đã bật sẵn chế độ <strong>Cho phép bán khi hết hàng</strong> để bạn có thể trải nghiệm bán thử tại POS ngay lập tức mà không cần qua các bước kiểm kho phức tạp.
                    </p>
                  </div>

                  <p className="text-xs text-slate-400 text-center sm:text-left">
                    Nhấn tiếp tục để tùy chọn cấu hình dữ liệu mẫu hoặc tự thiết lập thủ công.
                  </p>
                </div>
              )}

              {onboardStep === 2 && (
                <div className="space-y-6 text-center sm:text-left">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-slate-800">
                      Bạn muốn bắt đầu như thế nào?
                    </h3>
                    <p className="text-slate-500 text-sm">
                      Chọn cách thiết lập dữ liệu phù hợp với định hướng của bạn:
                    </p>
                  </div>

                  {seedingError && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-600 font-medium">
                      {seedingError}
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Option 1: Seed sample data */}
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/20 p-5 space-y-3 text-left transition-all hover:border-emerald-350">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700 shadow-xs">
                          <Package className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-emerald-950">Khởi tạo dữ liệu mẫu (Khuyên dùng)</h4>
                          <p className="text-xs text-slate-500 leading-relaxed font-normal">
                            Tự động tạo 3-5 sản phẩm mẫu, danh mục tương ứng và sơ đồ bàn/phòng/sân mẫu phù hợp nhất với ngành hàng <strong>{verticalConfig.label}</strong> của bạn.
                          </p>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleSeedPresets}
                        disabled={seedingLoading || hasUserProducts}
                        className="w-full bg-primary hover:bg-primary-dark text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer border-0 active:scale-95"
                      >
                        {seedingLoading ? (
                          <>
                            <div className="h-4.5 w-4.5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                            Đang nạp dữ liệu mẫu...
                          </>
                        ) : hasUserProducts ? (
                          <>Đã có sản phẩm (Không thể nạp)</>
                        ) : (
                          <>Nạp dữ liệu mẫu cho {verticalConfig.label}</>
                        )}
                      </button>
                      {hasUserProducts && (
                        <p className="text-[10px] text-amber-600 font-semibold mt-1 text-center leading-normal">
                          ⚠️ Chi nhánh đã có dữ liệu sản phẩm. Hãy bỏ qua bước này để tự thiết lập thủ công.
                        </p>
                      )}
                    </div>

                    {/* Option 2: Add manually */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 text-left transition-all hover:border-slate-300">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 border border-slate-250 text-slate-600 shadow-xs">
                          <Edit className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-slate-800">Tự tạo dữ liệu của riêng bạn</h4>
                          <p className="text-xs text-slate-500 leading-relaxed font-normal">
                            Bỏ qua dữ liệu mẫu để trực tiếp thêm các sản phẩm, danh mục và cấu hình cụ thể cho cửa hàng của bạn từ đầu.
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setOnboardStep(3); // Go directly to checklist
                        }}
                        className="w-full text-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer shadow-3xs active:scale-95"
                      >
                        Tự thêm sản phẩm thủ công
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {onboardStep === 3 && (
                <div className="space-y-5 text-left">
                  <div className="text-center space-y-2">
                    <div className="flex justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 shadow-sm">
                        <Check className="w-6 h-6" />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">
                      Khởi tạo dữ liệu thành công!
                    </h3>
                    <p className="text-slate-500 text-xs leading-normal max-w-sm mx-auto">
                      Gian hàng <strong>{shop.name}</strong> đã sẵn sàng. Hãy hoàn thành checklist dưới đây để bắt đầu kinh doanh chính thức:
                    </p>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {/* Item 1: Seeding (Completed) */}
                    <div className="flex gap-3 p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/10">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                        <Check className="w-3 h-3" />
                      </span>
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-emerald-950">Khởi tạo sản phẩm & sơ đồ mẫu</h4>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          {seedSuccess ? `Đã tạo sản phẩm và sơ đồ mẫu theo ngành ${verticalConfig.label}.` : "Bắt đầu tự lập danh sách sản phẩm và sơ đồ bàn của bạn."}
                        </p>
                      </div>
                    </div>

                    {/* Item 2: Cashbook Bank Account (Pending) */}
                    <div className="flex gap-3 p-3.5 rounded-2xl border border-slate-100 bg-white">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-250 text-slate-550 bg-slate-50 font-semibold shadow-xs">
                        <Wallet className="w-3.5 h-3.5" />
                      </span>
                      <div className="space-y-0.5 flex-1">
                        <h4 className="text-xs font-bold text-slate-800">Cấu hình Số tài khoản ở sổ quỹ</h4>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Liên kết thông tin Ngân hàng & Số tài khoản trong Sổ quỹ để nhận thanh toán VietQR động tại POS.
                        </p>
                        <Link
                          href={`${homePath === '/' ? '' : homePath}/cashbook`}
                          onClick={() => {
                            setOnboardModalOpen(false);
                            localStorage.setItem(`oni_onboard_dismissed_${shop.id}`, 'true');
                          }}
                          className="inline-flex items-center gap-0.5 text-[11px] font-bold text-primary hover:underline mt-1"
                        >
                          <span>Đi đến Sổ quỹ</span>
                          <span>→</span>
                        </Link>
                      </div>
                    </div>

                    {/* Item 3: Invoice Settings (Pending) */}
                    <div className="flex gap-3 p-3.5 rounded-2xl border border-slate-100 bg-white">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-250 text-slate-550 bg-slate-50 font-semibold shadow-xs">
                        <Receipt className="w-3.5 h-3.5" />
                      </span>
                      <div className="space-y-0.5 flex-1">
                        <h4 className="text-xs font-bold text-slate-800">Cấu hình thông tin hiển thị trên Hóa đơn</h4>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Cập nhật các thông tin Wi-Fi, Mã số thuế, tên cửa hàng và địa chỉ in trên biên lai thanh toán.
                        </p>
                        <Link
                          href={`${homePath === '/' ? '' : homePath}/settings?tab=sales`}
                          onClick={() => {
                            setOnboardModalOpen(false);
                            localStorage.setItem(`oni_onboard_dismissed_${shop.id}`, 'true');
                          }}
                          className="inline-flex items-center gap-0.5 text-[11px] font-bold text-primary hover:underline mt-1"
                        >
                          <span>Thiết lập hóa đơn</span>
                          <span>→</span>
                        </Link>
                      </div>
                    </div>

                    {/* Item 4: Download App (App Store / CH Play) */}
                    <div className="flex gap-3 p-3.5 rounded-2xl border border-slate-100 bg-white">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-250 text-slate-550 bg-slate-50 font-semibold shadow-xs">
                        <Smartphone className="w-3.5 h-3.5" />
                      </span>
                      <div className="space-y-1 flex-1">
                        <h4 className="text-xs font-bold text-slate-800">Tải ứng dụng di động Oni POS</h4>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Bán hàng nhanh, in bill và theo dõi doanh số tức thì ngay trên điện thoại của bạn.
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <a
                            href="https://apps.apple.com/vn/app/oni-pos/id6779038675"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:opacity-85 transition-opacity"
                          >
                            <img
                              src="/partners/app-store.svg"
                              alt="App Store"
                              className="h-6 w-auto"
                            />
                          </a>
                          <a
                            href="https://play.google.com/store/apps/details?id=vn.oni.pos"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:opacity-85 transition-opacity"
                          >
                            <img
                              src="/partners/google-play.svg"
                              alt="Google Play"
                              className="h-6 w-auto"
                            />
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Item 5: Zalo Community Support (New) */}
                    <div className="flex gap-3 p-3.5 rounded-2xl border border-slate-100 bg-white">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-150 text-blue-600 bg-blue-50/50 font-semibold shadow-xs">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </span>
                      <div className="space-y-0.5 flex-1">
                        <h4 className="text-xs font-bold text-slate-800">Tham gia Cộng đồng Hỗ trợ Zalo</h4>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Nhận tài liệu hướng dẫn, giải đáp thắc mắc và hỗ trợ kỹ thuật trực tiếp 24/7 từ đội ngũ ONI.
                        </p>
                        <a
                          href="https://zalo.me/g/owlxjd9bqfhocunnrjos"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 hover:underline mt-1"
                        >
                          <span>Vào nhóm Zalo hỗ trợ</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 space-y-2.5 max-w-xs mx-auto">
                    <Link
                      href={`${homePath === '/' ? '' : homePath}/channels/pos`}
                      className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary-dark text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition-all text-center cursor-pointer active:scale-95"
                    >
                      <span>Bán hàng ngay tại quầy (POS)</span>
                      <span>→</span>
                    </Link>

                    <button
                      onClick={() => {
                        setOnboardModalOpen(false);
                        localStorage.setItem(`oni_onboard_dismissed_${shop.id}`, 'true');
                      }}
                      className="block text-center w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer active:scale-95"
                    >
                      Hoàn thành & Đóng hướng dẫn
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {onboardStep < 3 && (
              <div className="shrink-0 p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full transition-all ${onboardStep === 1 ? 'bg-primary w-3' : 'bg-slate-300'}`} />
                  <span className={`h-1.5 w-1.5 rounded-full transition-all ${onboardStep === 2 ? 'bg-primary w-3' : 'bg-slate-300'}`} />
                </div>

                <div className="flex items-center gap-2">
                  {onboardStep === 1 ? (
                    <button
                      onClick={() => setOnboardStep(2)}
                      className="bg-primary hover:bg-primary-dark text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-sm transition-all cursor-pointer active:scale-95"
                    >
                      Tiếp tục →
                    </button>
                  ) : (
                    <button
                      onClick={() => setOnboardStep(1)}
                      disabled={seedingLoading}
                      className="text-slate-600 hover:text-slate-900 font-semibold text-xs py-2 px-3 disabled:opacity-50 transition-all cursor-pointer active:scale-95"
                    >
                      ← Quay lại
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Setup Connector Dialog Modal ────────────────────────────────────── */}
      {showModal && (
        <SetupModal
          tenantId={shop.tenantId}
          onConnected={handleConnectedSuccess}
          onClose={() => setShowModal(false)}
          returnTo={homePath}
        />
      )}
    </div>
  );
}
