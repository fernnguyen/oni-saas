import { useState, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { usePosStore } from '@/stores/pos-store';
import { useTenantStore } from '@/stores/tenant-store';
import { syncOrderDirect, createCustomer } from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  customer_type?: string;
  total_spent?: number;
  total_orders?: number;
  debt_amount?: number;
  prepaid_balance?: number;
  credit_limit?: number;
  note?: string;
}

interface PaymentRow {
  id: string;
  method: string;
  amount: string;
  fund_id?: string;
}

function nextId() {
  return String(Date.now() + Math.random());
}

// ── VND Local Mask & Parse Helpers (Int-only, 100% bug-free for VND) ──
function maskVnd(valStr: string | number | null | undefined): string {
  if (valStr === null || valStr === undefined || valStr === '') return '';
  const clean = String(valStr).replace(/\D/g, '');
  if (!clean) return '';
  const num = parseInt(clean, 10);
  return num.toLocaleString('vi-VN');
}

function parseVnd(formatted: string | number | null | undefined): number {
  if (formatted === null || formatted === undefined || formatted === '') return 0;
  if (typeof formatted === 'number') return formatted;
  const clean = String(formatted).replace(/\D/g, '');
  return parseInt(clean, 10) || 0;
}

export default function CheckoutModal() {
  const shop = useTenantStore((s) => s.shop);
  const shopId = shop?.id ?? '';

  const cart = usePosStore((s) => s.cart);
  const customers = usePosStore((s) => s.customers);
  const paymentMethods = usePosStore((s) => s.paymentMethods);
  const paymentFunds = usePosStore((s) => s.paymentFunds);
  const selectedCustomer = usePosStore((s) => s.selectedCustomer);
  const discountAmount = usePosStore((s) => s.discountAmount);
  const orderNote = usePosStore((s) => s.orderNote);

  const {
    updateQuantity,
    updateUnitPrice,
    removeFromCart,
    clearCart,
    setSelectedCustomer,
    setDiscountAmount,
    setOrderNote,
    setIsCheckoutOpen,
    setCustomers,
  } = usePosStore.getState();

  // ── Customer default ──
  const activeCustomer = useMemo<Customer>(() => {
    return selectedCustomer || { id: 'C-DEFAULT-RETAIL', name: 'Khách lẻ', customer_type: 'retail', prepaid_balance: 0, debt_amount: 0 };
  }, [selectedCustomer]);

  // Autocomplete customer search state
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const custDropdownRef = useRef<HTMLDivElement>(null);

  // Quick add customer modal state
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustType, setNewCustType] = useState('retail');

  // Custom Confirmation Dialog Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // ── Discount & Unit Price edit states ──
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(null);

  // ── Totals ──
  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const finalAmount = Math.max(0, subtotal - discountAmount);

  // ── Multiple Payment Rows ──
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper: Auto-match default funds when changing method
  const getAutoMatchedFund = (methodId: string) => {
    const pm = paymentMethods.find((m) => m.id === methodId);
    if (!pm) return null;
    const targetType = pm.type || 'cash';
    const match = paymentFunds.filter((f) => f.type === targetType);
    return match.find((f) => f.is_default === 'TRUE' || f.is_default === 'true') || match[0];
  };

  // Setup default single payment row matching subtotal
  useEffect(() => {
    if (paymentMethods.length === 0) return;

    const defaultMethod = paymentMethods.find((pm) => pm.is_default) || paymentMethods[0];
    const defaultMethodId = defaultMethod?.id || 'cash';
    const defaultMethodType = defaultMethod?.type || 'cash';

    const matchFunds = paymentFunds.filter((f) => f.type === defaultMethodType);
    const defaultFund = matchFunds.find((f) => f.is_default === 'TRUE' || f.is_default === 'true') || matchFunds[0];

    setPayments([
      {
        id: nextId(),
        method: defaultMethodId,
        amount: String(finalAmount),
        fund_id: defaultFund?.id || '',
      },
    ]);
  }, [paymentMethods, paymentFunds, finalAmount]);

  // Handle clicking outside customer dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (custDropdownRef.current && !custDropdownRef.current.contains(event.target as Node)) {
        setShowCustDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Payment Row Actions ──
  const handleAddPayment = () => {
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const leftover = Math.max(0, finalAmount - totalPaid);

    // Find next unused method
    const usedMethods = new Set(payments.map((p) => p.method));
    const nextMethod = paymentMethods.find((m) => !usedMethods.has(m.id)) || paymentMethods[0];
    if (!nextMethod) return;

    const autoFund = getAutoMatchedFund(nextMethod.id);
    setPayments([
      ...payments,
      {
        id: nextId(),
        method: nextMethod.id,
        amount: leftover > 0 ? String(leftover) : '0',
        fund_id: autoFund?.id || '',
      },
    ]);
  };

  const handleRemovePayment = (id: string) => {
    if (payments.length === 1) return;
    setPayments(payments.filter((p) => p.id !== id));
  };

  const handleUpdatePayment = (id: string, field: keyof PaymentRow, value: string) => {
    setPayments(
      payments.map((p) => {
        if (p.id === id) {
          const updated = { ...p, [field]: value };
          if (field === 'method') {
            const autoFund = getAutoMatchedFund(value);
            updated.fund_id = autoFund?.id || '';
          }
          return updated;
        }
        return p;
      })
    );
  };

  // Sum of payments set
  const totalReceived = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const remaining = Math.max(0, finalAmount - totalReceived);

  // Overpayment change due calculation (excluding debt methods)
  const changeDue = useMemo(() => {
    const nonDebtReceived = payments
      .filter((p) => {
        const pm = paymentMethods.find((m) => m.id === p.method);
        return pm?.type !== 'debt';
      })
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    return nonDebtReceived > finalAmount ? nonDebtReceived - finalAmount : 0;
  }, [payments, paymentMethods, finalAmount]);

  // ── Filtered Customers ──
  const filteredCustomers = useMemo(() => {
    const q = custSearchQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 10);
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    );
  }, [customers, custSearchQuery]);

  // ── Constraints & Warnings ──
  const checkoutWarning = useMemo(() => {
    for (const p of payments) {
      const pm = paymentMethods.find((m) => m.id === p.method);
      const isDebt = pm?.type === 'debt';
      const isPrepaid = pm?.type === 'prepaid';
      const rowAmt = parseFloat(p.amount) || 0;

      if (isDebt && activeCustomer.id === 'C-DEFAULT-RETAIL') {
        return 'Không thể ghi nợ cho Khách mua lẻ. Vui lòng chọn hoặc thêm khách hàng cụ thể.';
      }
      if (isDebt) {
        const creditLimit = activeCustomer.credit_limit ?? 0;
        const currentDebt = activeCustomer.debt_amount ?? 0;
        if (creditLimit > 0 && (currentDebt + rowAmt) > creditLimit) {
          return `Vượt hạn mức nợ của khách hàng (Hạn mức: ${formatCurrency(creditLimit)}, Nợ hiện tại: ${formatCurrency(currentDebt)}).`;
        }
      }
      if (isPrepaid) {
        const balance = activeCustomer.prepaid_balance ?? 0;
        if (balance < rowAmt) {
          return `Số dư ví trả trước không đủ (Số dư hiện tại: ${formatCurrency(balance)}, Yêu cầu: ${formatCurrency(rowAmt)}).`;
        }
      }
    }
    return null;
  }, [payments, activeCustomer, paymentMethods]);

  const [discountDisplay, setDiscountDisplay] = useState(
    discountAmount > 0 ? maskVnd(String(discountAmount)) : '',
  );

  // ── Handlers ──
  const handleDiscountChange = (value: string) => {
    const masked = maskVnd(value);
    setDiscountDisplay(masked);
    setDiscountAmount(parseVnd(masked));
  };

  const handleSelectCustomer = (cust: Customer | null) => {
    setSelectedCustomer(cust);
    setCustSearchQuery('');
    setShowCustDropdown(false);
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      toast.error('Vui lòng nhập tên khách hàng');
      return;
    }
    try {
      const newCust = await createCustomer(shopId, {
        name: newCustName.trim(),
        phone: newCustPhone.trim() || undefined,
        customer_type: newCustType,
      });
      toast.success('Thêm khách hàng thành công');
      setCustomers([...customers, newCust]);
      setSelectedCustomer(newCust);
      setShowAddCustModal(false);
      setNewCustName('');
      setNewCustPhone('');
    } catch (err: any) {
      toast.error(err?.message || 'Không thể tạo khách hàng mới');
    }
  };

  // Open confirm modal dialog
  const handleCheckoutClick = () => {
    if (cart.length === 0) {
      toast.error('Giỏ hàng trống');
      return;
    }
    if (checkoutWarning) {
      toast.error(checkoutWarning);
      return;
    }
    if (remaining > 0) {
      toast.error(`Khách chưa trả đủ tiền (còn thiếu ${formatCurrency(remaining)})`);
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setIsSubmitting(true);

    try {
      const orderId = crypto.randomUUID();
      const isDebt = payments.some(
        (p) =>
          paymentMethods.find((m) => m.id === p.method)?.type === 'debt'
      );

      const orderPayload = {
        local_order_id: orderId,
        server_order_id: orderId,
        order: {
          status: 'completed',
          channel: 'mini_app',
          customer_id: activeCustomer.id === 'C-DEFAULT-RETAIL' ? 'C-DEFAULT-RETAIL' : activeCustomer.id,
          customer_name: activeCustomer.name,
          subtotal: subtotal,
          discount_amount: discountAmount,
          tax_amount: 0,
          total_amount: finalAmount,
          paid_amount: totalReceived,
          debt_amount: isDebt ? remaining : 0,
          payment_method: payments.map((p) => paymentMethods.find((m) => m.id === p.method)?.type || 'cash').join(','),
          note: orderNote || null,
          created_at: new Date().toISOString(),
          branch_id: shopId,
        },
        items: cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          qty: item.quantity,
          unit_price: item.unit_price,
          line_total: item.unit_price * item.quantity,
          discount_amount: 0,
        })),
        payments: payments.map((p) => ({
          method: paymentMethods.find((m) => m.id === p.method)?.type || 'cash',
          amount: parseFloat(p.amount) || 0,
          fund_id: p.fund_id || null,
        })),
        stock_movements: [],
        customer: activeCustomer.id === 'C-DEFAULT-RETAIL' ? undefined : {
          name: activeCustomer.name,
          phone: activeCustomer.phone || '',
        },
      };

      await syncOrderDirect(shopId, orderPayload);

      toast.success('Thanh toán thành công!', { duration: 2000 });
      clearCart();
      setIsCheckoutOpen(false);
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('Lỗi thanh toán. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setIsCheckoutOpen(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', maxHeight: '95dvh' }}>
        {/* Header */}
        <div className="modal-header shrink-0">
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Thanh toán đơn hàng</h3>
          <button
            onClick={() => setIsCheckoutOpen(false)}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
          
          {/* ══════ SECTION 1: Customer ══════ */}
          <div className="form-group" style={{ position: 'relative', background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }} ref={custDropdownRef}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>Khách hàng</label>
              {activeCustomer.id === 'C-DEFAULT-RETAIL' && (
                <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 700 }}>Khách lẻ</span>
              )}
            </div>

            {/* HIDE INPUT SEARCH IF CUSTOMER IS SELECTED */}
            {activeCustomer.id === 'C-DEFAULT-RETAIL' ? (
              <div style={{ display: 'flex', border: '1.5px solid #cbd5e1', borderRadius: 10, background: 'white', overflow: 'hidden', height: 40, marginTop: 4 }}>
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                  <input
                    type="text"
                    style={{ border: 'none', background: 'transparent', flex: 1, padding: '0 10px', fontSize: 14, outline: 'none' }}
                    placeholder="Tìm khách hàng..."
                    value={custSearchQuery}
                    onChange={(e) => {
                      setCustSearchQuery(e.target.value);
                      setShowCustDropdown(true);
                    }}
                    onFocus={() => setShowCustDropdown(true)}
                  />
                  {custSearchQuery && (
                    <button
                      onClick={() => {
                        setCustSearchQuery('');
                        setShowCustDropdown(false);
                      }}
                      style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddCustModal(true)}
                  style={{
                    width: 44, background: '#f1f5f9', border: 'none', borderLeft: '1.5px solid #cbd5e1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--primary)'
                  }}
                  title="Tạo khách mới"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            ) : (
              /* Active customer details shown directly when selected */
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, background: 'white', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <div>
                  <span className="font-bold text-slate-800" style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    {activeCustomer.name}
                  </span>
                  {activeCustomer.phone && <span className="text-xs text-slate-500 font-mono block mt-0.5">{activeCustomer.phone}</span>}
                  <div className="flex gap-4 mt-1 text-[10px] text-slate-500 font-medium">
                    <span>Nợ: <strong className="text-rose-600">{formatCurrency(activeCustomer.debt_amount ?? 0)}</strong></span>
                    <span>Ví trả trước: <strong className="text-emerald-600">{formatCurrency(activeCustomer.prepaid_balance ?? 0)}</strong></span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectCustomer(null)}
                  style={{
                    border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 10px',
                    color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#fee2e2'
                  }}
                >
                  Bỏ chọn
                </button>
              </div>
            )}

            {/* Dropdown list results */}
            {showCustDropdown && activeCustomer.id === 'C-DEFAULT-RETAIL' && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 12, right: 12,
                  background: 'white', border: '1px solid #cbd5e1', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 110, maxHeight: 180, overflowY: 'auto', marginTop: 4
                }}
              >
                <div
                  onClick={() => handleSelectCustomer(null)}
                  style={{
                    padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    background: activeCustomer.id === 'C-DEFAULT-RETAIL' ? '#f8fafc' : 'white',
                    fontWeight: activeCustomer.id === 'C-DEFAULT-RETAIL' ? 600 : 400
                  }}
                >
                  <span style={{ color: 'var(--primary)' }}>Khách mua lẻ</span>
                </div>
                {filteredCustomers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    style={{
                      padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                      background: activeCustomer.id === c.id ? '#f8fafc' : 'white',
                      fontWeight: activeCustomer.id === c.id ? 600 : 400
                    }}
                  >
                    <div className="flex justify-between">
                      <span className="font-semibold text-xs text-slate-800">{c.name}</span>
                      {c.phone && <span className="text-[10px] text-slate-500 font-mono">{c.phone}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ══════ SECTION 2: Cart Items & Prices ══════ */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>
              Danh sách mặt hàng & Đơn giá
            </p>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
              {cart.map((item) => {
                const lineTotal = item.unit_price * item.quantity;
                return (
                  <div
                    key={item.product.id}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 6,
                      padding: '10px 12px', borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }} className="truncate pr-4">
                        {item.product.name}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                        {formatCurrency(lineTotal)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      
                      {/* Price editing with dotted underline & edit mode */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Đơn giá:</span>
                        {editingPriceItemId === item.product.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              type="text"
                              value={maskVnd(item.unit_price)}
                              onChange={(e) => updateUnitPrice(item.product.id, parseVnd(e.target.value))}
                              onBlur={() => setEditingPriceItemId(null)}
                              onKeyDown={(e) => { if (e.key === 'Enter') setEditingPriceItemId(null) }}
                              style={{
                                width: 100, height: 28, padding: '2px 6px',
                                border: '1px solid #cbd5e1', borderRadius: 6,
                                fontSize: 12, fontWeight: 700, textAlign: 'right', background: 'white'
                              }}
                              autoFocus
                              inputMode="numeric"
                            />
                            <button
                              type="button"
                              onClick={() => setEditingPriceItemId(null)}
                              style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 600 }}
                            >
                              Xong
                            </button>
                          </div>
                        ) : (
                          <span
                            onClick={() => setEditingPriceItemId(item.product.id)}
                            style={{
                              fontSize: 12, fontWeight: 700, color: '#1e293b', borderBottom: '1px dotted #64748b', cursor: 'pointer', paddingBottom: 1
                            }}
                          >
                            {formatCurrency(item.unit_price)}
                          </span>
                        )}
                      </div>

                      {/* Quantity editing & remove */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          style={{ width: 24, height: 24, border: '1px solid #e2e8f0', borderRadius: 4, background: '#f8fafc', fontWeight: 600 }}
                        >
                          −
                        </button>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          style={{ width: 24, height: 24, border: '1px solid #e2e8f0', borderRadius: 4, background: '#f8fafc', fontWeight: 600 }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          style={{ color: '#ef4444', fontSize: 12, border: 'none', background: 'none', cursor: 'pointer', marginLeft: 8 }}
                        >
                          Xoá
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ══════ SECTION 3: Summary Totals Card with Dotted Clickable Discount ══════ */}
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1.5px solid #cbd5e1', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: '#64748b', fontSize: 13 }}>Giảm giá:</span>
              {isEditingDiscount ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={discountDisplay}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    onBlur={() => setIsEditingDiscount(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingDiscount(false) }}
                    style={{ width: 90, height: 28, padding: '2px 6px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, textAlign: 'right', background: 'white' }}
                    autoFocus
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={() => setIsEditingDiscount(false)}
                    style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}
                  >
                    Xong
                  </button>
                </div>
              ) : (
                <span
                  onClick={() => setIsEditingDiscount(true)}
                  style={{
                    fontSize: 14, fontWeight: 700, color: '#1e293b', borderBottom: '1px dotted #64748b', cursor: 'pointer', paddingBottom: 1
                  }}
                >
                  {formatCurrency(discountAmount)}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px dashed #e2e8f0' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Tổng cộng:</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: '#ea580c' }}>{formatCurrency(finalAmount)}</span>
            </div>
          </div>

          {/* Ghi chú */}
          <div className="form-group">
            <textarea
              className="form-input"
              rows={2}
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Ghi chú đơn hàng..."
              style={{ resize: 'none', background: 'white', borderColor: '#cbd5e1' }}
            />
          </div>

          {/* ══════ SECTION 4: Multi-payment (Unique select list) ══════ */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>PHƯƠNG THỨC THANH TOÁN</span>
              <button
                type="button"
                onClick={handleAddPayment}
                style={{ fontSize: 12, color: '#ea580c', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                Thêm
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {payments.map((p, idx) => {
                const pm = paymentMethods.find((m) => m.id === p.method);
                const isDebtRow = pm?.type === 'debt';
                const isPrepaidRow = pm?.type === 'prepaid';
                
                // Match and fallback funds if matching is empty
                const matchingFunds = paymentFunds.filter((f) => f.type === pm?.type);
                const resolvedFunds = matchingFunds.length > 0 ? matchingFunds : paymentFunds;

                // Unique Select Filter: exclude already used payment methods in other rows
                const usedMethods = new Set(payments.map((pay) => pay.method));

                return (
                  <div key={p.id} style={{ border: '1.5px solid #cbd5e1', borderRadius: 12, padding: 12, background: 'white', position: 'relative' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      
                      {/* Method selector with Unique Select Filtered options */}
                      <select
                        value={p.method}
                        onChange={(e) => handleUpdatePayment(p.id, 'method', e.target.value)}
                        className="form-input form-select"
                        style={{ padding: '6px 28px 6px 10px', fontSize: 13, flex: 1.2, height: 38, background: 'white', borderColor: '#cbd5e1', fontWeight: 600 }}
                      >
                        {paymentMethods.map((m) => {
                          const isUsedElsewhere = usedMethods.has(m.id) && p.method !== m.id;
                          if (isUsedElsewhere) return null; // hide already selected options!
                          return <option key={m.id} value={m.id}>{m.name}</option>;
                        })}
                      </select>

                      {/* Amount input - using 100% bug-free integer maskVnd */}
                      <input
                        type="text"
                        value={maskVnd(p.amount)}
                        onChange={(e) => handleUpdatePayment(p.id, 'amount', String(parseVnd(e.target.value)))}
                        className="form-input"
                        placeholder="Số tiền"
                        style={{ padding: '6px 10px', fontSize: 13, flex: 1, height: 38, textAlign: 'right', background: 'white', borderColor: '#cbd5e1', fontWeight: 700 }}
                        inputMode="numeric"
                      />

                      {/* Remove row */}
                      {payments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePayment(p.id)}
                          style={{ border: '1.5px solid #cbd5e1', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', color: '#ef4444', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Styled Fund selector showing name + account number */}
                    {!isDebtRow && !isPrepaidRow && resolvedFunds.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 12, position: 'relative' }}>
                        {/* Connecting line */}
                        <div style={{ position: 'absolute', left: 4, top: -8, bottom: '50%', width: 1, background: '#cbd5e1' }} />
                        <div style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1' }} />

                        <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', padding: '6px 12px', borderRadius: 8, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                          <span style={{ fontWeight: 700, color: '#c2410c', fontSize: 10 }}>QUỸ:</span>
                          {resolvedFunds.length === 1 ? (
                            <span style={{ fontWeight: 700, color: '#431407' }}>
                              {resolvedFunds[0].name} {resolvedFunds[0].account_number ? `(${resolvedFunds[0].account_number})` : ''}
                            </span>
                          ) : (
                            <select
                              value={p.fund_id || ''}
                              onChange={(e) => handleUpdatePayment(p.id, 'fund_id', e.target.value)}
                              className="form-input form-select"
                              style={{
                                padding: '2px 24px 2px 8px', fontSize: 11, flex: 1, height: 26, border: 'none',
                                background: 'transparent', color: '#431407', fontWeight: 700, outline: 'none'
                              }}
                            >
                              <option value="">-- Chọn quỹ nhận --</option>
                              {resolvedFunds.map((f) => (
                                <option key={f.id} value={f.id} style={{ background: 'white' }}>
                                  {f.name} {f.account_number ? `(${f.account_number})` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Info text for prepaid / debt */}
                    {isPrepaidRow && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#047857', fontWeight: 500, paddingLeft: 12 }}>
                        Số dư ví khả dụng: {formatCurrency(activeCustomer.prepaid_balance ?? 0)}
                      </div>
                    )}
                    {isDebtRow && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#b91c1c', fontWeight: 500, paddingLeft: 12 }}>
                        Nợ hiện tại: {formatCurrency(activeCustomer.debt_amount ?? 0)} / Hạn mức: {formatCurrency(activeCustomer.credit_limit ?? 0)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Warnings Banner */}
          {checkoutWarning && (
            <div style={{ background: '#fee2e2', border: '1.5px solid #fecaca', color: '#991b1b', padding: '10px 12px', borderRadius: 10, fontSize: 12, fontWeight: 500, marginBottom: 16 }}>
              {checkoutWarning}
            </div>
          )}

          {/* Total received list */}
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, border: '1px solid #cbd5e1', marginBottom: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Số tiền nhận:</span>
              <span style={{ fontWeight: 750, color: remaining > 0 ? '#ef4444' : '#16a34a' }}>
                {formatCurrency(totalReceived)}
                {remaining > 0 && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 6 }}>(thiếu {formatCurrency(remaining)})</span>}
              </span>
            </div>
            {changeDue > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: 4, marginTop: 4 }}>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>Trả tiền thừa:</span>
                <span style={{ fontWeight: 750, color: '#ef4444' }}>{formatCurrency(changeDue)}</span>
              </div>
            )}
          </div>

          {/* Sticky Actions Footer */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              onClick={() => setIsCheckoutOpen(false)}
              style={{
                width: 80, height: 44, border: '1.5px solid #cbd5e1', borderRadius: 10,
                background: 'white', color: '#1e293b', fontWeight: 700, fontSize: 14, cursor: 'pointer'
              }}
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleCheckoutClick}
              disabled={isSubmitting || cart.length === 0 || !!checkoutWarning || remaining > 0}
              style={{
                flex: 1, height: 44, borderRadius: 10, background: '#10b981', color: 'white',
                fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: isSubmitting || !!checkoutWarning || remaining > 0 ? 0.6 : 1, cursor: 'pointer', border: 'none'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Lưu & xác nhận ({formatCurrency(finalAmount)})
            </button>
          </div>

        </div>
      </div>

      {/* ── Sub-modal 1: Quick Add Customer ── */}
      {showAddCustModal && (
        <div className="modal-backdrop" style={{ zIndex: 200, alignItems: 'center' }} onClick={() => setShowAddCustModal(false)}>
          <div className="modal-content modal-content-center" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Thêm khách hàng mới</h3>
              <button
                type="button"
                onClick={() => setShowAddCustModal(false)}
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleQuickAddCustomer} className="modal-body">
              <div className="form-group">
                <label className="form-label">Tên khách hàng *</label>
                <input
                  type="text"
                  className="form-input"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Số điện thoại</label>
                <input
                  type="tel"
                  className="form-input"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="09XXXXXXXX"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nhóm khách hàng</label>
                <select
                  className="form-input form-select"
                  value={newCustType}
                  onChange={(e) => setNewCustType(e.target.value)}
                >
                  <option value="retail">Bán lẻ</option>
                  <option value="wholesale">Khách sỉ</option>
                  <option value="vip">Khách VIP</option>
                </select>
              </div>

              <button type="submit" className="pos-cart-btn mt-4" style={{ width: '100%' }}>
                Lưu khách hàng
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Sub-modal 2: CUSTOM CONFIRMATION DIALOG MODAL ── */}
      {showConfirmModal && (
        <div className="modal-backdrop" style={{ zIndex: 300, alignItems: 'center' }} onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content modal-content-center" style={{ maxWidth: 360, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '0 0 12px', borderBottom: '1px solid #cbd5e1' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1e293b' }}>Xác nhận thanh toán</h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div style={{ margin: '14px 0', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Khách hàng:</span>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{activeCustomer.name}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Tổng tiền thanh toán:</span>
                <span style={{ fontWeight: 750, color: 'var(--primary)', fontSize: 15 }}>{formatCurrency(finalAmount)}</span>
              </div>

              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 8, marginTop: 4 }}>
                <span style={{ color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>Chi tiết thanh toán:</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#f8fafc', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}>
                  {payments.map((p) => {
                    const pm = paymentMethods.find((m) => m.id === p.method);
                    const matchingFund = paymentFunds.find((f) => f.id === p.fund_id);
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{pm?.name || 'Tiền mặt'}</span>
                          {matchingFund && (
                            <span style={{ fontSize: 10, color: '#64748b' }}>Quỹ: {matchingFund.name} {matchingFund.account_number ? `(${matchingFund.account_number})` : ''}</span>
                          )}
                        </div>
                        <span style={{ fontWeight: 700 }}>{formatCurrency(parseFloat(p.amount) || 0)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {changeDue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fee2e2', padding: 8, borderRadius: 8, border: '1px solid #fecaca', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>
                  <span>Tiền thừa trả khách:</span>
                  <span>{formatCurrency(changeDue)}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="zaui-btn zaui-btn-tertiary"
                style={{ flex: 1, height: 40 }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="pos-cart-btn"
                style={{ flex: 1.5, height: 40 }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
