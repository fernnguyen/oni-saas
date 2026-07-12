import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { usePosStore } from '@/stores/pos-store';
import { useTenantStore } from '@/stores/tenant-store';
import {
  getProducts,
  getCategories,
  getCustomers,
  getPaymentMethods,
  getPaymentFunds,
} from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import CheckoutModal from './checkout-modal';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

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
    setPaymentFunds,
    setSelectedCategory,
    setSearchQuery,
    setIsCheckoutOpen,
    setIsLoading,
    addToCart,
  } = usePosStore.getState();

  // ── Local pagination state for product grid ──
  const [displayLimit, setDisplayLimit] = useState(30);

  // Pull to Refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [pullStart, setPullStart] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);

  // Barcode scanner modal state
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);

  // ── Load Data (with optional cache bypass) ──
  const loadData = async (bypassCache = false) => {
    if (!shopId) return;
    setIsLoading(true);

    try {
      const cacheKey = `pos_cache_${shopId}`;
      const cachedData = localStorage.getItem(cacheKey);

      if (!bypassCache && cachedData) {
        const parsed = JSON.parse(cachedData);
        const { products: cachedProds, categories: cachedCats, customers: cachedCusts, paymentMethods: cachedPms, paymentFunds: cachedFunds, timestamp } = parsed;
        if (Date.now() - timestamp < CACHE_TTL && Array.isArray(cachedFunds) && cachedFunds.length > 0) {
          setProducts(cachedProds || []);
          setCategories(cachedCats || []);
          setCustomers(cachedCusts || []);
          setPaymentMethods(cachedPms || []);
          setPaymentFunds(cachedFunds || []);
          setIsLoading(false);
          return;
        }
      }

      // Fetch fresh data
      const [prodRes, catRes, custRes, pmRes, pfRes] = await Promise.all([
        getProducts(shopId),
        getCategories(shopId),
        getCustomers(shopId, { limit: '10' }),
        getPaymentMethods(shopId),
        getPaymentFunds(shopId),
      ]);

      const freshProds = prodRes?.products || [];
      const freshCats = catRes?.categories || [];
      const freshCusts = custRes?.customers || [];
      const freshPms = Array.isArray(pmRes) ? pmRes : [];
      const freshFunds = Array.isArray(pfRes) ? pfRes : [];

      setProducts(freshProds);
      setCategories(freshCats);
      setCustomers(freshCusts);
      setPaymentMethods(freshPms);
      setPaymentFunds(freshFunds);

      // Save cache
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          products: freshProds,
          categories: freshCats,
          customers: freshCusts,
          paymentMethods: freshPms,
          paymentFunds: freshFunds,
          timestamp: Date.now(),
        })
      );

      if (bypassCache) {
        toast.success('Đã cập nhật dữ liệu mới');
      }
    } catch (err) {
      console.error('POS load error:', err);
      toast.error('Không thể tải dữ liệu. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [shopId]);

  // Reset pagination limit when search or category changes
  useEffect(() => {
    setDisplayLimit(30);
  }, [searchQuery, selectedCategory]);

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

  // Paginated view of filtered products
  const paginatedProducts = useMemo(() => {
    return filteredProducts.slice(0, displayLimit);
  }, [filteredProducts, displayLimit]);

  const hasMoreProducts = filteredProducts.length > displayLimit;

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
    toast.success(`Đã thêm ${product.name}`, { duration: 1000 });
  };

  const handleScanBarcode = () => {
    setIsBarcodeScannerOpen(true);
  };

  const handleBarcodeScanned = (code: string) => {
    setSearchQuery(code);
    setIsBarcodeScannerOpen(false);

    // Auto-add to cart if exactly 1 product matches barcode or SKU
    const query = code.trim().toLowerCase();
    const matches = products.filter(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === query) ||
        (p.sku && p.sku.toLowerCase() === query)
    );

    if (matches.length === 1) {
      handleAddToCart(matches[0]);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const container = document.querySelector('.pos-page');
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
        await loadData(true);
      }
      setPullStart(null);
      setPullOffset(0);
    }
  };

  return (
    <div
      className="pos-page"
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
        <div className="flex items-center gap-2 text-xs text-subtitle" style={{ padding: '10px 0' }}>
          <div className="animate-spin-custom rounded-full h-4 w-4 border-2 border-[var(--primary)] border-t-transparent" />
          <span>{refreshing ? 'Đang làm mới...' : 'Kéo để làm mới...'}</span>
        </div>
      </div>
      {/* ══════ Top Bar: Search + Cart Badge ══════ */}
      <div className="pos-topbar">
        <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center' }}>
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
              style={{ paddingLeft: 38, paddingRight: searchQuery ? 36 : 14, fontSize: 14 }}
              placeholder="Tìm sản phẩm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  padding: 4,
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Barcode scanner */}
          <button
            onClick={handleScanBarcode}
            className="zaui-btn zaui-btn-tertiary"
            style={{ padding: 10, minWidth: 'unset', height: 40, width: 40, borderRadius: 10 }}
            title="Quét mã vạch"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5v14M21 5v14M7 5v14M17 5v14M12 5v14" />
            </svg>
          </button>
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
        <div className="pos-categories scrollbar-none">
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
                <div className="skeleton" style={{ width: '100%', height: 90 }} />
                <div className="pos-product-info">
                  <div className="skeleton" style={{ width: '80%', height: 12, marginBottom: 4 }} />
                  <div className="skeleton" style={{ width: '50%', height: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ) : paginatedProducts.length === 0 ? (
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
            {paginatedProducts.map((product) => (
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
                      fontSize: 24,
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

            {/* Load More Button */}
            {hasMoreProducts && (
              <div style={{ gridColumn: 'span 3', padding: '12px 0', textAlign: 'center' }}>
                <button
                  onClick={() => setDisplayLimit((prev) => prev + 30)}
                  className="zaui-btn zaui-btn-tertiary"
                  style={{ width: '100%', fontSize: 13, height: 38 }}
                >
                  Xem thêm sản phẩm
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════ Bottom Cart Bar ══════ */}
      {cart.length > 0 && (
        <div className="pos-cart-bar">
          <div>
            <p style={{ fontSize: 12, color: '#64748b' }}>
              {cartCount} sản phẩm
            </p>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
              {formatCurrency(cartTotal)}
            </p>
          </div>
          <button
            className="pos-cart-btn"
            style={{ flex: 'unset', padding: '10px 20px', height: 40, fontSize: 14 }}
            onClick={() => setIsCheckoutOpen(true)}
          >
            <svg
              width="18"
              height="18"
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

      {/* ══════ Barcode Scanner Modal ══════ */}
      <BarcodeScannerModal
        visible={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </div>
  );
}
