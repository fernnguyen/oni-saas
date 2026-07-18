import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useTenantStore } from '@/stores/tenant-store';
import { getReportsOverview, type ReportOverview, getQrOrders } from '@/services/shop-api';
import { formatCurrency, formatCompactNumber } from '@/utils/format';
import { useNotificationStore } from '@/stores/notification-store';
import { apiFetch } from '@/services/api';
import { createShortcut, scanQRCode } from 'zmp-sdk';
import { getAccessToken } from 'zmp-sdk/apis';
import toast from 'react-hot-toast';

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

const SHORTCUT_PROMPT_KEY_PREFIX = 'oni-shortcut-prompt-dismissed';

type PendingQrLogin = {
  token: string;
  requestedHost: string;
  requestedTenantSlug: string | null;
};

function parseQrLoginContent(content: string): PendingQrLogin | null {
  try {
    const parsed = new URL(content);
    const isSupportedScheme = parsed.protocol === 'oni:' || parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isQrLoginPath = parsed.pathname === '/qr-login' || parsed.pathname === '/auth/qr-login';
    if (!isSupportedScheme || !isQrLoginPath) {
      return null;
    }

    const token = parsed.searchParams.get('token');
    if (!token) {
      return null;
    }

    return {
      token,
      requestedHost: parsed.searchParams.get('origin') || 'thiết bị web',
      requestedTenantSlug: parsed.searchParams.get('tenant_slug'),
    };
  } catch {
    return null;
  }
}

function QrLoginIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="5" y="5" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="15" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="17" y="5" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="3" y="15" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="5" y="17" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="14.5" y="14.5" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="18" y="14.5" width="2.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.9" />
      <rect x="14.5" y="18" width="2.5" height="2.5" rx="0.5" fill="currentColor" opacity="0.9" />
      <rect x="18" y="18" width="2.5" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="11" y="11" width="1.75" height="1.75" rx="0.45" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

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
  const tenant = useTenantStore((s) => s.tenant);
  const shop = useTenantStore((s) => s.shop);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const [data, setData] = useState<ReportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrOrdersCount, setQrOrdersCount] = useState(0);
  const [showShortcutPrompt, setShowShortcutPrompt] = useState(false);
  const [shortcutLoading, setShortcutLoading] = useState(false);
  const [pendingQrLogin, setPendingQrLogin] = useState<PendingQrLogin | null>(null);
  const [qrLoginSubmitting, setQrLoginSubmitting] = useState(false);

  const userName = profile?.full_name || profile?.email || 'Người dùng';
  const shortcutPromptStorageKey =
    profile?.id && shop?.id ? `${SHORTCUT_PROMPT_KEY_PREFIX}:${profile.id}:${shop.id}` : null;

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

  useEffect(() => {
    if (!shortcutPromptStorageKey) return;

    const wasDismissed = localStorage.getItem(shortcutPromptStorageKey);
    setShowShortcutPrompt(!wasDismissed);
  }, [shortcutPromptStorageKey]);

  const dismissShortcutPrompt = useCallback(() => {
    if (shortcutPromptStorageKey) {
      localStorage.setItem(shortcutPromptStorageKey, '1');
    }
    setShowShortcutPrompt(false);
  }, [shortcutPromptStorageKey]);

  const handleCreateShortcut = useCallback(async () => {
    setShortcutLoading(true);
    try {
      await createShortcut({
        params: {
          utm_source: 'shortcut',
          utm_medium: 'zalo_home_prompt',
        },
      });

      toast.success('Đã gửi yêu cầu thêm ứng dụng ra màn hình chính');
      dismissShortcutPrompt();
    } catch (err: any) {
      const message = typeof err?.message === 'string' && err.message.trim()
        ? err.message
        : 'Không thể tạo lối tắt lúc này. Vui lòng thử lại trong Zalo.';
      toast.error(message);
    } finally {
      setShortcutLoading(false);
    }
  }, [dismissShortcutPrompt]);

  const handleScanQrLogin = useCallback(async () => {
    try {
      const { content } = await scanQRCode({});
      if (!content) return;

      const parsed = parseQrLoginContent(content);
      if (!parsed) {
        toast.error('Mã QR này không phải mã đăng nhập ONI hợp lệ');
        return;
      }

      setPendingQrLogin(parsed);
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
      if (message.includes('cancel')) return;
      toast.error(err?.message || 'Không thể quét mã QR lúc này');
    }
  }, []);

  const handleConfirmQrLogin = useCallback(async () => {
    if (!pendingQrLogin) return;

    setQrLoginSubmitting(true);
    try {
      const accessToken = await new Promise<string>((resolve, reject) => {
        getAccessToken({
          success: (token) => resolve(token as string),
          fail: (error) => reject(error),
        });
      });

      const result = await apiFetch<{ ok: boolean; requestedHost?: string }>('/api/auth/qr-login/confirm', {
        method: 'POST',
        body: JSON.stringify({
          token: pendingQrLogin.token,
          accessToken,
        }),
      });

      toast.success(`Đã xác nhận đăng nhập cho ${result.requestedHost || pendingQrLogin.requestedHost}`);
      setPendingQrLogin(null);
    } catch (err: any) {
      toast.error(err?.message || 'Không thể xác nhận đăng nhập web');
    } finally {
      setQrLoginSubmitting(false);
    }
  }, [pendingQrLogin]);

  const hasTenantMismatch =
    !!pendingQrLogin?.requestedTenantSlug &&
    !!tenant?.slug &&
    pendingQrLogin.requestedTenantSlug !== tenant.slug;

  // ── Render ──

  return (
    <div style={{ minHeight: '100%', background: 'var(--background, #f8fafc)', paddingBottom: 16 }}>

      {/* ══════ Welcome Header ══════ */}
      <div style={{ padding: '16px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
          Xin chào, {userName}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleScanQrLogin}
            style={{
              padding: 8,
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: 12,
              cursor: 'pointer',
              color: '#047857',
            }}
            aria-label="Quét mã QR đăng nhập"
          >
            <QrLoginIcon size={22} />
          </button>

          <button 
            onClick={() => navigate('/notifications')}
            style={{ position: 'relative', padding: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute', top: 4, right: 6, width: 10, height: 10,
                background: '#ef4444', borderRadius: '50%', border: '2px solid var(--background, #f8fafc)'
              }} />
            )}
          </button>
        </div>
      </div>

      {showShortcutPrompt && (
        <div className="shortcut-prompt-shell">
          <section className="shortcut-prompt-card">
            <div className="shortcut-prompt-orb shortcut-prompt-orb-top" />
            <div className="shortcut-prompt-orb shortcut-prompt-orb-bottom" />

            <div className="shortcut-prompt-header">
              <div>
                <span className="shortcut-prompt-badge">Truy cập nhanh</span>
                <h3 className="shortcut-prompt-title">Thêm ONI ra màn hình chính</h3>
              </div>
              <button
                type="button"
                className="shortcut-prompt-close"
                onClick={dismissShortcutPrompt}
                aria-label="Đóng gợi ý thêm vào trang chủ"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <p className="shortcut-prompt-copy">
              Tạo biểu tượng ngoài màn hình để mở ứng dụng chỉ với 1 chạm mỗi lần vào ca làm việc.
            </p>

            <div className="shortcut-prompt-preview">
              <div className="shortcut-preview-icon">
                <img src="/logo.png" alt="ONI shortcut" />
              </div>
              <div className="shortcut-preview-content">
                <strong>ONI Mini App</strong>
                <span>Mở nhanh từ màn hình chính Zalo của bạn</span>
              </div>
            </div>

            <div className="shortcut-prompt-actions">
              <button
                type="button"
                className="shortcut-primary-button"
                onClick={handleCreateShortcut}
                disabled={shortcutLoading}
              >
                {shortcutLoading ? 'Đang tạo lối tắt...' : 'Thêm vào trang chủ'}
              </button>
              <button
                type="button"
                className="shortcut-secondary-button"
                onClick={dismissShortcutPrompt}
                disabled={shortcutLoading}
              >
                Để sau
              </button>
            </div>
          </section>
        </div>
      )}

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

      {pendingQrLogin && (
        <div className="modal-backdrop" style={{ zIndex: 1200, alignItems: 'center' }} onClick={() => !qrLoginSubmitting && setPendingQrLogin(null)}>
          <div className="modal-content modal-content-center" style={{ maxWidth: 360, padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>Xác nhận đăng nhập web</h3>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                  Bạn sắp đăng nhập cho <strong style={{ color: '#0f172a' }}>{pendingQrLogin.requestedHost}</strong> bằng tài khoản Mini App hiện tại.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !qrLoginSubmitting && setPendingQrLogin(null)}
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: '#94a3b8' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ marginTop: 16, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#dcfce7', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m8.5 12.5 2.3 2.3 4.7-5.1" />
                  </svg>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Đăng nhập nhanh bằng Zalo Mini App</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Chỉ xác nhận nếu chính bạn đang mở web cần đăng nhập.</p>
                </div>
              </div>
            </div>

            {hasTenantMismatch && (
              <div style={{ marginTop: 12, borderRadius: 14, background: '#fff7ed', border: '1px solid #fdba74', padding: 14 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Cảnh báo tenant khác nhau
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9a3412', lineHeight: 1.6 }}>
                  Mini App hiện đang làm việc với <strong>{tenant?.slug}</strong>, nhưng mã QR này yêu cầu đăng nhập vào <strong>{pendingQrLogin.requestedTenantSlug}</strong>.
                  Bạn vẫn có thể tiếp tục quét. Nếu tài khoản không thuộc tenant đó, web sẽ báo không có quyền truy cập sau khi đăng nhập.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setPendingQrLogin(null)}
                disabled={qrLoginSubmitting}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 12,
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  color: '#475569',
                  fontWeight: 700,
                  cursor: qrLoginSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmQrLogin}
                disabled={qrLoginSubmitting}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 12,
                  border: 'none',
                  background: '#16a34a',
                  color: 'white',
                  fontWeight: 700,
                  cursor: qrLoginSubmitting ? 'not-allowed' : 'pointer',
                  opacity: qrLoginSubmitting ? 0.7 : 1,
                }}
              >
                {qrLoginSubmitting ? 'Đang xác nhận...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
