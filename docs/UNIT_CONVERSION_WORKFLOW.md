# Đơn vị tính quy đổi đa cấp (Unit Conversions)

Tài liệu mô tả kiến trúc và luồng xử lý của tính năng Đơn vị tính quy đổi đa cấp trong hệ thống ONI SaaS.

## 1. Tổng quan (Overview)

Hệ thống ONI SaaS ban đầu được thiết kế với một trường đơn vị tính duy nhất (`unit`) cho mỗi sản phẩm. Tuy nhiên, nhiều ngành nghề đặc thù (điển hình như Nhà thuốc, Tạp hoá) yêu cầu nhập và xuất hàng hóa bằng nhiều đơn vị khác nhau (Ví dụ: 1 Hộp = 10 Vỉ = 100 Viên). 

Tính năng **Unit Conversions** cho phép:
- Định nghĩa một Đơn vị cơ sở (nhỏ nhất) và nhiều Đơn vị quy đổi (Đơn vị phụ).
- Hỗ trợ thiết lập **Giá vốn**, **Giá bán** và **Mã vạch (Barcode)** riêng cho từng đơn vị.
- Tự động quy đổi tồn kho (Stock quantity) về đơn vị cơ sở khi thực hiện bất kỳ giao dịch nhập/xuất nào (Bán hàng POS, Nhập hàng).

## 2. Thiết kế Cơ sở dữ liệu (Database Schema)

Cấu trúc được mở rộng bằng việc thêm table `product_units` (quan hệ One-to-Many với `products`).

### Table `products` (Lưu Đơn vị cơ sở)
Đại diện cho sản phẩm và Đơn vị tính nhỏ nhất (Base Unit).
- `unit`: Tên đơn vị cơ sở (VD: Viên).
- `barcode`: Mã vạch của đơn vị cơ sở.
- `stock_qty`: Tổng số lượng tồn kho được quản lý thống nhất theo ĐV cơ sở.

### Table `product_units` (Lưu Đơn vị phụ)
- `id`: Định danh duy nhất cho bản ghi quy đổi.
- `product_id`: Khoá ngoại (Foreign Key) trỏ tới sản phẩm gốc.
- `unit_name`: Tên đơn vị phụ (VD: Hộp, Vỉ).
- `conversion_rate`: Hệ số quy đổi ra đơn vị cơ sở (VD: 1 Hộp 100 viên -> `conversion_rate` = 100).
- `barcode`: Mã vạch riêng biệt của đơn vị phụ.
- `sell_price`: Giá bán của đơn vị phụ.
- `cost_price`: Giá vốn của đơn vị phụ.

## 3. Luồng Quản lý Sản phẩm (UI & API)

- **Giao diện (`ProductsClient.tsx`)**: Bổ sung một bảng dữ liệu "Đơn vị tính quy đổi". Người dùng có thể Thêm/Sửa/Xoá không giới hạn số lượng đơn vị phụ (Virtual/Unit Rows). Mã vạch cũng đã được bổ sung cho Đơn vị cơ sở.
- **API Xử lý**: Khi tạo mới hoặc cập nhật sản phẩm qua Endpoint `/api/shops/[shopId]/products`, danh sách `product_units` sẽ được đính kèm vào Payload. Postgres Adapter sẽ tự động UPSERT (Cập nhật hoặc Thêm mới) các đơn vị này. 
- **Thiết kế giao diện**: Các input Nhập Giá và Số lượng được tái sử dụng Component `NumberInput` với `inputClassName` để tự động Format hàng nghìn (VND) và đồng nhất Style với Table chuẩn của Tailwind.

## 4. Luồng Bán hàng Offline-First (POS Dexie)

Đây là thành phần cốt lõi của tính năng, giúp hệ thống POS có thể linh hoạt hoạt động ngay cả khi Offline.

- **Flattening Products (`usePOSProductSearch.ts`)**: 
  - Khác với trước đây chỉ trả về các sản phẩm gốc, Hook tìm kiếm nay sẽ duyệt qua danh sách `product_units` bên trong mỗi sản phẩm và tự động sinh ra các **Sản phẩm ảo (Virtual Products)**.
  - Ví dụ: Tra cứu "Panadol" (Viên) có đơn vị "Hộp", POS sẽ trả về 2 kết quả:
    1. `Panadol` (Viên) - Giá gốc, Mã vạch gốc.
    2. `Panadol (Hộp)` - Kèm giá hộp, Mã vạch hộp, lưu trữ biến `unit_id` và `conversion_rate = 10`.
  - **Lợi ích**: Khi quét mã vạch (Barcode Scanner) của đơn vị "Hộp", hệ thống quét sẽ so khớp và lập tức chèn thẳng "Panadol (Hộp)" vào giỏ hàng mà không cần Popup hay Thao tác xác nhận từ người dùng. Lỗi trùng ID React (`Duplicate Key`) được xử lý bằng format: `key={product_id + '-' + unit_id}`.

- **Giỏ hàng & Trừ tồn kho (`CheckoutModal.tsx`)**:
  - Khi một mục được thêm vào Cart, cấu trúc `CartItem` lưu đầy đủ thông tin: `unit_id`, `unit_name`, `conversion_rate`.
  - Khi thực hiện **Thanh toán**, Tồn kho (Stock) hiển thị ngay trong máy (Local Dexie) bị trừ đi theo công thức quy đổi chuẩn: `Deduction = Số lượng bán (qty) * Hệ số quy đổi (conversion_rate)`. Đảm bảo POS không bao giờ bị âm kho ảo.

## 5. Luồng Cập nhật Đơn hàng (Backend Sync)

- **Gửi lên Server**: Các đơn hàng mới sinh ở POS Offline sẽ được đẩy theo luồng Batch lên `/api/shops/[shopId]/pos-sync`. Payload của `order_items` nay chứa trực tiếp dữ liệu quy đổi.
- **Ghi nhận Postgres**: Các bản ghi `order_items` sẽ phản ánh chính xác đơn vị bán (Ví dụ: Bán 1 Hộp thay vì 10 Viên) để in hoá đơn chuẩn xác. Đồng thời, API kho (`Inventory/Postgres`) sẽ trừ đúng số Viên tổng tương ứng từ Tồn kho (Base Stock).

## 6. Hướng phát triển tiếp theo (Next Steps)

- **Nhập Kho theo Đơn vị phụ**: Mở rộng màn hình Nhập Hàng (`InventoryClient.tsx`) để thủ kho có thể chọn thả xuống Nhập theo "Hộp" (kèm giá nhập Hộp) thay vì luôn phải gõ số lượng quy đổi ra "Viên". Hệ thống tự động nhân hệ số trước khi cộng vào Kho Postgres.
- **Quản lý Hạn sử dụng (Expiry/Batches) cho Đơn vị phụ**: Cảnh báo cận Date phải hoạt động đồng nhất bất kể lúc kiểm kê bằng Đơn vị gì.
- **In Hóa Đơn**: In ra bill khách hàng rõ ràng thông tin giá theo Đơn vị Vỉ/Hộp.
