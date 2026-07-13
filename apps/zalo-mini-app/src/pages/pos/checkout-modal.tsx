import { useState, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { usePosStore } from '@/stores/pos-store';
import { useTenantStore } from '@/stores/tenant-store';
import { useAuthStore } from '@/stores/auth-store';
import { useTableStore } from '@/stores/table-store';
import { syncOrderDirect, createCustomer, getCustomers, updateLocationResource } from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import { calculateBilling } from '@/utils/billing';

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
  const paymentMethods = usePosStore((s) => s.paymentMethods);
  const paymentFunds = usePosStore((s) => s.paymentFunds);
  const selectedCustomer = usePosStore((s) => s.selectedCustomer);
  const discountAmount = usePosStore((s) => s.discountAmount);
  const orderNote = usePosStore((s) => s.orderNote);
  const profile = useAuthStore((s) => s.profile);

  // ── Table context ──
  const cartOwnerTableId = useTableStore((s) => s.cartOwnerTableId);
  const tableSessions = useTableStore((s) => s.tableSessions);
  const resources = useTableStore((s) => s.resources);
  const tableSession = cartOwnerTableId ? tableSessions[cartOwnerTableId] : null;
  const tableResource = cartOwnerTableId ? resources.find((r) => r.id === cartOwnerTableId) : null;
  const isTableCheckout = !!cartOwnerTableId && !!tableSession;

  const {
    updateQuantity,
    updateUnitPrice,
    removeFromCart,
    clearCart,
    setSelectedCustomer,
    setDiscountAmount,
    setOrderNote,
    setIsCheckoutOpen,
  } = usePosStore.getState();

  // ── Customer default ──
  const activeCustomer = useMemo<Customer>(() => {
    return selectedCustomer || { id: 'C-DEFAULT-RETAIL', name: 'Khách lẻ', customer_type: 'retail', prepaid_balance: 0, debt_amount: 0 };
  }, [selectedCustomer]);

  // Autocomplete customer search state
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const custDropdownRef = useRef<HTMLDivElement>(null);

  // Live / Paginated Customer state
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [custOffset, setCustOffset] = useState(0);
  const [custHasMore, setCustHasMore] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Quick add customer modal state
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustType, setNewCustType] = useState('retail');

  // Custom Confirmation Dialog Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // ── Adjustable Check-in / Check-out times ──
  const [customCheckInTime, setCustomCheckInTime] = useState<Date | null>(null);
  const [customCheckOutTime, setCustomCheckOutTime] = useState<Date | null>(null);
  const [isEditingTimes, setIsEditingTimes] = useState(false);
  const [editInHour, setEditInHour] = useState('');
  const [editInMinute, setEditInMinute] = useState('');
  const [editInDate, setEditInDate] = useState(''); // DD/MM/YYYY
  const [editOutHour, setEditOutHour] = useState('');
  const [editOutMinute, setEditOutMinute] = useState('');
  const [editOutDate, setEditOutDate] = useState(''); // DD/MM/YYYY

  useEffect(() => {
    if (tableSession) {
      setCustomCheckInTime(new Date(tableSession.checkInTime));
      setCustomCheckOutTime(new Date());
    } else {
      setCustomCheckInTime(null);
      setCustomCheckOutTime(null);
    }
  }, [cartOwnerTableId, tableSession]);

  const billingInfo = useMemo(() => {
    if (!isTableCheckout || !tableResource || !customCheckInTime || !customCheckOutTime) return null;

    const billing = calculateBilling({
      rentalType: tableSession.rentalType,
      checkInISO: customCheckInTime.toISOString(),
      checkOutISO: customCheckOutTime.toISOString(),
      hourlyRate: tableSession.hourlyRate ?? tableResource.hourly_rate ?? 0,
      dailyRate: tableSession.dailyRate ?? tableResource.daily_rate ?? 0,
      overnightRate: tableSession.overnightRate ?? tableResource.overnight_rate ?? 0,
      advancedPricing: tableSession.advancedPricing,
    });

    const formatDateTime = (date: any) => {
      if (!date) return '';
      const dObj = (typeof date === 'string' || typeof date === 'number' || date instanceof Date) ? new Date(date) : null;
      if (!dObj || isNaN(dObj.getTime())) return '';
      const pad = (n: number) => n.toString().padStart(2, '0');
      const d = pad(dObj.getDate());
      const m = pad(dObj.getMonth() + 1);
      const y = dObj.getFullYear();
      const h = pad(dObj.getHours());
      const min = pad(dObj.getMinutes());
      return `${h}:${min} ${d}/${m}/${y}`;
    };

    return {
      checkIn: formatDateTime(customCheckInTime),
      checkOut: formatDateTime(customCheckOutTime),
      duration: billing.label,
      cost: billing.cost,
      qty: billing.qty,
      unitPrice: billing.unitPrice,
    };
  }, [isTableCheckout, tableResource, tableSession, customCheckInTime, customCheckOutTime]);

  useEffect(() => {
    if (billingInfo && isTableCheckout) {
      const hasTimeCharge = usePosStore.getState().cart.some((item) => item.product.id === 'TIME_CHARGE');
      if (hasTimeCharge) {
        usePosStore.setState({
          cart: usePosStore.getState().cart.map((item) =>
            item.product.id === 'TIME_CHARGE' ? {
              ...item,
              quantity: billingInfo.qty,
              unit_price: billingInfo.unitPrice
            } : item
          ),
        });
      } else if (billingInfo.cost > 0) {
        const name = tableResource?.name || '';
        const billingName = tableResource?.type === 'room'
          ? `Tiền phòng - ${name} (${billingInfo.duration})`
          : `Tiền giờ - ${name} (${billingInfo.duration})`;
        usePosStore.setState({
          cart: [
            {
              product: {
                id: 'TIME_CHARGE',
                name: billingName,
                sell_price: billingInfo.unitPrice,
              },
              quantity: billingInfo.qty,
              unit_price: billingInfo.unitPrice,
            },
            ...usePosStore.getState().cart,
          ],
        });
      }
    }
  }, [billingInfo, isTableCheckout, tableResource]);

  const handleStartEditTimes = () => {
    if (!customCheckInTime || !customCheckOutTime) return;
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    setEditInHour(pad(customCheckInTime.getHours()));
    setEditInMinute(pad(customCheckInTime.getMinutes()));
    setEditInDate(`${pad(customCheckInTime.getDate())}/${pad(customCheckInTime.getMonth() + 1)}/${customCheckInTime.getFullYear()}`);
    
    setEditOutHour(pad(customCheckOutTime.getHours()));
    setEditOutMinute(pad(customCheckOutTime.getMinutes()));
    setEditOutDate(`${pad(customCheckOutTime.getDate())}/${pad(customCheckOutTime.getMonth() + 1)}/${customCheckOutTime.getFullYear()}`);
    
    setIsEditingTimes(true);
  };

  const handleSaveTimes = () => {
    try {
      const parseTime = (h: string, m: string, dStr: string) => {
        const hour = parseInt(h, 10);
        const minute = parseInt(m, 10);
        if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(minute) || minute < 0 || minute > 59) {
          throw new Error('Giờ hoặc phút không hợp lệ!');
        }
        const dateParts = dStr.split('/');
        if (dateParts.length !== 3) {
          throw new Error('Định dạng ngày phải là DD/MM/YYYY!');
        }
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10);
        const year = parseInt(dateParts[2], 10);
        if (isNaN(day) || day < 1 || day > 31 || isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000) {
          throw new Error('Ngày, tháng hoặc năm không hợp lệ!');
        }
        return new Date(year, month - 1, day, hour, minute, 0);
      };

      const newIn = parseTime(editInHour, editInMinute, editInDate);
      const newOut = parseTime(editOutHour, editOutMinute, editOutDate);

      if (newOut.getTime() < newIn.getTime()) {
        toast.error('Giờ ra không được nhỏ hơn giờ vào!');
        return;
      }

      setCustomCheckInTime(newIn);
      setCustomCheckOutTime(newOut);
      setIsEditingTimes(false);
      toast.success('Đã cập nhật thời gian sử dụng');
    } catch (err: any) {
      toast.error(err.message || 'Lỗi định dạng thời gian!');
    }
  };

  const handleResetTimes = () => {
    if (tableSession) {
      setCustomCheckInTime(new Date(tableSession.checkInTime));
      setCustomCheckOutTime(new Date());
      setIsEditingTimes(false);
      toast.success('Đã khôi phục giờ hệ thống');
    }
  };

  // ── Discount & Unit Price edit states ──
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(null);

  // ── Totals ──
  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const finalAmount = Math.max(0, subtotal - discountAmount);

  // ── Multiple Payment Rows ──
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendViaZalo, setSendViaZalo] = useState(false);

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
      // For table checkout: reuse existing orderId. For retail: new UUID.
      const orderId = isTableCheckout && tableSession?.orderId
        ? tableSession.orderId
        : crypto.randomUUID();
      const isDebt = payments.some(
        (p) =>
          paymentMethods.find((m) => m.id === p.method)?.type === 'debt'
      );

      const orderPayload: any = {
        local_order_id: orderId,
        server_order_id: orderId,
        order: {
          status: 'completed',
          channel: 'zalo',
          customer_id: activeCustomer.id === 'C-DEFAULT-RETAIL' ? 'C-DEFAULT-RETAIL' : activeCustomer.id,
          customer_name: activeCustomer.name,
          employee_id: profile?.id || null,
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
        payments: (() => {
          const list = payments.map((p) => ({
            method: paymentMethods.find((m) => m.id === p.method)?.type || 'cash',
            amount: parseFloat(p.amount) || 0,
            fund_id: p.fund_id || null,
          }));
          if (changeDue > 0) {
            const cashPaymentRow = payments.find(
              (p) => paymentMethods.find((m) => m.id === p.method)?.type === 'cash'
            );
            list.push({
              method: 'cash',
              amount: -changeDue,
              fund_id: cashPaymentRow?.fund_id || null,
            });
          }
          return list;
        })(),
        stock_movements: [],
        customer: activeCustomer.id === 'C-DEFAULT-RETAIL' ? undefined : {
          name: activeCustomer.name,
          phone: activeCustomer.phone || '',
        },
      };

      // Table checkout: add table_action to payload
      if (isTableCheckout && cartOwnerTableId) {
        orderPayload.table_action = {
          resource_id: cartOwnerTableId,
          resource_name: tableResource?.name ?? '',
          action: 'checkout',
        };
      }

      await syncOrderDirect(shopId, orderPayload);

      // ── Table-specific post-checkout: mark table cleaning ──
      if (isTableCheckout && cartOwnerTableId) {
        try {
          await updateLocationResource(shopId, cartOwnerTableId, {
            status: 'cleaning',
            current_order_id: '',
          });
          const {
            updateResource,
            removeTableSession,
            clearTableCart,
            setCartOwnerTableId,
            setIsTableCheckoutOpen,
          } = useTableStore.getState();
          updateResource(cartOwnerTableId, { status: 'cleaning', current_order_id: '' });
          removeTableSession(cartOwnerTableId);
          clearTableCart(cartOwnerTableId);
          setCartOwnerTableId(null);
          setIsTableCheckoutOpen(false);
        } catch (tableErr) {
          console.warn('Table post-checkout error:', tableErr);
        }
      }

      toast.success('Thanh toán thành công!', { duration: 2000 });

      if (sendViaZalo) {
        try {
          const isZalo = typeof window !== 'undefined' && 
            (navigator.userAgent.toLowerCase().includes('zalo') || (window as any).ZaloJSBridge);
          
          if (!isZalo) {
            toast.error('Chia sẻ Zalo chỉ hoạt động trên ứng dụng Zalo di động!', { duration: 4000 });
          } else {
            const { openProfilePicker, openChat } = await import('zmp-sdk/apis');
            const res = await openProfilePicker({ maxProfile: 1 });
            const users = res?.users;
            if (users && users.length > 0 && users[0].id) {
              const dateStr = new Date().toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit' });
              const message = `🧾 HÓA ĐƠN BÁN HÀNG
🏪 Cửa hàng: ${shop?.name || 'Hệ thống POS'}
📌 Mã đơn: ${orderId.substring(0, 8).toUpperCase()}
⏰ Thời gian: ${dateStr}
👤 Khách hàng: ${activeCustomer.name}
-----------------------------
${cart.map((item, idx) => `${idx + 1}. ${item.product.name}\n   SL: ${item.quantity} x ${formatCurrency(item.unit_price)} = ${formatCurrency(item.unit_price * item.quantity)}`).join('\n')}
-----------------------------
💰 Tổng cộng: ${formatCurrency(finalAmount)}
💵 Đã thanh toán: ${formatCurrency(totalReceived)}
${remaining > 0 ? `💳 Còn nợ: ${formatCurrency(remaining)}` : '✅ Đã thanh toán đủ'}

Cảm ơn Quý khách và hẹn gặp lại! 🙏`;

              await openChat({
                type: 'user',
                id: users[0].id,
                message: message,
              });
            } else {
              toast.error('Không tìm thấy thông tin bạn bè được chọn.');
            }
          }
        } catch (zaloErr: any) {
          console.warn('Lỗi chia sẻ Zalo:', zaloErr);
          if (zaloErr?.code !== -2003 && zaloErr?.code !== '-2003') {
            toast.error('Gửi Zalo thất bại: ' + (zaloErr?.message || 'Lỗi hệ thống'));
          }
        }
      }

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
        <div className="modal-header shrink-0" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setIsCheckoutOpen(false)}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {isTableCheckout && tableResource
              ? `Thanh toán · ${tableResource.name}`
              : 'Thanh toán đơn hàng'}
          </h3>
        </div>

        {/* Table context banner */}
        {isTableCheckout && tableResource && (
          <div style={{
            background: '#fef2f2', borderLeft: '4px solid #ef4444',
            padding: '10px 16px', margin: '0', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontWeight: 700, color: '#dc2626' }}>🏠 {tableResource.name}</span>
              {tableSession?.rentalType && (
                <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 11 }}>
                  {tableSession.rentalType === 'hourly' ? '⏱ Theo giờ'
                    : tableSession.rentalType === 'daily' ? '☀️ Theo ngày'
                    : '🌙 Qua đêm'}
                </span>
              )}
            </div>
          </div>
        )}

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

            {/* LIVE Autocomplete Dropdown List with scroll-pagination */}
            {showCustDropdown && activeCustomer.id === 'C-DEFAULT-RETAIL' && (
              <div
                onScroll={handleDropdownScroll}
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
                {customersList.map((c) => (
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
                {custLoading && (
                  <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: '#64748b' }}>
                    Đang tải thêm...
                  </div>
                )}
                {!custLoading && customersList.length === 0 && (
                  <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
                    Không tìm thấy khách hàng
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══════ SECTION 1.5: Rent/Stay Time Details (Adjustable) ══════ */}
          {isTableCheckout && billingInfo && (
            <div style={{
              background: '#f8fafc', borderRadius: 12, padding: 14,
              border: '1.5px solid #cbd5e1', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Thời gian sử dụng
                </span>
                {!isEditingTimes && (
                  <button
                    type="button"
                    onClick={handleStartEditTimes}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: '#fff7ed', border: '1.5px solid #fed7aa',
                      borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: '#ea580c',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                    </svg>
                    Sửa giờ vào/ra
                  </button>
                )}
              </div>

              {isEditingTimes ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'white', border: '1px solid #cbd5e1', borderRadius: 10, padding: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', margin: 0, textTransform: 'uppercase' }}>
                    Nhập thời gian mới
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Check-in input */}
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 6 }}>GIỜ VÀO</label>
                      <div style={{ display: 'flex', gap: 6, width: '105%', marginLeft: '-2.5%' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 8, fontWeight: 700, color: '#94a3b8', marginBottom: 2, textAlign: 'center' }}>GIỜ (0-23)</span>
                          <input
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, border: '1.5px solid #cbd5e1', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 600 }}
                            value={editInHour}
                            onChange={(e) => setEditInHour(e.target.value)}
                            placeholder="HH"
                            maxLength={2}
                            inputMode="numeric"
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 8, fontWeight: 700, color: '#94a3b8', marginBottom: 2, textAlign: 'center' }}>PHÚT (0-59)</span>
                          <input
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, border: '1.5px solid #cbd5e1', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 600 }}
                            value={editInMinute}
                            onChange={(e) => setEditInMinute(e.target.value)}
                            placeholder="mm"
                            maxLength={2}
                            inputMode="numeric"
                          />
                        </div>
                        <div style={{ flex: 2.2, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 8, fontWeight: 700, color: '#94a3b8', marginBottom: 2, textAlign: 'center' }}>NGÀY (DD/MM/YYYY)</span>
                          <input
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, border: '1.5px solid #cbd5e1', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 600 }}
                            value={editInDate}
                            onChange={(e) => setEditInDate(e.target.value)}
                            placeholder="DD/MM/YYYY"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Check-out input */}
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 6 }}>GIỜ RA</label>
                      <div style={{ display: 'flex', gap: 6, width: '105%', marginLeft: '-2.5%' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 8, fontWeight: 700, color: '#94a3b8', marginBottom: 2, textAlign: 'center' }}>GIỜ (0-23)</span>
                          <input
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, border: '1.5px solid #cbd5e1', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 600 }}
                            value={editOutHour}
                            onChange={(e) => setEditOutHour(e.target.value)}
                            placeholder="HH"
                            maxLength={2}
                            inputMode="numeric"
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 8, fontWeight: 700, color: '#94a3b8', marginBottom: 2, textAlign: 'center' }}>PHÚT (0-59)</span>
                          <input
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, border: '1.5px solid #cbd5e1', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 600 }}
                            value={editOutMinute}
                            onChange={(e) => setEditOutMinute(e.target.value)}
                            placeholder="mm"
                            maxLength={2}
                            inputMode="numeric"
                          />
                        </div>
                        <div style={{ flex: 2.2, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 8, fontWeight: 700, color: '#94a3b8', marginBottom: 2, textAlign: 'center' }}>NGÀY (DD/MM/YYYY)</span>
                          <input
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, border: '1.5px solid #cbd5e1', borderRadius: 6, textAlign: 'center', fontSize: 12, fontWeight: 600 }}
                            value={editOutDate}
                            onChange={(e) => setEditOutDate(e.target.value)}
                            placeholder="DD/MM/YYYY"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetTimes}
                    style={{
                      width: '100%', height: 34, borderRadius: 8,
                      border: '1.5px dashed #3b82f6', background: '#eff6ff',
                      fontSize: 11, fontWeight: 600, color: '#2563eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      marginTop: 4, cursor: 'pointer'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                    Sử dụng giờ hệ thống (Khôi phục)
                  </button>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setIsEditingTimes(false)}
                      style={{
                        flex: 1, height: 34, borderRadius: 8,
                        border: '1.5px solid #cbd5e1', background: '#f8fafc',
                        fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer'
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTimes}
                      style={{
                        flex: 1, height: 34, borderRadius: 8,
                        border: 'none', background: '#ea580c',
                        fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer'
                      }}
                    >
                      Xác nhận
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Giờ vào:</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{billingInfo.checkIn}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Giờ ra:</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{billingInfo.checkOut}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Tổng thời gian:</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>{billingInfo.duration}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════ SECTION 2: Cart Items & Prices ══════ */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>
              Danh sách mặt hàng & Đơn giá
            </p>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
              {(() => {
                const sortedCart = [...cart].sort((a, b) => {
                  if (a.product.id === 'TIME_CHARGE') return -1;
                  if (b.product.id === 'TIME_CHARGE') return 1;
                  return 0;
                });

                return sortedCart.map((item) => {
                  const lineTotal = item.unit_price * item.quantity;
                  const isTimeCharge = item.product.id === 'TIME_CHARGE';

                  return (
                    <div
                      key={item.product.id}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: '10px 12px', borderBottom: '1px solid #f1f5f9',
                        background: isTimeCharge ? '#ecfdf5' : 'white',
                        borderLeft: isTimeCharge ? '4px solid #10b981' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isTimeCharge ? '#065f46' : '#334155' }} className="truncate pr-4">
                          {item.product.name}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isTimeCharge ? '#047857' : 'var(--foreground)' }}>
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        
                        {/* Price editing */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: isTimeCharge ? '#047857' : '#64748b', opacity: isTimeCharge ? 0.8 : 1 }}>Đơn giá:</span>
                          {isTimeCharge ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>
                              {formatCurrency(item.unit_price)}
                            </span>
                          ) : editingPriceItemId === item.product.id ? (
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
                          {isTimeCharge ? (
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#047857' }}>
                              Số lượng: {item.quantity}
                            </span>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
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

                // Unique Select Filter
                const usedMethods = new Set(payments.map((pay) => pay.method));

                return (
                  <div key={p.id} style={{ border: '1.5px solid #cbd5e1', borderRadius: 12, padding: 12, background: 'white', position: 'relative' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      
                      {/* Method selector */}
                      <select
                        value={p.method}
                        onChange={(e) => handleUpdatePayment(p.id, 'method', e.target.value)}
                        className="form-input form-select"
                        style={{ padding: '6px 28px 6px 10px', fontSize: 13, flex: 1.2, height: 38, background: 'white', borderColor: '#cbd5e1', fontWeight: 600 }}
                      >
                        {paymentMethods.map((m) => {
                          const isUsedElsewhere = usedMethods.has(m.id) && p.method !== m.id;
                          if (isUsedElsewhere) return null;
                          return <option key={m.id} value={m.id}>{m.name}</option>;
                        })}
                      </select>

                      {/* Amount input */}
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

          {/* Zalo Share Order Checkbox */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#f0f7ff',
            borderRadius: 12,
            padding: '10px 12px',
            border: '1.5px solid #d0e7ff',
            marginBottom: 16,
            fontSize: 13,
            cursor: 'pointer',
            userSelect: 'none'
          }} onClick={() => setSendViaZalo(!sendViaZalo)}>
            <input
              type="checkbox"
              id="sendViaZalo"
              checked={sendViaZalo}
              onChange={(e) => setSendViaZalo(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                accentColor: '#0068ff',
                cursor: 'pointer'
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 600, color: '#0068ff', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                Gửi hóa đơn qua Zalo
              </span>
              <span style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                Chọn bạn bè hoặc khách để gửi tin nhắn chi tiết đơn hàng
              </span>
            </div>
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
                <label className="block text-sm font-semibold mb-1">Số điện thoại</label>
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
