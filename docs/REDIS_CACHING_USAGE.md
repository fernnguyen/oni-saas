# Hướng Dẫn Sử Dụng & Triển Khai Lớp Hybrid Caching (Plug-n-Play)

Tài liệu này hướng dẫn chi tiết cách cấu hình, vận hành và bảo trì hệ thống **Hybrid Caching (Memory & Redis)** vừa được tích hợp vào tầng dữ liệu của dự án **Oni**.

---

## 1. Tổng Quan Kiến Trúc Caching Lớp Lai (Hybrid)

Lớp Caching này được thiết kế theo mô hình **Decorator Pattern** cực kỳ linh hoạt và cắm ghép (Plug-n-Play). Nó bọc ngoài các Database Connectors hiện tại thông qua lớp trung gian `CachedDataConnector` kế thừa trọn vẹn interface `IDataConnector`.

```
                  ┌─────────────────────────────────┐
                  │      Tầng API / Next.js         │
                  └────────────────┬────────────────┘
                                   │
                                   ▼
                  ┌─────────────────────────────────┐
                  │    CachedDataConnector (Proxy)  │
                  └──────┬───────────────────┬──────┘
                         │                   │
             (Cache Hit) │                   │ (Cache Miss / Lệnh Ghi)
                         ▼                   ▼
            ┌──────────────────────┐   ┌──────────────────────────┐
            │   ICacheService      │   │ IDataConnector Gốc       │
            │ (Memory/Redis Cache) │   │ (Postgres/MySQL/Sheets)  │
            └──────────────────────┘   └──────────────────────────┘
```

### Ưu điểm vượt trội:
* **Không xâm lấn (Zero-intrusion):** Không chỉnh sửa bất kỳ dòng code logic nghiệp vụ nào của các adapter hiện tại (`PostgresConnector`, `GoogleSheetsConnector`).
* **Plug-n-Play:** Dễ dàng bật/tắt toàn bộ tầng cache hoặc hoán đổi giữa Memory Cache và Redis Cache chỉ thông qua cấu hình trong file `.env`.
* **Chịu lỗi cao (Fault-tolerant):** Nếu Redis bị sập đột ngột trên Production, hệ thống tự động phát hiện và chuyển sang cơ chế Bypass (kết nối trực tiếp xuống DB) để bảo vệ ứng dụng Next.js không bị gián đoạn.

---

## 2. Hướng Dẫn Cấu Hình Biến Môi Trường (Environment Variables)

Hệ thống điều khiển hoạt động Caching thông qua 3 biến môi trường chính trong file `.env.local` (ở thư mục `apps/web/.env.local` hoặc môi trường Production):

```bash
# 1. Bật/Tắt tính năng Caching toàn hệ thống (mặc định: false)
ENABLE_CACHE=true

# 2. Lựa chọn nhà cung cấp dịch vụ cache ('memory' hoặc 'redis')
# - 'memory': Sử dụng RAM cục bộ của chính server Next.js (thích hợp cho Dev/Test)
# - 'redis': Sử dụng máy chủ Redis phân tán tập trung (bắt buộc cho Production nhiều instances)
CACHE_PROVIDER=memory

# 3. Đường dẫn kết nối tới máy chủ Redis (chỉ yêu cầu khi CACHE_PROVIDER=redis)
REDIS_URL=redis://127.0.0.1:6379
```

---

## 3. Quy Tắc Phân Tách Cache Key (Namespacing) Cho 1000 Tenants

Để đảm bảo bảo mật tuyệt đối, tránh rò rỉ dữ liệu chéo giữa các Tenants (doanh nghiệp) dùng chung một Database và dễ dàng dọn dẹp cache cũ, toàn bộ Key trong Redis được chuẩn hóa theo quy tắc phân cấp nghiêm ngặt:

* **Cache tìm kiếm trực tiếp theo ID:**
  `oni:data:{tenant_id}:{branch_id}:{entity_name}:id:{record_id}`
  * *Thời gian sống (TTL):* 30 phút (1800 giây).
* **Cache danh sách truy vấn phân trang / tìm kiếm (List Query):**
  `oni:data:{tenant_id}:{branch_id}:{entity_name}:list:{options_hash}`
  * *Thời gian sống (TTL):* 5 phút (300 giây).
  * *Giải thích:* `{options_hash}` là chuỗi mã hóa SHA256 gồm các tham số phân trang, bộ lọc filters, và từ khóa search để đảm bảo tính nhất quán của kết quả hiển thị.

---

## 4. Chiến Lược An Toàn Dữ Liệu: Thu Hồi Cache Chủ Động (Active Eviction)

Hệ thống áp dụng cơ chế **Cache-Aside kết hợp Active Eviction-on-Write**:

1. **Khi ĐỌC dữ liệu (`findById`, `list`):**
   * Đọc cache trước. Nếu có (Cache Hit) $\rightarrow$ Trả về ngay.
   * Nếu không có (Cache Miss) $\rightarrow$ Đọc từ cơ sở dữ liệu gốc $\rightarrow$ Nạp ngược lại vào cache $\rightarrow$ Trả về cho Client.
