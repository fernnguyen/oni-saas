import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantStore } from '@/stores/tenant-store';
import { getCustomers, createCustomer, Customer } from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'vip', label: 'VIP' },
  { key: 'loyal', label: 'Thân thiết' },
  { key: 'member', label: 'Thành viên' },
];

interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  customer_type: string;
  note: string;
}

const INITIAL_FORM: CustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  customer_type: 'member',
  note: '',
};

export default function CustomersPage() {
  const shopId = useTenantStore((s) => s.shop?.id);
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CustomerForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Pagination & Lazy loading
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Pull-to-refresh states
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCustomers = useCallback(async (pageNum = 1, append = false) => {
    if (!shopId) return;
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const params: Record<string, string> = {
        page: String(pageNum),
        limit: '20',
        sort_by: 'created_at',
        sort_order: 'desc',
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (activeTab !== 'all') params.customer_type = activeTab;

      const res = await getCustomers(shopId, params);
      const list = res?.customers ?? [];
      setCustomers((prev) => append ? [...prev, ...list] : list);
      setHasMore(list.length === 20);
      setPage(pageNum);
    } catch {
      toast.error('Không thể tải danh sách khách hàng');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [shopId, debouncedSearch, activeTab]);

  useEffect(() => {
    fetchCustomers(1, false);
  }, [fetchCustomers]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCustomers(1, false);
  };

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    fetchCustomers(page + 1, true);
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
        await fetchCustomers(1, false);
      }
      setPullStart(null);
      setPullOffset(0);
    }
  };

  const filtered = customers;

  // ── Modal ──
  const openModal = () => {
    setForm(INITIAL_FORM);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!shopId) return;
    if (!form.name.trim()) {
      toast.error('Vui lòng nhập tên khách hàng');
      return;
    }
    setSubmitting(true);
    try {
      await createCustomer(shopId, {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        customer_type: form.customer_type,
        note: form.note.trim() || undefined,
      });
      toast.success('Thêm khách hàng thành công');
      setShowModal(false);
      fetchCustomers();
    } catch {
      toast.error('Thêm khách hàng thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const getInitial = (name: string) => {
    return (name || '?').charAt(0).toUpperCase();
  };

  const getBadgeClass = (type?: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'vip') return 'customer-badge vip';
    if (t === 'loyal' || t === 'thân thiết') return 'customer-badge loyal';
    return 'customer-badge member';
  };

  const getBadgeLabel = (type?: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'vip') return 'VIP';
    if (t === 'loyal' || t === 'thân thiết') return 'Thân thiết';
    return 'Thành viên';
  };

  // ── Scroll event for infinite scroll ──
  useEffect(() => {
    const scrollEl = document.querySelector('.overflow-y-auto');
    
    const handleScroll = () => {
      const el = scrollEl || document.documentElement;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
        if (hasMore && !loading && !loadingMore) {
          fetchCustomers(page + 1, true);
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
  }, [page, hasMore, loading, loadingMore, fetchCustomers]);

  return (
    <div 
      className="min-h-full bg-background pb-20"
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

      {/* Search */}
      <div className="search-bar">
        <svg className="search-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          placeholder="Tìm khách hàng..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="px-4 space-y-3 mt-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state mt-8">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <p className="empty-state-title">Không có khách hàng</p>
          <p className="empty-state-desc">
            {search ? 'Thử tìm kiếm với từ khóa khác' : 'Nhấn nút + để thêm khách hàng mới'}
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((c) => (
            <div
              key={c.id}
              className="customer-card"
              onClick={() => navigate(`/customers/${c.id}`)}
            >
              <div className="customer-avatar">{getInitial(c.name)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  <span className={getBadgeClass(c.customer_type)}>
                    {getBadgeLabel(c.customer_type)}
                  </span>
                </div>
                <p className="text-2xs text-subtitle truncate">
                  {c.phone || c.email || 'Chưa có thông tin liên hệ'}
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                {(c.debt_amount ?? 0) > 0 && (
                  <p className="text-2xs text-[#dc2626] font-medium">
                    Nợ: {formatCurrency(c.debt_amount)}
                  </p>
                )}
                {(c.total_spent ?? 0) > 0 && (
                  <p className="text-3xs text-subtitle">
                    Đã chi: {formatCurrency(c.total_spent)}
                  </p>
                )}
              </div>
            </div>
          ))}

          {loadingMore && (
            <div className="py-4 flex justify-center items-center gap-2">
              <div className="animate-spin-custom rounded-full h-4 w-4 border-2 border-[var(--primary)] border-t-transparent" />
              <span className="text-xs text-subtitle">Đang tải thêm...</span>
            </div>
          )}
          {!hasMore && filtered.length > 0 && (
            <div className="py-4 text-center text-3xs text-inactive">
              Đã hiển thị toàn bộ khách hàng
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <button className="fab" onClick={openModal}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Add Customer Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-base font-semibold">Thêm khách hàng</h3>
              <button onClick={() => setShowModal(false)} className="p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tên khách hàng *</label>
                <input
                  className="form-input"
                  placeholder="Nhập tên..."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Số điện thoại</label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="0xxx xxx xxx"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Địa chỉ</label>
                <input
                  className="form-input"
                  placeholder="Nhập địa chỉ..."
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Loại khách hàng</label>
                <select
                  className="form-input form-select"
                  value={form.customer_type}
                  onChange={(e) => setForm({ ...form, customer_type: e.target.value })}
                >
                  <option value="member">Thành viên</option>
                  <option value="loyal">Thân thiết</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
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
              <button
                className="auth-btn auth-btn-primary mt-2"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? 'Đang xử lý...' : 'Thêm khách hàng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
