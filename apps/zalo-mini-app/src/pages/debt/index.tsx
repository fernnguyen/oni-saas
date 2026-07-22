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

interface ZaloDebtReminderModalProps {
  entity: DebtRow;
  amount: number;
  funds: PaymentFund[];
  shopName: string;
  onClose: () => void;
}

type ToneType = 'gentle' | 'professional' | 'friendly' | 'viral' | 'firm';

function ZaloDebtReminderModal({ entity, amount, funds, shopName, onClose }: ZaloDebtReminderModalProps) {
  const [tone, setTone] = useState<ToneType>('gentle');
  
  const bankFunds = useMemo(() => funds.filter(f => f.type === 'bank' || f.type === 'bank_transfer'), [funds]);
  const [selectedFundId, setSelectedFundId] = useState(() => {
    const defaultFund = bankFunds.find(f => f.is_default === 'TRUE') || bankFunds[0];
    return defaultFund?.id || '';
  });

  const selectedFund = useMemo(() => bankFunds.find(f => f.id === selectedFundId), [bankFunds, selectedFundId]);

  const getVietQRBankCode = (bankName?: string): string => {
    if (!bankName) return '';
    const clean = bankName.toLowerCase().replace(/\s+/g, '');
    if (clean.includes('vietcombank') || clean === 'vcb') return 'vcb';
    if (clean.includes('techcombank') || clean === 'tcb') return 'tcb';
    if (clean.includes('vietinbank') || clean === 'ctg') return 'vietinbank';
    if (clean.includes('bidv')) return 'bidv';
    if (clean.includes('mbbank') || clean === 'mb') return 'mb';
    if (clean.includes('acb')) return 'acb';
    if (clean.includes('vpbank') || clean === 'vpb') return 'vpbank';
    if (clean.includes('tpbank') || clean === 'tpb') return 'tpb';
    if (clean.includes('sacombank') || clean === 'stb') return 'sacombank';
    if (clean.includes('agribank') || clean === 'vba') return 'agribank';
    if (clean.includes('hdbank') || clean === 'hdb') return 'hdbank';
    if (clean.includes('vib')) return 'vib';
    if (clean.includes('shb')) return 'shb';
    return bankName.toUpperCase();
  };

  const messageText = useMemo(() => {
    const custName = entity.name || 'Quý khách';
    const amountFormatted = formatCurrency(amount);
    
    let bankInfoText = '';
    let qrUrl = '';
    if (selectedFund && selectedFund.account_number) {
      const bankCode = getVietQRBankCode(selectedFund.bank_name);
      const accNo = selectedFund.account_number;
      const accName = encodeURIComponent(selectedFund.account_name || selectedFund.account_holder || '');
      const addInfo = encodeURIComponent(`THANH TOAN CONG NO ${entity.name ? entity.name.toUpperCase() : ''}`);
      qrUrl = `https://img.vietqr.io/image/${bankCode}-${accNo}-compact.png?amount=${amount}&addInfo=${addInfo}&accountName=${accName}`;
      
      bankInfoText = `\n\n📌 Thông tin thanh toán:
Ngân hàng: ${selectedFund.bank_name || '—'}
Số tài khoản: ${selectedFund.account_number}
Chủ tài khoản: ${selectedFund.account_name || selectedFund.account_holder || '—'}`;
    }

    if (tone === 'gentle') {
      return `Dạ em chào anh/chị ${custName}, em gửi từ ${shopName} ạ.
Hiện tại hệ thống ghi nhận khoản công nợ của mình là ${amountFormatted}.
Anh/chị sắp xếp xem xét đối chiếu và thanh toán giúp shop nhé. Em cảm ơn anh/chị nhiều ạ! 😊${bankInfoText}`;
    }
    
    if (tone === 'professional') {
      return `Kính gửi Quý khách hàng ${custName},
Đại diện ${shopName} xin trân trọng thông báo về khoản dư nợ công nợ của Quý khách tính đến thời điểm hiện tại là: ${amountFormatted}.
Kính đề nghị Quý khách hàng tiến hành đối chiếu thông tin và hoàn tất thanh toán trong thời gian sớm nhất theo chính sách của cửa hàng.
Trân trọng cảm ơn sự hợp tác của Quý khách!${bankInfoText}`;
    }

    if (tone === 'friendly') {
      return `Alo sếp ${custName} iu dấu ơi!
Em gửi sếp số dư công nợ của mình nha: ${amountFormatted}.
Sếp bớt chút thời gian "ting ting" giải cứu shop nha, shop nhớ tiếng chuông ting ting của sếp lắm rồi á! 🥺 Chúc sếp ngày mới ngập tràn niềm vui! ${bankInfoText}`;
    }

    if (tone === 'viral') {
      return `Alo alo sếp ${custName} ơi!
Lướt Facebook thấy sếp check-in ăn chơi, du lịch sang chảnh mê thật!
Mà sếp ôi, còn khoản nợ ${amountFormatted} nhỏ tí ti ở ${shopName} kìa, sếp bớt chút "tiền lẻ" ting-ting cho shop để shop có chi phí đi đu đưa theo sếp với ạ! 🤪
Ting-ting liền tay - giữ trọn tình anh em sếp nhé! ❤️${bankInfoText}`;
    }

    if (tone === 'firm') {
      return `[THÔNG BÁO NHẮC NỢ GẤP] từ ${shopName}:
Kính gửi ${custName}, hệ thống ghi nhận khoản nợ ${amountFormatted} của Quý khách đã đến/quá hạn thanh toán.
Rất mong Quý khách vui lòng kiểm tra và hoàn tất chuyển khoản ngay hôm nay để tránh gián đoạn các giao dịch tiếp theo.
Xin cảm ơn!${bankInfoText}`;
    }

    return '';
  }, [tone, entity, amount, selectedFund, shopName]);

  const handleSendReminder = async () => {
    try {
      const isZalo = typeof window !== 'undefined' && 
        (navigator.userAgent.toLowerCase().includes('zalo') || (window as any).ZaloJSBridge);
      
      if (!isZalo) {
        toast.error('Nhắc nợ Zalo chỉ hoạt động trên ứng dụng Zalo di động!', { duration: 4000 });
        return;
      }

      const { openProfilePicker, openChat } = await import('zmp-sdk/apis');
      const res = await openProfilePicker({ maxProfile: 1 });
      const users = res?.users;
      if (users && users.length > 0 && users[0].id) {
        await openChat({
          type: 'user',
          id: users[0].id,
          message: messageText
        });
        toast.success('Đã mở chat Zalo gửi lời nhắc nợ!');
        onClose();
      } else {
        toast.error('Không tìm thấy thông tin bạn bè được chọn.');
      }
    } catch (err: any) {
      console.error('Lỗi gọi Zalo API:', err);
      if (err?.code !== -2003 && err?.code !== '-2003') {
        toast.error('Gửi nhắc nợ thất bại: ' + (err?.message || 'Lỗi hệ thống'));
      }
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal-content modal-content-center" style={{ maxWidth: 360, maxHeight: '90dvh', overflowY: 'auto', padding: 18 }} onClick={e => e.stopPropagation()}>
        
        <div className="modal-header" style={{ padding: '0 0 12px', borderBottom: '1px solid #cbd5e1', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1e293b' }}>Cấu hình nhắc nợ Zalo</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="form-group mb-3">
          <label className="form-label" style={{ fontWeight: 600, fontSize: 12 }}>Giọng điệu lời nhắc</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 4 }}>
            {[
              { id: 'gentle', label: 'Nhẹ nhàng 😊' },
              { id: 'professional', label: 'Lịch sự 🫡' },
              { id: 'friendly', label: 'Hài hước 🤣' },
              { id: 'viral', label: 'Cà khịa 😏' },
              { id: 'firm', label: 'Cương quyết 😤' },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTone(t.id as ToneType)}
                style={{
                  padding: '6px 4px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 'bold',
                  background: tone === t.id ? '#0068ff' : '#f1f5f9',
                  color: tone === t.id ? 'white' : '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {bankFunds.length > 0 ? (
          <div className="form-group mb-3">
            <label className="form-label" style={{ fontWeight: 600, fontSize: 12 }}>Tài khoản nhận tiền</label>
            <select
              className="form-input"
              value={selectedFundId}
              onChange={e => setSelectedFundId(e.target.value)}
              style={{ fontSize: 12, marginTop: 4 }}
            >
              {bankFunds.map(f => (
                <option key={f.id} value={f.id}>
                  {f.bank_name || f.name} - {f.account_number}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ padding: '8px 10px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, fontSize: 11, color: '#b45309', marginBottom: 12 }}>
            Cửa hàng chưa cấu hình Sổ quỹ Ngân hàng. Lời nhắc sẽ chỉ chứa văn bản thông thường không kèm VietQR.
          </div>
        )}

        <div className="form-group mb-3">
          <label className="form-label" style={{ fontWeight: 600, fontSize: 12 }}>Xem trước tin nhắn</label>
          <div style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            lineHeight: 1.5,
            color: '#1e293b',
            whiteSpace: 'pre-wrap',
            maxHeight: 160,
            overflowY: 'auto',
            marginTop: 4
          }}>
            {messageText}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              height: 38,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              background: 'white',
              color: '#475569',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={handleSendReminder}
            style={{
              flex: 1.5,
              height: 38,
              borderRadius: 8,
              background: '#0068ff',
              color: 'white',
              fontWeight: 700,
              fontSize: 12,
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
            Gửi qua Zalo
          </button>
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
  const [showZaloReminder, setShowZaloReminder] = useState(false);
  const shopName = useTenantStore((s) => s.shop)?.name || 'Cửa hàng';

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                {isCustomer && (
                  <button
                    type="button"
                    onClick={() => setShowZaloReminder(true)}
                    style={{
                      width: '100%',
                      height: 40,
                      background: '#0068ff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '700',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <path fillRule="evenodd" clipRule="evenodd" d="M22.782 0.166016H27.199C33.2653 0.166016 36.8103 1.05701 39.9572 2.74421C43.1041 4.4314 45.5875 6.89585 47.2557 10.0428C48.9429 13.1897 49.8339 16.7347 49.8339 22.801V27.1991C49.8339 33.2654 48.9429 36.8104 47.2557 39.9573C45.5685 43.1042 43.1041 45.5877 39.9572 47.2559C36.8103 48.9431 33.2653 49.8341 27.199 49.8341H22.8009C16.7346 49.8341 13.1896 48.9431 10.0427 47.2559C6.89583 45.5687 4.41243 43.1042 2.7442 39.9573C1.057 36.8104 0.166016 33.2654 0.166016 27.1991V22.801C0.166016 16.7347 1.057 13.1897 2.7442 10.0428C4.43139 6.89585 6.89583 4.41245 10.0427 2.74421C13.1707 1.05701 16.7346 0.166016 22.782 0.166016Z" fill="#0068FF"/>
                      <path opacity="0.12" fillRule="evenodd" clipRule="evenodd" d="M49.8336 26.4736V27.1994C49.8336 33.2657 48.9427 36.8107 47.2555 39.9576C45.5683 43.1045 43.1038 45.5879 39.9569 47.2562C36.81 48.9434 33.265 49.8344 27.1987 49.8344H22.8007C17.8369 49.8344 14.5612 49.2378 11.8104 48.0966L7.27539 43.4267L49.8336 26.4736Z" fill="#001A33"/>
                      <path fillRule="evenodd" clipRule="evenodd" d="M7.779 43.5892C10.1019 43.846 13.0061 43.1836 15.0682 42.1825C24.0225 47.1318 38.0197 46.8954 46.4923 41.4732C46.8209 40.9803 47.1279 40.4677 47.4128 39.9363C49.1062 36.7779 50.0004 33.22 50.0004 27.1316V22.7175C50.0004 16.629 49.1062 13.0711 47.4128 9.91273C45.7385 6.75436 43.2461 4.28093 40.0877 2.58758C36.9293 0.894239 33.3714 0 27.283 0H22.8499C17.6644 0 14.2982 0.652754 11.4699 1.89893C11.3153 2.03737 11.1636 2.17818 11.0151 2.32135C2.71734 10.3203 2.08658 27.6593 9.12279 37.0782C9.13064 37.0921 9.13933 37.1061 9.14889 37.1203C10.2334 38.7185 9.18694 41.5154 7.55068 43.1516C7.28431 43.399 7.37944 43.5512 7.779 43.5892Z" fill="white"/>
                      <path d="M20.5632 17H10.8382V19.0853H17.5869L10.9329 27.3317C10.7244 27.635 10.5728 27.9194 10.5728 28.5639V29.0947H19.748C20.203 29.0947 20.5822 28.7156 20.5822 28.2606V27.1421H13.4922L19.748 19.2938C19.8428 19.1801 20.0134 18.9716 20.0893 18.8768L20.1272 18.8199C20.4874 18.2891 20.5632 17.8341 20.5632 17.2844V17Z" fill="#0068FF"/>
                      <path d="M32.9416 29.0947H34.3255V17H32.2402V28.3933C32.2402 28.7725 32.5435 29.0947 32.9416 29.0947Z" fill="#0068FF"/>
                      <path d="M25.814 19.6924C23.1979 19.6924 21.0747 21.8156 21.0747 24.4317C21.0747 27.0478 23.1979 29.171 25.814 29.171C28.4301 29.171 30.5533 27.0478 30.5533 24.4317C30.5723 21.8156 28.4491 19.6924 25.814 19.6924ZM25.814 27.2184C24.2785 27.2184 23.0273 25.9672 23.0273 24.4317C23.0273 22.8962 24.2785 21.645 25.814 21.645C27.3495 21.645 28.6007 22.8962 28.6007 24.4317C28.6007 25.9672 27.3685 27.2184 25.814 27.2184Z" fill="#0068FF"/>
                      <path d="M40.4867 19.6162C37.8516 19.6162 35.7095 21.7584 35.7095 24.3934C35.7095 27.0285 37.8516 29.1707 40.4867 29.1707C43.1217 29.1707 45.2639 27.0285 45.2639 24.3934C45.2639 21.7584 43.1217 19.6162 40.4867 19.6162ZM40.4867 27.2181C38.9322 27.2181 37.681 25.9669 37.681 24.4124C37.681 22.8579 38.9322 21.6067 40.4867 21.6067C42.0412 21.6067 43.2924 22.8579 43.2924 24.4124C43.2924 25.9669 42.0412 27.2181 40.4867 27.2181Z" fill="#0068FF"/>
                      <path d="M29.4562 29.0944H30.5747V19.957H28.6221V28.2793C28.6221 28.7153 29.0012 29.0944 29.4562 29.0944Z" fill="#0068FF"/>
                    </svg>
                    Nhắc nợ qua Zalo
                  </button>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="auth-btn auth-btn-outline flex-1"
                    style={{
                      background: 'white',
                      color: '#0f172a',
                      border: '1.5px solid #cbd5e1',
                      height: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                    onClick={onClose}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="auth-btn flex-1"
                    style={{
                      background: 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      height: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                    disabled={!amount || Number(amount) <= 0 || !fundId || submitting}
                    onClick={() => setShowConfirm(true)}
                  >
                    {entityType === 'supplier' ? 'Trả nợ' : 'Thu nợ'}
                  </button>
                </div>
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

      {showZaloReminder && (
        <ZaloDebtReminderModal
          entity={entity}
          amount={Number(amount)}
          funds={funds}
          shopName={shopName}
          onClose={() => setShowZaloReminder(false)}
        />
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
