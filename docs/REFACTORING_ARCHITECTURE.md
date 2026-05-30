# Tenant-Scoped Dynamic Database Architecture

Tài liệu này mô tả chi tiết về việc refactor từ mô hình "Mỗi chi nhánh một kết nối dữ liệu (Shop-Scoped Connector)" sang "Mỗi tổ chức một kết nối dữ liệu (Tenant-Scoped Connector)". 

## 1. Mục Tiêu Refactor
1. **Dữ liệu tập trung:** Các chi nhánh trong cùng một Tổ chức/Workspace (Tenant) dùng chung một Database (Google Sheets hoặc Local MySQL).
2. **Quản lý phân quyền (RBAC):** Chỉ `owner` hoặc `admin` của Tenant mới có quyền cấu hình kết nối dữ liệu này. `staff` chỉ được sử dụng.
3. **Phân tách chi nhánh tự động:** Adapter (Google Sheets / MySQL) sẽ tự động quản lý dữ liệu riêng rẽ cho từng chi nhánh dựa trên biến `branchId`.

## 2. Kiến Trúc Mới

### 2.1 Cấu trúc Cơ sở dữ liệu (Supabase)
Bảng `connectors` trước đây liên kết trực tiếp với `shop_id` nay đã được thay thế bằng `tenant_id`:
```sql
ALTER TABLE public.connectors DROP COLUMN shop_id;
ALTER TABLE public.connectors ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
```
*(Chi tiết tại `supabase/migrations/20260513000000_tenant_connectors.sql`)*

### 2.2 Factory Pattern & Adapter (packages/adapters)
Factory cung cấp Connector (`getConnectorForShop`) không còn truy vấn `connectors` theo `shop_id` nữa. Thay vào đó:
1. Nhận vào `shopId`.
2. Truy vấn lấy `tenant_id` từ `shops`.
3. Tìm Active Connector theo `tenant_id`.
4. Inject `tenantId` và `branchId` (`shopId`) vào `MysqlConnector` hoặc `GoogleSheetsConnector`.

Khi Connector thực thi lệnh `list` / `create`, nó sẽ tự động append `branchId` (và `tenantId` với hệ thống dùng chung) vào các câu Query hoặc payload.

### 2.3 Phân Quyền (UI/API)
- **Trang Cài Đặt Tổ Chức (`/t/[slug]/settings`):** Được bọc bởi `DashboardShell` (context `control`) và sử dụng hàm `getUserPermissions` để lấy roles. Chỉ role `owner` và `admin` mới được vào trang này.
- **API `mysql_local`:** Tạo ra API endpoint mới là `/api/connectors/mysql/connect` để cấp phát kết nối Local DB cho các Tenant muốn dùng hệ thống thay vì Google Sheets.

## 3. Cấu hình Môi trường (Local Database)

Để sử dụng kết nối Local DB thay vì Google Sheets, cần cấu hình biến môi trường trong file `.env.local` ở `apps/web/.env.local`:

```bash
# Local Postgres Connection (Mặc định cho môi trường hiện tại)
LOCAL_PG_URI=postgresql://postgres:postgres@127.0.0.1:5432/oni_saas_local

# Local MySQL Connection (Cũ/Optional)
LOCAL_MYSQL_URI=mysql://root:root@127.0.0.1:3306/oni_saas

# Hoặc hệ thống sẽ tự fallback về DATABASE_URL nếu có khai báo.
```

## 4. Xử lý Lỗi & Trải Nghiệm Người Dùng (UX)

Để đảm bảo người dùng biết họ cần cấu hình cơ sở dữ liệu:
1. **Bắt Lỗi ở Adapter:** API endpoints (như `api/shops/[shopId]/products`) sẽ trả về status code HTTP tương ứng (vd `422 Unprocessable Entity` với code `NO_CONNECTOR` hoặc `500 Server Error` nếu chưa config biến môi trường MySQL).
2. **Bắt Lỗi ở Client (SWR/Fetch):** Hàm `safeFetch` trong logic Hydration cho Offline POS (`lib/localDb/hydration.ts`) đã được sửa để `throw` khi có mã lỗi API (`!res.ok`).
3. **Hiển thị giao diện:** Component POS Client sẽ bắt `status === 'error'` và hiển thị trang cảnh báo thay vì trống trơn. Giao diện này cung cấp đường dẫn chuyển hướng thẳng về `/t/[slug]/settings` để Admin cấu hình Connector.

## 5. Khởi tạo Database (Seed / Schema Push)

Nếu đây là lần đầu tiên bạn cấu hình hệ thống Local MySQL (ví dụ: vừa tạo schema database rỗng bằng lệnh `create database oni_saas;`), bạn cần chạy công cụ **Drizzle Kit** để nó tự động tạo bảng (tables) dựa trên định nghĩa cấu trúc. Không cần seed dữ liệu mẫy (dummy data) vì mỗi chi nhánh khi đăng ký sẽ có dữ liệu trống rỗng.

