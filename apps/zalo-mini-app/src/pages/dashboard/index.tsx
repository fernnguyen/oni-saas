import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useTenantStore } from '@/stores/tenant-store';
import { getReportsOverview, type ReportOverview, getQrOrders } from '@/services/shop-api';
import { formatCurrency, formatCompactNumber } from '@/utils/format';

// ────────────────────────────── Quick Actions Config ──────────────────────────────

const QUICK_ACTIONS = [
  {
    label: 'Gọi món QR',
    path: '/qr-orders',
    color: '#ef4444',
    bg: '#fef2f2',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Sổ quỹ',
    path: '/cashbook',
    color: '#16a34a',
    bg: '#f0fdf4',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    label: 'Sản phẩm',
    path: '/products',
    color: '#3b82f6',
    bg: '#eff6ff',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    label: 'Khách hàng',
    path: '/customers',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

// ────────────────────────────── Helpers ──────────────────────────────

function GrowthBadge({ value }: { value: number | undefined }) {
  if (value === undefined || value === null) return null;

  const isPositive = value >= 0;
  const arrow = isPositive ? '↑' : '↓';
  const cls = isPositive ? 'positive' : 'negative';

  return (
    <span className={`kpi-change ${cls}`}>
      {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function SkeletonBlock({ width, height }: { width: string; height: string }) {
  return <div className="skeleton" style={{ width, height }} />;
}

// ────────────────────────────── KPI Skeleton ──────────────────────────────

function KpiSkeleton() {
  return (
    <div className="kpi-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="kpi-card" key={i}>
          <SkeletonBlock width="60%" height="14px" />
          <div style={{ marginTop: 8 }}>
            <SkeletonBlock width="80%" height="22px" />
          </div>
          <div style={{ marginTop: 6 }}>
            <SkeletonBlock width="40%" height="12px" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────── Top Products Skeleton ──────────────────────────────

function TopProductsSkeleton() {
  return (
    <div style={{ padding: '0 12px 12px' }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
          <SkeletonBlock width="32px" height="32px" />
          <div style={{ flex: 1 }}>
            <SkeletonBlock width="70%" height="14px" />
            <div style={{ marginTop: 4 }}>
              <SkeletonBlock width="50%" height="12px" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────── Main Component ──────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const shop = useTenantStore((s) => s.shop);

  const [data, setData] = useState<ReportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrOrdersCount, setQrOrdersCount] = useState(0);

  const userName = profile?.full_name || profile?.email || 'Người dùng';

  // Compute KPI values from nested or flat API structures
  const todayRevenue = data?.kpi?.today?.revenue ?? data?.todayRevenue ?? 0;
  const monthRevenue = data?.kpi?.month?.revenue ?? data?.monthRevenue ?? 0;
  const todayOrders = data?.kpi?.today?.orders ?? data?.todayOrders ?? 0;
  const monthOrders = data?.kpi?.month?.orders ?? data?.monthOrders ?? 0;
  const aov = data?.aov ?? (monthOrders > 0 ? monthRevenue / monthOrders : 0);
  const refundRevenue = data?.kpi?.returns?.refund ?? data?.refundRevenue ?? 0;
  const refundCount = data?.kpi?.returns?.count ?? data?.refundCount ?? 0;

  const fetchData = useCallback(async () => {
    if (!shop?.id) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getReportsOverview(shop.id);
      setData(result);

      // Fetch pending QR orders count
      const pendingQRs = await getQrOrders(shop.id, { status: 'pending' });
      setQrOrdersCount(Array.isArray(pendingQRs) ? pendingQRs.length : 0);
    } catch (err: any) {
      console.error('[Dashboard] fetch error:', err);
      setError(err?.message || 'Không thể tải dữ liệu báo cáo');
    } finally {
      setLoading(false);
    }
  }, [shop?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Render ──

  return (
    <div style={{ minHeight: '100%', background: 'var(--background, #f8fafc)', paddingBottom: 16 }}>

      {/* ══════ Welcome Header ══════ */}
      <div style={{ padding: '16px 12px 8px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
          Xin chào, {userName}
        </h2>
      </div>

      {/* ══════ KPI Cards ══════ */}
      {loading ? (
        <KpiSkeleton />
      ) : error ? (
        <div style={{ padding: '20px 12px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</p>
          <button
            onClick={fetchData}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1.5px solid var(--border, #e2e8f0)',
              background: 'white',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div className="kpi-grid">
          {/* Doanh thu hôm nay */}
          <div className="kpi-card">
            <p className="kpi-label">Doanh thu hôm nay</p>
            <p className="kpi-value">{formatCompactNumber(todayRevenue)}</p>
            <GrowthBadge value={data?.todayGrowth} />
          </div>

          {/* Doanh thu tháng */}
          <div className="kpi-card">
            <p className="kpi-label">Doanh thu tháng</p>
            <p className="kpi-value">{formatCompactNumber(monthRevenue)}</p>
            <GrowthBadge value={data?.monthGrowth} />
          </div>

          {/* Giá trị TB (AOV) */}
          <div className="kpi-card">
            <p className="kpi-label">Giá trị TB</p>
            <p className="kpi-value">{formatCurrency(aov)}</p>
            <span className="kpi-change" style={{ color: '#64748b' }}>
              {todayOrders} đơn hôm nay
            </span>
          </div>

          {/* Trả hàng */}
          <div className="kpi-card">
            <p className="kpi-label">Trả hàng</p>
            <p className="kpi-value">{formatCurrency(refundRevenue)}</p>
            <span className="kpi-change" style={{ color: '#64748b' }}>
              {refundCount} phiếu trả
            </span>
          </div>
        </div>
      )}

      {/* ══════ Quick Actions ══════ */}
      <div style={{ padding: '4px 0 0' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', padding: '0 12px', marginBottom: 8 }}>
          Truy cập nhanh
        </h3>
        <div className="quick-actions relative">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.path}
              className="quick-action relative"
              onClick={() => navigate(action.path)}
            >
              {action.path === '/qr-orders' && qrOrdersCount > 0 && (
                <div className="absolute top-0 right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full z-10 animate-bounce">
                  {qrOrdersCount}
                </div>
              )}
              <div
                className="quick-action-icon"
                style={{ background: action.bg, color: action.color }}
              >
                {action.icon}
              </div>
              <span className="quick-action-label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════ Top Selling Products ══════ */}
      <div style={{ padding: '4px 0 0' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', padding: '0 12px', marginBottom: 8 }}>
          Top sản phẩm bán chạy
        </h3>

        {loading ? (
          <TopProductsSkeleton />
        ) : !data?.topProducts || data.topProducts.length === 0 ? (
          <div className="dashboard-card" style={{ margin: '0 12px', textAlign: 'center', padding: '24px 16px' }}>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>Chưa có dữ liệu sản phẩm</p>
          </div>
        ) : (
          <div className="dashboard-card" style={{ margin: '0 12px', padding: 0, overflow: 'hidden' }}>
            {data.topProducts.map((product, index) => (
              <div
                key={`${product.name}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderBottom: index < data.topProducts!.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}
              >
                {/* Rank badge */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: index === 0 ? '#fef3c7' : index === 1 ? '#f1f5f9' : index === 2 ? '#fde9d9' : '#f8fafc',
                    color: index === 0 ? '#b45309' : index === 1 ? '#475569' : index === 2 ? '#c2410c' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </div>

                {/* Product info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--foreground)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {product.name}
                  </p>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                    SL: {product.quantity ?? product.qty ?? 0}
                  </p>
                </div>

                {/* Revenue */}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', flexShrink: 0 }}>
                  {formatCompactNumber(product.revenue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
