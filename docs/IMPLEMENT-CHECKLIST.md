# ONI Implementation Checklist

> Track tiến độ build. Tick khi hoàn thành.

---

## Setup (Foundation)

- [x] Install deps: `sonner`, `@tanstack/react-query`, `use-debounce`, `date-fns`, `dexie`
- [x] `app/components/providers/QueryProvider.tsx` — TanStack Query client
- [x] Root layout wrap với QueryProvider + Toaster (sonner)
- [x] `app/components/ui/ConfirmProvider.tsx` + `useConfirm` hook — programmatic confirm dialog

---

## Phase 1 — Server Cache + React Query (Admin pages)

### Products
- [x] `unstable_cache` wrap GET handler
- [x] `revalidateTag` sau POST / PUT / DELETE
- [x] Migrate `ProductsClient` → `useQuery` + `useMutation` + toast

### Categories
- [x] `unstable_cache` + `revalidateTag`
- [x] Migrate `CategoriesClient` → `useQuery` + `useMutation`

### Customers
- [x] `unstable_cache` + `revalidateTag`
- [x] Migrate `CustomersClient` → `useQuery` + `useMutation`

### Suppliers
- [x] `unstable_cache` + `revalidateTag`
- [x] Migrate `SuppliersClient` → `useQuery` + `useMutation`

### Employees
- [x] `unstable_cache` + `revalidateTag`
- [x] Migrate `EmployeesClient` → `useQuery` + `useMutation`

### Inventory
- [x] `unstable_cache` + `revalidateTag` (inventory + stock-movements)
- [x] Migrate `InventoryClient` → `useQuery` + debounce

---

## Phase 2 — Orders (Admin view)

- [x] `lib/validators/orders.ts` — zod schema Order + OrderItems + Payments
- [x] `app/api/shops/[shopId]/orders/route.ts` (GET list, POST)
- [x] `app/api/shops/[shopId]/orders/[id]/route.ts` (GET one, PUT status, DELETE)
- [x] `app/api/shops/[shopId]/order-items/route.ts` (GET by order_id)
- [x] `app/api/shops/[shopId]/payments/route.ts` (GET by order_id, POST)
- [x] `app/t/[slug]/[branch]/orders/OrdersClient.tsx`
- [x] `app/t/[slug]/[branch]/orders/page.tsx`
- [x] Order detail slide-over (items + payments)

---

## Phase 3 — LocalDB + Hydration

- [x] `lib/localDb/schema.ts` — Dexie class, tất cả tables
- [x] `lib/localDb/hydration.ts` — `hydrateAll()`, background refresh
- [x] `lib/localDb/tabSync.ts` — BroadcastChannel setup
- [x] `hooks/usePOSHydration.ts` — hook quản lý hydration state
- [x] `hooks/useNetworkStatus.ts` — online/offline detection

---

## Phase 4 — POS Core UI

- [ ] `app/t/[slug]/[branch]/channels/pos/page.tsx` — server component + auth
- [ ] `app/t/[slug]/[branch]/channels/pos/POSClient.tsx` — main POS layout
- [ ] `app/t/[slug]/[branch]/channels/pos/components/ProductGrid.tsx`
- [ ] `app/t/[slug]/[branch]/channels/pos/components/CartPanel.tsx`
- [ ] `app/t/[slug]/[branch]/channels/pos/components/CheckoutModal.tsx`
- [ ] `app/t/[slug]/[branch]/channels/pos/components/CustomerSearch.tsx`
- [ ] `hooks/usePOSProductSearch.ts` — local default, advanced API
- [ ] `hooks/useCart.ts` — cart state management
- [ ] Ghi đơn vào LocalDB + syncQueue sau checkout
- [ ] Delta inventory update tại LocalDB
- [ ] `lib/pos/printBill.ts` + bill HTML template
- [ ] Print bill sau thanh toán thành công

---

## Phase 5 — Sync Worker + Offline

- [ ] `lib/pos/syncWorker.ts` — SyncWorker class (tick, flushQueue, retry)
- [ ] Worker khởi động khi mount POSClient
- [ ] `app/t/[slug]/[branch]/channels/pos/components/SyncStatusBar.tsx`
- [ ] Network restore → trigger hydrateAll + flush queue
- [ ] Manual "Đồng bộ" button
- [ ] Xử lý first-launch-offline (block UI + hướng dẫn)
- [ ] Xử lý `failed` sync items (alert + manual retry)
- [ ] Clear LocalDB khi logout (`/lib/localDb/clear.ts`)

---

## Phase 6 — Order History trong POS

- [ ] Tab "Đơn hôm nay" (query LocalDB `orders` by date)
- [ ] `OrderHistoryPanel.tsx` — danh sách đơn + status badge
- [ ] `OrderDetailDrawer.tsx` — chi tiết (local-first, API fallback)
- [ ] In lại bill từ đơn cũ
- [ ] Advanced search → gọi `/api/orders` với filter

---

## Ghi chú

- Mỗi phase phải test trước khi sang phase tiếp
- Phase 1-2: không có breaking change, admin pages vẫn hoạt động
- Phase 3+ chỉ ảnh hưởng `/pos` — an toàn để deploy song song
