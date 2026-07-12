import { useState, useEffect, useCallback } from 'react';
import { useTenantStore } from '@/stores/tenant-store';
import { getQrOrders, updateQrOrder, getLocationResources } from '@/services/shop-api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import toast from 'react-hot-toast';

type QrTab = 'pending' | 'accepted' | 'all';

const TABS: { key: QrTab; label: string }[] = [
  { key: 'pending', label: 'Chờ xác nhận' },
  { key: 'accepted', label: 'Đã xác nhận' },
  { key: 'all', label: 'Tất cả' },
];

export default function QrOrdersPage() {
  const shopId = useTenantStore((s) => s.shop?.id);

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<QrTab>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [tables, setTables] = useState<Record<string, string>>({});
  
  // Track which items are UNCHECKED (rejected) for pending orders
  // Key: order.id, Value: array of item indices
  const [rejectedItems, setRejectedItems] = useState<Record<string, number[]>>({});

  // State to hold current action waiting for confirmation
  const [confirmAction, setConfirmAction] = useState<{
    orderId: string;
    status: 'confirmed' | 'rejected';
    orderItems?: any[];
    title: string;
    rejectedItemsText?: string;
  } | null>(null);

  // Pull-to-refresh states
  const [refreshing, setRefreshing] = useState(false);
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);

  const fetchOrdersAndTables = useCallback(async (isRefresh = false) => {
    if (!shopId) return;
    if (!isRefresh) setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeTab !== 'all') params.status = activeTab;
      
      const [res, tablesRes] = await Promise.all([
        getQrOrders(shopId, params),
        getLocationResources(shopId)
      ]);
      
      setOrders(Array.isArray(res) ? res : []);
      
      if (tablesRes && Array.isArray(tablesRes)) {
        const tableMap: Record<string, string> = {};
        tablesRes.forEach((t: any) => {
          const id = t.resource_id || t.id;
          if (id) tableMap[id] = t.name;
        });
        setTables(tableMap);
      }
      
      // Reset selections
      setRejectedItems({});
    } catch {
      toast.error('Không thể tải đơn QR');
    } finally {
      setLoading(false);
    }
  }, [shopId, activeTab]);

  useEffect(() => {
    fetchOrdersAndTables();
  }, [fetchOrdersAndTables]);

  const toggleItem = (orderId: string, idx: number) => {
    setRejectedItems(prev => {
      const current = prev[orderId] || [];
      if (current.includes(idx)) {
        // Was unchecked, now check it
        return { ...prev, [orderId]: current.filter(i => i !== idx) };
      } else {
        // Was checked, now uncheck it
        return { ...prev, [orderId]: [...current, idx] };
      }
    });
  };

  const handleAction = async (orderId: string, status: 'confirmed' | 'rejected', orderItems?: any[]) => {
    if (!shopId) return;
    
    // If not confirmed yet, trigger the modal confirmation instead of executing API
    if (!confirmAction) {
      const order = orders.find(o => o.id === orderId);
      const tableName = order ? (tables[order.resource_id] || order.table_name || 'Bàn ẩn danh') : 'Bàn ẩn danh';
      const actionText = status === 'confirmed' ? 'xác nhận' : 'từ chối';
      
      let rejectedItemNames = '';
      if (status === 'confirmed' && orderItems) {
        const rejected = rejectedItems[orderId] || [];
        if (rejected.length > 0) {
          rejectedItemNames = orderItems
            .filter((_, idx) => rejected.includes(idx))
            .map((item) => `${item.qty || item.quantity || 1}x ${item.product_name || item.name}`)
            .join(', ');
        }
      }

      setConfirmAction({
        orderId,
        status,
        orderItems,
        title: `Bạn có chắc chắn muốn ${actionText} đơn hàng của ${tableName}?`,
        rejectedItemsText: rejectedItemNames
      });
      return;
    }

    setProcessingId(orderId);
    try {
      let dataToUpdate: any = { status };
      
      if (status === 'confirmed' && orderItems) {
        // Filter out unchecked items
        const rejected = rejectedItems[orderId] || [];
        const acceptedItems = orderItems.filter((_, idx) => !rejected.includes(idx));
        dataToUpdate.items = acceptedItems;
        
        if (acceptedItems.length === 0) {
          toast.error('Vui lòng chọn ít nhất 1 món để xác nhận');
          setProcessingId(null);
          setConfirmAction(null);
          return;
        }

        // Generate auto reject reason for excluded items like Web app does
        if (rejected.length > 0) {
          const rejectedItemNames = orderItems
            .filter((_, idx) => rejected.includes(idx))
            .map((item) => `${item.qty || item.quantity || 1}x ${item.product_name || item.name}`)
            .join(', ');
          dataToUpdate.reject_reason = `Từ chối các món hết hàng: ${rejectedItemNames}`;
        }
      }
      
      await updateQrOrder(shopId, orderId, dataToUpdate);
      toast.success(status === 'confirmed' ? 'Đã xác nhận đơn' : 'Đã từ chối đơn');
      fetchOrdersAndTables();
    } catch {
      toast.error('Thao tác thất bại');
    } finally {
      setProcessingId(null);
      setConfirmAction(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="order-status pending bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-2xs font-medium">Chờ xác nhận</span>;
      case 'confirmed':
      case 'accepted':
        return <span className="order-status completed bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-2xs font-medium">Đã xác nhận</span>;
      case 'rejected':
        return <span className="order-status cancelled bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-2xs font-medium">Đã từ chối</span>;
      default:
        return <span className="order-status bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-2xs font-medium">{status}</span>;
    }
  };
  
  const calculateTotal = (order: any) => {
    if (order.total_amount || order.final_amount) return order.total_amount || order.final_amount;
    if (!order.items) return 0;
    
    const rejected = rejectedItems[order.id] || [];
    return order.items.reduce((sum: number, item: any, idx: number) => {
      // If pending and unchecked, don't count towards total
      if (order.status === 'pending' && rejected.includes(idx)) return sum;
      return sum + (item.line_total || (item.unit_price || 0) * (item.qty || item.quantity || 0));
    }, 0);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const container = document.querySelector('.overflow-y-auto');
    const scrollTop = container ? container.scrollTop : window.scrollY;
    if (scrollTop === 0) {
      setPullStart(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStart !== null) {
      const currentY = e.touches[0].clientY;
      const offset = currentY - pullStart;
      if (offset > 0) {
        setPullOffset(Math.min(offset * 0.4, 60));
      }
    }
  };

  const handleTouchEnd = async () => {
    if (pullStart !== null) {
      if (pullOffset >= 50) {
        setRefreshing(true);
        await fetchOrdersAndTables(true);
        setRefreshing(false);
      }
      setPullStart(null);
      setPullOffset(0);
    }
  };

  return (
    <div 
      className="min-h-full bg-background pb-8 overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Tabs */}
      <div className="sticky top-0 z-10 flex border-b border-border bg-card shadow-xs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pull to Refresh Indicator */}
      <div 
        className="flex items-center justify-center text-[10px] text-muted-foreground transition-all duration-150 overflow-hidden bg-muted/20"
        style={{
          height: refreshing ? '40px' : `${pullOffset}px`,
          opacity: refreshing || pullOffset > 0 ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-1.5 py-1.5">
          <svg className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {refreshing ? (
              <>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </>
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            )}
          </svg>
          <span>{refreshing ? 'Đang làm mới...' : 'Kéo để làm mới...'}</span>
        </div>
      </div>

      {/* Order List */}
      {loading ? (
        <div className="px-4 space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-muted h-32 rounded-xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center mt-8">
          <svg className="text-muted-foreground opacity-30 mb-4" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <p className="text-foreground font-semibold">Không có đơn QR</p>
          <p className="text-muted-foreground text-sm mt-1">
            {activeTab === 'pending'
              ? 'Chưa có đơn hàng QR nào chờ xác nhận'
              : 'Không có đơn hàng QR nào'}
          </p>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-4">
          {orders.map((order) => {
            const rejected = rejectedItems[order.id] || [];
            const resolvedTableName = tables[order.resource_id] || order.table_name || 'Bàn chưa đặt tên';
            const customerText = order.customer_name ? ` - ${order.customer_name}` : '';
            const displayTitle = order.order_number 
              ? `${resolvedTableName}${customerText} - ${order.order_number}` 
              : `${resolvedTableName}${customerText}`;

            return (
              <div key={order.id} className="bg-card border border-border rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2 border-b border-border pb-1.5">
                  <p className="text-xs font-bold text-foreground">
                    {displayTitle}
                  </p>
                  {getStatusBadge(order.status)}
                </div>

                {/* Order details */}
                {(order.customer_name || order.note) && (
                  <div className="mb-2 bg-muted/30 p-2 rounded-lg space-y-1">
                    {order.customer_name && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="opacity-70 text-xs">👤</span> 
                        <span className="font-medium text-foreground">{order.customer_name}</span>
                        {order.customer_phone ? ` • ${order.customer_phone}` : ''}
                      </p>
                    )}
                    {order.note && (
                      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <span className="opacity-70 text-xs">📝</span>
                        <span className="font-medium text-foreground italic">"{order.note}"</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Display reject reason if present */}
                {order.reject_reason && (
                  <div className="mb-2 p-1.5 bg-red-50 text-red-700 text-[10px] rounded-md border border-red-100 leading-snug">
                    ⚠️ {order.reject_reason}
                  </div>
                )}

                {/* Items list */}
                {order.items && order.items.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {order.items.map((item: any, idx: number) => {
                      const isPending = order.status === 'pending';
                      const isChecked = !rejected.includes(idx);
                      const qty = item.qty || item.quantity || 1;
                      const price = item.line_total || (item.unit_price || 0) * qty;
                      
                      return (
                        <div key={idx} className={`flex items-center justify-between py-1 ${!isChecked ? 'opacity-40 grayscale' : ''}`}>
                          <div className="flex items-center gap-2 flex-1 overflow-hidden">
                            {isPending && (
                              <div 
                                className="shrink-0 cursor-pointer p-0.5"
                                onClick={() => toggleItem(order.id, idx)}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-primary border-primary' : 'bg-transparent border-input'}`}>
                                  {isChecked && (
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {item.product_name || item.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatCurrency(item.unit_price || 0)} x {qty}
                              </p>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold ml-2 ${isChecked ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                            {formatCurrency(price)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Total + Actions */}
                <div className="pt-2 border-t border-border mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground leading-none">🕐 {formatDateTime(order.created_at)}</span>
                    <span className="text-base font-bold text-primary">
                      {formatCurrency(calculateTotal(order))}
                    </span>
                  </div>

                  {order.status === 'pending' && (
                    <div className="flex justify-end gap-1.5 mt-2 pt-2 border-t border-border/50">
                      <button
                        className="px-3 py-1.5 rounded-lg font-medium text-xs border border-border text-foreground bg-card hover:bg-muted transition-colors disabled:opacity-50"
                        disabled={processingId === order.id}
                        onClick={() => handleAction(order.id, 'rejected')}
                      >
                        Từ chối
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-lg font-medium text-xs bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
                        disabled={processingId === order.id}
                        onClick={() => handleAction(order.id, 'confirmed', order.items)}
                      >
                        {processingId === order.id && (
                          <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                        Xác nhận
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-card w-full max-w-[280px] rounded-xl border border-border p-4 shadow-xl animate-in fade-in zoom-in-95 duration-100">
            <h3 className="text-xs font-bold text-foreground mb-1.5">
              Xác nhận thao tác
            </h3>
            <p className="text-2xs text-muted-foreground mb-3 leading-relaxed">
              {confirmAction.title}
            </p>

            {confirmAction.rejectedItemsText && (
              <div className="mb-3 p-2 bg-red-50 text-red-700 text-[10px] rounded-md border border-red-100">
                <p className="font-bold mb-0.5">Món sẽ bị từ chối:</p>
                <p className="line-clamp-2">{confirmAction.rejectedItemsText}</p>
              </div>
            )}

            <div className="flex justify-end gap-1.5">
              <button
                disabled={processingId !== null}
                className="px-3 py-1.5 rounded-lg font-medium text-2xs border border-border text-foreground bg-card hover:bg-muted transition-colors disabled:opacity-50"
                onClick={() => setConfirmAction(null)}
              >
                Hủy
              </button>
              <button
                disabled={processingId !== null}
                className={`px-3 py-1.5 rounded-lg font-medium text-2xs text-white transition-colors flex items-center gap-1 disabled:opacity-50 ${
                  confirmAction.status === 'confirmed'
                    ? 'bg-primary hover:bg-primary/90'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                onClick={() => handleAction(confirmAction.orderId, confirmAction.status, confirmAction.orderItems)}
              >
                {processingId === confirmAction.orderId && (
                  <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {processingId === confirmAction.orderId ? 'Đang xử lý' : 'Đồng ý'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
