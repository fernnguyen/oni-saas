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
