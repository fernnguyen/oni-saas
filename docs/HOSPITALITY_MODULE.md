# Tài Liệu Kỹ Thuật: Nghiệp Vụ & Thiết Kế Kiến Trúc Module Khách Sạn (Hospitality Enterprise)

Tài liệu này đóng vai trò là tham chiếu kiến trúc chính thức cho Module Khách sạn/Dịch vụ Lưu trú (Hospitality Enterprise) của hệ thống Oni SaaS. Mọi điều chỉnh về thiết kế hoặc luồng đi của dữ liệu trong quá trình triển khai thực tế bắt buộc phải cập nhật đồng bộ vào tài liệu này.

---

## 1. TỔNG QUAN HỆ THỐNG & ĐỘ FIT NGHIỆP VỤ

Module Khách sạn Enterprise được thiết kế cho phân khúc khách sạn vừa và lớn (3-5 sao, chuỗi khách sạn/homestay quy mô), tích hợp trực tiếp vào hệ sinh thái Oni SaaS (bán hàng POS, quản lý kho F&B, sổ quỹ cashbook, báo cáo tài chính).

### 1.1. Các điểm cốt lõi bổ sung so với core cũ
*   **Quản lý Đặt phòng (Reservation Subsystem):** Hỗ trợ đặt giữ phòng trước dạng Sơ đồ Gantt Timeline tương tác trực quan, xử lý quy trình đóng tiền cọc trước (treo nợ nhận trước - Liability) và chuyển đổi tự động thành đơn hàng in-progress khi khách check-in.
*   **Attribution nguồn đặt phòng OTA (CRM & Kế toán):** Gắn mã kênh đặt phòng (Booking.com, Agoda) trực tiếp vào đợt ở của khách hàng. Giữ nguyên hồ sơ CRM của khách thực tế lưu trú để tích lũy điểm và sở thích, đồng thời chuyển hướng luồng công nợ tiền phòng (Receivables) sang công nợ đối soát đại lý OTA realtime (nếu là hình thức OTA Collect).
*   **Động cơ tính phí lưu trú nâng cao (`hotelBillingEngine`):** Hỗ trợ 3 chế độ thuê: Giờ, Qua đêm và Ngày đêm (Standard check-in 14h, check-out 12h ngày hôm sau). Tự động hóa tính Phụ thu nhận sớm (Early Check-in Surcharge) và Phụ thu trả trễ (Late Check-out Surcharge) kèm cơ chế Lễ tân ghi đè có giải trình (`override_reason`) để kiểm toán.
*   **Minibar Buồng phòng tinh gọn (Housekeeping & Minibar):** Nhân viên dọn phòng đếm số lượng thực tế còn lại trong tủ lạnh bằng điện thoại di động, hệ thống tự tính số tiêu hao (`Định mức - Còn lại`) và tự động nạp thẳng vào đơn hàng Lễ tân realtime. Hàng tiêu hao được xuất kho trực tiếp từ **Kho Bộ phận Buồng phòng (`lodging_hskp`)** để xếp đồ bù (Top-up).

---

## 2. KIẾN TRÚC CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)

