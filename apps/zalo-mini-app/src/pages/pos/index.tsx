import { useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { usePosStore } from '@/stores/pos-store';
import { useTenantStore } from '@/stores/tenant-store';
import { useTableStore, makeTableCartItemId, type TableCartItem } from '@/stores/table-store';
import {
  getProducts,
  getCategories,
  getCustomers,
  getPaymentMethods,
  getPaymentFunds,
  getOrderItems,
  createOrderItem,
  updateOrderItem,
  getLocationResources,
  getShopSettings,
  createQuickProduct,
} from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import CheckoutModal from './checkout-modal';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import TableMapPage from './TableMapPage';
import { RetailIcon, TableRoomIcon } from '@/components/vectors';
import QuickCreateProductModal from './QuickCreateProductModal';

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

  // ── Table store ──
  const cartOwnerTableId = useTableStore((s) => s.cartOwnerTableId);
  const resources = useTableStore((s) => s.resources);
  const isTableCheckoutOpen = useTableStore((s) => s.isTableCheckoutOpen);
  const activeTable = useTableStore((s) => s.activeTable);
  const cartOwnerTable = cartOwnerTableId
    ? resources.find((r) => r.id === cartOwnerTableId)
    : null;

  // ── POS mode ──
  const [posMode, setPosMode] = useState<'retail' | 'table'>('retail');
  const hasTableRoomSupport = useMemo(() => {
    return shop?.industry_type !== 'retail' && resources.length > 0;
  }, [shop?.industry_type, resources.length]);

  useEffect(() => {
    if (!hasTableRoomSupport && posMode !== 'retail') {
      setPosMode('retail');
    }
  }, [hasTableRoomSupport, posMode]);

  const [isSavingTableItems, setIsSavingTableItems] = useState(false);

  const handleSaveTableCart = async () => {
    if (!cartOwnerTableId || !cartOwnerTable) return;
    const tableSession = useTableStore.getState().tableSessions[cartOwnerTableId];
    if (!tableSession?.orderId) {
      toast.error('Không tìm thấy mã đơn hàng của bàn này');
      return;
    }

    setIsSavingTableItems(true);
    const loadingToast = toast.loading('Đang lưu món vào bàn...');
    try {
      // 1. Get current server items
      const serverItems = await getOrderItems(shopId, { order_id: tableSession.orderId, limit: '200' });

      // 2. Loop through retail cart items and save them
      let index = serverItems.length + 1;
      for (const item of cart) {
        const existing = serverItems.find((si) => si.product_id === item.product.id);
        const lineTotal = item.unit_price * item.quantity;
        const lineNo = String(index++);

        if (existing) {
          const existingQty = parseInt(String(existing.quantity || existing.qty || 0), 10);
          const newQty = existingQty + item.quantity;
          const existingPrice = parseFloat(String(existing.unit_price)) || item.unit_price;
          const newTotal = existingPrice * newQty;

          await updateOrderItem(shopId, existing.id, {
            qty: String(newQty),
            line_total: String(newTotal),
            unit_price: String(existingPrice),
            original_price: String(existingPrice),
            discount_amount: '0',
          });
        } else {
          await createOrderItem(shopId, {
            order_id: tableSession.orderId,
            line_no: lineNo,
            product_id: item.product.id,
            product_name: item.product.name,
            qty: String(item.quantity),
            unit_price: String(item.unit_price),
            original_price: String(item.unit_price),
            discount_amount: '0',
            line_total: String(lineTotal),
            line_discount: '0',
            variant_label: '',
            modifiers: '',
            modifier_total: '0',
          });
        }
      }

      // 3. Re-fetch all items for this table order to sync local store
      const updatedItems = await getOrderItems(shopId, { order_id: tableSession.orderId, limit: '200' });
      const newTableCart: Record<string, TableCartItem> = {};
      for (const item of updatedItems) {
        const cartItemId = makeTableCartItemId(item.product_id, item.variant_name);
        const priceVal = parseFloat(String(item.unit_price || 0)) || 0;
        const qtyVal = parseInt(String(item.qty || item.quantity || 0), 10) || 1;
        newTableCart[cartItemId] = {
          productId: item.product_id,
          name: item.product_name,
          price: priceVal,
          quantity: qtyVal,
          note: item.note || undefined,
          variantLabel: item.variant_name || undefined,
        };
      }

      useTableStore.getState().setTableCart(cartOwnerTableId, newTableCart);

      toast.dismiss(loadingToast);
      toast.success(`Đã lưu món vào ${cartOwnerTable.name}!`);

      // 4. Reset states & return to table mode
      usePosStore.getState().clearCart();
      useTableStore.getState().setCartOwnerTableId(null);
      setPosMode('table');
    } catch (err) {
      console.error('Error saving table cart:', err);
      toast.dismiss(loadingToast);
      toast.error('Không thể lưu món. Vui lòng thử lại.');
    } finally {
      setIsSavingTableItems(false);
    }
  };

  // ── Backup and restore retail cart when entering/leaving room/table ordering ──
  const prevTableIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevTableId = prevTableIdRef.current;
    if (cartOwnerTableId !== prevTableId) {
      if (cartOwnerTableId) {
        if (!prevTableId) {
          // Entering table order from retail: backup retail cart
          usePosStore.getState().backupRetailCart();
        }
        // Only clear cart when entering "add items" mode, NOT checkout mode.
        // In checkout mode, handleSessionCheckout already pre-populated the cart
        // with food items + TIME_CHARGE, so clearing would wipe them out.
        if (!useTableStore.getState().isTableCheckoutOpen) {
          usePosStore.getState().clearCart();
        }
      } else {
        // Exiting table order to retail: restore retail cart
        usePosStore.getState().restoreRetailCart();
      }
      prevTableIdRef.current = cartOwnerTableId;
    }
  }, [cartOwnerTableId]);

  // When user chooses to add items for a table, switch to retail mode and show banner
  const handleTableAddItems = () => {
    setPosMode('retail');
  };

  // When table checkout opens: trigger checkout modal
  useEffect(() => {
    if (isTableCheckoutOpen) {
      usePosStore.getState().setIsCheckoutOpen(true);
    }
  }, [isTableCheckoutOpen]);

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
  const [quickCreateRequest, setQuickCreateRequest] = useState<{ name: string; barcode: string } | null>(null);

  // Track image load errors to display fallback watermark
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

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

  // Track shop changes to reset state on branch switch
  const prevShopIdRef = useRef(shopId);
  useEffect(() => {
    if (prevShopIdRef.current && shopId && prevShopIdRef.current !== shopId) {
      // Branch changed — clear all POS and table state
      usePosStore.getState().clearCart();
      useTableStore.getState().clearAllTableData();
      setPosMode('retail');
    }
    prevShopIdRef.current = shopId;
    loadData();

    // Prefetch table resources to verify table support
    if (shopId && shop?.industry_type !== 'retail') {
      getLocationResources(shopId)
        .then((resData) => {
          const raw = (resData || []) as any[];
          useTableStore.getState().setResources(raw.filter((r) => r.deleted_at == null));
        })
        .catch((err) => {
          console.error('Error prefetching resources:', err);
        });

      getShopSettings(shopId)
        .then((settingsData) => {
          if (settingsData) {
            useTableStore.getState().setShopSettings(settingsData as any);
          }
        })
        .catch((err) => {
          console.error('Error prefetching shop settings:', err);
        });
    }
  }, [shopId, shop?.industry_type]);

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
    } else if (matches.length === 0) {
      setQuickCreateRequest({ name: '', barcode: code });
    }
  };

  const handleQuickCreate = async (payload: { name: string; barcode: string; sell_price: number; cost_price: number; min_price: number; unit: string; category_id: string; image_url: string }) => {
    const result = await createQuickProduct(shopId, { ...payload, source: 'pos_quick_web' });
    const product = result.product;
    setProducts([product, ...products.filter((item) => item.id !== product.id)]);
    return product;
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
      onTouchStart={posMode === 'retail' ? handleTouchStart : undefined}
      onTouchMove={posMode === 'retail' ? handleTouchMove : undefined}
      onTouchEnd={posMode === 'retail' ? handleTouchEnd : undefined}
    >
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-spin-custom {
          animation: spin 0.8s linear infinite;
        }
      `}</style>

      {/* Pull to Refresh Indicator (retail only) */}
      {posMode === 'retail' && (
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
      )}

      {/* ═════ Top Bar ═════ */}
      <div className="pos-topbar" style={{ flexDirection: 'column', gap: 8, paddingBottom: 8, alignItems: 'stretch' }}>
        {/* Mode switcher */}
        {hasTableRoomSupport && (
          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
            <button
              onClick={() => setPosMode('retail')}
              style={{
                flex: 1, height: 36, borderRadius: 10,
                border: '1.5px solid',
                borderColor: posMode === 'retail' ? 'var(--primary, #3b82f6)' : '#e2e8f0',
                background: posMode === 'retail' ? 'var(--primary, #3b82f6)' : '#f8fafc',
                color: posMode === 'retail' ? '#fff' : '#64748b',
                fontSize: 12, fontWeight: 700,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <RetailIcon size={15} color={posMode === 'retail' ? '#fff' : '#64748b'} /> Bán lẻ
              </span>
            </button>
            <button
              onClick={() => setPosMode('table')}
              style={{
                flex: 1, height: 36, borderRadius: 10,
                border: '1.5px solid',
                borderColor: posMode === 'table' ? 'var(--primary, #3b82f6)' : '#e2e8f0',
                background: posMode === 'table' ? 'var(--primary, #3b82f6)' : '#f8fafc',
                color: posMode === 'table' ? '#fff' : '#64748b',
                fontSize: 12, fontWeight: 700,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <TableRoomIcon size={15} color={posMode === 'table' ? '#fff' : '#64748b'} /> Bàn / Phòng
              </span>
            </button>
          </div>
        )}

        {/* Search + Barcode + Cart icon (retail mode only) */}
        {posMode === 'retail' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                    position: 'absolute', right: 8, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    color: '#94a3b8', padding: 4, cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={() => setQuickCreateRequest({ name: '', barcode: '' })}
              className="zaui-btn zaui-btn-tertiary"
              style={{ padding: 10, minWidth: 'unset', height: 40, width: 40, borderRadius: 10 }}
              title="Tạo mới sản phẩm"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              onClick={handleScanBarcode}
              className="zaui-btn zaui-btn-tertiary"
              style={{ padding: 10, minWidth: 'unset', height: 40, width: 40, borderRadius: 10 }}
              title="Quét mã vạch"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M4 16v3a1 1 0 0 0 1 1h3" /><path d="M8 12h8" /></svg>
            </button>
            <button
              style={{ position: 'relative', background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}
              onClick={() => cartCount > 0 && setIsCheckoutOpen(true)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              {cartCount > 0 && (
                <span className="badge badge-red" style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, fontSize: 11 }}>
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Cart-owner table banner (when adding items for a table) */}
      {posMode === 'retail' && cartOwnerTableId && cartOwnerTable && (
        <div style={{
          background: '#fef2f2', borderLeft: '4px solid #ef4444',
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🏪</span>
            <div>
              <p style={{ fontWeight: 700, color: '#dc2626', margin: 0 }}>
                Thêm món cho: {cartOwnerTable.name}
              </p>
              <p style={{ color: '#94a3b8', margin: '1px 0 0', fontSize: 11 }}>
                Sản phẩm sẽ được gắn vào đơn bàn này
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              useTableStore.getState().setCartOwnerTableId(null);
              setPosMode('table');
            }}
            style={{
              padding: '4px 10px', borderRadius: 8,
              border: '1.5px solid #fecdd3', background: '#fff1f2',
              fontSize: 11, fontWeight: 700, color: '#f43f5e',
            }}
          >
            ✕ Hủy
          </button>
        </div>
      )}

      {/* ═════ Table Mode Body ═════ */}
      {posMode === 'table' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TableMapPage onAddItems={handleTableAddItems} />
        </div>
      )}

      {/* ═════ Retail Mode Body ═════ */}
      {posMode === 'retail' && (
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
                <div key={i} className="pos-product-card" style={{ pointerEvents: 'none', background: '#fff' }}>
                  <div className="skeleton" style={{ width: '100%', height: 90, borderRadius: '10px 10px 0 0' }} />
                  <div className="pos-product-info" style={{ padding: '8px 10px' }}>
                    <div className="skeleton" style={{ width: '85%', height: 11, marginBottom: 6 }} />
                    <div className="skeleton" style={{ width: '45%', height: 9 }} />
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
              <p className="empty-state-title">{products.length === 0 ? 'Chưa có sản phẩm nào' : 'Không tìm thấy sản phẩm'}</p>
              <p className="empty-state-desc">{products.length === 0 ? 'Hãy tạo sản phẩm để bắt đầu bán hàng' : 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'}</p>
              <button className="zaui-btn zaui-btn-primary" style={{ marginTop: 12 }} onClick={() => setQuickCreateRequest({ name: searchQuery.trim(), barcode: '' })}>
                Tạo mới sản phẩm{searchQuery.trim() ? ` “${searchQuery.trim()}”` : ''}
              </button>
            </div>
          ) : (
            <div className="pos-products">
              {paginatedProducts.map((product) => (
                <div
                  key={product.id}
                  className="pos-product-card"
                  onClick={() => handleAddToCart(product)}
                >
                  {product.image_url && !imageErrors[product.id] ? (
                    <img
                      className="pos-product-img"
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                      onError={() => {
                        setImageErrors((prev) => ({ ...prev, [product.id]: true }));
                      }}
                    />
                  ) : (
                    <div
                      className="pos-product-img"
                      style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f8fafc',
                        position: 'relative',
                        overflow: 'hidden',
                        borderBottom: '1px solid #f1f5f9'
                      }}
                    >
                      <img
                        src="/logo.png"
                        alt="ONI Logo"
                        style={{
                          width: '42px',
                          height: '42px',
                          objectFit: 'contain',
                          opacity: 0.7,
                          userSelect: 'none',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                  )}
                  <div className="pos-product-info">
                    <p className="pos-product-name">{product.name}</p>
                    <p className="pos-product-price">{formatCurrency(product.sell_price)}</p>
                  </div>
                </div>
              ))}

              {/* Load More */}
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
      )}


      {/* ══════ Bottom Cart Bar (retail mode only) ══════ */}
      {posMode === 'retail' && cart.length > 0 && (
        <div className="pos-cart-bar">
          <div>
            <p style={{ fontSize: 12, color: '#64748b' }}>
              {cartOwnerTable
                ? `${cartCount} món · ${cartOwnerTable.name}`
                : `${cartCount} sản phẩm`}
            </p>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
              {formatCurrency(cartTotal)}
            </p>
          </div>

          {cartOwnerTableId ? (
            <button
              className="pos-cart-btn"
              style={{
                flex: 'unset', padding: '10px 20px', height: 40, fontSize: 14,
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                border: 'none',
              }}
              onClick={handleSaveTableCart}
              disabled={isSavingTableItems}
            >
              {isSavingTableItems ? (
                'Đang lưu...'
              ) : (
                <>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ marginRight: 4 }}
                  >
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Lưu món
                </>
              )}
            </button>
          ) : (
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
          )}
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
      <QuickCreateProductModal
        open={!!quickCreateRequest}
        initialName={quickCreateRequest?.name}
        initialBarcode={quickCreateRequest?.barcode}
        categories={categories}
        shopId={shopId}
        onClose={() => setQuickCreateRequest(null)}
        onSave={handleQuickCreate}
        onCreated={(product) => {
          handleAddToCart(product);
          setSearchQuery('');
        }}
      />
    </div>
  );
}
