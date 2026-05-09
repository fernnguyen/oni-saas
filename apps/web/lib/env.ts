export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
};

// ─── Cache TTL (seconds) — server-side unstable_cache revalidate ──────────────
// Override via env vars per-deployment or per-entity as needed.
export const cacheTTL = {
  /** Sản phẩm — thay đổi thường xuyên vừa phải */
  products:        parseInt(process.env.CACHE_TTL_PRODUCTS        ?? '300'),
  /** Danh mục — ít thay đổi nhất */
  categories:      parseInt(process.env.CACHE_TTL_CATEGORIES      ?? '600'),
  /** Khách hàng */
  customers:       parseInt(process.env.CACHE_TTL_CUSTOMERS       ?? '300'),
  /** Nhà cung cấp */
  suppliers:       parseInt(process.env.CACHE_TTL_SUPPLIERS       ?? '300'),
  /** Nhân viên */
  employees:       parseInt(process.env.CACHE_TTL_EMPLOYEES       ?? '300'),
  /** Tồn kho — thay đổi sau mỗi giao dịch, TTL ngắn hơn */
  inventory:       parseInt(process.env.CACHE_TTL_INVENTORY       ?? '120'),
  /** Lịch sử xuất nhập kho */
  stockMovements:  parseInt(process.env.CACHE_TTL_STOCK_MOVEMENTS ?? '120'),
  /** Đơn hàng */
  orders:          parseInt(process.env.CACHE_TTL_ORDERS          ?? '60'),
} as const

// ─── Client-side TanStack Query (milliseconds) ────────────────────────────────
// NEXT_PUBLIC_ prefix vì được dùng ở client component (QueryProvider).
export const queryConfig = {
  /** Thời gian data được coi là "fresh" — không refetch nếu chưa qua staleTime */
  staleTime: parseInt(process.env.NEXT_PUBLIC_QUERY_STALE_MS ?? '60000'),
  /** Thời gian giữ data trong memory sau khi component unmount */
  gcTime:    parseInt(process.env.NEXT_PUBLIC_QUERY_GC_MS    ?? '300000'),
} as const

// ─── POS / Sync Worker ────────────────────────────────────────────────────────
export const posConfig = {
  /** Chu kỳ sync queue lên server (ms) */
  syncIntervalMs:    parseInt(process.env.NEXT_PUBLIC_POS_SYNC_INTERVAL_MS    ?? '3000'),
  /** Số lần retry tối đa trước khi mark failed */
  syncMaxRetry:      parseInt(process.env.NEXT_PUBLIC_POS_SYNC_MAX_RETRY      ?? '5'),
  /** Số khách hàng cache local cho POS search */
  customerCacheSize: parseInt(process.env.NEXT_PUBLIC_POS_CUSTOMER_CACHE_SIZE ?? '500'),
  /** Chu kỳ re-hydrate LocalDB (ms) */
  hydrateIntervalMs: parseInt(process.env.NEXT_PUBLIC_POS_HYDRATE_INTERVAL_MS ?? '300000'),
} as const
