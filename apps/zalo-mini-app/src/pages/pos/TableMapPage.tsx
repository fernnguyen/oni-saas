/**
 * TableMapPage.tsx
 * Table/Room grid view for POS — the main table management screen.
 * Shows all location resources grouped by zone with status filters.
 * Handles: click to check-in, click occupied to manage session,
 *          click dirty to clean, housekeeping confirmation.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTableStore } from '@/stores/table-store';
import type { ResourceFull, TableSession } from '@/stores/table-store';
import { useTenantStore } from '@/stores/tenant-store';
import { usePosStore } from '@/stores/pos-store';
import {
  getLocationResources,
  getOrders,
  updateLocationResource,
  getShopSettings,
} from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import { calculateBilling, formatElapsed } from '@/utils/billing';
import TableCheckInModal from './TableCheckInModal';
import TableSessionModal from './TableSessionModal';

const CACHE_TTL = 30 * 1000; // 30 seconds

// Status config
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  available:   { label: 'Trống',      color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  occupied:    { label: 'Đang dùng',  color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  checking_out:{ label: 'Chờ kiểm',  color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  dirty:       { label: 'Chờ dọn',   color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  cleaning:    { label: 'Đang dọn',  color: '#b45309', bg: '#fefce8', border: '#fde047' },
  inspected:   { label: 'Đã nghiệm', color: '#0891b2', bg: '#ecfeff', border: '#67e8f9' },
  reserved:    { label: 'Đã đặt',    color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  maintenance: { label: 'Tạm ngừng', color: '#64748b', bg: '#f8fafc', border: '#cbd5e1' },
};

interface TableCardProps {
  table: ResourceFull;
  session?: TableSession;
  onClick: () => void;
}

function TableCard({ table, session, onClick }: TableCardProps) {
  const [tick, setTick] = useState(0);
  const tableCarts = useTableStore((s) => s.tableCarts);
  const tableCustomers = useTableStore((s) => s.tableCustomers);

  useEffect(() => {
    if (table.status !== 'occupied' || !session?.rentalType || session.rentalType !== 'hourly') return;
    const interval = setInterval(() => setTick((t) => t + 1), 30000); // update every 30s
    return () => clearInterval(interval);
  }, [table.status, session]);

  const billing = useMemo(() => {
    if (table.status !== 'occupied' || !session?.checkInTime) return null;
    try {
      return calculateBilling({
        rentalType: session.rentalType,
        checkInISO: session.checkInTime,
        hourlyRate: session.hourlyRate ?? table.hourly_rate ?? 0,
        dailyRate: session.dailyRate ?? table.daily_rate ?? 0,
        overnightRate: session.overnightRate ?? table.overnight_rate ?? 0,
        advancedPricing: session.advancedPricing,
      });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, session, tick]);

  const isActive = table.status === 'occupied';
  const isDirty = table.status === 'dirty' || table.status === 'cleaning';

  const stripeColor = isActive ? '#f43f5e' : isDirty ? '#f59e0b' : '#10b981';
  const cardBg = isActive ? '#fff1f2' : isDirty ? '#fffbeb' : '#ffffff';
  const cardBorder = isActive ? '#fda4af' : isDirty ? '#fde68a' : '#e2e8f0';

  return (
    <button
      onClick={onClick}
      style={{
        background: cardBg,
        border: `1.5px solid ${cardBorder}`,
        borderRadius: 16,
        padding: '16px 12px 12px',
        textAlign: 'left',
        cursor: 'pointer',
        position: 'relative',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        boxShadow: '0 1.5px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        animation: table.status === 'checking_out' ? 'pulse 2s infinite' : undefined,
      }}
    >
      {/* Top Stripe */}
      <div style={{ height: 4, width: '100%', backgroundColor: stripeColor, position: 'absolute', top: 0, left: 0, right: 0 }} />

      {/* Info */}
      <div style={{ width: '100%' }}>
        <p style={{
          fontWeight: 700, fontSize: 13, color: '#1e293b',
          margin: '0 0 6px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {table.name}
        </p>

        {/* Capacity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>
            {table.capacity || '4'} người
          </span>
        </div>

        {/* Rate */}
        {table.hourly_rate ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>
              {formatCurrency(table.hourly_rate)}/h
            </span>
          </div>
        ) : null}

        {/* Billing details if active */}
        {isActive && billing && (
          <div style={{
            background: '#fff1f2', border: '1px solid #ffe4e6',
            borderRadius: 8, padding: '6px 8px', marginBottom: 8,
          }}>
            <p style={{ fontSize: 9, color: '#e11d48', fontWeight: 700, margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Dùng: {billing.label}
            </p>
            <p style={{ fontSize: 11, color: '#e11d48', fontWeight: 800, margin: 0 }}>
              Tiền giờ: {formatCurrency(billing.cost)}
            </p>
            {(() => {
              const cart = tableCarts[table.id] ?? {};
              const count = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
              if (count > 0) {
                return (
                  <p style={{
                    fontSize: 9, color: '#475569', fontWeight: 600,
                    marginTop: 4, paddingTop: 4, borderTop: '1px dashed rgba(225,29,72,0.15)',
                    display: 'flex', alignItems: 'center', gap: 3, margin: '4px 0 0'
                  }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5">
                      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                    </svg>
                    Đã gọi: {count} món
                  </p>
                );
              }
              return null;
            })()}
          </div>
        )}

        {/* Housekeeping details if dirty */}
        {isDirty && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fef3c7',
            borderRadius: 8, padding: '6px 8px', marginBottom: 8,
          }}>
            <p style={{ fontSize: 9, color: '#d97706', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Chờ dọn dẹp
            </p>
          </div>
        )}
      </div>

      {/* Bottom Button */}
      <div style={{
        width: '100%',
        padding: '6px 0',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        border: '1px solid',
        background: isActive ? '#ffeef0'
                  : isDirty ? '#fef3c7'
                  : '#f0fdf4',
        borderColor: isActive ? '#fda4af'
                  : isDirty ? '#fde68a'
                  : '#86efac',
        color: isActive ? '#e11d48'
                  : isDirty ? '#d97706'
                  : '#16a34a',
      }}>
        {isActive ? (
          tableCustomers[table.id]?.name || session?.customerName || 'Khách lẻ'
        ) : isDirty ? (
          'Đã dọn'
        ) : (
          'Trống'
        )}
      </div>
    </button>
  );
}

interface Props {
  onAddItems: () => void;     // called when user wants to add items to a table
}

export default function TableMapPage({ onAddItems }: Props) {
  const shop = useTenantStore((s) => s.shop);
  const shopId = shop?.id ?? '';

  const resources = useTableStore((s) => s.resources);
  const tableSessions = useTableStore((s) => s.tableSessions);
  const shopSettings = useTableStore((s) => s.shopSettings);
  const statusFilter = useTableStore((s) => s.statusFilter);
  const selectedZone = useTableStore((s) => s.selectedZone);
  const isLoading = useTableStore((s) => s.isLoading);
  const lastFetched = useTableStore((s) => s.lastFetched);
  const isCheckInModalOpen = useTableStore((s) => s.isCheckInModalOpen);
  const selectedTableForOpen = useTableStore((s) => s.selectedTableForOpen);
  const activeTable = useTableStore((s) => s.activeTable);
  const isSessionModalOpen = useTableStore((s) => s.isSessionModalOpen);
  const isCleanConfirmOpen = useTableStore((s) => s.isCleanConfirmOpen);
  const tableToClean = useTableStore((s) => s.tableToClean);
  const isTableCheckoutOpen = useTableStore((s) => s.isTableCheckoutOpen);
  const cartOwnerTableId = useTableStore((s) => s.cartOwnerTableId);
  const tableCarts = useTableStore((s) => s.tableCarts);
  const tableCustomers = useTableStore((s) => s.tableCustomers);

  const {
    setResources,
    setShopSettings,
    setStatusFilter,
    setSelectedZone,
    setIsLoading,
    setLastFetched,
    setIsCheckInModalOpen,
    setSelectedTableForOpen,
    setActiveTable,
    setIsSessionModalOpen,
    setIsCleanConfirmOpen,
    setTableToClean,
    setIsTableCheckoutOpen,
    setCartOwnerTableId,
    updateResource,
    setTableSession,
  } = useTableStore.getState();

  // ── Fetch data ──
  const fetchData = useCallback(async (force = false) => {
    if (!shopId) return;
    const now = Date.now();
    if (!force && lastFetched && now - lastFetched < CACHE_TTL) return;
    setIsLoading(true);
    try {
      const [resourceData, ordersData, settingsData] = await Promise.all([
        getLocationResources(shopId),
        getOrders(shopId, { status: 'in_progress', limit: '100' }),
        !shopSettings ? getShopSettings(shopId) : Promise.resolve(shopSettings),
      ]);

      const rawResources = resourceData as ResourceFull[];
      setResources(rawResources.filter((r) => (r as any).deleted_at == null));

      if (settingsData && !shopSettings) {
        setShopSettings(settingsData as any);
      }

      // Restore sessions from in_progress orders for resources that don't have local session
      const orders = ordersData.orders;
      for (const order of orders) {
        let meta: any = {};
        try { meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata as string) : (order.metadata ?? {}); } catch {}
        const tableId = meta.resource_id;
        if (tableId && !tableSessions[tableId]) {
          setTableSession(tableId, {
            tableId,
            orderId: order.id,
            rentalType: meta.rental_type ?? 'hourly',
            checkInTime: meta.check_in ?? order.created_at,
            numGuests: meta.num_guests ?? 1,
            customerId: order.customer_id,
            customerName: meta.customer_name ?? undefined,
            expectedCheckout: meta.expected_checkout,
          });
        }
      }

      setLastFetched(Date.now());
    } catch {
      toast.error('Không thể tải dữ liệu bàn/phòng');
    } finally {
      setIsLoading(false);
    }
  }, [shopId, lastFetched, shopSettings, tableSessions]);

  useEffect(() => { fetchData(); }, [shopId]);

  // ── Pull to refresh ──
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const el = e.currentTarget;
    if (el.scrollTop === 0) setPullStart(e.touches[0].clientY);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStart !== null) {
      const offset = e.touches[0].clientY - pullStart;
      if (offset > 0) setPullOffset(Math.min(offset * 0.4, 60));
    }
  };
  const handleTouchEnd = async () => {
    if (pullStart !== null && pullOffset >= 50) {
      setRefreshing(true);
      await fetchData(true);
      setRefreshing(false);
    }
    setPullStart(null);
    setPullOffset(0);
  };

  // ── Zones ──
  const zones = useMemo(() => {
    const map: Record<string, ResourceFull[]> = {};
    for (const r of resources) {
      const z = r.zone ?? 'Chưa phân vùng';
      if (!map[z]) map[z] = [];
      map[z].push(r);
    }
    return map;
  }, [resources]);

  const zoneNames = useMemo(() => Object.keys(zones).sort(), [zones]);

  // ── Filter ──
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      if (selectedZone && r.zone !== selectedZone) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'available') return r.status === 'available';
      if (statusFilter === 'occupied') return r.status === 'occupied' || r.status === 'checking_out';
      if (statusFilter === 'dirty') return r.status === 'dirty' || r.status === 'cleaning';
      if (statusFilter === 'cleaning') return r.status === 'cleaning';
      return true;
    });
  }, [resources, selectedZone, statusFilter]);

  // ── Stats ──
  const stats = useMemo(() => ({
    total: resources.length,
    available: resources.filter((r) => r.status === 'available').length,
    occupied: resources.filter((r) => r.status === 'occupied' || r.status === 'checking_out').length,
    dirty: resources.filter((r) => r.status === 'dirty' || r.status === 'cleaning').length,
  }), [resources]);

  // ── Handlers ──
  const handleTableClick = (table: ResourceFull) => {
    const status = table.status;
    if (status === 'dirty' || status === 'cleaning') {
      setTableToClean(table);
      setIsCleanConfirmOpen(true);
      return;
    }
    if (status === 'available' || status === 'reserved' || status === 'inspected') {
      setSelectedTableForOpen(table);
      setIsCheckInModalOpen(true);
      return;
    }
    if (status === 'occupied' || status === 'checking_out') {
      setActiveTable(table);
      setIsSessionModalOpen(true);
    }
  };

  const handleCleanConfirm = async () => {
    if (!tableToClean) return;
    try {
      await updateLocationResource(shopId, tableToClean.id, { status: 'available' });
      updateResource(tableToClean.id, { status: 'available' });
      toast.success(`${tableToClean.name} đã được dọn sạch`);
    } catch {
      toast.error('Không thể cập nhật trạng thái');
    } finally {
      setIsCleanConfirmOpen(false);
      setTableToClean(null);
    }
  };

  const handleCheckInSuccess = (session: TableSession) => {
    setIsCheckInModalOpen(false);
    setSelectedTableForOpen(null);
    // Open session modal immediately
    if (selectedTableForOpen) {
      setActiveTable(selectedTableForOpen);
      setIsSessionModalOpen(true);
    }
  };

  const handleSessionAddItems = () => {
    if (!activeTable) return;
    usePosStore.getState().clearCart();
    setCartOwnerTableId(activeTable.id);
    setIsSessionModalOpen(false);
    onAddItems();
  };

  const handleSessionCheckout = () => {
    if (!activeTable) return;
    const session = tableSessions[activeTable.id];
    if (!session) return;

    // Set the table owner ID in table-store
    setCartOwnerTableId(activeTable.id);

    // Construct cart items for POS store
    const tableCart = tableCarts[activeTable.id] ?? {};
    const newCartItems: any[] = [];

    // Add all table cart items
    Object.values(tableCart).forEach((item) => {
      newCartItems.push({
        product: {
          id: item.productId,
          name: item.name,
          sell_price: item.price,
        },
        quantity: item.quantity,
        unit_price: item.price,
      });
    });

    // Add TIME_CHARGE item if cost > 0
    const billing = calculateBilling({
      rentalType: session.rentalType,
      checkInISO: session.checkInTime,
      hourlyRate: session.hourlyRate ?? activeTable.hourly_rate ?? 0,
      dailyRate: session.dailyRate ?? activeTable.daily_rate ?? 0,
      overnightRate: session.overnightRate ?? activeTable.overnight_rate ?? 0,
      advancedPricing: session.advancedPricing,
    });

    if (billing && billing.cost > 0) {
      const billingName = activeTable.type === 'room'
        ? `Tiền phòng - ${activeTable.name} (${billing.label})`
        : `Tiền giờ - ${activeTable.name} (${billing.label})`;
      newCartItems.push({
        product: {
          id: 'TIME_CHARGE',
          name: billingName,
          sell_price: billing.unitPrice,
        },
        quantity: billing.qty,
        unit_price: billing.unitPrice,
      });
    }

    // Set selected customer in POS store
    const customer = tableCustomers[activeTable.id] || null;
    usePosStore.getState().setSelectedCustomer(customer);

    // Populate the main cart and open checkout modal
    usePosStore.setState({ cart: newCartItems });
    usePosStore.getState().setIsCheckoutOpen(true);

    // Close active table modal and trigger checkout modal
    setIsSessionModalOpen(false);
    setIsTableCheckoutOpen(true);
  };

  const handleSessionEnd = () => {
    setIsSessionModalOpen(false);
    setActiveTable(null);
    fetchData(true);
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: '1.5px solid',
    borderColor: active ? 'var(--primary, #3b82f6)' : '#e2e8f0',
    background: active ? 'var(--primary, #3b82f6)' : '#fff',
    color: active ? '#fff' : '#64748b',
    whiteSpace: 'nowrap', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  });

  const filterOptions = [
    { value: 'all', label: `Tất cả (${stats.total})`, dotColor: null },
    { value: 'available', label: `Trống (${stats.available})`, dotColor: '#10b981' },
    { value: 'occupied', label: `Đang dùng (${stats.occupied})`, dotColor: '#f43f5e' },
    { value: 'dirty', label: `Chờ dọn (${stats.dirty})`, dotColor: '#f59e0b' },
  ];

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      <div style={{
        height: refreshing ? 48 : `${pullOffset}px`,
        overflow: 'hidden', transition: 'height 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b' }}>
          <div style={{
            width: 14, height: 14, border: '2px solid var(--primary, #3b82f6)',
            borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          {refreshing ? 'Đang làm mới...' : 'Kéo để làm mới'}
        </div>
      </div>

      {/* Filter Row with Sync Button */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid #f1f5f9', background: '#fff',
        flexShrink: 0, gap: 12
      }}>
        {/* Status filter chips */}
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', flex: 1,
          scrollbarWidth: 'none',
        }} className="scrollbar-none">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value as any)}
              style={chipStyle(statusFilter === opt.value)}
            >
              {opt.dotColor && (
                <span style={{
                  display: 'inline-block',
                  width: 8, height: 8, borderRadius: '50%',
                  backgroundColor: opt.dotColor, marginRight: 6,
                }} />
              )}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sync button */}
        <button
          onClick={() => fetchData(true)}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '1.5px solid #e2e8f0', background: '#f8fafc',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer'
          }}
          title="Đồng bộ lại"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>
      </div>

      {/* Zone filter chips */}
      {zoneNames.length > 1 && (
        <div style={{
          display: 'flex', gap: 8, padding: '4px 16px 10px',
          overflowX: 'auto', flexShrink: 0, background: '#fff',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <button onClick={() => setSelectedZone(null)} style={chipStyle(!selectedZone)}>
            Tất cả khu
          </button>
          {zoneNames.map((z) => (
            <button key={z} onClick={() => setSelectedZone(z)} style={chipStyle(selectedZone === z)}>
              {z}
            </button>
          ))}
        </div>
      )}

      {/* Grid body */}
      <div style={{ flex: 1, padding: '12px 16px 32px', overflowY: 'auto' }}>
        {isLoading ? (
          <>
            <style>{`
              @keyframes shimmer-glow {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
              }
            `}</style>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 100,
                    borderRadius: 14,
                    background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer-glow 1.6s infinite linear',
                    border: '1px solid #e2e8f0',
                  }}
                />
              ))}
            </div>
          </>
        ) : filteredResources.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" style={{ margin: '0 auto 8px' }}>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Không có bàn/phòng nào</p>
            <p style={{ fontSize: 13, margin: '4px 0 0' }}>Thử thay đổi bộ lọc</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {filteredResources.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                session={tableSessions[table.id]}
                onClick={() => handleTableClick(table)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}

      {/* Check-in modal */}
      {isCheckInModalOpen && selectedTableForOpen && (
        <TableCheckInModal
          table={selectedTableForOpen}
          onClose={() => { setIsCheckInModalOpen(false); setSelectedTableForOpen(null); }}
          onSuccess={handleCheckInSuccess}
        />
      )}

      {/* Session modal */}
      {isSessionModalOpen && activeTable && tableSessions[activeTable.id] && (
        <TableSessionModal
          table={activeTable}
          session={tableSessions[activeTable.id]}
          onClose={() => { setIsSessionModalOpen(false); setActiveTable(null); }}
          onCheckout={handleSessionCheckout}
          onAddItems={handleSessionAddItems}
          onSessionEnd={handleSessionEnd}
        />
      )}

      {/* Clean confirm */}
      {isCleanConfirmOpen && tableToClean && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => { setIsCleanConfirmOpen(false); setTableToClean(null); }}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, padding: '20px 20px 16px',
              maxWidth: 320, width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" style={{ marginBottom: 8 }}>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <p style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', margin: '0 0 6px' }}>
              Đánh dấu đã dọn xong?
            </p>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              {tableToClean.name} sẽ được chuyển về trạng thái <strong>Trống (Sạch)</strong>.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setIsCleanConfirmOpen(false); setTableToClean(null); }}
                style={{
                  flex: 1, height: 42, borderRadius: 10,
                  border: '1.5px solid #e2e8f0', background: '#f8fafc',
                  fontSize: 13, fontWeight: 600, color: '#64748b',
                }}
              >
                Hủy
              </button>
              <button
                onClick={handleCleanConfirm}
                style={{
                  flex: 1, height: 42, borderRadius: 10,
                  background: '#22c55e', border: 'none',
                  fontSize: 13, fontWeight: 700, color: '#fff',
                }}
              >
                Đã dọn xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
