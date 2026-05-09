# ONI POS — Offline-First Architecture & Caching Design

> Document thiết kế cho `/pos` page và hệ thống caching toàn app.  
> Mục tiêu: cashier bán hàng bình thường khi mất mạng; data tự sync khi kết nối phục hồi.

---

## Quyết định đã lock (không thay đổi khi impl)

| # | Quyết định | Lý do |
|---|-----------|-------|
| 1 | **Multi-tab**: MVP chỉ cần 1 tab, nhưng dùng BroadcastChannel từ đầu | Dễ mở rộng sau, không tốn công thêm |
| 2 | **Order history**: cache đơn do tab hiện tại tạo (local-first), advanced search gọi API | Cashier hay cần xem lại đơn vừa bán, không cần full history |
| 3 | **Customers**: cache 500 khách gần nhất; walk-in không cần lookup | Đủ cho cửa hàng nhỏ lẻ; không waste memory |
| 4 | **In bill**: bắt buộc; dùng `window.print()` + print CSS template | Không cần thư viện ngoài, hoạt động offline |
| 5 | **MVP**: single tab, single device; kiến trúc ready để mở rộng multi-device | Target: hộ kinh doanh, cửa hàng nhỏ lẻ |
| 6 | **Search**: default = query LocalDB; "Tìm nâng cao" = gọi API | UX nhanh cho tìm kiếm thường, chính xác cho edge cases |
| 7 | **Inventory conflict**: delta-based (`qty += -n`), không bao giờ set absolute | Đúng khi multi-device, không thể sai |
| 8 | **Sync queue**: FIFO, tuần tự (không parallel) | Tránh race condition inventory |

---

## Tổng quan kiến trúc

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER (Tab A)                    BROWSER (Tab B — future)          │
│                                                                        │
│  POS UI ──► LocalDB (Dexie)  ◄──── BroadcastChannel ────► LocalDB   │
│               │         ▲                                              │
│               │ <1ms    │ hydrate/refresh                             │
│               ▼         │                                              │
│          Sync Queue ─── Sync Worker (setInterval 3s)                  │
│                              │                                         │
└──────────────────────────────┼─────────────────────────────────────── ┘
                               │ POST (online only)
                               ▼
                         Next.js API Route
                               │
                     Next.js Data Cache (unstable_cache)
                               │
                         Google Sheets / Any Connector
```

**Nguyên tắc cốt lõi:**
- **Đọc luôn từ LocalDB** — không bao giờ block UI để chờ network
- **Ghi vào LocalDB trước** → enqueue → worker sync lên API ngầm
- **BroadcastChannel** luôn được init, tab đơn vẫn hoạt động bình thường
- Admin pages (products list, customers list...) dùng TanStack Query, **không** dùng LocalDB

---

## Phân loại dữ liệu

| Dataset | LocalDB table | TTL / Limit | Chiến lược hydrate |
|---------|--------------|-------------|-------------------|
| Products (active) | `products` | 5 phút | Tất cả khi mount |
| Categories | `categories` | 15 phút | Tất cả khi mount |
| PriceLists (active) | `priceLists` | 15 phút | Tất cả khi mount |
| Discounts (active) | `discounts` | 5 phút | Tất cả khi mount |
| Employees (active) | `employees` | 30 phút | Tất cả khi mount |
| Inventory (1 branch) | `inventory` | 5 phút | 1 branch khi mount |
| **Customers** | `customers` | 1 ngày / max 500 | 500 gần nhất khi mount |
| **Orders (session)** | `orders` | Theo session | Đơn do tab này tạo + xem lại |
| **OrderItems** | `orderItems` | Theo session | Đi kèm orders |
| **Payments** | `payments` | Theo session | Đi kèm orders |
| **StockMovements** | `syncQueue` | Flush khi sync done | Write-local-first |
| Sync Queue | `syncQueue` | Cho đến khi synced | Persist cho đến khi server confirm |

---

## LocalDB Schema (Dexie.js)

```ts
// lib/localDb/schema.ts
import Dexie, { type Table } from 'dexie'

