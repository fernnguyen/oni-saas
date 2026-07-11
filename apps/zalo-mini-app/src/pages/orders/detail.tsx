import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getOrderDetail,
  getOrderItems,
  cancelOrder,
  getCashbook,
  getReturns,
  getReturnItems,
  createReturn,
  createReturnItems,
  processReturn,
  type Order,
  type OrderItem,
  type CashbookEntry,
} from '@/services/shop-api';
import { useTenantStore } from '@/stores/tenant-store';
import { formatCurrency, formatDateTime } from '@/utils/format';
import toast from 'react-hot-toast';

// ────────────────────────────── Status helpers ──────────────────────────────

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

// ────────────────────────────── Component ──────────────────────────────

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const shop = useTenantStore((s) => s.shop);
  const shopId = shop?.id || '';

  // Data state
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [cashbook, setCashbook] = useState<CashbookEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Return modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [selectedReturnItems, setSelectedReturnItems] = useState<
    Record<string, number>
  >({});
  const [returning, setReturning] = useState(false);

  // ── Fetch all data ──
  const fetchData = useCallback(async () => {
    if (!shopId || !orderId) return;
    setLoading(true);

    try {
      const [orderData, itemsData, cashbookData] = await Promise.all([
        getOrderDetail(shopId, orderId),
        getOrderItems(shopId, { order_id: orderId }),
        getCashbook(shopId, { reference_id: orderId, reference_type: 'order' }),
      ]);

      setOrder(orderData);
      setItems(Array.isArray(itemsData) ? itemsData : []);
      setCashbook(Array.isArray(cashbookData) ? cashbookData : []);
    } catch (err) {
      console.error('[OrderDetail] fetch error:', err);
      toast.error('Không thể tải chi tiết đơn hàng');
    } finally {
      setLoading(false);
    }
  }, [shopId, orderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Cancel order ──
  const handleCancel = async () => {
    if (!shopId || !orderId || !cancelReason.trim()) return;
    setCancelling(true);

    try {
      await cancelOrder(shopId, orderId, cancelReason.trim());
      toast.success('Đã hủy đơn hàng');
      setShowCancelModal(false);
      setCancelReason('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Hủy đơn thất bại');
    } finally {
      setCancelling(false);
    }
  };

  // ── Return order ──
  const handleReturn = async () => {
    if (!shopId || !orderId) return;

    const returnItemsList = Object.entries(selectedReturnItems).filter(
      ([, qty]) => qty > 0,
    );
    if (returnItemsList.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 sản phẩm');
      return;
    }

    setReturning(true);

    try {
      // 1. Create return record
      const returnData = await createReturn(shopId, {
        order_id: orderId,
        reason: returnReason.trim() || 'Trả hàng',
      });

      const returnId = returnData?.id;
      if (!returnId) throw new Error('Không tạo được phiếu trả hàng');

      // 2. Create return items
      const returnItems = returnItemsList.map(([itemId, qty]) => {
        const item = items.find((i) => i.id === itemId);
        return {
          return_id: returnId,
          order_item_id: itemId,
          product_id: item?.product_id,
          product_name: item?.product_name,
          quantity: qty,
          unit_price: item?.unit_price,
          total_price: Number(item?.unit_price || 0) * qty,
        };
      });

      await createReturnItems(shopId, { items: returnItems });

      // 3. Process return
      await processReturn(shopId, returnId, { status: 'completed' });

      toast.success('Đã tạo phiếu trả hàng');
      setShowReturnModal(false);
      setReturnReason('');
      setSelectedReturnItems({});
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Trả hàng thất bại');
    } finally {
      setReturning(false);
    }
  };

  // ── Toggle return item quantity ──
  const toggleReturnItem = (itemId: string, maxQty: number) => {
    setSelectedReturnItems((prev) => {
      const current = prev[itemId] || 0;
      if (current > 0) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: maxQty };
    });
  };

  const updateReturnItemQty = (itemId: string, qty: number) => {
    setSelectedReturnItems((prev) => ({
      ...prev,
      [itemId]: Math.max(0, qty),
    }));
  };

  // ────────────────────────────── Loading ──────────────────────────────

  if (loading) {
    return (
      <div className="min-h-full bg-background p-4 space-y-3">
        <div className="dashboard-card">
          <div className="skeleton" style={{ width: '60%', height: 18, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: '40%', height: 14, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: '50%', height: 14 }} />
        </div>
        <div className="dashboard-card">
          <div className="skeleton" style={{ width: '80%', height: 14, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: '70%', height: 14 }} />
        </div>
        <div className="dashboard-card">
          <div className="skeleton" style={{ width: '50%', height: 14, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: '30%', height: 18 }} />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="empty-state" style={{ minHeight: '60vh' }}>
        <div className="empty-state-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="empty-state-title">Không tìm thấy đơn hàng</p>
        <p className="empty-state-desc">Đơn hàng không tồn tại hoặc đã bị xóa</p>
      </div>
    );
  }

  const canCancel = order.status === 'pending' || order.status === 'processing';
  const canReturn = order.status === 'completed';

  return (
    <div className="min-h-full bg-background pb-6">
      {/* ── Order Info Header ── */}
      <div className="p-4">
        <div className="dashboard-card">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-base font-bold text-foreground">
                {order.order_number || `#${order.id.slice(-6)}`}
              </h2>
              <p className="text-2xs text-subtitle mt-0.5">
                {formatDateTime(order.created_at)}
              </p>
            </div>
            <span className={`order-status ${getStatusClass(order.status)}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>

          {order.channel && (
            <p className="text-2xs text-subtitle">
              Kênh bán: <span className="font-medium text-foreground">{order.channel}</span>
            </p>
          )}
          {order.note && (
            <p className="text-2xs text-subtitle mt-1">
              Ghi chú: <span className="text-foreground">{order.note}</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Customer Info ── */}
      {(order.customer_name || order.customer_phone) && (
        <div className="px-4 pb-3">
          <div className="dashboard-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {(order.customer_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {order.customer_name || 'Khách lẻ'}
                </p>
                {order.customer_phone && (
                  <p className="text-2xs text-subtitle">{order.customer_phone}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Items ── */}
      <div className="px-4 pb-3">
        <div className="dashboard-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Sản phẩm ({items.length})
          </h3>
          {items.length === 0 ? (
            <p className="text-2xs text-subtitle">Không có sản phẩm</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm text-foreground truncate">
                      {item.product_name}
                    </p>
                    {item.variant_name && (
                      <p className="text-3xs text-subtitle">{item.variant_name}</p>
                    )}
                    <p className="text-2xs text-subtitle mt-0.5">
                      {formatCurrency(item.unit_price)} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                    {formatCurrency(item.total_price)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Payment Summary ── */}
      <div className="px-4 pb-3">
        <div className="dashboard-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Thanh toán</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-2xs">
              <span className="text-subtitle">Tạm tính</span>
              <span className="text-foreground">{formatCurrency(order.total_amount)}</span>
            </div>
            {Number(order.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-2xs">
                <span className="text-subtitle">Giảm giá</span>
                <span className="text-danger">-{formatCurrency(order.discount_amount)}</span>
              </div>
            )}
            {Number(order.tax_amount || 0) > 0 && (
              <div className="flex justify-between text-2xs">
                <span className="text-subtitle">Thuế</span>
                <span className="text-foreground">{formatCurrency(order.tax_amount)}</span>
              </div>
            )}
            <div className="h-px bg-[var(--border)]" />
            <div className="flex justify-between">
              <span className="text-sm font-semibold text-foreground">Tổng cộng</span>
              <span className="text-sm font-bold text-foreground">
                {formatCurrency(order.final_amount ?? order.total_amount)}
              </span>
            </div>
            {order.payment_method && (
              <p className="text-3xs text-subtitle">
                Phương thức: {order.payment_method}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Cashbook Entries ── */}
      {cashbook.length > 0 && (
        <div className="px-4 pb-3">
          <div className="dashboard-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Sổ quỹ ({cashbook.length})
            </h3>
            <div className="space-y-2">
              {cashbook.map((entry) => (
                <div key={entry.id} className="flex justify-between items-center">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-2xs text-foreground truncate">
                      {entry.category || (entry.type === 'receipt' ? 'Thu' : 'Chi')}
                    </p>
                    <p className="text-3xs text-subtitle">
                      {formatDateTime(entry.created_at)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      entry.type === 'receipt' ? 'text-[#16a34a]' : 'text-danger'
                    }`}
                  >
                    {entry.type === 'receipt' ? '+' : '-'}
                    {formatCurrency(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Action Buttons ── */}
      {(canCancel || canReturn) && (
        <div className="px-4 pb-3 flex gap-3">
          {canReturn && (
            <button
              className="auth-btn auth-btn-outline flex-1"
              onClick={() => setShowReturnModal(true)}
            >
              Trả hàng
            </button>
          )}
          {canCancel && (
            <button
              className="auth-btn flex-1"
              style={{ background: '#ef4444', color: 'white' }}
              onClick={() => setShowCancelModal(true)}
            >
              Hủy đơn
            </button>
          )}
        </div>
      )}

      {/* ════════════════════ Cancel Modal ════════════════════ */}
      {showCancelModal && (
        <div className="modal-backdrop" onClick={() => setShowCancelModal(false)}>
          <div
            className="modal-content modal-content-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="text-sm font-semibold">Xác nhận hủy đơn</h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="p-1"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="text-2xs text-subtitle mb-3">
                Bạn có chắc chắn muốn hủy đơn hàng{' '}
                <strong>{order.order_number || `#${order.id.slice(-6)}`}</strong>?
              </p>
              <div className="form-group">
                <label className="form-label">Lý do hủy *</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Nhập lý do hủy đơn..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  className="auth-btn auth-btn-outline flex-1"
                  onClick={() => setShowCancelModal(false)}
                >
                  Đóng
                </button>
                <button
                  className="auth-btn flex-1"
                  style={{ background: '#ef4444', color: 'white' }}
                  disabled={!cancelReason.trim() || cancelling}
                  onClick={handleCancel}
                >
                  {cancelling ? 'Đang hủy...' : 'Xác nhận hủy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ Return Modal ════════════════════ */}
      {showReturnModal && (
        <div className="modal-backdrop" onClick={() => setShowReturnModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="text-sm font-semibold">Trả hàng</h3>
              <button
                onClick={() => setShowReturnModal(false)}
                className="p-1"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {/* Return reason */}
              <div className="form-group">
                <label className="form-label">Lý do trả hàng</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Nhập lý do trả hàng..."
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
              </div>

              {/* Item selection */}
              <div className="form-group">
                <label className="form-label">Chọn sản phẩm trả</label>
                <div className="space-y-2 mt-2">
                  {items.map((item) => {
                    const maxQty = item.quantity - (item.returned_quantity || 0);
                    if (maxQty <= 0) return null;

                    const isSelected = (selectedReturnItems[item.id] || 0) > 0;

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_5%,white)]'
                            : 'border-[var(--border)]'
                        }`}
                      >
                        <div
                          className="flex items-start gap-3 cursor-pointer"
                          onClick={() => toggleReturnItem(item.id, maxQty)}
                        >
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                              isSelected
                                ? 'border-[var(--primary)] bg-[var(--primary)]'
                                : 'border-[#cbd5e1]'
                            }`}
                          >
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">
                              {item.product_name}
                            </p>
                            <p className="text-3xs text-subtitle">
                              Đã mua: {item.quantity} · Có thể trả: {maxQty}
                            </p>
                          </div>
                        </div>

                        {/* Quantity selector */}
                        {isSelected && (
                          <div className="flex items-center gap-3 mt-2 ml-8">
                            <span className="text-2xs text-subtitle">Số lượng:</span>
                            <div className="flex items-center gap-1">
                              <button
                                className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-foreground active:bg-gray-100"
                                onClick={() =>
                                  updateReturnItemQty(
                                    item.id,
                                    (selectedReturnItems[item.id] || 1) - 1,
                                  )
                                }
                              >
                                −
                              </button>
                              <input
                                type="number"
                                className="form-input text-center"
                                style={{ width: 48, padding: '4px 6px' }}
                                value={selectedReturnItems[item.id] || 0}
                                min={0}
                                max={maxQty}
                                onChange={(e) =>
                                  updateReturnItemQty(
                                    item.id,
                                    Math.min(Number(e.target.value) || 0, maxQty),
                                  )
                                }
                              />
                              <button
                                className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-foreground active:bg-gray-100"
                                onClick={() =>
                                  updateReturnItemQty(
                                    item.id,
                                    Math.min(
                                      (selectedReturnItems[item.id] || 0) + 1,
                                      maxQty,
                                    ),
                                  )
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Return summary */}
              {Object.keys(selectedReturnItems).length > 0 && (
                <div className="dashboard-card mt-3 bg-[#f8fafc]">
                  <div className="flex justify-between text-2xs mb-1">
                    <span className="text-subtitle">Sản phẩm trả</span>
                    <span className="text-foreground font-medium">
                      {Object.values(selectedReturnItems).reduce((a, b) => a + b, 0)} sản phẩm
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold text-foreground">Tiền hoàn</span>
                    <span className="text-sm font-bold text-foreground">
                      {formatCurrency(
                        Object.entries(selectedReturnItems).reduce((sum, [itemId, qty]) => {
                          const item = items.find((i) => i.id === itemId);
                          return sum + Number(item?.unit_price || 0) * qty;
                        }, 0),
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className="flex gap-3 mt-4">
                <button
                  className="auth-btn auth-btn-outline flex-1"
                  onClick={() => setShowReturnModal(false)}
                >
                  Đóng
                </button>
                <button
                  className="auth-btn auth-btn-primary flex-1"
                  disabled={
                    Object.values(selectedReturnItems).filter((q) => q > 0).length === 0 ||
                    returning
                  }
                  onClick={handleReturn}
                >
                  {returning ? 'Đang xử lý...' : 'Xác nhận trả hàng'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
