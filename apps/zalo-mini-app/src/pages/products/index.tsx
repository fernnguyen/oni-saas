import { useState, useEffect, useCallback } from 'react';
import { useTenantStore } from '@/stores/tenant-store';
import {
  getProducts,
  getCategories,
  createProduct,
  updateProduct,
  Product,
  Category,
} from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import toast from 'react-hot-toast';

interface ProductForm {
  name: string;
  sku: string;
  sell_price: string;
  cost_price: string;
  category_id: string;
  unit: string;
  product_type: string;
  active: string;
}

const INITIAL_FORM: ProductForm = {
  name: '',
  sku: '',
  sell_price: '',
  cost_price: '',
  category_id: '',
  unit: 'cái',
  product_type: 'product',
  active: 'TRUE',
};

export default function ProductsPage() {
  const shopId = useTenantStore((s) => s.shop?.id);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        getProducts(shopId),
        getCategories(shopId),
      ]);
      setProducts(prodRes?.products ?? []);
      setCategories(catRes?.categories ?? []);
    } catch {
      toast.error('Không thể tải danh sách sản phẩm');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Filtered ──
  const filtered = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // ── Modal helpers ──
  const openAddModal = () => {
    setEditingProduct(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      sell_price: String(product.sell_price || ''),
      cost_price: String(product.cost_price || ''),
      category_id: product.category_id || '',
      unit: product.unit || 'cái',
      product_type: product.product_type || 'product',
      active: product.active || 'TRUE',
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!shopId) return;
    if (!form.name.trim()) {
      toast.error('Vui lòng nhập tên sản phẩm');
      return;
    }
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      sell_price: Number(form.sell_price) || 0,
      cost_price: Number(form.cost_price) || 0,
      category_id: form.category_id || undefined,
      unit: form.unit || undefined,
      product_type: form.product_type || 'product',
      active: form.active,
    };

    try {
      if (editingProduct) {
        await updateProduct(shopId, editingProduct.id, payload);
        toast.success('Cập nhật sản phẩm thành công');
      } else {
        await createProduct(shopId, payload);
        toast.success('Thêm sản phẩm thành công');
      }
      setShowModal(false);
      fetchData();
    } catch {
      toast.error(editingProduct ? 'Cập nhật thất bại' : 'Thêm sản phẩm thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-background pb-20">
      {/* Search */}
      <div className="search-bar">
        <svg className="search-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          placeholder="Tìm sản phẩm, mã SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="pos-categories">
          <button
            className={`pos-category-chip ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Tất cả
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`pos-category-chip ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Product List */}
      {loading ? (
        <div className="px-4 space-y-3 mt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state mt-8">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <p className="empty-state-title">Không có sản phẩm</p>
          <p className="empty-state-desc">
            {search ? 'Thử tìm kiếm với từ khóa khác' : 'Nhấn nút + để thêm sản phẩm mới'}
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((p) => (
            <div
              key={p.id}
              className="product-list-item"
              onClick={() => openEditModal(p)}
            >
              {/* Product image or placeholder */}
              <div className="product-list-img">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.sku && <span className="text-2xs text-subtitle">SKU: {p.sku}</span>}
                  {p.category_name && (
                    <span className="text-2xs text-subtitle">• {p.category_name}</span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className="text-sm font-semibold text-[var(--primary)]">
                  {formatCurrency(p.sell_price)}
                </p>
                {p.cost_price && Number(p.cost_price) > 0 && (
                  <p className="text-2xs text-subtitle">
                    Vốn: {formatCurrency(p.cost_price)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button className="fab" onClick={openAddModal}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-base font-semibold">
                {editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tên sản phẩm *</label>
                <input
                  className="form-input"
                  placeholder="Nhập tên sản phẩm..."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mã SKU</label>
                <input
                  className="form-input"
                  placeholder="VD: SP001"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">Giá bán</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="0"
                    value={form.sell_price}
                    onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Giá vốn</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="0"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Danh mục</label>
                <select
                  className="form-input form-select"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">-- Không chọn --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">Đơn vị</label>
                  <input
                    className="form-input"
                    placeholder="cái, kg, hộp..."
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Loại</label>
                  <select
                    className="form-input form-select"
                    value={form.product_type}
                    onChange={(e) => setForm({ ...form, product_type: e.target.value })}
                  >
                    <option value="product">Sản phẩm</option>
                    <option value="service">Dịch vụ</option>
                    <option value="combo">Combo</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Trạng thái</label>
                <select
                  className="form-input form-select"
                  value={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.value })}
                >
                  <option value="TRUE">Đang bán</option>
                  <option value="FALSE">Ngừng bán</option>
                </select>
              </div>

              <button
                className="auth-btn auth-btn-primary mt-2"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting
                  ? 'Đang xử lý...'
                  : editingProduct
                    ? 'Cập nhật sản phẩm'
                    : 'Thêm sản phẩm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
