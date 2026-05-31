# Hướng dẫn Kỹ thuật: Chuyển đổi Ngành nghề kinh doanh (industry_type) sang cấp Chi nhánh (Shop Level)

Tài liệu này dùng để tham chiếu lâu dài, giải thích chi tiết kiến trúc, cơ chế kế thừa, và cách thức xử lý dữ liệu liên quan khi đưa thuộc tính `industry_type` từ cấp **Tổ chức (Tenant)** xuống cấp **Chi nhánh (Shop)** trong hệ thống ERP ONI.vn.

---

## 1. Bối cảnh & Mục tiêu
* **Trước đây:** Hệ thống lưu cấu hình `industry_type` ở cấp `tenants`. Do đó, toàn bộ các chi nhánh thuộc cùng một doanh nghiệp bắt buộc phải chung một ngành nghề kinh doanh (ví dụ: cùng là Bán lẻ hoặc cùng là Khách sạn).
* **Vấn đề thực tế:** Đối với các tổ hợp dịch vụ lớn (như Khách sạn kết hợp Bar/Nhà hàng, Spa, Sân thể thao...), doanh nghiệp cần chạy chung dữ liệu trên một **Tenant duy nhất** để chia sẻ CRM tích điểm, hạch toán Sổ quỹ tập trung, và luân chuyển tài sản cố định (Assets). Tuy nhiên, mỗi chi nhánh lại đòi hỏi giao diện bán hàng chuyên biệt (Khách sạn cần Room Map, Nhà hàng cần Table Map, Bar/Spa cần tính tiền theo giờ).
* **Mục tiêu:** Di chuyển thuộc tính `industry_type` xuống cấp **Shop (Chi nhánh)**, giúp thiết lập độc lập ngành kinh doanh cho từng chi nhánh, đồng thời giữ vững tính đồng nhất dữ liệu toàn doanh nghiệp.

---

## 2. Thiết kế Cơ sở dữ liệu & Kế thừa (Inheritance)

### 2.1 Cột mới trên bảng `public.shops`
Chúng ta bổ sung cột `industry_type` kiểu `TEXT` vào bảng `public.shops`. 
Khi chạy migration, để đảm bảo an toàn dữ liệu hiện tại, chúng ta sử dụng câu lệnh backpopulate kế thừa dữ liệu từ bảng Tenant cha:
```sql
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS industry_type TEXT;

UPDATE public.shops s
SET industry_type = t.industry_type
FROM public.tenants t
WHERE s.tenant_id = t.id;

ALTER TABLE public.shops 
ALTER COLUMN industry_type SET DEFAULT 'retail',
ALTER COLUMN industry_type SET NOT NULL;
```

### 2.2 Cập nhật View `public.shops_view`
Để tối ưu hóa hiệu năng truy vấn ở Backend và Frontend, View `public.shops_view` được cập nhật để trả về trực tiếp cột `industry_type` của Shop:
```sql
CREATE OR REPLACE VIEW public.shops_view AS
SELECT
  sh.id,
  sh.tenant_id,
  sh.name,
  sh.slug,
  sh.address,
  sh.created_at,
  sh.industry_type, -- Trả về ngành nghề của Shop
  c.id     as connector_id,
  c.type   as connector_type,
  c.status as connector_status
FROM public.shops sh
LEFT JOIN public.connectors c ON ...
```

### 2.3 Khởi tạo Chi nhánh mới qua Postgres RPC `create_shop`
Hàm khởi tạo chi nhánh `create_shop` được nạp chồng (overload) để nhận thêm tham số `p_industry_type`. Nếu tham số này bị bỏ trống (ví dụ: tạo chi nhánh nhanh), hệ thống sẽ tự động truy vấn tìm `industry_type` của Tenant cha để làm giá trị mặc định:
```sql
v_resolved_industry := coalesce(
  p_industry_type, 
  (SELECT industry_type FROM public.tenants WHERE id = p_tenant_id), 
  'retail'
);
```

---

## 3. Kiến trúc Đồng bộ & API (Backend)

