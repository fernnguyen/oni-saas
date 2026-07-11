import { useState, useEffect, useCallback } from 'react';
import { useTenantStore } from '@/stores/tenant-store';
import { getQrOrders, updateQrOrder } from '@/services/shop-api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import toast from 'react-hot-toast';

type QrTab = 'pending' | 'confirmed' | 'all';

const TABS: { key: QrTab; label: string }[] = [
  { key: 'pending', label: 'Chờ xác nhận' },
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'all', label: 'Tất cả' },
];

export default function QrOrdersPage() {
  const shopId = useTenantStore((s) => s.shop?.id);

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<QrTab>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeTab !== 'all') params.status = activeTab;
      const res = await getQrOrders(shopId, params);
      setOrders(Array.isArray(res) ? res : []);
    } catch {
      toast.error('Không thể tải đơn QR');
    } finally {
      setLoading(false);
    }
  }, [shopId, activeTab]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleAction = async (orderId: string, status: 'confirmed' | 'rejected') => {
    if (!shopId) return;
    setProcessingId(orderId);
    try {
      await updateQrOrder(shopId, orderId, { status });
      toast.success(status === 'confirmed' ? 'Đã xác nhận đơn' : 'Đã từ chối đơn');
      fetchOrders();
    } catch {
      toast.error('Thao tác thất bại');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="order-status pending">Chờ xác nhận</span>;
      case 'confirmed':
        return <span className="order-status completed">Đã xác nhận</span>;
      case 'rejected':
        return <span className="order-status cancelled">Đã từ chối</span>;
      default:
        return <span className="order-status">{status}</span>;
    }
  };

  return (
    <div className="min-h-full bg-background pb-8">
      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map((tab) => (
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
      {loading ? (
        <div className="px-4 space-y-3 mt-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-state mt-8">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M7 7h.01M7 12h.01M7 17h.01M12 7h5M12 12h5M12 17h5" />
            </svg>
          </div>
          <p className="empty-state-title">Không có đơn QR</p>
          <p className="empty-state-desc">
            {activeTab === 'pending'
              ? 'Chưa có đơn hàng QR nào chờ xác nhận'
              : 'Không có đơn hàng QR nào'}
          </p>
        </div>
      ) : (
        <div className="px-4 mt-3 space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="qr-order-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">
                  {order.order_number || `QR-${(order.id || '').slice(-6)}`}
                </p>
                {getStatusBadge(order.status)}
              </div>

              {/* Order details */}
              <div className="space-y-1 mb-3">
                {order.customer_name && (
                  <p className="text-2xs text-subtitle">
                    👤 {order.customer_name}
                    {order.customer_phone ? ` • ${order.customer_phone}` : ''}
                  </p>
                )}
                {order.table_name && (
                  <p className="text-2xs text-subtitle">📍 {order.table_name}</p>
                )}
                <p className="text-2xs text-subtitle">
                  🕐 {formatDateTime(order.created_at)}
                </p>
              </div>

              {/* Items preview */}
              {order.items && order.items.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-[#f8fafc]">
                  {order.items.slice(0, 3).map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-2xs py-0.5">
                      <span className="text-foreground truncate flex-1">
                        {item.product_name || item.name}
                        <span className="text-subtitle"> x{item.quantity}</span>
                      </span>
                      <span className="text-foreground font-medium ml-2">
                        {formatCurrency(item.total_price || item.unit_price * item.quantity)}
                      </span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <p className="text-3xs text-subtitle mt-1">
                      +{order.items.length - 3} sản phẩm khác
                    </p>
                  )}
                </div>
              )}

              {/* Total + Actions */}
              <div className="flex items-center justify-between">
                <p className="text-base font-bold text-foreground">
                  {formatCurrency(order.total_amount || order.final_amount || 0)}
                </p>

                {order.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      className="qr-action-btn qr-action-reject"
                      disabled={processingId === order.id}
                      onClick={() => handleAction(order.id, 'rejected')}
                    >
                      Từ chối
                    </button>
                    <button
                      className="qr-action-btn qr-action-confirm"
                      disabled={processingId === order.id}
                      onClick={() => handleAction(order.id, 'confirmed')}
                    >
                      {processingId === order.id ? '...' : 'Xác nhận'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