```typescript
// 1. Quản lý Đặt phòng / Giữ chỗ trước (Reservations Table)
export const reservations = mysqlTable('reservations', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  reservation_no: varchar('reservation_no', { length: 255 }).notNull(), // RSV-YYYYMMDD-XXXX
  
  // CRM & Guest Profile
  customer_id: varchar('customer_id', { length: 255 }).notNull(),       // Link tới customers
  customer_name: varchar('customer_name', { length: 255 }),
  customer_phone: varchar('customer_phone', { length: 50 }),
  
  // Booking Source & OTA Details
  channel_id: varchar('channel_id', { length: 255 }).default('direct'),  // 'direct' | 'booking_com' | 'agoda' | 'corporate'
  ota_booking_code: varchar('ota_booking_code', { length: 255 }),        // Mã đặt phòng từ OTA
  
  // Stay Duration
  expected_checkin: timestamp('expected_checkin').notNull(),
  expected_checkout: timestamp('expected_checkout').notNull(),
  
  // Block Room
  room_category_id: varchar('room_category_id', { length: 255 }),        // Loại phòng đặt (Deluxe, Standard...)
  resource_id: varchar('resource_id', { length: 255 }),                  // ID Phòng cụ thể gán cho khách (có thể NULL khi đặt, gán sau)
  
  // Financials & Deposit
  num_guests: int('num_guests').default(1),
  daily_rate: varchar('daily_rate', { length: 50 }),                     // Giá phòng thỏa thuận mỗi đêm
  deposit_amount: varchar('deposit_amount', { length: 50 }).default('0'),// Tiền đặt cọc giữ phòng
  deposit_fund_id: varchar('deposit_fund_id', { length: 255 }),          // Quỹ nhận tiền đặt cọc
  
  status: varchar('status', { length: 50 }).default('confirmed'),        // 'pending_deposit' | 'confirmed' | 'checked_in' | 'cancelled' | 'no_show'
  note: text('note'),
  created_by: varchar('created_by', { length: 255 }),
  metadata: json('metadata'),
});

// 2. Định mức vật tư tiêu chuẩn phòng minibar (Minibar Setup)
export const minibar_setup = mysqlTable('minibar_setup', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),        // Link sang location_resources
  product_id: varchar('product_id', { length: 255 }).notNull(),          // Coca, Nước suối...
  standard_qty: int('standard_qty').notNull().default(0),                 // Định mức setup phòng
});

// 3. Số lượng tồn thực tế trong phòng hiện tại (Room Stock Track)
export const room_minibar_stock = mysqlTable('room_minibar_stock', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),
  product_id: varchar('product_id', { length: 255 }).notNull(),
  current_qty: int('current_qty').notNull().default(0),                  // Số lượng thực tế đang có trong tủ lạnh phòng
});

// 4. Nhật ký công việc và đếm tiêu hao buồng phòng (Housekeeping Logs)
export const housekeeping_logs = mysqlTable('housekeeping_logs', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),
  employee_id: varchar('employee_id', { length: 255 }),                  // Nhân viên dọn
  status: varchar('status', { length: 50 }),                              // 'dirty' | 'cleaning' | 'clean_inspected'
  check_type: varchar('check_type', { length: 50 }),                      // 'daily_check' | 'checkout_check'
  consumption_details: text('consumption_details'),                       // JSON [{product_id, consumed_qty, unit_price}]
  topup_status: varchar('topup_status', { length: 50 }),                  // 'pending' | 'completed'
  note: text('note'),
});

// 5. Thẻ Đặt phòng OTA & Khấu khấu hoa hồng (OTA Bookings Mapping)
export const ota_bookings = mysqlTable('ota_bookings', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  order_id: varchar('order_id', { length: 255 }).notNull(),
  agency_id: varchar('agency_id', { length: 255 }).notNull(),             // Booking.com, Agoda
  booking_code: varchar('booking_code', { length: 255 }),
  payment_flow: varchar('payment_flow', { length: 50 }),                  // 'OTA_COLLECT' | 'HOTEL_COLLECT'
  gross_amount: varchar('gross_amount', { length: 50 }),                  // Tổng tiền khách thanh toán
  commission_rate: varchar('commission_rate', { length: 50 }),            // % phí đại lý (e.g. 15%)
  commission_amount: varchar('commission_amount', { length: 50 }),        // Tiền phí đại lý
  net_payout: varchar('net_payout', { length: 50 }),                      // Doanh thu thực nhận khách sạn (Gross - Commission)
  reconciliation_status: varchar('reconciliation_status', { length: 50 }), // 'pending' | 'reconciled'
});
```

---

## 3. LUỒNG NGHIỆP VỤ & QUY TRÌNH HẠCH TOÁN KẾ TOÁN