2. **Khi GHI dữ liệu (`create`, `update`, `delete`, `batchCreate`):**
   * Hệ thống ghi nhận dữ liệu mới trực tiếp xuống Database trước.
   * **Bắt buộc XÓA (Evict)** toàn bộ các key cache liên quan của thực thể đó thuộc Tenant (`invalidateEntityCache`).
   * **Tại sao không dùng Write-Through (ghi đè giá trị mới)?** Việc xóa cache đảm bảo ở lần đọc tiếp theo, hệ thống sẽ lấy dữ liệu chuẩn xác 100% từ Database gốc, bảo toàn toàn bộ các trường tự động tạo ở DB (như ID tự tăng, database triggers, timestamps `updated_at` tự động).

### 4.1 Danh Sách Thực Thể Loại Trừ (Bypass Caching)

Để bảo vệ tuyệt đối tính toàn vẹn dữ liệu (đảm bảo độ chính xác tài chính và lượng tồn kho từng giây), hệ thống thiết lập một danh sách loại trừ **bắt buộc không đi qua cache** (luôn đọc/ghi trực tiếp từ Postgres):

* **Sổ quỹ:** `cashbook`
* **Đơn hàng & Thanh toán:** `orders`, `order-items`, `payments`
* **Kho hàng:** `stock-movements`, `shop-shifts` (ca làm việc), `fund-audits` (kiểm kho)
* **Trả hàng:** `returns`, `return-items`

Cơ chế này được quản lý tập trung bằng biến `EXCLUDED_ENTITIES` bên trong [CachedDataConnector.ts](file:///Users/fern/Coding/ERP/oni-saas-starter/packages/adapters/src/cache/CachedDataConnector.ts) và tự động bypass mà không cần lập trình viên cấu hình thêm.

---

## 5. Hướng Dẫn Kiểm Thử & Vận Hành Cục Bộ (Local)

### Bước 1: Test nhanh bằng RAM cục bộ (Memory Cache)
1. Trong file `apps/web/.env.local`, cấu hình:
   ```env
   ENABLE_CACHE=true
   CACHE_PROVIDER=memory
   ```
2. Chạy ứng dụng Next.js ở chế độ dev:
   ```bash
   pnpm dev
   ```
3. Bạn có thể kiểm tra xem hệ thống đã cache các API Products hoặc Customers hay chưa bằng cách kiểm tra độ trễ (latency) của API giảm xuống mức dưới **5ms** ở các lần tải trang thứ hai trở đi.

### Bước 2: Chạy script kiểm tra tự động (Automated Verification)
Tôi đã xây dựng sẵn một script kiểm thử độc lập giúp mô phỏng toàn bộ quy trình đọc, ghi, cache miss, cache hit và thu hồi cache tự động. 
Anh có thể chạy lệnh sau tại thư mục gốc của dự án:
```bash
pnpx tsx scratch/test-cache.ts
```
**Kỳ vọng kết quả đầu ra thành công hoàn toàn:**
```text
🧪 Bắt đầu chạy các ca kiểm thử xác thực Hybrid Caching...

--- Case 1: Đọc lần đầu (Cache Miss) ---
Dữ liệu P1: Sản phẩm gốc A
Số lần đọc DB: 1 (Kỳ vọng: 1)

--- Case 2: Đọc lần hai (Cache Hit) ---
Dữ liệu P2: Sản phẩm gốc A
Số lần đọc DB: 1 (Kỳ vọng: 1 - không tăng thêm)

--- Case 3: Cache danh sách truy vấn (List Query) ---
Số sản phẩm tìm thấy: 1
Số lần đọc DB: 2 (Kỳ vọng: 2 - list query hit DB lần đầu)
Số lần đọc DB: 2 (Kỳ vọng: 2 - list query hit Cache lần 2)

--- Case 4: Thu hồi Cache trực tiếp khi cập nhật (Active Eviction) ---
Đã cập nhật sản phẩm trong DB.
Dữ liệu P3: Sản phẩm A đã cập nhật
Số lần đọc DB: 3 (Kỳ vọng: 3 - cache đã bị xóa và phải nạp lại từ DB)

--- Case 5: Thu hồi Cache danh sách khi cập nhật ---
Số lần đọc DB: 4 (Kỳ vọng: 4 - cache danh sách bị xóa và phải nạp lại)

✅ BÁO CÁO: TẤT CẢ CÁC CA KIỂM THỬ ĐÃ VƯỢT QUA HOÀN HẢO!
```

---

## 6. Các Lưu Ý Vận Hành Cực Kỳ Quan Trọng Trên Production

1. **Chính sách thu hồi dung lượng khi đầy RAM (Redis Eviction Policy):**
   * Tránh cấu hình mặc định là `noeviction` (lỗi đầy bộ nhớ OOM khi nhiều tenant lưu trữ dữ liệu).
   * **Cấu hình đề xuất cho Redis Server:** Đặt `maxmemory` và cấu hình chính sách tự xóa `maxmemory-policy volatile-lru` hoặc `allkeys-lru`.
2. **Không cố gắng cache dữ liệu biến động cực cao:**
   * Tuyệt đối không bọc cache cho các API giao dịch liên tục như `cashbook`, `payments` hay `orders` (dù hệ thống đã được cô lập an toàn ở tầng decorator nhưng lập trình viên mới cần tránh lạm dụng).
3. **Cảnh báo lỗi kết nối Redis:**
   * Hệ thống đã tích hợp Fault-Tolerance. Tuy nhiên, nếu log server hiển thị liên tục lỗi `❌ Redis Cache Client connection error`, hãy kiểm tra ngay trạng thái hoạt động của Redis Server hoặc tường lửa (Firewall) cổng `6379`.
