import { useState, useEffect, useCallback } from 'react';
import { useTenantStore } from '@/stores/tenant-store';
import {
  getCashbook,
  getPaymentMethods,
  getCustomers,
  createCashbookEntry,
  CashbookEntry,
  PaymentMethod,
  Customer,
} from '@/services/shop-api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import toast from 'react-hot-toast';

const RECEIPT_CATEGORIES = [
  { value: 'sales', label: 'Bán hàng' },
  { value: 'debt_collection', label: 'Thu nợ' },
  { value: 'other', label: 'Khác' },
];

const PAYMENT_CATEGORIES = [
  { value: 'import', label: 'Nhập hàng' },
  { value: 'salary', label: 'Lương' },
  { value: 'utilities', label: 'Tiện ích' },
  { value: 'other', label: 'Khác' },
];

interface TxForm {
  type: 'receipt' | 'payment';
  amount: string;
  category: string;
  fund_id: string;
  customer_id: string;
  note: string;
}

const INITIAL_FORM: TxForm = {
  type: 'receipt',
  amount: '',
  category: 'sales',
  fund_id: '',
  customer_id: '',
  note: '',
};

export default function CashbookPage() {
  const shopId = useTenantStore((s) => s.shop?.id);

  const [entries, setEntries] = useState<CashbookEntry[]>([]);
  const [funds, setFunds] = useState<PaymentMethod[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFund, setSelectedFund] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<TxForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (selectedFund !== 'all') params.fund_id = selectedFund;

      const [cbRes, pmRes, custRes] = await Promise.all([
        getCashbook(shopId, params),
        getPaymentMethods(shopId),
        getCustomers(shopId, { limit: '500' }),
      ]);

      const txList = Array.isArray(cbRes) ? cbRes : [];
      setEntries(txList);
      setFunds(Array.isArray(pmRes) ? pmRes : []);
      setCustomers(custRes?.customers ?? []);
    } catch (err) {
      toast.error('Không thể tải dữ liệu sổ quỹ');
    } finally {
      setLoading(false);
    }
  }, [shopId, selectedFund]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Computed summary ──
  const totalReceipt = entries
    .filter((e) => e.type === 'receipt')
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalPayment = entries
    .filter((e) => e.type === 'payment')
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const balance = totalReceipt - totalPayment;

  // ── Modal helpers ──
  const openModal = () => {
    setForm(INITIAL_FORM);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!shopId) return;
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }
    setSubmitting(true);
    try {
      await createCashbookEntry(shopId, {
        type: form.type,
        amount,
        category: form.category,
        fund_id: form.fund_id || undefined,
        customer_id: form.customer_id || undefined,
        note: form.note || undefined,
      });
      toast.success('Tạo phiếu thành công');
      setShowModal(false);
      fetchData();
    } catch {
      toast.error('Tạo phiếu thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const categories = form.type === 'receipt' ? RECEIPT_CATEGORIES : PAYMENT_CATEGORIES;

  // ── Category label map ──
  const categoryLabels: Record<string, string> = {
    sales: 'Bán hàng',
    sale: 'Bán hàng',
    debt_collection: 'Thu nợ',
    debt_payment: 'Trả nợ nhà cung cấp',
    import: 'Nhập hàng',
    import_goods: 'Nhập hàng',
    salary: 'Lương nhân viên',
    utilities: 'Chi phí vận hành',
    returns: 'Trả hàng',
    refund: 'Hoàn tiền trả',
    other: 'Khác',
  };

  const allCatMap: Record<string, string> = {};
  [...RECEIPT_CATEGORIES, ...PAYMENT_CATEGORIES].forEach((c) => {
    allCatMap[c.value] = c.label;
  });

  return (
    <div className="min-h-full bg-background pb-20">
      {/* Summary */}
      <div className="cashbook-summary">
        <div className="cashbook-stat">
          <p className="text-2xs text-subtitle">Số dư</p>
          <p className={`cashbook-stat-value ${balance >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
            {formatCurrency(balance)}
          </p>
        </div>
        <div className="cashbook-stat">
          <p className="text-2xs text-subtitle">Tổng thu</p>
          <p className="cashbook-stat-value text-[#16a34a]">{formatCurrency(totalReceipt)}</p>
        </div>
        <div className="cashbook-stat">
          <p className="text-2xs text-subtitle">Tổng chi</p>
          <p className="cashbook-stat-value text-[#dc2626]">{formatCurrency(totalPayment)}</p>
        </div>
      </div>

      {/* Fund filter */}
      {funds.length > 0 && (
        <div className="px-3 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
          <button
            className={`pos-category-chip ${selectedFund === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedFund('all')}
          >
            Tất cả
          </button>
          {funds.map((f) => (
            <button
              key={f.id}
              className={`pos-category-chip ${selectedFund === f.id ? 'active' : ''}`}
              onClick={() => setSelectedFund(f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Transaction list */}
      {loading ? (
        <div className="px-4 space-y-3 mt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state mt-8">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <p className="empty-state-title">Chưa có giao dịch</p>
          <p className="empty-state-desc">Nhấn nút + để tạo phiếu thu/chi mới</p>
        </div>
      ) : (
        <div>
          {entries.map((tx) => (
            <div key={tx.id} className="cashbook-tx">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mr-3"
                style={{
                  background: tx.type === 'receipt' ? '#dcfce7' : '#fee2e2',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={tx.type === 'receipt' ? '#16a34a' : '#dc2626'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {tx.type === 'receipt' ? (
                    <>
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </>
                  ) : (
                    <>
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </>
                  )}
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {categoryLabels[tx.category || ''] || allCatMap[tx.category || ''] || tx.category || (tx.type === 'receipt' ? 'Thu' : 'Chi')}
                </p>
                <p className="text-2xs text-subtitle truncate">
                  {tx.customer_name || tx.note || tx.fund_name || formatDateTime(tx.created_at)}
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <p
                  className={`text-sm font-semibold ${tx.type === 'receipt' ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}
                >
                  {tx.type === 'receipt' ? '+' : '-'}
                  {formatCurrency(tx.amount)}
                </p>
                <p className="text-3xs text-inactive">{formatDateTime(tx.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button className="fab" onClick={openModal}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Create Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-base font-semibold">Tạo phiếu thu/chi</h3>
              <button onClick={() => setShowModal(false)} className="p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {/* Type toggle */}
              <div className="form-group">
                <label className="form-label">Loại phiếu</label>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      form.type === 'receipt'
                        ? 'bg-[#dcfce7] text-[#166534] border-2 border-[#16a34a]'
                        : 'bg-[#f8fafc] text-[#64748b] border-2 border-transparent'
                    }`}
                    onClick={() => setForm({ ...form, type: 'receipt', category: 'sales' })}
                  >
                    Thu
                  </button>
                  <button
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      form.type === 'payment'
                        ? 'bg-[#fee2e2] text-[#991b1b] border-2 border-[#dc2626]'
                        : 'bg-[#f8fafc] text-[#64748b] border-2 border-transparent'
                    }`}
                    onClick={() => setForm({ ...form, type: 'payment', category: 'import' })}
                  >
                    Chi
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div className="form-group">
                <label className="form-label">Số tiền</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>

              {/* Category */}
              <div className="form-group">
                <label className="form-label">Danh mục</label>
                <select
                  className="form-input form-select"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fund */}
              {funds.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Quỹ / TK thanh toán</label>
                  <select
                    className="form-input form-select"
                    value={form.fund_id}
                    onChange={(e) => setForm({ ...form, fund_id: e.target.value })}
                  >
                    <option value="">-- Chọn quỹ --</option>
                    {funds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Customer */}
              {(form.type === 'receipt' && form.category === 'debt_collection') && (
                <div className="form-group">
                  <label className="form-label">Khách hàng</label>
                  <select
                    className="form-input form-select"
                    value={form.customer_id}
                    onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Note */}
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Ghi chú..."
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>

              {/* Submit */}
              <button
                className="auth-btn auth-btn-primary mt-2"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Đang xử lý...' : 'Tạo phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
