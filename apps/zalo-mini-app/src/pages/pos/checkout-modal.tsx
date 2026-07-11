import { useState } from 'react';
import toast from 'react-hot-toast';
import { usePosStore } from '@/stores/pos-store';
import { useTenantStore } from '@/stores/tenant-store';
import { createOrderBatch } from '@/services/shop-api';
import { formatCurrency, maskCurrencyInput, parseCurrencyToNumber } from '@/utils/format';

export default function CheckoutModal() {
  const shop = useTenantStore((s) => s.shop);
  const shopId = shop?.id ?? '';

  const cart = usePosStore((s) => s.cart);
  const customers = usePosStore((s) => s.customers);
  const paymentMethods = usePosStore((s) => s.paymentMethods);
  const selectedCustomer = usePosStore((s) => s.selectedCustomer);
  const discountAmount = usePosStore((s) => s.discountAmount);
  const orderNote = usePosStore((s) => s.orderNote);

  const {
    updateQuantity,
    removeFromCart,
    clearCart,
    setSelectedCustomer,
    setDiscountAmount,
    setOrderNote,
    setIsCheckoutOpen,
  } = usePosStore.getState();

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    paymentMethods.find((pm) => pm.is_default)?.name ?? paymentMethods[0]?.name ?? 'Tiền mặt',
  );
  const [discountDisplay, setDiscountDisplay] = useState(
    discountAmount > 0 ? maskCurrencyInput(String(discountAmount)) : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Totals ──
  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const finalAmount = Math.max(0, subtotal - discountAmount);

  // ── Handlers ──
  const handleDiscountChange = (value: string) => {
    const masked = maskCurrencyInput(value);
    setDiscountDisplay(masked);
    setDiscountAmount(parseCurrencyToNumber(masked));
  };

  const handleCustomerChange = (customerId: string) => {
    if (!customerId) {
      setSelectedCustomer(null);
      return;
    }
    const customer = customers.find((c) => c.id === customerId) ?? null;
    setSelectedCustomer(customer);
  };

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast.error('Giỏ hàng trống');
      return;
    }

    setIsSubmitting(true);

    try {
      const orderId = crypto.randomUUID();
      const timestamp = Date.now();

      const orderPayload = {
        id: orderId,
        order_number: `ONI-${timestamp}`,
        status: 'completed' as const,
        total_amount: subtotal,
        discount_amount: discountAmount,
        final_amount: finalAmount,
        customer_id: selectedCustomer?.id ?? null,
        customer_name: selectedCustomer?.name ?? null,
        note: orderNote || null,
        channel: 'mini_app' as const,
        payment_method: selectedPaymentMethod,
        items: cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.quantity,
        })),
        created_at: new Date().toISOString(),
        branch_id: shopId,
      };

      await createOrderBatch(shopId, [orderPayload]);

      toast.success('Tạo đơn hàng thành công!', { duration: 2000 });
      clearCart();
      setIsCheckoutOpen(false);
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('Lỗi tạo đơn hàng. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsCheckoutOpen(false);
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ══════ Header ══════ */}
        <div className="modal-header">
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            Thanh toán
          </h3>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ══════ Body ══════ */}
        <div className="modal-body">
          {/* ── Cart Items ── */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 10 }}>
              Giỏ hàng ({cart.length} sản phẩm)
            </p>
            {cart.map((item) => (
              <div
                key={item.product.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                {/* Product info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 14, fontWeight: 500, margin: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {item.product.name}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600, margin: '2px 0 0' }}>
                    {formatCurrency(item.unit_price)}
                  </p>
                </div>

                {/* Qty controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    style={{
                      width: 28, height: 28, borderRadius: 6,
                      border: '1.5px solid #e2e8f0', background: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 16, fontWeight: 600,
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                    style={{
                      width: 28, height: 28, borderRadius: 6,
                      border: '1.5px solid #e2e8f0', background: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 16, fontWeight: 600,
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Line total + remove */}
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                    {formatCurrency(item.unit_price * item.quantity)}
                  </p>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      color: '#ef4444', fontSize: 12, cursor: 'pointer', marginTop: 2,
                    }}
                  >
                    Xoá
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ── Customer Selector ── */}
          <div className="form-group">
            <label className="form-label">Khách hàng</label>
            <select
              className="form-input form-select"
              value={selectedCustomer?.id ?? ''}
              onChange={(e) => handleCustomerChange(e.target.value)}
            >
              <option value="">Khách lẻ</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` - ${c.phone}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* ── Discount ── */}
          <div className="form-group">
            <label className="form-label">Giảm giá</label>
            <input
              className="form-input"
              placeholder="0"
              value={discountDisplay}
              onChange={(e) => handleDiscountChange(e.target.value)}
              inputMode="numeric"
            />
          </div>

          {/* ── Note ── */}
          <div className="form-group">
            <label className="form-label">Ghi chú đơn hàng</label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="Ghi chú thêm..."
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              style={{ resize: 'none' }}
            />
          </div>

          {/* ── Payment Method ── */}
          <div className="form-group">
            <label className="form-label">Phương thức thanh toán</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {paymentMethods.length > 0 ? (
                paymentMethods.map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => setSelectedPaymentMethod(pm.name)}
                    className="pos-category-chip"
                    style={{
                      ...(selectedPaymentMethod === pm.name
                        ? { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }
                        : {}),
                    }}
                  >
                    {pm.name}
                  </button>
                ))
              ) : (
                <button
                  className="pos-category-chip active"
                  style={{ cursor: 'default' }}
                >
                  Tiền mặt
                </button>
              )}
            </div>
          </div>

          {/* ── Summary ── */}
          <div style={{
            background: '#f8fafc', borderRadius: 12, padding: 16,
            marginTop: 8, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: '#64748b' }}>Tạm tính</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>Giảm giá</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>
                  -{formatCurrency(discountAmount)}
                </span>
              </div>
            )}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              paddingTop: 8, borderTop: '1px solid #e2e8f0',
            }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Tổng cộng</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>
                {formatCurrency(finalAmount)}
              </span>
            </div>
          </div>

          {/* ── Submit Button ── */}
          <button
            className="pos-cart-btn"
            onClick={handleSubmit}
            disabled={isSubmitting || cart.length === 0}
            style={{ width: '100%', opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? (
              <span>Đang xử lý...</span>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                Xác nhận thanh toán
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
