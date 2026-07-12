import { useState, useEffect, useCallback, useRef } from 'react';
import { useTenantStore } from '@/stores/tenant-store';
import {
  getProducts,
  getCategories,
  createProduct,
  updateProduct,
  createCategory,
  Product,
  Category,
} from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/services/api';
import toast from 'react-hot-toast';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';

// Simple VND integer format masking
const maskVNDInput = (text: string): string => {
  if (!text) return '';
  const clean = text.replace(/\D/g, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const parseVNDToNumber = (formattedValue: string): number => {
  if (!formattedValue) return 0;
  return parseInt(formattedValue.replace(/\./g, ''), 10) || 0;
};

interface ProductForm {
  name: string;
  sku: string;
  barcode: string;
  sell_price: string;
  cost_price: string;
  category_id: string;
  unit: string;
  product_type: string;
  active: string;
  image_url: string;
}

const INITIAL_FORM: ProductForm = {
  name: '',
  sku: '',
  barcode: '',
  sell_price: '',
  cost_price: '',
  category_id: '',
  unit: 'cái',
  product_type: 'product',
  active: 'TRUE',
  image_url: '',
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

  // Barcode scanner modal state
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);

  const handleBarcodeScanned = (code: string) => {
    setForm((prev) => ({ ...prev, barcode: code }));
    setIsBarcodeScannerOpen(false);
  };

  // Pagination & Lazy loading
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Plan Check (Hidden photo upload for Free plan)
  const [isFreePlan, setIsFreePlan] = useState(true);

  // Pull-to-refresh gestures
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);

  // Image upload
  const [selectedLocalImageUri, setSelectedLocalImageUri] = useState<string | null>(null);

  // Category creation
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCategoryConfirm, setShowCategoryConfirm] = useState(false);
  const [submittingCategory, setSubmittingCategory] = useState(false);

  // Check Plan Meta on Mount
  useEffect(() => {
    const checkPlan = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: member } = await supabase
          .from('user_tenants')
          .select('tenant_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
          
        if (member?.tenant_id) {
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('plans (code)')
            .eq('tenant_id', member.tenant_id)
            .maybeSingle();
            
          const planCode = (sub?.plans as any)?.code;
          setIsFreePlan(!planCode || planCode === 'plan_mini');
        }
      } catch (err) {
        console.error('Error checking plan:', err);
      }
    };
    checkPlan();
  }, [shopId]);

  const fetchData = useCallback(async (pageNum = 1, append = false) => {
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
      };
      if (search.trim()) params.search = search.trim();
      if (selectedCategory && selectedCategory !== 'all') {
        params.category_id = selectedCategory;
      }

      const [prodRes, catRes] = await Promise.all([
        getProducts(shopId, params),
        getCategories(shopId),
      ]);
      const newProds = prodRes?.products ?? [];
      
      setProducts((prev) => append ? [...prev, ...newProds] : newProds);
      setCategories(catRes?.categories ?? []);
      setHasMore(newProds.length === 20);
      setPage(pageNum);
    } catch {
      toast.error('Không thể tải danh sách sản phẩm');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [shopId, search, selectedCategory]);

  // Load page 1 on filter changes
  useEffect(() => {
    fetchData(1, false);
  }, [search, selectedCategory]);

  // Infinite Scroll Listener
  useEffect(() => {
    const handleScroll = () => {
      if (loading || loadingMore || !hasMore) return;
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const clientHeight = window.innerHeight;
      
      if (scrollHeight - scrollTop - clientHeight < 100) {
        fetchData(page + 1, true);
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [page, hasMore, loading, loadingMore, fetchData]);

  // Gesture Pull to Refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = 0;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === 0) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0) {
      setPulling(true);
      setPullDistance(Math.min(diff * 0.4, 80));
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 50) {
      fetchData(1, false);
    }
    setPulling(false);
    setPullDistance(0);
    startY.current = 0;
  };

  // ── Filtered ──
  const filtered = products.filter((p) => {
    // Hide TIME_CHARGE
    const skuUpper = (p.sku || '').toUpperCase();
    const idUpper = (p.id || '').toUpperCase();
    return !skuUpper.includes('TIME_CHARGE') && !idUpper.includes('TIME_CHARGE');
  });

  // ── Modal helpers ──
  const openAddModal = () => {
    setEditingProduct(null);
    setForm(INITIAL_FORM);
    setSelectedLocalImageUri(null);
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      sell_price: maskVNDInput(String(product.sell_price || '')),
      cost_price: maskVNDInput(String(product.cost_price || '')),
      category_id: product.category_id || '',
      unit: product.unit || 'cái',
      product_type: product.product_type || 'product',
      active: product.active || 'TRUE',
      image_url: product.image_url || '',
    });
    setSelectedLocalImageUri(null);
    setShowModal(true);
  };

  // Handle Media Picker (Zalo SDK)
  const handleSelectImage = async () => {
    try {
      const { openMediaPicker } = await import('zmp-sdk/apis');
      
      toast.loading('Đang mở thư viện...', { id: 'media-picker' });
      const { data } = await openMediaPicker({
        type: 'photo',
        maxSelectItem: 1,
      });
      toast.dismiss('media-picker');

      const fileUri = Array.isArray(data) ? data[0] : (typeof data === 'string' ? data : '');
      if (fileUri) {
        setSelectedLocalImageUri(fileUri);
        // Set form image_url to local URI for instant preview
        setForm(prev => ({ ...prev, image_url: fileUri }));
        toast.success('Đã chọn ảnh');
      } else {
        toast.error('Không thể chọn ảnh');
      }
    } catch (err: any) {
      toast.dismiss('media-picker');
      console.error('Lỗi chọn media:', err);
      toast.error('Hủy chọn media');
    }
  };

  const handleSubmit = async () => {
    if (!shopId) return;
    if (!form.name.trim()) {
      toast.error('Vui lòng nhập tên sản phẩm');
      return;
    }
    setSubmitting(true);

    const sellVal = parseVNDToNumber(form.sell_price) || 0;
    const costVal = parseVNDToNumber(form.cost_price) || 0;

    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      sell_price: String(sellVal), // Backend expects string representation of decimal
      cost_price: String(costVal), // Backend expects string representation of decimal
      category_id: form.category_id || undefined,
      unit: form.unit || undefined,
      product_type: form.product_type || 'product',
      active: form.active,
      // If we have selected a local image, don't save its temporary URI to database yet
      image_url: selectedLocalImageUri ? (editingProduct?.image_url || undefined) : (form.image_url || undefined),
    };

    try {
      let savedProduct;
      if (editingProduct) {
        savedProduct = await updateProduct(shopId, editingProduct.id, payload);
      } else {
        savedProduct = await createProduct(shopId, payload);
      }

      const productId = editingProduct?.id || savedProduct?.product_id || savedProduct?.id;

      // Upload image to Cloudflare R2 / S3 if a local image was picked
      if (selectedLocalImageUri && productId) {
        try {
          toast.loading('Đang tải ảnh lên...', { id: 'image-upload' });
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token || '';

          const uploadUrlRes = await fetch(`/api/shops/${shopId}/products/${productId}/upload-url?token=${token}`);
          if (!uploadUrlRes.ok) throw new Error('Không lấy được link upload');
          const { uploadUrl, publicUrl } = await uploadUrlRes.json();

          const imgRes = await fetch(selectedLocalImageUri);
          const blob = await imgRes.blob();

          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: blob,
            headers: {
              'Content-Type': 'image/jpeg',
            }
          });
          if (!uploadRes.ok) throw new Error('Upload ảnh thất bại');

          // Update product record with the public URL
          await updateProduct(shopId, productId, { image_url: publicUrl });
          toast.success('Đã lưu sản phẩm và ảnh thành công', { id: 'image-upload' });
        } catch (uploadErr: any) {
          console.error('Image upload failed:', uploadErr);
          toast.error(`Đã lưu sản phẩm nhưng tải ảnh lỗi: ${uploadErr.message}`, { id: 'image-upload', duration: 4000 });
        }
      } else {
        toast.success(editingProduct ? 'Cập nhật sản phẩm thành công' : 'Thêm sản phẩm thành công');
      }

      setShowModal(false);
      setSelectedLocalImageUri(null);
      fetchData(1, false);
    } catch (err: any) {
      toast.error(err?.message || (editingProduct ? 'Cập nhật thất bại' : 'Thêm sản phẩm thất bại'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!shopId) return;
    if (!newCategoryName.trim()) {
      toast.error('Vui lòng nhập tên danh mục');
      return;
    }

    const exists = categories.some(
      (c) => c.name.trim().toLowerCase() === newCategoryName.trim().toLowerCase()
    );
    if (exists) {
      toast.error('Tên danh mục này đã tồn tại!');
      return;
    }

    setSubmittingCategory(true);
    try {
      const res = await createCategory(shopId, { name: newCategoryName.trim() });
      toast.success('Tạo danh mục thành công');
      
      const catRes = await getCategories(shopId);
      const updatedCategories = catRes?.categories ?? [];
      setCategories(updatedCategories);

      const createdId = res?.category_id || res?.id;
      if (createdId) {
        setForm((prev) => ({ ...prev, category_id: createdId }));
      } else {
        const found = updatedCategories.find(
          (c) => c.name.trim().toLowerCase() === newCategoryName.trim().toLowerCase()
        );
        if (found) {
          setForm((prev) => ({ ...prev, category_id: found.id }));
        }
      }

      setShowCategoryConfirm(false);
      setShowCategoryModal(false);
      setNewCategoryName('');
    } catch (err: any) {
      console.error('Lỗi tạo danh mục:', err);
      toast.error(err?.message || 'Tạo danh mục thất bại');
    } finally {
      setSubmittingCategory(false);
    }
  };

  return (
    <div 
      className="min-h-full bg-background pb-20"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="flex items-center justify-center text-xs text-subtitle py-2 bg-white/50 border-b border-[var(--border)] transition-all overflow-hidden"
          style={{ height: pullDistance, opacity: pullDistance / 50 }}
        >
          <span className="font-semibold text-[var(--primary)]">
            {pullDistance > 50 ? 'Thả ra để làm mới...' : 'Kéo xuống để làm mới...'}
          </span>
        </div>
      )}

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

          {/* Lazy Load loading indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
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
            <div className="modal-body max-h-[75vh] overflow-y-auto pb-4">
              {/* Product Image Selection (Hidden for Free plan) */}
              {!isFreePlan && (
                <div className="form-group">
                  <label className="form-label">Hình ảnh sản phẩm</label>
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-20 h-20 rounded-xl border border-[var(--border)] overflow-hidden bg-slate-50 flex items-center justify-center relative cursor-pointer"
                      onClick={handleSelectImage}
                    >
                      {form.image_url ? (
                        <>
                          <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-3xs font-semibold">
                            Thay đổi
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-[var(--subtitle)]">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          <span className="text-[10px] mt-1">Thêm ảnh</span>
                        </div>
                      )}
                    </div>
                    
                    {form.image_url && (
                      <button 
                        type="button" 
                        className="text-xs text-red-500 font-semibold"
                        onClick={() => setForm({ ...form, image_url: '' })}
                      >
                        Xóa ảnh
                      </button>
                    )}
                  </div>
                </div>
              )}

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

              <div className="form-group">
                <label className="form-label">Mã vạch (Barcode)</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    placeholder="Quét hoặc nhập mã vạch..."
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setIsBarcodeScannerOpen(true)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 4,
                      color: '#fa5908'
                    }}
                    title="Quét mã vạch"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 5v14M21 5v14M7 5v14M17 5v14M12 5v14" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">Giá bán</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="0"
                    value={form.sell_price}
                    onChange={(e) => setForm({ ...form, sell_price: maskVNDInput(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Giá vốn</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="0"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: maskVNDInput(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="flex justify-between items-center mb-1">
                  <label className="form-label mb-0">Danh mục</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCategoryName('');
                      setShowCategoryModal(true);
                    }}
                    className="text-xs font-semibold text-[var(--primary)] flex items-center gap-1 focus:outline-none"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Tạo mới
                  </button>
                </div>
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
                className="auth-btn auth-btn-primary mt-4 w-full"
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
      {/* Add Category Modal */}
      {showCategoryModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setShowCategoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-base font-semibold">Tạo danh mục mới</h3>
              <button onClick={() => setShowCategoryModal(false)} className="p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body space-y-4 pb-6">
              <div className="form-group">
                <label className="form-label">Tên danh mục *</label>
                <input
                  className="form-input"
                  placeholder="Nhập tên danh mục mới..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="auth-btn border border-[var(--border)] text-foreground bg-white w-full"
                  onClick={() => setShowCategoryModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="auth-btn auth-btn-primary w-full"
                  onClick={() => {
                    if (!newCategoryName.trim()) {
                      toast.error('Vui lòng nhập tên danh mục');
                      return;
                    }
                    const exists = categories.some(
                      (c) => c.name.trim().toLowerCase() === newCategoryName.trim().toLowerCase()
                    );
                    if (exists) {
                      toast.error('Tên danh mục này đã tồn tại!');
                      return;
                    }
                    setShowCategoryConfirm(true);
                  }}
                >
                  Tiếp tục
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Category Modal */}
      {showCategoryConfirm && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={() => setShowCategoryConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-base font-semibold text-amber-600">Xác nhận tạo danh mục</h3>
            </div>
            <div className="modal-body space-y-4 pb-6">
              <p className="text-sm text-subtitle leading-relaxed">
                Bạn có chắc chắn muốn tạo danh mục mới <strong>"{newCategoryName}"</strong> trên hệ thống?
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="auth-btn border border-[var(--border)] text-foreground bg-white w-full"
                  onClick={() => setShowCategoryConfirm(false)}
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  className="auth-btn auth-btn-primary w-full"
                  disabled={submittingCategory}
                  onClick={handleCreateCategory}
                >
                  {submittingCategory ? 'Đang tạo...' : 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Barcode Scanner Modal ══════ */}
      <BarcodeScannerModal
        visible={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </div>
  );
}