export class OniLocalDB extends Dexie {
  products!:    Table<LocalProduct>
  categories!:  Table<LocalCategory>
  priceLists!:  Table<LocalPriceList>
  discounts!:   Table<LocalDiscount>
  employees!:   Table<LocalEmployee>
  inventory!:   Table<LocalInventory>
  customers!:   Table<LocalCustomer>
  orders!:      Table<LocalOrder>
  orderItems!:  Table<LocalOrderItem>
  payments!:    Table<LocalPayment>
  syncQueue!:   Table<SyncQueueItem>
  meta!:        Table<MetaEntry>

  constructor() {
    super('oni-pos')
    this.version(1).stores({
      products:   'product_id, sku, barcode, category_id, active',
      categories: 'category_id, parent_id',
      priceLists: 'price_id, product_id, price_type, active',
      discounts:  'discount_id, active, end_date',
      employees:  'employee_id, branch_id, active',
      inventory:  '[product_id+branch_id], product_id',
      customers:  'customer_id, phone, last_seen_at',  // index phone để tìm nhanh
      orders:     'local_id, server_id, created_at, status',
      orderItems: 'local_id, order_local_id',
      payments:   'local_id, order_local_id',
      syncQueue:  '++id, status, entity, created_at',
      meta:       'key',
    })
  }
}

export const localDb = new OniLocalDB()
```

### LocalOrder — lưu đơn hàng cục bộ

```ts
interface LocalOrder {
  local_id: string          // 'LOCAL-ORD-20250509-001' — hiển thị cho cashier
  server_id?: string        // 'ORD-2025-0047' — fill sau khi sync
  sync_status: 'pending' | 'syncing' | 'done' | 'failed'
  customer_id?: string
  customer_name?: string    // snapshot
  branch_id: string
  employee_id: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  note?: string
  created_at: string        // ISO8601
  items: LocalOrderItem[]   // denormalized để đọc nhanh
}
```

### SyncQueueItem

```ts
interface SyncQueueItem {
  id?: number
  status: 'pending' | 'syncing' | 'done' | 'failed'
  entity: 'order'           // v1: order = 1 atomic bundle (order + items + payments + movements)
  payload: {
    order: Omit<LocalOrder, 'items'>
    items: LocalOrderItem[]
    payments: LocalPayment[]
    stockMovements: StockMovementPayload[]
  }
  local_order_id: string
  server_order_id?: string
  retry_count: number
  last_error?: string
  created_at: string
  synced_at?: string
}
```

> **Lưu ý thiết kế:** Một `syncQueueItem` chứa toàn bộ 1 đơn hàng (order + items + payments + movements) như một atomic bundle. API xử lý tất cả trong 1 transaction. Tránh partial sync (order saved nhưng stock chưa update).

---

## Luồng bán hàng

### Tạo đơn hàng

```
Cashier bấm "Thanh toán"
    │
    ├─ 1. generateLocalId() → 'LOCAL-ORD-20250509-001'
    │
    ├─ 2. Ghi vào LocalDB (atomic transaction):
    │     orders.put(order)
    │     orderItems.bulkPut(items)
    │     payments.put(payment)
    │     inventory.update([product_id, branch_id], { stock_qty: qty + delta })
    │
    ├─ 3. syncQueue.add({ entity: 'order', payload: bundle, status: 'pending' })
    │
    ├─ 4. BroadcastChannel.postMessage({ type: 'ORDER_CREATED', order })
    │     → các tab khác nhận và update LocalDB của họ
    │
    └─ 5. UI: hiển thị bill ngay lập tức (dùng local_id)
           → nút "In bill" active ngay
           → Worker sync ngầm, replace local_id → server_id khi xong
```

### Offline path

```
Bước 1–4 giống hệt — cashier không thấy khác biệt.

Sync Worker tick() → navigator.onLine = false → skip

Network restore:
    → Worker flush queue FIFO
    → Sync tuần tự (đơn 1 xong mới đến đơn 2)
    → Mỗi đơn sync thành công: BroadcastChannel notify tất cả tabs
    → UI replace local_id bằng server_id silently
