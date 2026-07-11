import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTenantStore } from '@/stores/tenant-store';
import {
  getCustomerDetail,
  getOrders,
  getCashbook,
  Customer,
  Order,
  CashbookEntry,
} from '@/services/shop-api';
import { formatCurrency, formatDateTime } from '@/utils/format';
import toast from 'react-hot-toast';

type DetailTab = 'overview' | 'orders' | 'transactions';

export default function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const shopId = useTenantStore((s) => s.shop?.id);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<CashbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  const fetchData = useCallback(async () => {
    if (!shopId || !customerId) return;
    setLoading(true);
    try {
      const [custRes, ordRes, txRes] = await Promise.all([
        getCustomerDetail(shopId, customerId),
        getOrders(shopId, { customer_id: customerId, limit: '50' }),
        getCashbook(shopId, { customer_id: customerId }),
      ]);
      setCustomer(custRes);
      setOrders(ordRes?.orders ?? []);
      const txList = Array.isArray(txRes) ? txRes : [];
      setTransactions(txList);
    } catch {
      toast.error('Không thể tải thông tin khách hàng');
    } finally {
      setLoading(false);
    }
  }, [shopId, customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-full bg-background p-4 space-y-4">
        <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 44, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="empty-state mt-12">
        <div className="empty-state-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="empty-state-title">Không tìm thấy khách hàng</p>
      </div>
    );
  }

  const getInitial = (name: string) => (name || '?').charAt(0).toUpperCase();

  const getBadgeLabel = (type?: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'vip') return 'VIP';
    if (t === 'loyal' || t === 'thân thiết') return 'Thân thiết';
    return 'Thành viên';
  };

  return (
    <div className="min-h-full bg-background pb-8">
      {/* Header Card */}
      <div className="mx-4 mt-4 bg-section rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="customer-avatar w-14 h-14 text-xl">{getInitial(customer.name)}</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">{customer.name}</h2>
            <p className="text-sm text-subtitle">{customer.phone || customer.email || ''}</p>
            <span className="customer-badge mt-1 inline-block" style={{ fontSize: 11 }}>
              {getBadgeLabel(customer.customer_type)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar mt-3">
        <button
          className={`tab-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Tổng quan
        </button>
        <button
          className={`tab-item ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          Đơn hàng ({orders.length})
        </button>
        <button
          className={`tab-item ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          Giao dịch ({transactions.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="px-4 mt-4">
          <div className="kpi-grid" style={{ padding: 0 }}>
            <div className="kpi-card">
              <p className="kpi-label">Công nợ</p>
              <p className="kpi-value text-[#dc2626]">
                {formatCurrency(customer.debt_amount ?? 0)}
              </p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Trả trước</p>
              <p className="kpi-value text-[#16a34a]">
                {formatCurrency(customer.prepaid_balance ?? 0)}
              </p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Tổng chi tiêu</p>
              <p className="kpi-value">{formatCurrency(customer.total_spent ?? 0)}</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Tổng đơn</p>
              <p className="kpi-value">{customer.total_orders ?? orders.length}</p>
            </div>
          </div>
          {customer.address && (
            <div className="mt-4 bg-section rounded-xl p-4">
              <p className="text-2xs text-subtitle mb-1">Địa chỉ</p>
              <p className="text-sm text-foreground">{customer.address}</p>
            </div>
          )}
          {customer.note && (
            <div className="mt-3 bg-section rounded-xl p-4">
              <p className="text-2xs text-subtitle mb-1">Ghi chú</p>
              <p className="text-sm text-foreground">{customer.note}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="mt-2">
          {orders.length === 0 ? (
            <div className="empty-state mt-8">
              <p className="empty-state-title">Chưa có đơn hàng</p>
              <p className="empty-state-desc">Khách hàng chưa có đơn hàng nào</p>
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="order-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-foreground">
                    {o.order_number || `#${o.id.slice(-6)}`}
                  </p>
                  <span className={`order-status ${o.status}`}>
                    {o.status === 'completed' ? 'Hoàn thành' :
                     o.status === 'cancelled' ? 'Đã hủy' :
                     o.status === 'pending' ? 'Chờ xử lý' : o.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-2xs text-subtitle">{formatDateTime(o.created_at)}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(o.final_amount ?? o.total_amount)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="mt-2">
          {transactions.length === 0 ? (
            <div className="empty-state mt-8">
              <p className="empty-state-title">Chưa có giao dịch</p>
              <p className="empty-state-desc">Khách hàng chưa có giao dịch sổ quỹ nào</p>
            </div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="cashbook-tx">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mr-3"
                  style={{
                    background: tx.type === 'receipt' ? '#dcfce7' : '#fee2e2',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={tx.type === 'receipt' ? '#16a34a' : '#dc2626'}
                    strokeWidth="2"
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
                    {tx.category || (tx.type === 'receipt' ? 'Thu' : 'Chi')}
                  </p>
                  <p className="text-2xs text-subtitle">{formatDateTime(tx.created_at)}</p>
                </div>
                <p
                  className={`text-sm font-semibold flex-shrink-0 ${
                    tx.type === 'receipt' ? 'text-[#16a34a]' : 'text-[#dc2626]'
                  }`}
                >
                  {tx.type === 'receipt' ? '+' : '-'}
                  {formatCurrency(tx.amount)}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
