# ONI CRUD Management — Design & Planning

> Document cho session tiếp theo. Mục tiêu: xây dựng hệ thống quản lý đầy đủ kết nối với Google Sheet DB.

---

## Kiến trúc tổng quan

```
Browser ──► Next.js API Route ──► Google Sheets API (Service Account)
                │
                └──► Supabase (shop_settings cache, auth, connector config)
```

**Read flow**: API đọc từ Sheet qua Service Account → parse → trả về JSON  
**Write flow**: API ghi vào Sheet qua Service Account → cập nhật Inventory/StockMovements tương ứng  
**Cache**: `shop_settings` trong Supabase cho settings; data thực tế luôn đọc từ Sheet

---

## API Layer — thiết kế chung

Mọi route đều theo pattern:

```
GET    /api/shops/[shopId]/[entity]           — list (query params: page, limit, search, filter)
POST   /api/shops/[shopId]/[entity]           — create
GET    /api/shops/[shopId]/[entity]/[id]      — get one
PUT    /api/shops/[shopId]/[entity]/[id]      — update
DELETE /api/shops/[shopId]/[entity]/[id]      — delete (soft: set active=FALSE)
```

**Sheet helper lib** cần build: `lib/server/sheetDb.ts`
- `readSheet(sheetId, token, tabName, headerRow?)` → `Record<string, string>[]`
- `appendRow(sheetId, token, tabName, row)` → row index
- `updateRow(sheetId, token, tabName, rowIndex, row)` → void
- `findRow(sheetId, token, tabName, key, value)` → `{ row, index }|null`
- `batchAppend(sheetId, token, tabName, rows[])` → void

ID generation: `lib/server/idGen.ts`
- `nextId(sheetId, token, tabName, prefix)` → đọc cột đầu tiên, lấy max số + 1 → `P-042`

---

## 1. Products — Quản lý sản phẩm

### UI (list view)
- **Toolbar**: Search input + filter by category + filter by active + "Thêm sản phẩm" button
- **Table columns**: SKU | Ảnh+Tên | Danh mục | Đơn vị | Giá bán | Giá vốn (owner only) | Tồn kho | Trạng thái | Actions
- **Row actions**: Edit (inline slide-over) | Xem tồn kho | ... menu (duplicate, deactivate)
- **Bulk actions**: Deactivate nhiều, Export CSV

### UI (create/edit form — slide-over panel, không dùng modal)
```
Tab 1: Thông tin cơ bản
  - Tên sản phẩm (required)
  - SKU (auto-suggest: slug of name + counter)
  - Barcode (optional)
  - Danh mục (searchable select → Categories)
  - Đơn vị tính
  - Mô tả
  - Ảnh URL

Tab 2: Giá & Chi phí
  - Giá bán lẻ (sell_price)
  - Giá vốn (cost_price) — chỉ hiển thị cho owner/manager
  - Giá sàn (min_price)
  - Thuế GTGT riêng (overrides shop default)

Tab 3: Kho hàng
  - Theo dõi tồn kho (toggle)
  - Tồn kho hiện tại per branch (read-only summary, edit qua StockMovement)
  - Tồn kho tối thiểu (min_stock)
```

### API
```
GET    /api/shops/[id]/products?search=&category=&active=&page=&limit=
POST   /api/shops/[id]/products         { sku, name, category_id, unit, sell_price, ... }
PUT    /api/shops/[id]/products/[rowId]  { ...fields }
DELETE /api/shops/[id]/products/[rowId]  → set active=FALSE
```

### Performance notes
- Đọc toàn bộ Products sheet 1 lần, cache trong memory 30s (hoặc Redis nếu có)
- Với >500 sản phẩm, dùng server-side pagination: đọc range `A2:P501` per page
- Search: filter ở API layer sau khi đọc (không query sheet per character)

---

## 2. Categories — Danh mục hàng hóa

### UI
- **Simple tree view**: danh mục cha có thể expand để xem con
- Inline edit tên (click → input → blur để save)
- Drag-and-drop sort order (dùng `@dnd-kit/sortable`)
- Add button ở footer mỗi group

### API
```
GET    /api/shops/[id]/categories         — trả về flat list, UI build tree
POST   /api/shops/[id]/categories         { name, parent_id?, sort_order }
PUT    /api/shops/[id]/categories/[rowId]
DELETE /api/shops/[id]/categories/[rowId] — check: không có product nào dùng category này
```

---

## 3. Inventory — Tồn kho

### UI — không CRUD trực tiếp
Inventory được cập nhật **gián tiếp** qua StockMovements. UI inventory là:
- **Dashboard view**: bảng sản phẩm + tồn kho per branch
- Highlight đỏ khi `stock_qty <= min_stock`
- Click vào sản phẩm → xem lịch sử StockMovements

### Nhập/Xuất kho (StockMovement form)
```
Type selector: Nhập hàng | Xuất hàng | Chuyển kho | Điều chỉnh
Nếu "Nhập hàng":
  - Nhà cung cấp (select → Suppliers)
  - Số phiếu nhập / mã hóa đơn
  - Danh sách sản phẩm: SKU | Tên | Số lượng | Đơn giá nhập
  - Ghi chú
Nếu "Chuyển kho":
  - Từ chi nhánh → Đến chi nhánh
  - Danh sách sản phẩm + số lượng
```