```

---

## Search Behavior (quan trọng)

### Tìm sản phẩm / khách hàng trong POS

```
User gõ vào search box
    │
    ├─ [Default] Query LocalDB ngay (<1ms, no network)
    │   Products: filter by name, sku, barcode
    │   Customers: filter by name, phone (index)
    │
    └─ [Nâng cao] User click "Tìm nâng cao" hoặc toggle
        → fetch /api/shops/[id]/products?search=...
        → Kết quả từ server (có thể có sản phẩm không trong local cache)
        → Hiện loading indicator (có thể chậm)
        → Kết quả merge vào LocalDB cho lần sau
```

### Implementation search cụ thể

```ts
// hooks/usePOSProductSearch.ts
function usePOSProductSearch(query: string, isAdvanced: boolean) {
  const localResults = useLiveQuery(async () => {
    if (!query || query.length < 2) return []
    return localDb.products
      .filter(p =>
        p.active &&
        (p.name.toLowerCase().includes(query.toLowerCase()) ||
         p.sku.toLowerCase().includes(query.toLowerCase()) ||
         p.barcode === query)  // barcode: exact match
      )
      .limit(20)
      .toArray()
  }, [query])

  const { data: apiResults, isFetching } = useQuery({
    queryKey: ['pos-product-search', query],
    queryFn: () => fetch(`/api/shops/${shopId}/products?search=${query}`).then(r => r.json()),
    enabled: isAdvanced && query.length >= 2,
    staleTime: 30_000,
  })

  return {
    results: isAdvanced ? (apiResults ?? localResults) : localResults,
    isLoading: isAdvanced && isFetching,
  }
}
```

> **Barcode scan**: luôn tìm local trước (exact match `barcode === input`). Nếu không có → thử API. Tuyệt đối không delay khi scan.

---

## Customer Lookup

```
Cache: 500 khách gần nhất (sorted by last_seen_at DESC)
Hydrate khi mount: GET /api/shops/[id]/customers?limit=500&sort=last_seen_at

Tìm trong POS:
  - Gõ SĐT/tên → query LocalDB (index phone)
  - Không tìm thấy local → auto-fallback API (không cần user click nâng cao)
    vì customer lookup ít hơn product search, chấp nhận được
  - Khi chọn khách → update last_seen_at trong LocalDB
    → background: PUT /api/shops/[id]/customers/[id] { last_seen_at }

Walk-in:
  - Button "Khách lẻ" (không cần chọn customer)
  - customer_id = null, customer_name = 'Khách lẻ'
```

---

## Order History trong POS

```
Tab "Đơn hôm nay" trong POS:
  → Query LocalDB orders WHERE DATE(created_at) = TODAY
  → Sort by created_at DESC
  → Hiển thị local_id cho đơn chưa sync, server_id cho đơn đã sync
  → Badge "Chờ sync" cho đơn pending/failed

Xem chi tiết đơn cũ:
  → Nếu có trong LocalDB → render ngay (offline capable)
  → Nếu không có (đơn cũ hơn, đã clear cache) → fetch API
    → User thấy loading spinner (chấp nhận được, đây là edge case)

"Tìm đơn nâng cao" (nút riêng):
  → Mở modal search → gọi API
  → Không cần offline support cho advanced search