**Các bước thực hiện:**
1. Đảm bảo bạn đã điền đúng `LOCAL_MYSQL_URI` trong file `apps/web/.env.local`.
2. Mở Terminal ở thư mục gốc của dự án (`oni-saas-starter`) và chạy:
   ```bash
   pnpm db:push
   ```
3. Lệnh này sẽ gọi qua `packages/adapters` để đọc schema và khởi tạo toàn bộ bảng (`orders`, `products`, `customers`, v.v.) vào Database của bạn.

---

## 6. AI Agent Guidelines (Quy tắc bắt buộc cho Antigravity & Gemini)

Để tránh các lỗi cơ bản khi thực hiện code trong hệ thống, mọi AI Agent (bao gồm cả Antigravity) khi làm việc trên workspace này **BẮT BUỘC** phải tuân thủ tuyệt đối các quy tắc sau:

### 6.1 Sử dụng Icon (React Lucide)
- **BẮT BUỘC** luôn dùng icon từ thư viện `lucide-react`.
- **CẤM** viết code SVG inline tự chế hoặc dùng các thư viện icon ngoài khác.
- **Import format:**
  ```typescript
  import { Trash2, Edit, Check, AlertCircle } from 'lucide-react'
  ```

### 6.2 Hộp thoại Xác nhận & Trạng thái Loading (Confirm Dialogs)
- **BẮT BUỘC** yêu cầu xác nhận (`confirm`) trước các hành động làm thay đổi trạng thái (xóa, cập nhật, thay đổi trạng thái kích hoạt, v.v.).
- **BẮT BUỘC** dùng hook `useConfirm` từ `@/app/components/ui/ConfirmProvider` thay vì tự tạo modal/alert cục bộ.
- **BẮT BUỘC** truyền hàm thực thi async vào thuộc tính `onConfirm` để kích hoạt trạng thái loading spinner tự động của hộp thoại.
- **Pattern chuẩn:**
  ```typescript
  const confirm = useConfirm()
  
  const handleDelete = async (id: string) => {
    await confirm({
      title: 'Xác nhận xóa tài khoản/quỹ',
      description: 'Bạn có chắc chắn muốn xóa tài khoản này không?',
      confirmLabel: 'Xóa',
      cancelLabel: 'Hủy',
      variant: 'danger',
      onConfirm: async () => {
        // Trả về promise để hiển thị spinner trên nút Xác nhận và khóa tương tác
        await deleteMutation.mutateAsync(id)
      }
    })
  }
  ```

### 6.3 Thao tác Database (Supabase vs. Dynamic Connector)
Hệ thống chia làm 2 phân tầng dữ liệu rõ rệt. Agent phải phân biệt và sử dụng đúng:
- **Control-plane (Supabase):** Dùng để truy vấn Auth, Tenants, Subscriptions, Plans, Domains, Connectors metadata config. (Truy vấn qua client của Supabase).
- **Data-plane (Operational Business Data):** Đối với các bảng nghiệp vụ (`products`, `categories`, `customers`, `inventory`, `stock_movements`, `cashbook`, `payment-funds`, `shifts`, `fund-audits`), **CẤM** truy vấn trực tiếp bằng Supabase client.
- **Cách dùng đúng:** Trong API route handlers, luôn dùng `requireShopAccess(shopId, permission)` để lấy instance `connector` động.
  ```typescript
  const { connector } = await requireShopAccess(shopId, 'products.view')
  const products = await connector.list('products', { filters })
  ```

### 6.4 Định tuyến URL & Subdomain Mapping (Client URL vs Physical Folder)
- **Bối cảnh:** Ngoại trừ trang quản trị hệ thống (`/super`), mọi nghiệp vụ và trang của Tenant đều hoạt động dưới dạng **Subdomain** (ví dụ: `tenant-slug.oni.vn` hoặc `linhka.localhost:3000`).
- **Cơ chế:** Middleware sẽ âm thầm rewrite (định tuyến ẩn) request từ subdomain `[slug].oni.vn/[branch]/settings` vào thư mục vật lý `/apps/web/app/t/[slug]/[branch]/settings`.
- **QUY TẮC BẮT BUỘC:** Khi sinh code cho Frontend (thẻ `<Link>`, hàm `router.push`, `window.location`, v.v.), **KHÔNG ĐƯỢC** thêm tiền tố vật lý `/t/[slug]` hay `/t/[branch]` vào URL.
  - **CẤM (Sai):** `<Link href="/t/ca-phe-minh/q1/settings">` hoặc `router.push('/t/q1/settings')`
  - **BẮT BUỘC (Đúng):** `<Link href="/q1/settings">` hoặc `router.push('/q1/settings')` (hoặc dùng `/[branch]/settings` với biến branch tương ứng).
- AI Agent phải luôn ghi nhớ rằng đối với trình duyệt của người dùng, `/t/[slug]` không hề tồn tại.


