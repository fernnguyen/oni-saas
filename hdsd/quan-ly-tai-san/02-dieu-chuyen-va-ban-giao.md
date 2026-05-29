# Hướng dẫn 2: Điều chuyển bộ phận & Phân bổ chi phí (Cost Center)

Một trong những thế mạnh của hệ thống quản lý tài sản **ONI ERP** là khả năng phân bổ chi phí hao mòn trực tiếp tới từng **Bộ phận thụ hưởng (Cost Center)**. Thao tác này giúp phòng kế toán và ban giám đốc có được báo cáo doanh thu - chi phí (P&L) nội bộ chính xác đến từng phòng ban.

---

## 1. Khái niệm Cost Center (Trung tâm Chi phí)

Khi một tài sản (Ví dụ: *Máy giặt công nghiệp LG*) được đưa vào sử dụng, chi phí hao mòn hàng tháng của nó phải được gánh chịu bởi bộ phận trực tiếp sử dụng nó (Ví dụ: *Bộ phận Buồng phòng - lodging_hskp*). 
*   Nếu tài sản được bàn giao 100% cho 1 phòng ban: Toàn bộ chi phí khấu hao tháng sẽ tính cho phòng ban đó.
*   Nếu tài sản được chia sẻ sử dụng (Ví dụ: *2 cái Máy giặt bàn giao cho Buồng phòng, 1 cái bàn giao cho Bếp*): Chi phí khấu hao sẽ được tự động chia tỷ lệ (2/3 cho Buồng phòng, 1/3 cho Bếp) khi chạy trích khấu hao.
*   Nếu tài sản chưa được bàn giao cho phòng ban nào: Hệ thống sẽ tính chi phí hao mòn vào **Chi phí quản lý chung** của chi nhánh.

---

## 2. Thao tác Điều chuyển / Bàn giao Bộ phận mới

Khi cần điều động thiết bị từ kho tổng hoặc chuyển giao thiết bị giữa các phòng ban, bạn thực hiện như sau:

### Bước 1: Mở cửa sổ điều chuyển
1. Tại bảng danh sách tài sản, tìm tài sản cần điều chuyển.
2. Nhấn vào nút thao tác cuối dòng ➔ chọn **Điều chuyển** (hoặc mở drawer chi tiết tài sản ➔ click nút **+ Điều chuyển**).

### Bước 2: Điền thông tin bàn giao mới
Hệ thống sẽ mở drawer di chuyển tài sản:
1.  **Phòng ban nhận thiết bị**: Chọn phòng ban (Cost Center) đích nhận thiết bị.
2.  **Số lượng bàn giao**: Nhập số lượng thiết bị sẽ chuyển giao cho phòng ban nhận.
3.  **Người nhận**: Nhập tên nhân viên đại diện ký nhận thiết bị.
4.  **Ngày bàn giao**: Ngày thực tế bàn giao thiết bị.
5.  **Ghi chú**: Nhập lý do điều chuyển (Ví dụ: *“Bàn giao máy siêu âm phục vụ phòng khám cơ xương khớp mới thành lập”*).
6.  Nhấn **Xác nhận điều chuyển**.

Hệ thống sẽ ghi nhận lịch sử và hiển thị trạng thái loading mượt mà trên nút bấm trong quá trình đồng bộ dữ liệu.

---

## 3. Tracing Lịch sử Di chuyển & Phân bổ (Timeline)

Để kiểm tra xem một thiết bị trong quá khứ đã được chuyển giao qua những bộ phận nào và ai chịu trách nhiệm:
1.  Nhấn vào dòng tài sản trong bảng danh sách để mở SlideOver chi tiết.
2.  Cuộn xuống phần **Lịch sử di chuyển & Phân bổ**.
3.  Tại đây hiển thị dòng thời gian (timeline) chi tiết:
    *   Tên bộ phận nhận và số lượng bàn giao.
    *   Tên nhân viên nhận thiết bị.
    *   Ngày bàn giao thực tế.
    *   Thông tin kiểm toán: **Người ghi nhận** thao tác, ngày giờ hệ thống cụ thể.
    *   Nội dung ghi chú đi kèm.

---

## 4. Thu hồi Điều chuyển / Bàn giao

Nếu nhập sai thông tin bàn giao hoặc thiết bị được thu hồi ngược lại kho chung:
1.  Mở drawer điều chuyển của tài sản đó.
2.  Tại danh sách bàn giao hiện tại ở phía dưới, tìm dòng bàn giao cần xóa.
3.  Nhấn vào nút **Thu hồi** (Icon hình dấu `X` màu đỏ).
4.  Xác nhận yêu cầu thu hồi trong hộp thoại mở ra. Hộp thoại có trạng thái loading để bảo đảm an toàn dữ liệu. Hệ thống sẽ thu hồi số lượng thiết bị và cập nhật lại danh sách tức thì.
