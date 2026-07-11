import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getDebt,
  getPaymentFunds,
  createCashbookEntry,
  getDebtOrders,
  getOrderItems,
  type DebtRow,
  type PaymentFund,
  type DebtOrder,
  type OrderItem,
} from '@/services/shop-api';
import { useTenantStore } from '@/stores/tenant-store';
import { formatCurrency, cleanOrderNo } from '@/utils/format';
import toast from 'react-hot-toast';

// ────────────────────────────── Debt Collect Modal ──────────────────────────────

interface OrderAllocation {
  order_id: string;
  order_no: string;
  amount: number;
  remaining_debt: number;
  fully_paid: boolean;
}

function OrderItemsPreview({ shopId, order }: { shopId: string; order: DebtOrder }) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrderItems(shopId, { order_id: order.id })
      .then((res) => {
        setItems(res || []);
      })
      .catch((err) => {
        console.error('Lỗi tải mặt hàng', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [shopId, order.id]);

  if (loading) {
    return (
      <div style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8', textAlign: 'center', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        Đang tải chi tiết hóa đơn...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8', textAlign: 'center', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        Không có mặt hàng nào.
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#f8fafc',
      borderTop: '1px solid #e2e8f0',
      padding: '8px 12px',
      fontSize: '11px',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, paddingRight: '8px', minWidth: 0 }}>
              <p style={{ fontWeight: '600', color: '#334155', margin: 0, fontSize: '11px' }}>{item.product_name}</p>
              <p style={{ color: '#64748b', fontSize: '10px', margin: '2px 0 0 0' }}>
                {item.quantity} x {formatCurrency(item.unit_price)}
                {Number(item.discount_amount || 0) > 0 && ` (Giảm: ${formatCurrency(item.discount_amount)})`}
              </p>
            </div>
            <span style={{ fontWeight: '700', color: '#1e293b', flexShrink: 0 }}>
              {formatCurrency(item.total_price)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
          <span>Tạm tính:</span>
          <span>{formatCurrency(Number(order.subtotal || order.total_amount))}</span>
        </div>
        {Number(order.discount_amount || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', fontWeight: '500' }}>
            <span>Chiết khấu:</span>
            <span>-{formatCurrency(Number(order.discount_amount))}</span>
          </div>
        )}
        {Number(order.shipping_fee || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span>Phí giao hàng:</span>
            <span>{formatCurrency(Number(order.shipping_fee))}</span>
          </div>
        )}
        {Number(order.tax_amount || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span>Thuế:</span>
            <span>{formatCurrency(Number(order.tax_amount))}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', color: '#0f172a', paddingTop: '2px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
          <span>Tổng cộng:</span>
          <span>{formatCurrency(Number(order.total_amount))}</span>
        </div>
        {Number(order.paid_amount || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: '500', fontSize: '10px' }}>
            <span>Đã thanh toán:</span>
            <span>{formatCurrency(Number(order.paid_amount))}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444', fontWeight: '700', fontSize: '11px', paddingTop: '1px' }}>
          <span>Còn nợ đơn:</span>
          <span>{formatCurrency(Number(order.debt_amount))}</span>
        </div>
      </div>
    </div>
  );
}

interface DebtCollectModalProps {
  entity: DebtRow;
  entityType: 'customer' | 'supplier';
  shopId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function DebtCollectModal({ entity, entityType, shopId, onClose, onSuccess }: DebtCollectModalProps) {
  const isCustomer = entityType === 'customer';
  const entityId = entityType === 'supplier' ? entity.id : (entity.customer_id ?? entity.id);
  const debtAmount = Number(entity.debt_amount ?? 0);

  const [amount, setAmount] = useState(String(Math.round(debtAmount)));
  const [fundId, setFundId] = useState('');
  const [fundMethod, setFundMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [funds, setFunds] = useState<PaymentFund[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Unpaid/Debt orders for customer
  const [debtOrders, setDebtOrders] = useState<DebtOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [totalDebtFromOrders, setTotalDebtFromOrders] = useState<number | null>(null);

  const customerDebt = useMemo(() => {
    if (isCustomer && totalDebtFromOrders !== null) {
      return Math.max(debtAmount, totalDebtFromOrders);
    }
    return debtAmount;
  }, [isCustomer, debtAmount, totalDebtFromOrders]);

  const debtMode = isCustomer && debtOrders.length > 0 ? 'by_order' : 'basic';

  // Load active funds list
  useEffect(() => {
    getPaymentFunds(shopId).then((res) => {
      setFunds(res);
      const defaultFund = res.find((f) => f.is_default === 'TRUE') || res[0];
      if (defaultFund) {
        setFundId(defaultFund.id);
        setFundMethod(defaultFund.type === 'cash' ? 'cash' : 'bank_transfer');
      }
    });
  }, [shopId]);

  // Load unpaid/debt orders for this customer
  useEffect(() => {
    if (isCustomer && entityId) {
      setOrdersLoading(true);
      getDebtOrders(shopId, entityId)
        .then((res) => {
          const list = res?.data ?? [];
          setDebtOrders(list);
          setTotalDebtFromOrders(Number(res?.totalDebt ?? 0));
          setSelectedOrderIds(list.map((o) => o.id));
        })
        .catch((err) => {
          console.error('Lỗi tải danh sách đơn nợ', err);
        })
        .finally(() => {
          setOrdersLoading(false);
        });
    }
  }, [shopId, entityId, isCustomer]);

  // Total debt of selected orders in by_order mode
  const selectedOrdersDebt = useMemo(() => {
    if (debtMode !== 'by_order') return customerDebt;
    return debtOrders
      .filter((o) => selectedOrderIds.includes(o.id))
      .reduce((sum, o) => sum + Number(o.debt_amount ?? 0), 0);
  }, [selectedOrderIds, debtOrders, debtMode, customerDebt]);

  // Auto-cap/set amount when selectedOrdersDebt changes
  useEffect(() => {
    if (debtMode === 'by_order') {
      setAmount(String(Math.round(selectedOrdersDebt)));
    }
  }, [selectedOrdersDebt, debtMode]);

  // FIFO allocation preview
  const allocations = useMemo<OrderAllocation[]>(() => {
    const numAmount = Number(amount);
    if (debtMode !== 'by_order' || numAmount <= 0) return [];

    const selectedOrders = debtOrders.filter((o) => selectedOrderIds.includes(o.id));
    const result: OrderAllocation[] = [];
    let remaining = numAmount;

    for (const order of selectedOrders) {
      if (remaining <= 0) break;
      const orderDebt = Number(order.debt_amount ?? 0);
      const applied = Math.min(remaining, orderDebt);
      result.push({
        order_id: order.id,
        order_no: order.order_no || order.id,
        amount: applied,
        remaining_debt: orderDebt - applied,
        fully_paid: applied >= orderDebt,
      });
      remaining -= applied;
    }
    return result;
  }, [debtMode, amount, debtOrders, selectedOrderIds]);

  const selectedFund = funds.find((f) => f.id === fundId);
  const isBankType = selectedFund && (selectedFund.type === 'bank' || selectedFund.type === 'bank_transfer');

  const handleSubmit = async () => {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Số tiền không hợp lệ');
      return;
    }
    const maxAllowed = debtMode === 'by_order' ? selectedOrdersDebt : customerDebt;
    if (numAmount > maxAllowed) {
      toast.error(`Số tiền vượt quá giới hạn nợ tối đa (${formatCurrency(maxAllowed)})`);
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        type: isCustomer ? 'receipt' : 'payment',
        amount: numAmount,
        method: fundMethod,
        fund_id: fundId || undefined,
        category: isCustomer ? 'debt_collection' : 'debt_payment',
        reference_id: entityId,
        reference_name: entity.name,
        note: note.trim() || (isCustomer ? `Thu nợ khách hàng ${entity.name || entityId}` : `Trả nợ nhà cung cấp ${entity.name || entityId}`),
      };

      if (debtMode === 'by_order' && allocations.length > 0) {
        payload.order_allocations = allocations.map((a) => ({
          order_id: a.order_id,
          amount: a.amount,
        }));
      }

      await createCashbookEntry(shopId, payload);
      toast.success(isCustomer ? `Đã thu nợ ${formatCurrency(numAmount)} thành công!` : `Đã trả nợ ${formatCurrency(numAmount)} thành công!`);
      setShowConfirm(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Lưu thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Main Debt Modal */}
      {!showConfirm && (
        <div className="modal-backdrop" onClick={onClose}>
          <div
            className="modal-content modal-content-center"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 360 }}
          >
            <div className="modal-header">
              <h3 className="text-sm font-semibold">
                {entityType === 'supplier' ? 'Trả nợ nhà cung cấp' : 'Thu nợ khách hàng'}
              </h3>
              <button onClick={onClose} className="p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {/* Customer/Supplier info */}
              <div className="form-group mb-3">
                <label className="form-label">
                  {entityType === 'supplier' ? 'Nhà cung cấp' : 'Khách hàng'}
                </label>
                <div className="text-sm font-semibold text-foreground">
                  {entity.name || entityId}
                  {entity.phone && (
                    <span className="text-xs text-subtitle font-normal ml-2">{entity.phone}</span>
                  )}
                </div>
              </div>

              {/* Current debt */}
              <div className="form-group mb-3">
                <label className="form-label">Dư nợ hiện tại</label>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--primary)' }}>
                  {formatCurrency(customerDebt)}
                </div>
              </div>

              {/* Order selection list (Customer only) */}
              {isCustomer && ordersLoading && (
                <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                  Đang tải đơn hàng nợ...
                </div>
              )}

              {debtMode === 'by_order' && (
                <div className="form-group mb-3">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Đơn hàng đang nợ ({debtOrders.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedOrderIds.length === debtOrders.length) {
                          setSelectedOrderIds([]);
                        } else {
                          setSelectedOrderIds(debtOrders.map((o) => o.id));
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      {selectedOrderIds.length === debtOrders.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                    </button>
                  </div>

                  <div style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    backgroundColor: '#f8fafc',
                  }}>
                    {debtOrders.map((order) => {
                      const isSelected = selectedOrderIds.includes(order.id);
                      const orderDebt = Number(order.debt_amount ?? 0);
                      const alloc = allocations.find((a) => a.order_id === order.id);

                      const displayNo = cleanOrderNo(order.order_no, order.id);

                      return (
                        <div key={order.id} style={{
                          borderBottom: '1px solid #e2e8f0',
                          display: 'flex',
                          flexDirection: 'column',
                        }}>
                          {/* Main Row */}
                          <div style={{
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                          }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedOrderIds((prev) =>
                                  prev.includes(order.id)
                                    ? prev.filter((id) => id !== order.id)
                                    : [...prev, order.id]
                                );
                              }}
                              style={{ marginTop: '3px' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                                  #{displayNo}
                                </span>
                                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)' }}>
                                  {formatCurrency(orderDebt)}
                                </span>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', gap: '8px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  {/* Allocation result */}
                                  {isSelected && alloc && (
                                    <div style={{
                                      fontSize: '10px',
                                      fontWeight: '500',
                                      color: alloc.fully_paid ? '#16a34a' : '#ea580c',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}>
                                      {alloc.fully_paid ? (
                                        <>
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"/>
                                          </svg>
                                          Gạch {formatCurrency(alloc.amount)}
                                        </>
                                      ) : (
                                        <>
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                          </svg>
                                          Gạch {formatCurrency(alloc.amount)}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setExpandedOrderIds((prev) =>
                                      prev.includes(order.id)
                                        ? prev.filter((id) => id !== order.id)
                                        : [...prev, order.id]
                                    );
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    color: '#64748b',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    backgroundColor: '#f1f5f9',
                                  }}
                                >
                                  {expandedOrderIds.includes(order.id) ? 'Thu gọn' : 'Chi tiết'}
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expandedOrderIds.includes(order.id) ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                                    <polyline points="6 9 12 15 18 9"/>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Preview */}
                          {expandedOrderIds.includes(order.id) && (
                            <OrderItemsPreview shopId={shopId} order={order} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary of selected */}
                  {selectedOrderIds.length > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      backgroundColor: '#f1f5f9',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      marginTop: '6px',
                    }}>
                      <span style={{ color: '#64748b' }}>Tổng nợ các đơn đã chọn:</span>
                      <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{formatCurrency(selectedOrdersDebt)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Amount input */}
              <div className="form-group mb-3">
                <label className="form-label">Số tiền {entityType === 'supplier' ? 'trả' : 'thu'} *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ paddingRight: '32px', textAlign: 'right', fontWeight: 'bold' }}
                    placeholder="Nhập số tiền..."
                    value={amount ? Number(amount).toLocaleString('vi-VN') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      const val = Number(raw);
                      const maxAllowed = debtMode === 'by_order' ? selectedOrdersDebt : customerDebt;
                      setAmount(String(Math.min(val, maxAllowed)));
                    }}
                  />
                  <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '14px' }}>
                    đ
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>
                  Có thể sửa số tiền để thu một phần
                </p>
              </div>

              {/* Fund select */}
              {funds.length > 0 && (
                <div className="form-group mb-3">
                  <label className="form-label">Tài khoản/Sổ quỹ nhận tiền *</label>
                  <select
                    className="form-input"
                    value={fundId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFundId(id);
                      const f = funds.find((f) => f.id === id);
                      if (f) setFundMethod(f.type === 'cash' ? 'cash' : 'bank_transfer');
                    }}
                  >
                    {funds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.type === 'cash' ? 'Tiền mặt' : 'Ngân hàng'} - Số dư: {formatCurrency(f.current_balance ?? 0)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Bank info card */}
              {isBankType && selectedFund && (
                <div style={{
                  background: '#f5f9ff',
                  border: '1px solid #e0eeff',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  margin: '4px 0 12px',
                }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 'bold', color: '#2563eb', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 22v-4h18v4H3zM12 2L2 7h20L12 2zM5 18V9h3v9H5zm7 0V9h3v9h-3zm7 0V9h3v9h-3z" />
                    </svg>
                    Thông tin chuyển khoản
                  </h4>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ color: '#475569', padding: '3px 0', width: '90px' }}>Ngân hàng:</td>
                        <td style={{ color: '#1e293b', fontWeight: 'bold', padding: '3px 0' }}>{selectedFund.bank_name || '—'}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#475569', padding: '3px 0' }}>Số tài khoản:</td>
                        <td style={{ color: '#0f172a', fontWeight: 'bold', padding: '3px 0' }}>{selectedFund.account_number || '—'}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#475569', padding: '3px 0' }}>Chủ tài khoản:</td>
                        <td style={{ color: '#0f172a', fontWeight: 'bold', padding: '3px 0', textTransform: 'uppercase' }}>{selectedFund.account_name || selectedFund.account_holder || '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Note */}
              <div className="form-group mb-3">
                <label className="form-label">Ghi chú</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Ghi chú thu nợ..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  className="auth-btn auth-btn-outline flex-1"
                  style={{ background: 'white', color: '#0f172a', border: '1px solid #cbd5e1' }}
                  onClick={onClose}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="auth-btn flex-1"
                  style={{ background: 'var(--primary)', color: 'white', border: 'none' }}
                  disabled={!amount || Number(amount) <= 0 || !fundId || submitting}
                  onClick={() => setShowConfirm(true)}
                >
                  {entityType === 'supplier' ? 'Trả nợ' : 'Thu nợ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={() => setShowConfirm(false)}>
          <div className="modal-content modal-content-center" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 320 }}>
            <div className="modal-header">
              <h3 className="text-sm font-semibold">Xác nhận {entityType === 'supplier' ? 'trả nợ' : 'thu nợ'}</h3>
              <button onClick={() => setShowConfirm(false)} className="p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px', textAlign: 'center', lineHeight: '1.6' }}>
                Xác nhận {entityType === 'supplier' ? 'trả nợ' : 'thu nợ'}{' '}
                <strong style={{ color: 'var(--primary)' }}>{formatCurrency(Number(amount))}</strong>{' '}
                cho <strong>{entity.name}</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="auth-btn auth-btn-outline flex-1"
                  style={{ background: 'white', color: '#0f172a', border: '1px solid #cbd5e1' }}
                  onClick={() => setShowConfirm(false)}
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  className="auth-btn flex-1"
                  style={{ background: 'var(--primary)', color: 'white', border: 'none' }}
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Đang lưu...' : 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ────────────────────────────── Sort types ──────────────────────────────

type SortKey = 'debt_days_asc' | 'debt_days_desc' | 'debt_amount_asc' | 'debt_amount_desc';

const SORT_OPTIONS: { key: SortKey; label: string; icon: React.ReactNode }[] = [
  {
    key: 'debt_days_desc',
    label: 'Nợ lâu nhất',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
        <path d="M19 13l-3 3-3-3" />
      </svg>
    ),
  },
  {
    key: 'debt_days_asc',
    label: 'Nợ ít ngày',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
        <path d="M13 8l3-3 3 3" />
      </svg>
    ),
  },
  {
    key: 'debt_amount_desc',
    label: 'Nợ nhiều nhất',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        <path d="M19 13l-3 3-3-3" />
      </svg>
    ),
  },
  {
    key: 'debt_amount_asc',
    label: 'Nợ ít nhất',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        <path d="M13 8l3-3 3 3" />
      </svg>
    ),
  },
];

// ────────────────────────────── Main Debt Page ──────────────────────────────

export default function DebtPage() {
  const { shop } = useTenantStore();
  const shopId = shop?.id ?? '';
  const [tab, setTab] = useState<'customer' | 'supplier'>('customer');
  const [data, setData] = useState<{ data: DebtRow[]; total: number; totalDebt: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('debt_days_desc');
  const [selectedEntity, setSelectedEntity] = useState<DebtRow | null>(null);

  // Pagination & Pull to Refresh
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async (pageNum = 1, append = false) => {
    if (!shopId) return;
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const params: Record<string, string> = {
        type: tab,
        page: String(pageNum),
        limit: '20',
        sort: sort,
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await getDebt(shopId, params);
      const list = res?.data || [];

      setData((prev) => {
        if (!prev || !append) return res;
        return {
          data: [...prev.data, ...list],
          total: res.total,
          totalDebt: res.totalDebt,
        };
      });

      setHasMore(list.length === 20);
      setPage(pageNum);
    } catch {
      toast.error('Không tải được dữ liệu công nợ');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [shopId, tab, debouncedSearch, sort]);

  useEffect(() => {
    fetchData(1, false);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(1, false);
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
        await fetchData(1, false);
      }
      setPullStart(null);
      setPullOffset(0);
    }
  };

  // ── Scroll event for infinite scroll ──
  useEffect(() => {
    const scrollEl = document.querySelector('.overflow-y-auto');
    
    const handleScroll = () => {
      const el = scrollEl || document.documentElement;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
        if (hasMore && !loading && !loadingMore) {
          fetchData(page + 1, true);
        }
      }
    };
    
    if (scrollEl) {
      scrollEl.addEventListener('scroll', handleScroll);
    } else {
      window.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', handleScroll);
      } else {
        window.removeEventListener('scroll', handleScroll);
      }
    };
  }, [page, hasMore, loading, loadingMore, fetchData]);

  const processedData = useMemo(() => {
    const raw = data?.data ?? [];
    return raw.map((row) => {
      let finalDebtDays = Number(row.debt_days || 0);
      try {
        if (row.metadata) {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          if (meta?.debt_days) finalDebtDays = Number(meta.debt_days);
        }
      } catch {/* ignore */}
      return { ...row, debt_days: finalDebtDays };
    });
  }, [data?.data]);

  const totalDebt = data?.totalDebt ?? 0;

  return (
    <div 
      className="page-container" 
      style={{ paddingBottom: 80 }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-spin-custom {
          animation: spin 0.8s linear infinite;
        }
      `}</style>

      {/* Pull to Refresh Indicator */}
      <div 
        className="flex items-center justify-center transition-all overflow-hidden bg-slate-50"
        style={{
          height: refreshing ? '50px' : `${pullOffset}px`,
          opacity: refreshing || pullOffset > 0 ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2 text-xs text-subtitle">
          <div className="animate-spin-custom rounded-full h-4 w-4 border-2 border-[var(--primary)] border-t-transparent" />
          <span>{refreshing ? 'Đang làm mới...' : 'Kéo để làm mới...'}</span>
        </div>
      </div>

      <div className="px-4 pt-3 pb-0">

        {/* ── Tabs ── */}
        <div className="flex gap-0 mb-3" style={{ borderBottom: '1px solid #e2e8f0' }}>
          {(['customer', 'supplier'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setSearch(''); setPage(1); setHasMore(true); }}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: tab === t ? '700' : '500',
                color: tab === t ? 'var(--primary)' : '#64748b',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t === 'customer' ? 'Nợ cần thu' : 'Nợ cần trả'}
            </button>
          ))}
        </div>

        {/* ── Total card ── */}
        <div style={{
          background: 'color-mix(in srgb, var(--primary) 8%, white)',
          border: '1.5px solid color-mix(in srgb, var(--primary) 25%, transparent)',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: '600', opacity: 0.8 }}>
            {tab === 'supplier' ? 'Tổng nợ cần trả' : 'Tổng nợ cần thu'}
          </span>
          <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--primary)' }}>
            {formatCurrency(totalDebt)}
          </span>
        </div>

        {/* ── Search ── */}
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <svg
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '32px', fontSize: '13px' }}
            placeholder={tab === 'supplier' ? 'Tìm nhà cung cấp...' : 'Tìm khách hàng...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ── Sort chips ── */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '6px', scrollbarWidth: 'none' }}>
          {SORT_OPTIONS.map((opt) => {
            const active = sort === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => { setSort(opt.key); setPage(1); setHasMore(true); }}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: active ? '700' : '500',
                  background: active ? 'var(--primary)' : '#f1f5f9',
                  color: active ? 'white' : '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.icon} {opt.label}
              </button>
            );
          })}
        </div>

        <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
          {data?.total ?? 0} {tab === 'supplier' ? 'nhà cung cấp' : 'khách hàng'} đang nợ
        </p>
      </div>

      {/* ── List ── */}
      <div className="px-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="dashboard-card" style={{ height: 72 }}>
                <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: '40%', height: 12 }} />
              </div>
            ))}
          </div>
        ) : processedData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }}>
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
              <path d="M9 12L11 14L15 10" />
            </svg>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: 4 }}>
              {tab === 'supplier' ? 'Không có nợ cần trả' : 'Không có nợ cần thu'}
            </p>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>
              {tab === 'supplier' ? 'Tất cả nhà cung cấp đã được thanh toán.' : 'Tất cả khách hàng đã thanh toán đầy đủ.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {processedData.map((row) => {
              const entityId = tab === 'supplier' ? row.id : (row.customer_id ?? row.id);
              const debtDays = Number(row.debt_days ?? 0);
              const debtAmt = Number(row.debt_amount ?? 0);
              const isOverdue = debtDays > 30;

              return (
                <div
                  key={entityId}
                  className="dashboard-card"
                  style={{ padding: '12px 14px', cursor: 'pointer', borderRadius: '12px' }}
                  onClick={() => setSelectedEntity(row)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    {/* Left: name + phone + days badge */}
                    <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>
                        {row.name || '—'}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {/* Debt days badge */}
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '10px',
                          fontWeight: '600',
                          padding: '2px 7px',
                          borderRadius: '20px',
                          background: isOverdue
                            ? 'color-mix(in srgb, var(--primary) 12%, white)'
                            : '#f1f5f9',
                          color: isOverdue ? 'var(--primary)' : '#64748b',
                        }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          {debtDays} ngày
                          {isOverdue && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '1px' }}>
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Right: amount + button stacked */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                      <p style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)', margin: 0 }}>
                        {formatCurrency(debtAmt)}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedEntity(row); }}
                        style={{
                          background: 'var(--primary)',
                          color: 'white',
                          border: 'none',
                          padding: '4px 12px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tab === 'supplier' ? 'Trả nợ' : 'Thu nợ'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {loadingMore && (
              <div className="py-4 flex justify-center items-center gap-2">
                <div className="animate-spin-custom rounded-full h-4 w-4 border-2 border-[var(--primary)] border-t-transparent" />
                <span className="text-xs text-subtitle">Đang tải thêm...</span>
              </div>
            )}
            {!hasMore && processedData.length > 0 && (
              <div className="py-4 text-center text-3xs text-inactive">
                Đã hiển thị toàn bộ công nợ
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Debt Collect Modal ── */}
      {selectedEntity && shopId && (
        <DebtCollectModal
          entity={selectedEntity}
          entityType={tab}
          shopId={shopId}
          onClose={() => setSelectedEntity(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