### 3.1 API Danh sách Tổ chức (`/api/tenants/list`)
API trả về danh sách các tổ chức mà user thuộc về sẽ bổ sung thêm trường `industry_type`. 
Điều này giúp giao diện tạo chi nhánh mới (`new/page.tsx`) ngay lập tức biết được ngành nghề mặc định của tổ chức cha để tự động gán vào Form.

### 3.2 API Tạo chi nhánh (`/api/shops` - POST)
Zod validator `createSchema` được tích hợp thêm trường enum `industry_type`. Khi nhận dữ liệu, API sẽ chuyển tiếp giá trị này xuống hàm Postgres RPC `create_shop` để lưu trực tiếp vào cơ sở dữ liệu.

### 3.3 API Cài đặt chi nhánh (`/api/shops/[shopId]/settings` - PUT)
Để hỗ trợ việc chỉnh sửa ngành nghề sau khi tạo, API Settings hỗ trợ trường `industry_type` trong payload `PUT`. Khi trường này được cung cấp, API sẽ đồng thời thực hiện cập nhật trường `industry_type` trên bảng `public.shops` cấp chi nhánh.

---

## 4. Xử lý Giao diện & Fallback (Frontend)

Để đảm bảo tương thích ngược 100% (Backward Compatibility) và không gây gián đoạn hệ thống khi nâng cấp, toàn bộ các trang giao diện chi nhánh sẽ tuân thủ cơ chế giải quyết (resolve) ngành nghề theo thứ tự ưu tiên:
1. `shop.industry_type` (Cấu hình riêng của chi nhánh).
2. `tenant.industry_type` (Cấu hình mặc định của doanh nghiệp mẹ - Fallback).
3. `'retail'` (Giá trị mặc định an toàn tuyệt đối).

### 4.1 Luồng Tạo chi nhánh Mới (`NewShopForm`)
* Khi người dùng chọn Tổ chức (Tenant), Form sẽ tự động lắng nghe sự thay đổi và gán giá trị mặc định của tổ chức cha làm giá trị pre-select cho chi nhánh mới.
* Tích hợp bộ thẻ chọn ngành kinh doanh (interactive cards) trực quan với thiết kế gradient, icon biểu trưng và micro-animations giúp người dùng dễ dàng nắm bắt các tính năng chính của từng ngành (Bán lẻ, FnB, Bi-a, Sân thể thao, Khách sạn...).

### 4.2 Luồng Thay đổi Ngành trong Cài đặt (`ShopSettingsForm`)
* Khi quản trị viên thay đổi ngành của chi nhánh tại trang Cài đặt chung, hệ thống sẽ kích hoạt một cửa sổ đối thoại xác nhận (`confirm`).
* Cửa sổ này cảnh báo rõ ràng cho người dùng về việc giao diện bán hàng (POS) và luồng nghiệp vụ kho hàng tại chi nhánh này sẽ thay đổi ngay lập tức, giúp ngăn ngừa tối đa các thao tác nhầm lẫn của thủ kho/thu ngân.

---

## 5. Ứng dụng Nghiệp vụ Kế toán đa ngành (Cost Center)
Việc đưa ngành nghề xuống chi nhánh phục vụ hoàn hảo cho việc đối chiếu và hạch toán kế toán dịch vụ:
* **Chi phí khấu hao & Bàn giao Tài sản (Assets Allocation):** Khách sạn có thể luân chuyển công cụ dụng cụ (như khăn, ga trải giường, máy lọc nước) từ kho tổng sang bộ phận Bar/FnB hoặc Spa. Khi đó, kế toán chỉ cần chọn trực tiếp mã bộ phận (Cost Center) để ghi nhận chi phí phân bổ chính xác cho từng chi nhánh đa ngành mà không lo bị lệch số liệu.
* **Doanh thu tích hợp:** Dòng tiền doanh thu từ phòng (Khách sạn), từ đồ uống (Bar), từ dịch vụ thuê giờ (Billiards/Spa) đều đổ về một Sổ quỹ tập trung (Cashbook) của doanh nghiệp nhưng được gắn nhãn mã chi nhánh chi tiết, giúp kế toán trưởng khóa sổ cuối kỳ cực kỳ nhanh chóng và chính xác.
