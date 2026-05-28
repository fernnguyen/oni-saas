'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SetupModal } from '../../components/connectors/SetupModal';

interface Props {
  shop: { id: string; tenantId: string; name: string; slug: string };
  connectorStatus: string | null;
  connectorId: string | null;
  homePath: string;
}

// ── Types for Reporting ──────────────────────────────────────────────────────
interface KpiPeriod   { orders: number; revenue: number }
interface RevenueDay  { date: string; revenue: number }
interface TopProduct  { id: string; name: string; revenue: number; qty: number }
interface OverviewData {
  kpi: { today: KpiPeriod; month: KpiPeriod; returns: { count: number; refund: number } }
  revenueSeries: RevenueDay[]
  topProducts: TopProduct[]
  statusBreakdown: Record<string, number>
  paymentRevenue: Record<string, number>
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
  const now = new Date();
  const series: RevenueDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dayOfWeek = d.getDay();
    // Weekends have 1.6x sales, upward monthly trend
    const base = 2500000 + (30 - i) * 70000;
    const factor = dayOfWeek === 0 || dayOfWeek === 6 ? 1.6 : 1.0;
    const noise = 0.85 + Math.random() * 0.3;
    series.push({
      date: d.toISOString().slice(0, 10),
      revenue: Math.round(base * factor * noise),
    });
  }

  return {
    kpi: {
      today: { orders: 18, revenue: 5420000 },
      month: { orders: 412, revenue: 124850000 },
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
  };
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Hoàn thành',
  processing: 'Đang xử lý',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã hủy',
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
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month'>('month');

  const errorParam = searchParams.get('error');
  const successParam = searchParams.get('success');

  // Trigger demo mode automatically if there's no data source connected
  useEffect(() => {
    if (!connected) {
      setDemoMode(true);
    } else {
      setDemoMode(false);
    }
  }, [connected]);

  // Fetch real data via React Query when connected and demo mode is off
  const { data: realData, isLoading, error: apiError } = useQuery<OverviewData>({
    queryKey: ['reports-overview', shop.id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shop.id}/reports/overview`);
      if (!res.ok) throw new Error('Không thể lấy dữ liệu tổng quan');
      return res.json();
    },
    enabled: connected && !demoMode,
    staleTime: 120_000,
  });

  const mockData = generateMockData();
  const activeData = demoMode ? mockData : realData;

  // Render loading state if loading active real data
  const isDataLoading = isLoading && connected && !demoMode;

  // Process data based on active period filter
  const displayKpi = activeData?.kpi;
  let chartSeries = activeData?.revenueSeries ?? [];

  if (activeData) {
    if (timeFilter === 'today') {
      chartSeries = chartSeries.slice(-1);
    } else if (timeFilter === 'week') {
      chartSeries = chartSeries.slice(-7);
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white rounded-3xl border border-slate-100 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
            {getGreeting()}
          </span>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight mt-0.5">{shop.name}</h1>
          <p className="mt-1 text-xs text-slate-400 font-mono tracking-wide">{shop.slug}.oni.vn</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Connector status pill */}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
            connected
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-amber-50 text-amber-700 border border-amber-100'
          }`}>
            <span className={`h-2 w-2 rounded-full animate-pulse ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {connected ? 'Dữ liệu trực tuyến' : 'Chưa kết nối dữ liệu'}
          </span>

          {/* Demo mode status pill */}
          {demoMode && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1.5 text-xs font-semibold">
              Chế độ Demo
            </span>
          )}

          {/* Configuration Action if not connected */}
          {!connected && (
            <button
              onClick={() => setShowModal(true)}
              className="rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-sm bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Cấu hình Sheet dữ liệu
            </button>
          )}

          {/* Demo toggle if not connected */}
          {!connected && (
            <button
              onClick={() => setDemoMode(!demoMode)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {demoMode ? 'Tắt bản thử' : 'Bật bản thử'}
            </button>
          )}
        </div>
      </div>

      {/* ── Banners & Status Notices ─────────────────────────────────────────── */}
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
                  <span className="text-xs font-semibold text-slate-400">Doanh thu hôm nay</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#FA5907]/10 text-[#FA5907]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">{fmtVND(displayKpi.today.revenue)}</p>
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
                  <span className="text-xs font-semibold text-slate-400">Doanh thu tháng này</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">{fmtVND(displayKpi.month.revenue)}</p>
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

          {/* 3. Splits layout for products and payment breakdown */}
          <div className="grid gap-6 md:grid-cols-2">
            
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
                          <span className="text-slate-600">{PAYMENT_LABELS[method] ?? method}</span>
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
            <a
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
            </a>
          ))}
        </section>
      </div>

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

