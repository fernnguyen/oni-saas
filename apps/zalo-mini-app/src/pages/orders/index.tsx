import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrders, getReportsOverview, type Order } from '@/services/shop-api';
import { useTenantStore } from '@/stores/tenant-store';
import { formatCurrency, formatDateTime, cleanOrderNo, getPaymentMethodLabel } from '@/utils/format';

// ────────────────────────────── Constants ──────────────────────────────

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { key: '', label: 'Tất cả' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
  { key: 'returned', label: 'Trả hàng' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  returned: 'Trả hàng',
  pending: 'Chờ xử lý',
  shipping: 'Đang giao',
  processing: 'Đang xử lý',
};

function getStatusClass(status: string): string {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'returned') return 'returned';
  return 'pending';
}

// ────────────────────────────── Skeleton ──────────────────────────────

function OrderCardSkeleton() {
  return (
    <div className="order-card">
      <div className="flex justify-between items-start mb-2">
        <div className="skeleton" style={{ width: 100, height: 14 }} />
        <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 6 }} />
      </div>
      <div className="skeleton" style={{ width: 140, height: 13, marginBottom: 8 }} />
      <div className="flex justify-between items-center">
        <div className="skeleton" style={{ width: 90, height: 16 }} />
        <div className="skeleton" style={{ width: 110, height: 12 }} />
      </div>
    </div>
  );
}

// ────────────────────────────── Component ──────────────────────────────

export default function OrdersPage() {
  const navigate = useNavigate();
  const shop = useTenantStore((s) => s.shop);
  const shopId = shop?.id || '';

  // State
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('');
  const [revenue, setRevenue] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Fetch orders ──
  const fetchOrders = useCallback(
    async (reset = false) => {
      if (!shopId) return;

      const currentOffset = reset ? 0 : offsetRef.current;
      if (reset) {
        setLoading(true);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const params: Record<string, string> = {
          limit: String(PAGE_SIZE),
          offset: String(currentOffset),
        };
        if (activeTab) params.status = activeTab;
        if (search.trim()) params.search = search.trim();

        const data = await getOrders(shopId, params);
        const fetched = data.orders || [];
        const fetchedTotal = data.total ?? 0;

        if (reset) {
          setOrders(fetched);
          offsetRef.current = fetched.length;
        } else {
          setOrders((prev) => [...prev, ...fetched]);
          offsetRef.current += fetched.length;
        }
        setTotal(fetchedTotal);
        setHasMore(offsetRef.current < fetchedTotal);
      } catch (err) {
        console.error('[OrdersPage] fetch error:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [shopId, activeTab, search],
  );

  // ── Fetch today's revenue from reports overview ──
  useEffect(() => {
    if (!shopId) return;

    getReportsOverview(shopId)
      .then((data) => {
        const todayRev = data?.kpi?.today?.revenue ?? data?.todayRevenue ?? 0;
        setRevenue(todayRev);
      })
      .catch(() => setRevenue(null));
  }, [shopId]);

  // ── Reload on tab/search change ──
  useEffect(() => {
    offsetRef.current = 0;
    fetchOrders(true);
  }, [fetchOrders]);

  // ── Debounced search ──
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      offsetRef.current = 0;
    }, 300);
  };

  // ── Lazy load on scroll ──
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchOrders(false);
    }
  };

  // ────────────────────────────── Render ──────────────────────────────

  return (
    <div className="min-h-full bg-background flex flex-col">
      {/* Search */}
      <div className="search-bar">
        <svg className="search-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Tìm đơn hàng, khách hàng..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {/* Revenue Summary */}
      <div className="px-3 pb-2">
        <div className="dashboard-card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xs text-subtitle">Doanh thu hôm nay</p>
            <p className="text-base font-bold text-foreground">
              {revenue !== null ? formatCurrency(revenue) : '--'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xs text-subtitle">Tổng đơn</p>
            <p className="text-sm font-semibold text-foreground">{total}</p>
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="tab-bar">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Order List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {loading ? (
          <>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <p className="empty-state-title">Không có đơn hàng</p>
            <p className="empty-state-desc">
              {search ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có đơn hàng nào trong mục này'}
            </p>
          </div>
        ) : (
          <>
            {orders.map((order) => {
              const payMethod = order.payment_method
                ? order.payment_method.split(',').map(m => getPaymentMethodLabel(m.trim())).join(', ')
                : '';

              return (
                <div
                  key={order.id}
                  className="order-card flex items-center justify-between gap-3"
                  onClick={() => navigate(`/orders/${order.id}`)}
                  style={{ padding: '12px 16px', background: 'white', borderBottom: '1px solid #f1f5f9' }}
                >
                  <div className="flex-1 min-w-0">
                    {/* Row 1: ID & Customer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span className="text-sm font-bold text-slate-800">
                        #{cleanOrderNo(order.order_number, order.id)}
                      </span>
                      <span className="text-sm text-slate-500 font-medium truncate">
                        - {order.customer_name || 'Khách lẻ'}
                      </span>
                    </div>

                    {/* Row 2: Price & Payment Method */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} className="text-3xs text-subtitle">
                      <span className="font-semibold text-slate-700 text-xs">
                        {formatCurrency(order.final_amount ?? order.total_amount)}
                      </span>
                      {payMethod && (
                        <>
                          <span style={{ color: '#cbd5e1' }}>·</span>
                          <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                            {payMethod}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right side: Status and Time Column, and Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="flex-shrink-0">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span className={`order-status ${getStatusClass(order.status)}`} style={{ margin: 0 }}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 500 }}>
                        {formatDateTime(order.created_at)}
                      </span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              );
            })}

            {/* Load more indicator */}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="skeleton" style={{ width: 120, height: 14 }} />
              </div>
            )}
            {!hasMore && orders.length > 0 && (
              <p className="text-center text-3xs text-subtitle py-4">
                Đã hiển thị tất cả đơn hàng
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