```

---

## In Bill (Offline capable)

```ts
// lib/pos/printBill.ts
function printBill(order: LocalOrder, shopSettings: ShopSettings) {
  const html = renderBillHTML(order, shopSettings)  // pure function, no network
  const win = window.open('', '_blank', 'width=400,height=600')
  win?.document.write(html)
  win?.document.close()
  win?.print()
  win?.close()
}
```

### Bill template

```html
<!-- Thermal printer friendly: 80mm width, no color ink -->
<style>
  @media print {
    body { font-family: monospace; font-size: 12px; width: 80mm; }
    .divider { border-top: 1px dashed #000; }
    .right { text-align: right; }
  }
</style>

<div>
  <h2>{{shop_name}}</h2>
  <p>{{shop_address}}</p>
  <div class="divider"/>
  <p>Đơn: {{order.local_id}} → {{order.server_id ?? 'chờ sync'}}</p>
  <p>Thời gian: {{formatDate(order.created_at)}}</p>
  <p>Thu ngân: {{employee.name}}</p>
  <div class="divider"/>
  {{#each items}}
  <p>{{name}} x{{qty}}<span class="right">{{formatVND(line_total)}}</span></p>
  {{/each}}
  <div class="divider"/>
  <p class="right">Tổng: {{formatVND(order.total_amount)}}</p>
  <p class="right">Đã trả: {{formatVND(order.paid_amount)}}</p>
  <div class="divider"/>
  <p style="text-align:center">Cảm ơn quý khách!</p>
</div>
```

> In bill luôn hoạt động offline vì dùng `local_id`. Nếu chưa sync, bill hiển thị `(chờ đồng bộ)` thay vì server_id — hoàn toàn hợp lệ.

---

## Multi-tab với BroadcastChannel

### MVP: 1 tab — BroadcastChannel là no-op

```ts
// lib/pos/tabSync.ts
const channel = typeof window !== 'undefined'
  ? new BroadcastChannel('oni-pos')
  : null

export function broadcastOrderCreated(order: LocalOrder) {
  channel?.postMessage({ type: 'ORDER_CREATED', order })
}

export function listenPOSEvents(handlers: POSEventHandlers) {
  channel?.addEventListener('message', (e) => {
    switch (e.data.type) {
      case 'ORDER_CREATED':    handlers.onOrderCreated?.(e.data.order); break
      case 'SYNC_DONE':        handlers.onSyncDone?.(e.data.orderId); break
      case 'HYDRATE_REFRESH':  handlers.onHydrateRefresh?.(); break
    }
  })
}
```

### Khi mở rộng multi-tab

```
Tab A tạo đơn:
  → broadcastOrderCreated(order)
  → Tab B nhận → bulkPut order vào LocalDB của Tab B
  → Tab B inventory cũng được update ngay (không cần chờ sync)

Tab A sync thành công:
  → broadcastSyncDone({ local_id, server_id })
  → Tab B replace local_id trong danh sách đơn của mình

Khi mở rộng multi-device (tương lai):
  → Cần thêm tầng server push (Supabase Realtime hoặc SSE)
  → BroadcastChannel chỉ hoạt động trong cùng browser/origin
```

---

## Sync Worker

```ts
// lib/pos/syncWorker.ts
const SYNC_INTERVAL_MS = 3_000
const MAX_RETRY = 5
const BACKOFF_SECONDS = [2, 4, 8, 16, 32]

export class SyncWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private shopId: string

  constructor(shopId: string) {
    this.shopId = shopId
  }

  start() {
    this.timer = setInterval(() => this.tick(), SYNC_INTERVAL_MS)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  private async tick() {
    if (!navigator.onLine || this.running) return
    this.running = true
    try {
      await this.flushQueue()
    } finally {
      this.running = false
    }
  }

  private async flushQueue() {
    const items = await localDb.syncQueue
      .where('status').equals('pending')
      .sortBy('id')  // FIFO

    for (const item of items) {
      await this.syncItem(item)  // tuần tự, không Promise.all
    }
  }

  private async syncItem(item: SyncQueueItem) {
    await localDb.syncQueue.update(item.id!, { status: 'syncing' })
    try {
      const res = await fetch(`/api/shops/${this.shopId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { order_id: serverId } = await res.json()

      await localDb.transaction('rw', [localDb.syncQueue, localDb.orders], async () => {
        await localDb.syncQueue.update(item.id!, {
          status: 'done',
          server_order_id: serverId,
          synced_at: new Date().toISOString(),
        })
        await localDb.orders.where('local_id').equals(item.local_order_id).modify({
          server_id: serverId,
          sync_status: 'done',
        })
      })

      broadcastOrderSynced({ local_id: item.local_order_id, server_id: serverId })
    } catch (err) {
      const retries = item.retry_count + 1
      const isFinal = retries >= MAX_RETRY
      await localDb.syncQueue.update(item.id!, {
        status: isFinal ? 'failed' : 'pending',
        retry_count: retries,
        last_error: String(err),
      })
      if (!isFinal) {
        await sleep(BACKOFF_SECONDS[retries - 1] * 1000)
      }
    }
  }
}
```

---

## Hydration Strategy

### Initial hydration

```ts
// lib/pos/hydration.ts
export async function hydrateAll(shopId: string, branchId: string) {
  const [products, categories, priceLists, discounts, employees, inventory, customers] =
    await Promise.all([
      fetch(`/api/shops/${shopId}/products?active=true`).then(r => r.json()),
      fetch(`/api/shops/${shopId}/categories?active=true`).then(r => r.json()),
      fetch(`/api/shops/${shopId}/price-lists?active=true`).then(r => r.json()),
      fetch(`/api/shops/${shopId}/discounts?active=true`).then(r => r.json()),
      fetch(`/api/shops/${shopId}/employees?active=true`).then(r => r.json()),
      fetch(`/api/shops/${shopId}/inventory?branch=${branchId}`).then(r => r.json()),
      fetch(`/api/shops/${shopId}/customers?limit=500&sort=last_seen_at`).then(r => r.json()),
    ])

  await localDb.transaction('rw',
    [localDb.products, localDb.categories, localDb.priceLists, localDb.discounts,
     localDb.employees, localDb.inventory, localDb.customers, localDb.meta],
    async () => {
      await Promise.all([
        localDb.products.bulkPut(products),
        localDb.categories.bulkPut(categories),
        localDb.priceLists.bulkPut(priceLists),
        localDb.discounts.bulkPut(discounts),
        localDb.employees.bulkPut(employees),
        localDb.inventory.bulkPut(inventory),
        localDb.customers.bulkPut(customers),
        localDb.meta.put({ key: 'last_hydrated_at', value: new Date().toISOString() }),
        localDb.meta.put({ key: 'hydrated_branch_id', value: branchId }),
      ])
    }
  )
}
```

### Background refresh triggers

```
1. Mỗi 5 phút: kiểm tra last_hydrated_at → nếu stale → re-hydrate
2. Network restore sau offline: hydrateAll() ngay
3. User bấm nút "Đồng bộ" thủ công (luôn hiển thị trong header)
4. BroadcastChannel nhận HYDRATE_REFRESH từ tab khác
```

### Data size estimate

| Entity | Số lượng | Size | Ghi chú |
|--------|---------|------|---------|
| Products | ~500 | ~150KB | Cửa hàng nhỏ thường <200 SKU |
| Categories | ~50 | ~5KB | |
| PriceLists | ~500 rows | ~50KB | |
| Discounts | ~20 | ~5KB | |
| Employees | ~20 | ~5KB | |
| Inventory | ~500 | ~50KB | 1 branch |
| Customers | 500 | ~100KB | |
| **Tổng** | | **~365KB** | Chấp nhận được, IndexedDB chứa được hàng chục MB |

---

## Conflict Resolution

### Orders / OrderItems / Payments → Không conflict

```
Append-only. LOCAL-ID unique per device per timestamp.
2 máy tạo 2 đơn khác nhau → 2 rows trên Sheet.
```

### Inventory → Delta, không Absolute

```
SAI: Máy A set qty=49, Máy B set qty=48 → 48 (lost 1 sale)
ĐÚNG: Máy A delta=-1, Máy B delta=-2 → 50-1-2=47 ✓
```

```ts
// StockMovement payload (delta-based)
{
  type: 'sale_out',
  product_id: 'P-001',
  qty: -1,          // âm = ra kho, API dùng: stock_qty = stock_qty + qty
  branch_id: 'BR-001',
  reference_no: 'LOCAL-ORD-20250509-001',
}
```

### Product / Discount update → Last Write Wins

```
Cashier không edit product. Manager sửa giá trên admin tab khác:
  → updated_at mới hơn local → server thắng
  → Sau hydrateAll: LocalDB cập nhật, POS dùng giá mới từ lần bán tiếp theo
```

---

## Network State & UX Rules

```tsx
// components/pos/SyncStatusBar.tsx
function SyncStatusBar() {
  const isOnline = useNetworkStatus()
  const pending = useLiveQuery(() =>
    localDb.syncQueue.where('status').anyOf(['pending', 'syncing']).count()
  )
  const failed = useLiveQuery(() =>
    localDb.syncQueue.where('status').equals('failed').count()
  )

  if (failed > 0) return (
    <div className="bg-red-500 text-white px-3 py-1 text-sm">
      {failed} đơn không sync được — kiểm tra kết nối hoặc liên hệ hỗ trợ
    </div>
  )
  if (!isOnline) return (
    <div className="bg-orange-500 text-white px-3 py-1 text-sm">
      Offline • {pending} đơn chờ sync khi có mạng
    </div>
  )
  if (pending > 0) return (
    <div className="bg-yellow-500 text-black px-3 py-1 text-sm">
      Đang đồng bộ {pending} đơn...
    </div>
  )
  return null
}
```

**Quy tắc UX:**
- Tìm sản phẩm: **không bao giờ có loading** (local)
- Tạo đơn / in bill: **không bao giờ có loading** (local)
- Sync: **im lặng khi thành công**, **nổi bật khi failed**
- Search nâng cao: có loading spinner — user biết mình đang dùng tính năng advanced
- Khi LocalDB trống (first launch offline): **block UI**, yêu cầu kết nối để hydrate

---

## Server-side Cache (Admin pages)

Không dùng LocalDB. Dùng TanStack Query + Next.js Data Cache.

```ts
// Cài một lần:
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
})

// Mỗi API route GET:
export const getCachedProducts = unstable_cache(
  async (shopId: string) => readFromSheet(shopId),
  ['products'],
  { tags: [`products-${shopId}`], revalidate: 300 }
)

// Sau mỗi write:
revalidateTag(`products-${shopId}`)
```

---

## Thứ tự Implementation

```
Phase 1 — Server cache cho Admin (1–2 ngày)
  ✦ Cài @tanstack/react-query, wrap app
  ✦ Migrate existing fetch → useQuery
  ✦ Wrap API GET handlers với unstable_cache
  ✦ revalidateTag sau mỗi POST/PUT/DELETE
  → Admin pages nhanh gấp 10x, không đụng Sheet mỗi request

Phase 2 — LocalDB + Hydration (1–2 ngày)
  ✦ Tạo localDb schema (Dexie) với đầy đủ tables
  ✦ hydrateAll() function
  ✦ usePOSHydration() hook (auto-refresh mỗi 5 phút)
  ✦ BroadcastChannel setup (listeners, broadcasters)
  → Nền tảng cho POS

Phase 3 — POS Core UI (3–5 ngày)
  ✦ Layout POS: product grid + cart sidebar
  ✦ usePOSProductSearch() (local default, advanced API)
  ✦ Customer lookup (local 500 + API fallback)
  ✦ Cart state management
  ✦ Checkout form (payment split, discount apply)
  ✦ Ghi đơn vào LocalDB + syncQueue
  ✦ printBill() + bill template
  → POS hoạt động hoàn chỉnh khi online

Phase 4 — Sync Worker + Offline (2–3 ngày)
  ✦ SyncWorker class (tick, flushQueue, retry)
  ✦ SyncStatusBar component
  ✦ Xử lý network restore event
  ✦ Delta inventory update tại LocalDB khi tạo đơn
  ✦ Manual sync button
  ✦ Clear LocalDB khi logout
  → POS hoạt động offline hoàn chỉnh

Phase 5 — Order History + Edge cases (1–2 ngày)
  ✦ Tab "Đơn hôm nay" (query LocalDB)
  ✦ Xem chi tiết đơn (local-first, API fallback)
  ✦ Xử lý first-launch-offline (block + hướng dẫn)
  ✦ Xử lý sync failed (notify + manual retry)
  ✦ In lại bill từ đơn cũ
```

---

## Dependencies

```bash
pnpm add dexie                    # IndexedDB ORM — mature, TypeScript native
pnpm add @tanstack/react-query    # Client cache + server state sync
pnpm add use-debounce             # Debounce search input
pnpm add date-fns                 # Date format (tree-shakeable)
```

> Không cần Upstash Redis ở MVP. Thêm sau khi traffic vượt ngưỡng Next.js Data Cache.  
> Không cần Service Worker ở MVP. Thêm ở Phase 6+ nếu cần background sync khi tab đóng.
