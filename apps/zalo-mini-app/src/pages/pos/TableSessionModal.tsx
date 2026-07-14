/**
 * TableSessionModal.tsx
 * Full-screen bottom-sheet modal for an active table/room session.
 * Tabs: Thông tin | Gọi món | Thanh toán preview
 * Supports: realtime billing counter, add/remove items, cancel order,
 *           transfer table, and checkout.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useTableStore, makeTableCartItemId } from '@/stores/table-store';
import type { ResourceFull, TableSession, TableCartItem } from '@/stores/table-store';
import { useTenantStore } from '@/stores/tenant-store';
import { usePosStore } from '@/stores/pos-store';
import {
  updateLocationResource,
  cancelOrderById,
  getOrderItems,
  createOrderItem,
  updateOrderItem,
  deleteOrderItem,
  updateOrder,
  createCustomer,
  getCustomers,
  type OrderItem,
  type Customer,
} from '@/services/shop-api';
import { calculateBilling, formatElapsed, formatViDatetime } from '@/utils/billing';
import { formatCurrency } from '@/utils/format';
import { LodgingGuestsForm } from './LodgingGuestsForm';
import TransferTableModal from './TransferTableModal';

interface Props {
  table: ResourceFull;
  session: TableSession;
  onClose: () => void;
  onCheckout: () => void;      // triggers checkout modal
  onAddItems: () => void;      // opens retail product grid for this table
  onSessionEnd: () => void;    // table released, refresh
}

type ActiveTab = 'info' | 'order' | 'billing';

export default function TableSessionModal({
  table,
  session,
  onClose,
  onCheckout,
  onAddItems,
  onSessionEnd,
}: Props) {
  const shop = useTenantStore((s) => s.shop);
  const shopId = shop?.id ?? '';
  const tableCarts = useTableStore((s) => s.tableCarts);
  const updateResource = useTableStore((s) => s.updateResource);
  const removeTableSession = useTableStore((s) => s.removeTableSession);
  const clearTableCart = useTableStore((s) => s.clearTableCart);
  const updateTableCartItemQty = useTableStore((s) => s.updateTableCartItemQty);
  const removeTableCartItem = useTableStore((s) => s.removeTableCartItem);
  const updateTableSession = useTableStore((s) => s.updateTableSession);
  const shopSettings = useTableStore((s) => s.shopSettings);
  const setCartOwnerTableId = useTableStore((s) => s.setCartOwnerTableId);

  const tableCart = tableCarts[table.id] ?? {};
  const tableCartItems = Object.entries(tableCart).map(([id, item]) => ({ id, ...item }));

  const isLodging =
    table.type === 'room' ||
    shop?.industry_type === 'hotel' ||
    shopSettings?.industry_type === 'hotel';

  const [tab, setTab] = useState<ActiveTab>('info');
  const [tick, setTick] = useState(0);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [syncingItems, setSyncingItems] = useState<Record<string, boolean>>({});
  const [serverItems, setServerItems] = useState<OrderItem[]>([]);
  const [lodgingGuests, setLodgingGuests] = useState(session.lodgingGuests ?? []);
  const [savingGuests, setSavingGuests] = useState(false);

  // Editable customer info
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerName, setCustomerName] = useState(session.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(session.customerPhone || '');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Autocomplete customer search state
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [custOffset, setCustOffset] = useState(0);
  const [custHasMore, setCustHasMore] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const custDropdownRef = useRef<HTMLDivElement>(null);

  // Inline add customer form state
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  // Search products
  const products = usePosStore((s) => s.products);
  const [searchQuery, setSearchQuery] = useState('');
  const addTableCartItem = useTableStore((s) => s.addTableCartItem);

  // Realtime billing counter (every 1 second for hourly)
  useEffect(() => {
    if (session.rentalType !== 'hourly') return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [session.rentalType]);

  // Calculate current billing
  const tableMeta = useMemo(() => {
    try { return table.metadata ? JSON.parse(table.metadata) : {}; } catch { return {}; }
  }, [table.metadata]);

  const billing = useMemo(() => {
    if (!session.checkInTime) return null;
    return calculateBilling({
      rentalType: session.rentalType,
      checkInISO: session.checkInTime,
      hourlyRate: session.hourlyRate ?? table.hourly_rate ?? 0,
      dailyRate: session.dailyRate ?? table.daily_rate ?? 0,
      overnightRate: session.overnightRate ?? table.overnight_rate ?? 0,
      advancedPricing: session.advancedPricing ?? tableMeta?.advanced_pricing,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick, tableMeta]);

  // Items total
  const itemsTotal = useMemo(
    () => tableCartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [tableCartItems]
  );

  const grandTotal = (billing?.cost ?? 0) + itemsTotal;

  // Sync item qty change to server
  const handleQtyChange = async (cartItemId: string, item: TableCartItem, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      // Remove
      removeTableCartItem(table.id, cartItemId);
      if (session.orderId) {
        // Find server item and delete
        const svItem = serverItems.find(
          (si) => si.product_id === item.productId
        );
        if (svItem) {
          try {
            await deleteOrderItem(shopId, svItem.id);
          } catch (e) {
            console.warn('Delete item error:', e);
          }
        }
      }
    } else {
      updateTableCartItemQty(table.id, cartItemId, newQty);
      if (session.orderId) {
        setSyncingItems((prev) => ({ ...prev, [cartItemId]: true }));
        try {
          const svItem = serverItems.find((si) => si.product_id === item.productId);
          const lineTotal = item.price * newQty;
          if (svItem) {
            await updateOrderItem(shopId, svItem.id, {
              qty: String(newQty),
              line_total: String(lineTotal),
              unit_price: String(item.price),
              original_price: String(item.price),
              discount_amount: '0',
            });
          } else {
            const lineNo = String(serverItems.length + 1);
            const created = await createOrderItem(shopId, {
              order_id: session.orderId,
              line_no: lineNo,
              product_id: item.productId,
              product_name: item.name,
              qty: String(newQty),
              unit_price: String(item.price),
              original_price: String(item.price),
              discount_amount: '0',
              line_total: String(lineTotal),
              line_discount: '0',
              variant_label: item.variantLabel || '',
              modifiers: '',
              modifier_total: '0',
            });
            setServerItems((prev) => [...prev, created as OrderItem]);
          }
        } catch (e) {
          console.warn('Update item error:', e);
        } finally {
          setSyncingItems((prev) => ({ ...prev, [cartItemId]: false }));
        }
      }
    }
  };

  const handleAddItemDirect = async (product: any) => {
    const cartItemId = makeTableCartItemId(product.id, '');
    const existingItem = tableCartItems.find(i => i.id === cartItemId);
    const itemPrice = Number(product.sell_price) || 0;
    
    if (existingItem) {
      handleQtyChange(cartItemId, existingItem, 1);
    } else {
      const newItem: TableCartItem = {
        productId: product.id,
        name: product.name,
        price: itemPrice,
        quantity: 1,
      };
      addTableCartItem(table.id, newItem);
      if (session.orderId) {
        setSyncingItems((prev) => ({ ...prev, [cartItemId]: true }));
        try {
          const lineNo = String(serverItems.length + 1);
          const created = await createOrderItem(shopId, {
            order_id: session.orderId,
            line_no: lineNo,
            product_id: product.id,
            product_name: product.name,
            qty: '1',
            unit_price: String(itemPrice),
            original_price: String(itemPrice),
            discount_amount: '0',
            line_total: String(itemPrice),
            line_discount: '0',
            variant_label: '',
            modifiers: '',
            modifier_total: '0',
          });
          setServerItems((prev) => [...prev, created as OrderItem]);
        } catch (e) {
          console.warn('Update item error:', e);
        } finally {
          setSyncingItems((prev) => ({ ...prev, [cartItemId]: false }));
        }
      }
    }
  };



  // Fetch server items on mount (to enable sync)
  useEffect(() => {
    if (!session.orderId) return;
    getOrderItems(shopId, { order_id: session.orderId, limit: '200' })
      .then((items) => {
        setServerItems(items);
        // Sync local tableCart with server state
        const mappedCart: Record<string, TableCartItem> = {};
        for (const item of items) {
          const cartItemId = makeTableCartItemId(item.product_id, item.variant_name);
          const priceVal = parseFloat(String(item.unit_price || 0)) || 0;
          const qtyVal = parseInt(String(item.qty || item.quantity || 0), 10) || 1;
          mappedCart[cartItemId] = {
            productId: item.product_id,
            name: item.product_name,
            price: priceVal,
            quantity: qtyVal,
            note: item.note || undefined,
            variantLabel: item.variant_name || undefined,
          };
        }
        useTableStore.getState().setTableCart(table.id, mappedCart);
      })
      .catch((err) => {
        console.error('Error fetching server items:', err);
      });
  }, [shopId, session.orderId, table.id]);

  // Debounce customer search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(custSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [custSearchQuery]);

  // Reload customers on debounced search change
  useEffect(() => {
    if (showCustDropdown && shopId) {
      loadCustomers(true);
    }
  }, [debouncedSearch, showCustDropdown, shopId]);

  const loadCustomers = async (reset = false) => {
    if (custLoading) return;
    if (!reset && !custHasMore) return;

    setCustLoading(true);
    const newOffset = reset ? 0 : custOffset;

    try {
      const urlParams: Record<string, string> = {
        limit: '10',
        offset: String(newOffset),
      };
      if (debouncedSearch.trim()) {
        urlParams.search = debouncedSearch.trim();
      }

      const res = await getCustomers(shopId, urlParams);
      const fetched = res?.customers || [];

      if (reset) {
        setCustomersList(fetched);
        setCustOffset(fetched.length);
      } else {
        setCustomersList((prev) => [...prev, ...fetched]);
        setCustOffset((prev) => prev + fetched.length);
      }

      setCustHasMore(fetched.length === 10);
    } catch (err) {
      console.error('Error loading customers in dropdown:', err);
    } finally {
      setCustLoading(false);
    }
  };

  const handleDropdownScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 10) {
      loadCustomers(false);
    }
  };

  const handleSelectCustomer = async (cust: Customer | null) => {
    setSavingCustomer(true);
    try {
      const customerName = cust?.name || '';
      const customerPhone = cust?.phone || '';
      const customerId = cust?.id || '';

      updateTableSession(table.id, {
        customerName,
        customerPhone,
        customerId: customerId || undefined,
      });

      if (session.orderId) {
        const newMeta = {
          ...session,
          customerName,
          customerPhone,
          customerId: customerId || undefined,
        };
        await updateOrder(shopId, session.orderId, {
          customer_id: customerId || undefined,
          customer_name: customerName || undefined,
          customer_phone: customerPhone || undefined,
          metadata: JSON.stringify(newMeta),
        });
      }
      
      // Update store tableCustomers
      useTableStore.getState().setTableCustomer(table.id, cust);

      setCustSearchQuery('');
      setShowCustDropdown(false);
      setEditingCustomer(false);
      toast.success('Đã cập nhật thông tin khách');
    } catch {
      toast.error('Lỗi khi lưu thông tin');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleCreateCustomerInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      toast.error('Vui lòng nhập tên khách hàng');
      return;
    }
    if (!newCustPhone.trim()) {
      toast.error('Vui lòng nhập số điện thoại');
      return;
    }
    setSavingCustomer(true);
    try {
      const created = await createCustomer(shopId, {
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        customer_type: 'retail',
      });
      
      const customerName = created.name;
      const customerPhone = created.phone;
      const customerId = created.id;

      updateTableSession(table.id, {
        customerName,
        customerPhone,
        customerId: customerId || undefined,
      });

      if (session.orderId) {
        const newMeta = {
          ...session,
          customerName,
          customerPhone,
          customerId: customerId || undefined,
        };
        await updateOrder(shopId, session.orderId, {
          customer_id: customerId || undefined,
          customer_name: customerName || undefined,
          customer_phone: customerPhone || undefined,
          metadata: JSON.stringify(newMeta),
        });
      }
      
      useTableStore.getState().setTableCustomer(table.id, created as Customer);
      
      setAddingCustomer(false);
      setNewCustName('');
      setNewCustPhone('');
      setEditingCustomer(false);
      toast.success('Đã tạo khách hàng mới');
    } catch {
      toast.error('Không thể tạo khách hàng mới');
    } finally {
      setSavingCustomer(false);
    }
  };

  // Cancel order
  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      if (session.orderId) {
        await cancelOrderById(shopId, session.orderId, 'Hủy tại POS Mini App');
      }
      await updateLocationResource(shopId, table.id, { status: 'available', current_order_id: '' });
      removeTableSession(table.id);
      clearTableCart(table.id);
      updateResource(table.id, { status: 'available', current_order_id: '' });
      toast.success(`Đã hủy ${table.name}`);
      onSessionEnd();
    } catch {
      toast.error('Không thể hủy đơn. Vui lòng thử lại.');
    } finally {
      setCancelling(false);
      setCancelConfirm(false);
    }
  };

  const handleSessionAddItems = () => {
    onAddItems();
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    zIndex: 1000, display: 'flex', alignItems: 'flex-end',
  };
  const sheetStyle: React.CSSProperties = {
    background: '#f8fafc', borderRadius: '20px 20px 0 0',
    width: '100%', height: '92vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: 'info', label: 'Thông tin' },
    { key: 'order', label: `Gọi món${tableCartItems.length > 0 ? ` (${tableCartItems.length})` : ''}` },
    { key: 'billing', label: 'Tổng tiền' },
  ];

  return (
    <>
      <div style={overlayStyle} onClick={onClose}>
        <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
          {/* Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0', background: '#fff' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0' }} />
          </div>

          {/* Header */}
          <div style={{ background: '#fff', padding: '10px 20px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, color: '#0f172a', margin: 0 }}>
                  {table.name}
                  {table.zone ? <span style={{ fontWeight: 400, fontSize: 13, color: '#94a3b8' }}> · {table.zone}</span> : null}
                </p>
                {session.customerName && (
                  <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>{session.customerName}</span>
                    {session.customerPhone ? <span> · {session.customerPhone}</span> : ''}
                  </p>
                )}
              </div>
              {/* Billing badge */}
              {billing && (
                <div style={{
                  textAlign: 'right',
                  background: '#fef2f2', borderRadius: 10, padding: '6px 12px',
                }}>
                  <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{billing.label}</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', margin: 0 }}>
                    {formatCurrency(billing.cost)}
                  </p>
                </div>
              )}
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2 }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    flex: 1, height: 36, borderRadius: '10px 10px 0 0',
                    border: 'none',
                    background: tab === t.key ? '#f8fafc' : 'transparent',
                    fontSize: 11, fontWeight: 600,
                    color: tab === t.key ? 'var(--primary, #3b82f6)' : '#94a3b8',
                    borderBottom: tab === t.key ? '2px solid var(--primary, #3b82f6)' : '2px solid transparent',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* ── TAB: INFO ── */}
            {tab === 'info' && (
              <div style={{ padding: '16px 20px' }}>
                {/* Info cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {(() => {
                    const items = [
                      { label: 'Giờ check-in', value: formatViDatetime(session.checkInTime) },
                    ];
                    if (isLodging) {
                      items.push({
                        label: 'Hình thức thuê',
                        value: session.rentalType === 'hourly' ? 'Theo giờ' : session.rentalType === 'daily' ? 'Theo ngày' : 'Qua đêm'
                      });
                    }
                    items.push({ label: 'Số khách', value: `${session.numGuests} người` });
                    if (session.expectedCheckout) {
                      items.push({ label: 'Dự kiến trả', value: formatViDatetime(session.expectedCheckout) });
                    } else if (isLodging) {
                      items.push({ label: 'Thời gian', value: billing?.label ?? '—' });
                    }
                    return items.map((item) => (
                      <div
                        key={item.label}
                        style={{
                          background: '#fff', borderRadius: 12, padding: '12px 14px',
                          border: '1.5px solid #e2e8f0',
                        }}
                      >
                        <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {item.label}
                        </p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                          {item.value}
                        </p>
                      </div>
                    ));
                  })()}
                </div>

                {/* Editable Customer Info */}
                <div className="form-group" style={{ position: 'relative', background: '#fff', padding: 14, borderRadius: 12, border: '1.5px solid #e2e8f0', marginBottom: 16 }} ref={custDropdownRef}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (session.customerName || session.customerPhone) ? 8 : 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Khách hàng</p>
                    {(!session.customerName && !session.customerPhone) && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: '#f8fafc', borderRadius: 20, padding: '4px 10px',
                        border: '1.5px solid #e2e8f0',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Khách lẻ</span>
                      </div>
                    )}
                  </div>

                  {(session.customerName || session.customerPhone) ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', borderRadius: 10, padding: '10px 12px', border: '1.5px solid #bbf7d0', marginBottom: 10 }}>
                      <div>
                        {session.customerName && <p style={{ fontSize: 13, fontWeight: 700, color: '#166534', margin: 0 }}>{session.customerName}</p>}
                        {session.customerPhone && <p style={{ fontSize: 12, color: '#15803d', margin: '2px 0 0' }}>{session.customerPhone}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectCustomer(null)}
                        style={{
                          height: 30, borderRadius: 8,
                          border: '1.5px solid #cbd5e1', background: '#fff',
                          color: '#64748b', fontSize: 11, fontWeight: 600, padding: '0 12px',
                          cursor: 'pointer',
                        }}
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  ) : null}

                  {/* Search input – always visible if no customer is selected */}
                  {(!session.customerName && !session.customerPhone) && (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Tìm khách hàng..."
                        value={custSearchQuery}
                        onChange={(e) => {
                          setCustSearchQuery(e.target.value);
                          setShowCustDropdown(true);
                          setAddingCustomer(false);
                        }}
                        onFocus={() => {
                          setShowCustDropdown(true);
                          loadCustomers(true);
                        }}
                        onBlur={() => setTimeout(() => setShowCustDropdown(false), 200)}
                        style={{
                          width: '100%', height: 38, borderRadius: 8,
                          border: '1.5px solid #cbd5e1', padding: '0 40px 0 12px',
                          fontSize: 13, boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setNewCustName(custSearchQuery.trim());
                          setAddingCustomer(true);
                          setShowCustDropdown(false);
                        }}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', width: 24, height: 24,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: '#3b82f6'
                        }}
                        title="Thêm khách hàng mới"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="8.5" cy="7" r="4" />
                          <line x1="20" y1="8" x2="20" y2="14" />
                          <line x1="23" y1="11" x2="17" y2="11" />
                        </svg>
                      </button>

                      {showCustDropdown && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 110,
                          maxHeight: 185, overflowY: 'auto',
                        }} onScroll={handleDropdownScroll}>
                          {/* Always show Khách mua lẻ at top */}
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectCustomer(null)}
                            style={{
                              width: '100%', padding: '10px 14px', textAlign: 'left',
                              background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer', fontSize: 13, color: 'var(--primary)', fontWeight: 600
                            }}
                          >
                            Khách mua lẻ
                          </button>
                          {customersList.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSelectCustomer(c)}
                              style={{
                                width: '100%', padding: '10px 14px', textAlign: 'left',
                                background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{c.name}</span>
                                {c.phone && <span style={{ fontSize: 11, color: '#94a3b8' }}>{c.phone}</span>}
                              </div>
                            </button>
                          ))}
                          {custLoading && (
                            <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: '#64748b' }}>
                              Đang tải thêm...
                            </div>
                          )}
                          {!custLoading && customersList.length === 0 && custSearchQuery.trim() ? (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setNewCustName(custSearchQuery.trim());
                                setAddingCustomer(true);
                                setShowCustDropdown(false);
                              }}
                              style={{
                                width: '100%', padding: '10px 14px', textAlign: 'left',
                                background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9',
                                fontSize: 13, fontWeight: 600, color: '#3b82f6',
                                cursor: 'pointer',
                              }}
                            >
                              + Tạo mới "{custSearchQuery.trim()}"
                            </button>
                          ) : null}

                          {/* Always-visible add button */}
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewCustName(custSearchQuery.trim());
                              setAddingCustomer(true);
                              setShowCustDropdown(false);
                            }}
                            style={{
                              width: '100%', padding: '10px 14px', textAlign: 'left',
                              background: '#f8fafc', border: 'none',
                              fontSize: 12, fontWeight: 600, color: '#3b82f6',
                              cursor: 'pointer',
                            }}
                          >
                            + Thêm khách hàng mới
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inline add-customer form */}
                  {addingCustomer && (
                    <div style={{
                      background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10,
                      padding: 12, marginTop: 10,
                    }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', margin: '0 0 8px' }}>
                        Thêm khách hàng mới
                      </p>
                      <input
                        style={{ width: '100%', height: 38, border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '0 12px', fontSize: 13, color: '#0f172a', background: '#fff', boxSizing: 'border-box', outline: 'none', marginBottom: 8 }}
                        placeholder="Họ và tên *"
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                      />
                      <input
                        style={{ width: '100%', height: 38, border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '0 12px', fontSize: 13, color: '#0f172a', background: '#fff', boxSizing: 'border-box', outline: 'none', marginBottom: 10 }}
                        placeholder="Số điện thoại *"
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        type="tel"
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => { setAddingCustomer(false); setNewCustName(''); setNewCustPhone(''); }}
                          style={{
                            flex: 1, height: 36, borderRadius: 8,
                            border: '1.5px solid #cbd5e1', background: '#fff',
                            fontSize: 13, fontWeight: 600, color: '#64748b',
                            cursor: 'pointer',
                          }}
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateCustomerInline}
                          disabled={!newCustName.trim() || !newCustPhone.trim()}
                          style={{
                            flex: 1, height: 36, borderRadius: 8,
                            background: '#3b82f6', border: 'none',
                            fontSize: 13, fontWeight: 700, color: '#fff',
                            opacity: !newCustName.trim() || !newCustPhone.trim() ? 0.6 : 1,
                            cursor: 'pointer',
                          }}
                        >
                          Lưu
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {session.note && (
                  <div style={{
                    background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10,
                    padding: '10px 14px', marginBottom: 16,
                  }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#92400e', margin: '0 0 2px' }}>Ghi chú</p>
                    <p style={{ fontSize: 13, color: '#78350f', margin: 0 }}>{session.note}</p>
                  </div>
                )}

                {/* Lodging guests */}
                {isLodging && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 }}>
                        Khách lưu trú ({lodgingGuests.length})
                      </p>
                    </div>
                    <LodgingGuestsForm
                      guests={lodgingGuests}
                      onChangeGuests={setLodgingGuests}
                      guestCount={session.numGuests}
                      onChangeGuestCount={() => {}}
                    />
                    <button
                      onClick={async () => {
                        setSavingGuests(true);
                        try {
                          updateTableSession(table.id, { lodgingGuests });
                          toast.success('Đã lưu thông tin khách');
                        } finally {
                          setSavingGuests(false);
                        }
                      }}
                      disabled={savingGuests}
                      style={{
                        width: '100%', height: 42, borderRadius: 10,
                        background: '#3b82f6', border: 'none',
                        fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 8,
                        opacity: savingGuests ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      {savingGuests ? (
                        'Đang lưu...'
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                          </svg>
                          Lưu thông tin khách
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    onClick={() => setShowTransfer(true)}
                    style={{
                      flex: 1, height: 40, borderRadius: 10,
                      border: '1.5px solid #e2e8f0', background: '#fff',
                      fontSize: 12, fontWeight: 600, color: '#374151',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                    Chuyển bàn
                  </button>
                  <button
                    onClick={() => setCancelConfirm(true)}
                    style={{
                      flex: 1, height: 40, borderRadius: 10,
                      border: '1.5px solid #fecdd3', background: '#fff1f2',
                      fontSize: 12, fontWeight: 600, color: '#f43f5e',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Hủy đơn
                  </button>
                </div>

                {/* Add items button directly on Info Tab */}
                <button
                  onClick={onAddItems}
                  style={{
                    width: '100%', height: 46, borderRadius: 12,
                    border: '2px dashed #93c5fd', background: '#eff6ff',
                    fontSize: 13, fontWeight: 700, color: '#3b82f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    marginTop: 16,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 800 }}>+</span>
                  Gọi món / Thêm dịch vụ
                </button>
              </div>
            )}

            {/* ── TAB: ORDER ── */}
            {tab === 'order' && (
              <div style={{ padding: '16px 20px' }}>
                {/* Search and add items directly */}
                <div style={{ marginBottom: 16 }}>
                  <input
                    type="text"
                    placeholder="Tìm và thêm món trực tiếp..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%', height: 42, borderRadius: 10, padding: '0 14px',
                      border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                  />
                  {searchQuery.trim().length > 0 && (
                    <div style={{
                      marginTop: 8, maxHeight: 220, overflowY: 'auto',
                      background: '#fff', borderRadius: 10, border: '1.5px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                    }}>
                      {products
                        .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .slice(0, 15)
                        .map(product => (
                          <div
                            key={product.id}
                            onClick={() => {
                              handleAddItemDirect(product);
                              setSearchQuery('');
                            }}
                            style={{
                              padding: '12px 14px', borderBottom: '1px solid #f1f5f9',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{product.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>{formatCurrency(Number(product.sell_price) || 0)}</span>
                              <div style={{ background: '#eff6ff', color: '#3b82f6', width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>+</div>
                            </div>
                          </div>
                        ))}
                      {products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                          Không tìm thấy món nào
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {tableCartItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" style={{ margin: '0 auto 8px' }}>
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Chưa có món nào</p>
                    <p style={{ fontSize: 12, margin: '4px 0 0' }}>Nhấn "Thêm món" để gọi thức ăn/dịch vụ</p>
                  </div>
                ) : (
                  <div style={{ marginBottom: 12 }}>
                    {tableCartItems.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          background: '#fff', borderRadius: 12, padding: '12px 14px',
                          marginBottom: 8,
                          border: '1.5px solid #e2e8f0',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          opacity: syncingItems[item.id] ? 0.7 : 1,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </p>
                          {item.variantLabel && (
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{item.variantLabel}</p>
                          )}
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', margin: '2px 0 0' }}>
                            {formatCurrency(item.price * item.quantity)}
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            onClick={() => handleQtyChange(item.id, item, -1)}
                            style={{
                              width: 28, height: 28, borderRadius: '50%',
                              border: 'none', background: '#f1f5f9',
                              fontSize: 15, color: '#334155', fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            −
                          </button>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', minWidth: 20, textAlign: 'center' }}>
                            {syncingItems[item.id] ? '...' : item.quantity}
                          </span>
                          <button
                            onClick={() => handleQtyChange(item.id, item, 1)}
                            style={{
                              width: 28, height: 28, borderRadius: '50%',
                              border: 'none', background: '#f1f5f9',
                              fontSize: 15, color: '#334155', fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add items button */}
                <button
                  onClick={onAddItems}
                  style={{
                    width: '100%', height: 46, borderRadius: 12,
                    border: '2px dashed #93c5fd', background: '#eff6ff',
                    fontSize: 13, fontWeight: 700, color: '#3b82f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 800 }}>+</span>
                  Thêm món / Dịch vụ
                </button>
              </div>
            )}

            {/* ── TAB: BILLING ── */}
            {tab === 'billing' && (
              <div style={{ padding: '16px 20px' }}>
                {/* Billing summary */}
                <div style={{
                  background: '#fff', borderRadius: 14, padding: 16,
                  border: '1.5px solid #e2e8f0', marginBottom: 12,
                }}>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#374151', margin: '0 0 12px' }}>
                    Chi tiết tính tiền
                  </p>

                  {billing && (
                    <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 10, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>
                          Tiền {table.type === 'room' ? 'phòng' : 'bàn'} ({billing.label})
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {formatCurrency(billing.cost)}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{billing.details}</p>
                    </div>
                  )}

                  {tableCartItems.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>
                        {item.name} × {item.quantity}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}

                  {tableCartItems.length > 0 && (
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>Dịch vụ</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {formatCurrency(itemsTotal)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Grand total */}
                <div style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  borderRadius: 14, padding: '16px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                    Tổng cộng
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            background: '#fff', padding: '12px 20px 24px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex', gap: 10,
          }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, height: 48, borderRadius: 12,
                border: '1.5px solid #e2e8f0', background: '#f8fafc',
                fontSize: 14, fontWeight: 600, color: '#64748b',
              }}
            >
              Đóng
            </button>
            <button
              onClick={onCheckout}
              style={{
                flex: 2, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                border: 'none',
                fontSize: 14, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Thanh toán · {formatCurrency(grandTotal)}
            </button>
          </div>
        </div>
      </div>

      {/* Cancel confirmation */}
      {cancelConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setCancelConfirm(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, padding: '20px 20px 16px',
              maxWidth: 320, width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', margin: '0 0 8px' }}>
              Hủy đơn {table.name}?
            </p>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              Toàn bộ món gọi và thông tin phiên sẽ bị xóa. Hành động này không thể hoàn tác.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setCancelConfirm(false)}
                style={{
                  flex: 1, height: 42, borderRadius: 10,
                  border: '1.5px solid #e2e8f0', background: '#f8fafc',
                  fontSize: 13, fontWeight: 600, color: '#64748b',
                }}
              >
                Không
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{
                  flex: 1, height: 42, borderRadius: 10,
                  background: '#ef4444', border: 'none',
                  fontSize: 13, fontWeight: 700, color: '#fff',
                  opacity: cancelling ? 0.7 : 1,
                }}
              >
                {cancelling ? '...' : 'Hủy đơn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {showTransfer && session.orderId && (
        <TransferTableModal
          shopId={shopId}
          sourceTable={table}
          session={session}
          onClose={() => setShowTransfer(false)}
          onSuccess={() => {
            setShowTransfer(false);
            onSessionEnd();
          }}
        />
      )}
    </>
  );
}