### 3.1. Quản lý Đặt phòng & Tiền cọc (Reservation Life Cycle)
*   **Khi khách đặt cọc phòng:** Hệ thống **chưa ghi nhận doanh thu** mà ghi nhận một khoản Công nợ nhận trước:
    $$\text{Nợ TK 112 (Tiền gửi NH)} \quad / \quad \text{Có TK 131 - Khách đặt trước (Anh Linh): 500.000đ}$$
*   **Khi Check-in:** Trạng thái `reservations` chuyển sang `checked_in`. Phòng chuyển sang `occupied`. Tự động tạo Đơn hàng POS (`orders`) ở trạng thái `in_progress` liên kết với hồ sơ Anh Linh.
*   **Khi Check-out:** Hệ thống tính toán tổng tiền phòng + phụ thu trễ/sớm và dịch vụ phát sinh (ví dụ: 1.400.000đ).
    *   *Bút toán ghi nhận Doanh thu & Phải thu tổng:*
        $$\text{Nợ TK 131 - Phải thu khách hàng (Anh Linh): 1.400.000đ}$$
        $$\text{Có TK 5111 - Doanh thu lưu trú: 1.380.000đ}$$
        $$\text{Có TK 5112 - Doanh thu minibar: 20.000đ}$$
    *   *Bút toán cấn trừ tiền cọc giữ phòng trước đó:*
        $$\text{Nợ TK 131 - Khách đặt trước: 500.000đ} \quad / \quad \text{Có TK 131 - Phải thu khách hàng: 500.000đ}$$
    *   *Bút toán thu phần tiền còn lại khách quẹt thẻ trả nốt (900.000đ):*
        $$\text{Nợ TK 112 (Tiền gửi ngân hàng): 900.000đ} \quad / \quad \text{Có TK 131 - Phải thu khách hàng: 900.000đ}$$

### 3.2. Quy trình Hạch toán Đặt phòng kênh OTA
*   **Hình thức OTA Collect (OTA thu tiền trước):**
    *   Doanh thu phòng: 1.200.000đ. Phí hoa hồng Booking.com: 15% (180.000đ). Net thực thu của khách sạn: 1.020.000đ.
    *   *Bút toán tại thời điểm Checkout:*
        $$\text{Nợ TK 131 - Công nợ đối soát đại lý Booking.com: 1.020.000đ}$$
        $$\text{Nợ TK 641 - Chi phí bán hàng (Hoa hồng OTA): 180.000đ}$$
        $$\text{Có TK 5111 - Doanh thu lưu trú: 1.200.000đ}$$
    *   *Ý nghĩa:* Giữ vững doanh số Gross 100% để tính ADR/RevPAR, phản ánh chính xác chi phí hoa hồng kênh và theo dõi sát sao công nợ đối soát của Booking.com chuyển về hàng tuần/tháng.
*   **Hình thức Hotel Collect (Khách trả trực tiếp):**
    *   Khách thanh toán đủ 1.200.000đ tiền mặt tại quầy checkout.
        $$\text{Nợ TK 111 / Có TK 5111: 1.200.000đ (Doanh thu lưu trú Gross)}$$
    *   Treo công nợ phải trả hoa hồng cho đại lý:
        $$\text{Nợ TK 641 (Chi phí hoa hồng) / Có TK 331 - Booking.com: 180.000đ}$$

