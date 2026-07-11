import { useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { usePosStore } from '@/stores/pos-store';
import { useTenantStore } from '@/stores/tenant-store';
import {
  getProducts,
  getCategories,
  getCustomers,
  getPaymentMethods,
} from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import CheckoutModal from './checkout-modal';

export default function PosPage() {
  const shop = useTenantStore((s) => s.shop);
  const shopId = shop?.id ?? '';

  const products = usePosStore((s) => s.products);
  const categories = usePosStore((s) => s.categories);
  const cart = usePosStore((s) => s.cart);
  const selectedCategory = usePosStore((s) => s.selectedCategory);
  const searchQuery = usePosStore((s) => s.searchQuery);
  const isCheckoutOpen = usePosStore((s) => s.isCheckoutOpen);
  const isLoading = usePosStore((s) => s.isLoading);

  const {
    setProducts,
    setCategories,
    setCustomers,
    setPaymentMethods,
    setSelectedCategory,
    setSearchQuery,
    setIsCheckoutOpen,
    setIsLoading,
    addToCart,
  } = usePosStore.getState();

  // ── Fetch data on mount ──
  useEffect(() => {
    if (!shopId) return;

    setIsLoading(true);

    Promise.all([
      getProducts(shopId),
      getCategories(shopId),
      getCustomers(shopId, { limit: '500' }),
      getPaymentMethods(shopId),
    ])
      .then(([prodRes, catRes, custRes, pmRes]) => {
        setProducts(prodRes?.products ?? []);
        setCategories(catRes?.categories ?? []);
        setCustomers(custRes?.customers ?? []);
        setPaymentMethods(Array.isArray(pmRes) ? pmRes : []);
      })
      .catch((err) => {
        console.error('POS load error:', err);
        toast.error('Không thể tải dữ liệu. Vui lòng thử lại.');
      })
      .finally(() => setIsLoading(false));
  }, [shopId]);

  // ── Filter products ──
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(
      (p) => p.active === undefined || p.active === 'TRUE',
    );

    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category_id === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q),
      );
    }

    return filtered;
  }, [products, selectedCategory, searchQuery]);

  // ── Cart totals ──
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart],
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  // ── Handlers ──
  const handleAddToCart = (product: (typeof products)[0]) => {
    addToCart(product);
    toast.success(`Đã thêm ${product.name}`, { duration: 1500 });
  };

  return (
    <div className="pos-page">
      {/* ══════ Top Bar: Search + Cart Badge ══════ */}
      <div className="pos-topbar">
        <div style={{ position: 'relative', flex: 1 }}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="form-input"
            style={{ paddingLeft: 38, fontSize: 14 }}
            placeholder="Tìm sản phẩm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          style={{
            position: 'relative',
            background: 'none',
            border: 'none',
            padding: 8,
            cursor: 'pointer',
          }}
          onClick={() => cartCount > 0 && setIsCheckoutOpen(true)}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {cartCount > 0 && (
            <span className="badge badge-red" style={{
              position: 'absolute', top: 0, right: 0,
              minWidth: 18, height: 18, fontSize: 11,
            }}>
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* ══════ Body ══════ */}
      <div className="pos-body">
        {/* Category Chips */}
        <div className="pos-categories">
          <button
            className={`pos-category-chip ${selectedCategory === null ? 'active' : ''}`}
            onClick={() => setSelectedCategory(null)}
          >
            Tất cả
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`pos-category-chip ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() =>
                setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
              }
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        {isLoading ? (
          <div className="pos-products">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="pos-product-card">
                <div className="skeleton" style={{ width: '100%', aspectRatio: '1' }} />
                <div className="pos-product-info">
                  <div className="skeleton" style={{ width: '80%', height: 14, marginBottom: 4 }} />
                  <div className="skeleton" style={{ width: '50%', height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </div>
            <p className="empty-state-title">Không tìm thấy sản phẩm</p>
            <p className="empty-state-desc">Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm</p>
          </div>
        ) : (
          <div className="pos-products">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="pos-product-card"
                onClick={() => handleAddToCart(product)}
              >
                {product.image_url ? (
                  <img
                    className="pos-product-img"
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="pos-product-img"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 28,
                      background: '#f1f5f9',
                    }}
                  >
                    📦
                  </div>
                )}
                <div className="pos-product-info">
                  <p className="pos-product-name">{product.name}</p>
                  <p className="pos-product-price">
                    {formatCurrency(product.sell_price)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════ Bottom Cart Bar ══════ */}
      {cart.length > 0 && (
        <div className="pos-cart-bar">
          <div>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              {cartCount} sản phẩm
            </p>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--foreground)' }}>
              {formatCurrency(cartTotal)}
            </p>
          </div>
          <button
            className="pos-cart-btn"
            style={{ flex: 'unset', padding: '12px 24px' }}
            onClick={() => setIsCheckoutOpen(true)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Thanh toán
          </button>
        </div>
      )}

      {/* ══════ Checkout Modal ══════ */}
      {isCheckoutOpen && <CheckoutModal />}
    </div>
  );
}
