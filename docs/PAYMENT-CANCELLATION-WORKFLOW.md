# POS Payment & Cancellation Workflow (Thanh toán, Tiền cọc & Hủy đơn)

Tài liệu này mô tả chi tiết luồng nghiệp vụ thanh toán, đặt cọc (Deposit), hoàn tiền (Refund) và xử lý phí hủy đơn (Penalty / Cancellation Fee) trong hệ thống ONI ERP. 

Hệ thống được thiết kế chặt chẽ về mặt kế toán, đảm bảo tính toàn vẹn của Sổ quỹ (Cashbook) và Báo cáo doanh thu (Revenue Reports) cho mọi mô hình kinh doanh (Khách sạn, F&B, Bán lẻ, v.v.).

---

## 1. Luồng Thanh toán trước (Tiền cọc)

Khi khách hàng mở bàn/phòng và thực hiện thanh toán trước một phần hoặc toàn bộ số tiền (nhưng đơn hàng chưa hoàn thành):

1. **Ghi nhận Thanh toán (Payments):** Hệ thống tạo một record trong bảng `payments` để ghi nhận đợt trả góp/đặt cọc này (Ví dụ: 125.000đ).
2. **Ghi nhận Sổ quỹ (Cashbook):** Đồng thời, hệ thống tự động sinh một Phiếu Thu (`type: receipt`, `category: sales`) trị giá 125.000đ vào Sổ quỹ, tham chiếu trực tiếp đến `order_id` của đơn hàng đó.
3. **Cập nhật Đơn hàng:** Trường `paid_amount` của bảng `orders` được cộng dồn thêm 125.000đ.

---

## 2. Luồng Hủy đơn & Hoàn tiền (Dynamic Refund)

Khi một đơn hàng **đã có thanh toán trước** bị hủy (do khách không đến hoặc khách đổi ý), thu ngân sẽ thao tác "Hủy bàn/phòng". Tại đây, hệ thống hiển thị một Popup yêu cầu thu ngân xác nhận số tiền muốn hoàn lại cho khách.

Hệ thống cho phép **Dynamic Refund** (Hoàn tiền tùy chỉnh):
- **Trường hợp 1 (Hoàn 100%):** Trả lại toàn bộ số tiền đã cọc (Ví dụ: Hoàn đủ 125.000đ).
- **Trường hợp 2 (Phạt cọc / Thu phí hủy đơn):** Chỉ hoàn một phần hoặc không hoàn (Ví dụ: Chỉ hoàn 50.000đ, giữ lại 75.000đ làm phí hủy đơn).

### Quá trình xử lý kỹ thuật (API `cancel`)

Khi thu ngân xác nhận hủy và nhập số tiền hoàn lại (`refundAmountBody`):

1. **Khôi phục Tồn kho (Inventory):** Hệ thống tự động quét các sản phẩm trong đơn, tạo phiếu `stock_movements` (Loại `inbound`, danh mục `refund`) để cộng lại số lượng hàng hóa vào kho.
2. **Khôi phục Công nợ (Debt):** Nếu đơn hàng có sử dụng công nợ (`debt_amount > 0`), hệ thống sẽ trừ ngược lại công nợ của Khách hàng đó.
3. **Giải phóng Tài nguyên (Location Resource):** Nếu đơn hàng gắn với Bàn/Phòng, trạng thái của Bàn/Phòng đó sẽ tự động chuyển về `available` (Trống) và xóa `current_order_id` để sẵn sàng đón khách mới. (Tính chất Idempotent đảm bảo giải phóng thành công ngay cả khi có lỗi gián đoạn mạng trước đó).
4. **Xử lý Sổ quỹ Hoàn tiền (Cashbook Refund):**
   - Nếu `refund_amount > 0`, hệ thống tạo một **Phiếu Chi** (`type: payment`, `category: refund`) trong bảng `cashbook` với số tiền tương ứng (Ví dụ: -50.000đ).
   - *Lưu ý:* Hệ thống KHÔNG xóa hay sửa Phiếu Thu 125.000đ ban đầu. Điều này đảm bảo tính minh bạch tuyệt đối của dòng tiền (Dòng tiền thực tế: Thu 125k, Chi 50k => Tồn quỹ 75k).
5. **Ghi nhận Phí Hủy Đơn & Doanh thu:**
   - Hệ thống tự động tính toán khoản tiền bồi thường/phạt cọc: `penalty = paid_amount - refund_amount`.
   - Cập nhật trường `paid_amount` và `total_amount` của đơn hàng bị hủy thành đúng bằng con số `penalty` này (Ví dụ: 75.000đ). 
   - *Tác dụng:* Báo cáo doanh thu (Revenue Dashboard) sẽ tự động bốc con số 75.000đ này vào biểu đồ doanh thu của ngày hôm đó như một khoản "Thu nhập khác".
6. **Cập nhật Ghi chú:** Hệ thống chèn thêm lý do hủy và số tiền Phí hủy đơn vào `note` của đơn hàng. Ví dụ: `[Hủy] Khách không đến (Phí hủy đơn: 75.000đ)`.

---

## 3. Giao diện Người dùng (UI/UX)

- **Trang Chi tiết Đơn hàng (OrdersClient):** 
  - Thẻ "Thanh toán" hiển thị kết hợp cả các đợt thanh toán (`payments`) và các giao dịch Sổ quỹ (`cashbook`) chưa được map với payment.
  - Các Phiếu Chi hoàn tiền được hiển thị nổi bật với tag đỏ **[HOÀN TIỀN]** kèm số tiền mang dấu âm (VD: `-50.000đ`).
  - Tổng tiền đơn hàng (`total_amount`) và Đã trả (`paid_amount`) hiển thị chính xác khoản Phí hủy đơn đã thu.
- **Trang Quản lý POS:** 
  - Lưới bàn tự động chớp và chuyển sang màu Xanh (Trống) ngay khi API Hủy đơn trả về thành công nhờ hàm `onSessionClosed()` trigger việc `fetchResources()`.

---

## 4. Ý nghĩa đối với các Mô hình Kinh doanh

- **Lưu trú (Khách sạn / Nhà nghỉ / Homestay / Thuê sân bãi):** Hoạt động này đáp ứng chuẩn xác quy trình "No-show" (Khách không đến). Hệ thống giữ lại 1 phần tiền cọc, hạch toán vào doanh thu "Phí hủy phòng", hoàn lại phần thừa cho khách và lập tức giải phóng phòng cho người khác thuê.
- **Bán lẻ (Siêu thị / Tạp hóa):** Mặc định ô Hoàn tiền luôn gợi ý 100% số tiền đã trả. Thu ngân chỉ việc Enter, hệ thống hoàn đủ 100%, không phát sinh Phí hủy đơn. 
- **F&B (Nhà hàng / Cafe):** Tương tự như Bán lẻ, hỗ trợ xử lý linh hoạt khi khách lỡ đặt món, thanh toán trước nhưng muốn hủy bàn (có hoặc không tính phí khấu hao nguyên vật liệu).