### 3.3. Quy trình Kiểm đếm & Tiêu hao Minibar Buồng phòng
1.  **Dọn phòng:** Nhân viên buồng phòng chọn phòng 101 trên app di động. Hệ thống tải định mức chuẩn (ví dụ: 2 Pepsi, 2 Nước suối).
2.  **Đếm thực tế:** Nhân viên đếm thấy thực tế còn 1 Pepsi, 0 Nước suối. Nhập số lượng thực tế đếm được.
3.  **Tự động tạo đơn F&B:** Hệ thống tự tính số tiêu hao (`2 Pepsi - 1 còn = 1 Pepsi tiêu hao`; `2 Nước suối - 0 còn = 2 Nước suối tiêu hao`). Ngay lập tức tự động thêm các món này vào `order_items` của phòng 101 trên màn hình Lễ tân.
4.  **Bù đồ & Trừ kho bộ phận:** Nhân viên lấy đồ mới trong giỏ dọn dẹp xếp vào tủ lạnh phòng và bấm **"Bù đồ & Xác nhận"**.
    *   Hệ thống tạo phiếu xuất kho lẻ (`stock_movements` dạng `MINIBAR_OUT`) trừ tồn kho sản phẩm tương ứng từ **Kho bộ phận Buồng phòng (`lodging_hskp`)**.
    *   Cập nhật lại trạng thái tủ lạnh phòng `room_minibar_stock` về đầy đủ định mức tiêu chuẩn.

        *   Một ngày được coi là bị chiếm bởi một booking trước đó nếu ngày đó nằm giữa ngày check-in và ngày check-out (bằng so sánh ngày không giờ phút):
            $$\text{dateStart} > \text{checkinStart} \quad \text{AND} \quad \text{dateStart} < \text{checkoutStart}$$
        *   *Kết quả cho Thứ 6:* Đối với Booking A, Thứ 6 là ngày checkout nên `dateStart < checkoutStart` (Thứ 6 < Thứ 6) là `false` -> Thứ 6 **KHÔNG** bị chiếm bởi Booking A. Đối với Booking B, Thứ 6 là ngày checkin nên `dateStart > checkinStart` (Thứ 6 > Thứ 6) là `false` -> Thứ 6 **KHÔNG** bị chiếm bởi Booking B.
        *   Do đó, Thứ 6 hoàn toàn tự do để vẽ khối bắt đầu cho Booking B từ Thứ 6 với `colspan = 2`, giải quyết triệt để bài toán gối đầu phòng hoàn hảo.

---

## 4. CHI TIẾT ĐỘNG CƠ TÍNH GIÁ PHÒNG & PHỤ THU (`hotelBillingEngine`)

Hàm `calculateHotelRoomBilling` hỗ trợ tính lũy tiến ngày lưu trú, so sánh giờ nhận/trả thực tế với giờ quy chuẩn của chi nhánh để tự động tính phụ thu nhận sớm/trả trễ.

### 4.1. Chính sách phụ thu quy chuẩn
*   **Early Check-in Surcharge (Nhận phòng sớm):**
    *   Nhận phòng trước 06:00 sáng: Phụ thu 100% một đêm.
    *   Nhận phòng từ 06:00 - 09:00 sáng: Phụ thu 50% một đêm.
    *   Nhận phòng từ 09:00 - 12:00 trưa: Phụ thu 30% một đêm.
*   **Late Check-out Surcharge (Trả phòng trễ):**
    *   Trả phòng từ 12:00 - 15:00 chiều: Phụ thu 30% một đêm.
    *   Trả phòng từ 15:00 - 18:00 chiều: Phụ thu 50% một đêm.
    *   Trả phòng sau 18:00 chiều: Phụ thu 100% một đêm.
*   **Auditing override:** Nếu lễ tân ghi đè sửa lại hoặc miễn phí phụ thu cho khách, bắt buộc phải nhập `override_reason` để ghi log và đẩy thông báo cảnh báo về hệ thống Telegram Bot.

---

## 5. KẾ HOẠCH NÂNG CẤP & BẢO TRÌ TÀI LIỆU
*   Tài liệu này được lưu trữ cố định tại đường dẫn [HOSPITALITY_MODULE.md](file:///Users/fern/Coding/ERP/oni-saas-starter/docs/HOSPITALITY_MODULE.md).
*   Trong quá trình phát triển mã nguồn, nếu có bất kỳ sự thay đổi nào về tên cột, luồng API hoặc cấu trúc bảng dữ liệu, lập trình viên chịu trách nhiệm triển khai phải cập nhật ngay vào tài liệu này để làm cơ sở bảo trì hệ thống cho doanh nghiệp.