**Logic khi save**: API ghi vào StockMovements sheet, sau đó cập nhật `Inventory.stock_qty` tương ứng.

---

## 4. Customers — Khách hàng

### UI (list)
- Table: Mã KH | Tên | SĐT | Loại KH | Công nợ | Điểm tích lũy | Ngày tạo
- Filter: customer_type, debt_amount > 0 (có nợ)
- Search: theo tên / SĐT / mã

### UI (detail — full page, không slide-over vì nhiều thông tin)
```
Header: Tên KH + badge loại + tổng đã mua (tính từ Orders)
Tab 1: Thông tin — phone, email, address, birthday, credit_limit
Tab 2: Lịch sử đơn hàng — Orders table filtered by customer_id
Tab 3: Công nợ — Payments + debt history
```

---

## 5. Suppliers — Nhà cung cấp

### UI (simple list + form)
- Table: Tên | SĐT | Email | Điều khoản TT | Actions
- Form: modal vì form ngắn (7 fields)

---

## 6. Employees — Nhân viên

### UI
- Table: Mã NV | Tên | SĐT | Role | Chi nhánh | Hoa hồng | Trạng thái
- Form: slide-over
- **Lưu ý**: Employee trong Sheet ≠ User trong Supabase. Đây là dữ liệu bán hàng, không phải account login.

---

## Component Library — design system cần build

```
components/ui/
  DataTable.tsx        — sortable, selectable, paginated table
  SlideOver.tsx        — right-side panel (400px) cho create/edit forms
  SearchInput.tsx      — debounced search
  SelectField.tsx      — searchable select (dùng cho category, supplier...)
  TagBadge.tsx         — colored badge cho status, customer_type, role
  EmptyState.tsx       — illustration + CTA khi list rỗng
  ConfirmDialog.tsx    — confirm trước khi delete
  Pagination.tsx       — page navigator
  NumberInput.tsx      — formatted number input (giá tiền: 1,000,000đ)
  FileUpload.tsx       — ảnh sản phẩm (upload to Supabase Storage)
```

---

## DataTable spec (component quan trọng nhất)

```tsx
<DataTable
  columns={[
    { key: 'sku', label: 'SKU', width: 100, sortable: true },
    { key: 'name', label: 'Tên sản phẩm', render: (row) => <ProductNameCell row={row} /> },
    { key: 'sell_price', label: 'Giá bán', align: 'right', render: (v) => formatVND(v) },
    { key: 'actions', label: '', render: (row) => <RowActions row={row} /> },
  ]}
  data={products}
  loading={isLoading}
  selectable
  onSelectionChange={setSelected}
  pagination={{ page, total, pageSize: 50, onChange: setPage }}
  emptyState={<EmptyState title="Chưa có sản phẩm" />}
/>
```

**Features cần có:**
- Sticky header khi scroll
- Sort by column (client-side cho <200 rows, server-side cho >200)
- Checkbox select all / per row
- Loading skeleton (không dùng spinner)
- Responsive: ẩn cột phụ trên mobile

---

## SlideOver spec

```tsx
<SlideOver
  open={isOpen}
  onClose={() => setOpen(false)}
  title="Thêm sản phẩm"
  width={480}
  footer={
    <>
      <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
      <Button onClick={handleSave} loading={saving}>Lưu</Button>
    </>
  }
>
  <ProductForm ... />
</SlideOver>
```

---

## Thứ tự build đề xuất cho session tiếp theo

```
1. lib/server/sheetDb.ts          — sheet reader/writer helpers (nền tảng cho mọi CRUD)
2. lib/server/idGen.ts            — ID generator
3. components/ui/DataTable.tsx    — component dùng đi dùng lại nhiều nhất
4. components/ui/SlideOver.tsx    — container form create/edit
5. Categories CRUD                — đơn giản nhất, ít field, validate dependency
6. Products CRUD                  — phức tạp nhất, làm sau khi DataTable + SlideOver ổn
7. Customers CRUD
8. Suppliers CRUD
9. Employees CRUD
10. Inventory view + StockMovement form
```

---

## Lưu ý kỹ thuật quan trọng

### Google Sheets API limits
- 100 requests/100s per user, 500 requests/100s per project
- Batch reads > nhiều single reads: dùng `values:batchGet` thay vì nhiều GET riêng
- Dùng `valueInputOption: USER_ENTERED` khi write để Sheet tự parse số/ngày

### Optimistic UI
- Khi user create/update: cập nhật local state ngay, gọi API async
- Nếu API fail: rollback + hiển thị error toast
- Tránh reload toàn trang sau mỗi action

### Error handling patterns
- Sheet API 429 (rate limit) → retry với exponential backoff (2s, 4s, 8s)
- Sheet không có tab → hiển thị "Cần chạy Rebuild schema" link to settings
- Sheet có tab nhưng thiếu cột → Oni bỏ qua, không crash

### Validation
- Client-side: react-hook-form + zod schema
- Server-side: zod schema (cùng schema export từ 1 file)
- Shared schema location: `lib/validators/[entity].ts`
