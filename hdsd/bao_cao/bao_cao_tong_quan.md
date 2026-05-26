# HƯỚNG DẪN: TRA CỨU BÁO CÁO TỔNG QUAN HOẠT ĐỘNG (OVERVIEW REPORT)

Báo cáo Tổng quan Hoạt động trên ONI.vn cung cấp cho Chủ cửa hàng (Owner) và Quản lý (Admin) bức tranh toàn cảnh về hiệu quả kinh doanh, xu hướng doanh thu hàng ngày, xếp hạng sản phẩm bán chạy nhất và cơ cấu thanh toán của chi nhánh.

---

## 1. QUY TRÌNH TRA CỨU BÁO CÁO TỔNG QUAN

Tài khoản có vai trò **Chủ sở hữu (Owner)**, **Giám đốc (Admin)** hoặc nhân sự được phân quyền xem báo cáo (`reports.view_shop`) mới có thể truy cập số liệu này.

### Các bước thực hiện:
1. Đăng nhập hệ thống chi nhánh -> Chọn mục **[Báo cáo]** -> Chọn **[Tổng quan]** trên thanh menu bên trái.
2. Hệ thống sẽ kết nối cơ sở dữ liệu thời gian thực để tổng hợp số liệu trong vòng vài giây.

---

## 2. GIẢI THÍCH CHI TIẾT CÁC KHU VỰC SỐ LIỆU (FIELDS SCAN)

### Khu vực A: Các chỉ số hoạt động cốt lõi (KPIs)
Hiển thị ngay đầu trang dưới dạng 4 thẻ số liệu lớn:
* **Doanh thu hôm nay:** Tổng số tiền bán hàng tích lũy trong ngày hôm nay (kèm số lượng đơn hàng phát sinh ngay bên dưới).
* **Doanh thu tháng này:** Tổng số tiền bán hàng tích lũy từ đầu tháng đến thời điểm hiện tại (kèm số lượng đơn hàng tháng bên dưới).
* **Trả hàng:** Số lượng phiếu trả hàng và tổng số tiền đã hoàn trả lại cho khách.
* **Tỷ lệ hoàn tiền:** Tỷ lệ % số tiền trả lại khách trên tổng doanh thu bán ra của tháng. Nếu tỷ lệ này vượt quá 5%, quản lý cần rà soát lại chất lượng sản phẩm hoặc khâu tư vấn bán hàng.

`[HÌNH ẢNH: 4 thẻ chỉ số hoạt động Doanh thu hôm nay, Doanh thu tháng, Phiếu trả hàng và Tỷ lệ hoàn tiền]`

---

### Khu vực B: Biểu đồ Doanh thu 30 ngày gần nhất (Xu hướng)
* **Mô tả:** Biểu đồ dạng cột mini (MiniBarChart) màu xanh dương, biểu thị doanh số gộp phát sinh của từng ngày trong vòng 30 ngày qua.
* **Cách thao tác:** Di chuyển con trỏ chuột (hoặc chạm tay trên điện thoại) vào từng cột dựng đứng. Một hộp thông tin nhỏ (Tooltip) sẽ hiện lên hiển thị chính xác **Ngày/Tháng/Năm** và **Số tiền doanh thu** cụ thể của ngày đó (ví dụ: `25/05/2026: 15.200.000đ`).
* Dưới chân biểu đồ hiển thị các mốc nhãn ngày (cách 5 ngày hiển thị một nhãn ngày như `01/05`, `06/05`...) để dễ quan sát xu hướng tăng trưởng.

`[HÌNH ẢNH: Biểu đồ cột xu hướng doanh số gộp 30 ngày qua kèm hộp thông tin hiển thị chi tiết khi hover chuột]`

---

### Khu vực C: Top 10 sản phẩm doanh thu cao nhất (Bán chạy)
Bảng xếp hạng từ vị trí số 1 đến 10 của các mặt hàng đóng góp doanh số lớn nhất cho cửa hàng:
* **Cột [Hạng]:** Thứ tự từ 1 đến 10.
* **Cột [Tên sản phẩm]:** Tên đầy đủ của hàng hóa/dịch vụ.
* **Thanh màu xanh dương:** Chiều dài thanh biểu thị tỷ lệ % doanh số đóng góp so với mặt hàng đứng đầu bảng (giúp quản lý nhận biết sản phẩm chủ lực cực nhanh bằng mắt thường).
* **Cột [Doanh số / Số lượng]:** 
  * Dòng chữ đậm: Số tiền doanh thu gộp thu được (dạng viết tắt, ví dụ: `15.5M` = 15.500.000đ, `2B` = 2.000.000.000đ, `50K` = 50.000đ).
  * Dòng chữ nhạt: Số lượng sản phẩm thực tế đã bán ra (ví dụ: `250 sp`).

---

### Khu vực D: Phân tích Trạng thái Đơn hàng & Hình thức Thanh toán
Chia làm 2 khung phân tích bên phải dưới chân trang:
1. **Trạng thái đơn hàng:** Hiển thị tổng số lượng đơn hàng phân bổ theo trạng thái xử lý gồm: *Nháp (Draft), Đã xác nhận (Confirmed), Đang xử lý (Processing), Hoàn thành (Completed), Đã hủy (Cancelled), Hoàn tiền (Refunded)*. Có thanh trượt xanh dương biểu thị tỷ lệ % cấu trúc đơn.
2. **Hình thức thanh toán (Tháng này):** Cơ cấu các phương thức nạp tiền của khách trong tháng qua các kênh: *Tiền mặt, Thẻ, Chuyển khoản, MoMo, VNPay, ZaloPay, Ghi nợ*. Hỗ trợ xem nhanh số tiền thu được trên mỗi kênh bằng đồ họa thanh trượt xanh lá.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Biểu đồ Doanh thu 30 ngày xuất hiện các cột trống trơn bằng 0đ bất thường
* **Hiện tượng:** Biểu đồ cột có các khoảng đứt gãy đột ngột (doanh thu ghi nhận 0đ) trong khi thực tế cửa hàng vẫn mở cửa và bán hàng đông đúc.
* **Nguyên nhân:** Nhân viên thu ngân quầy bán hàng ngoại tuyến (Offline POS) lưu đơn cục bộ trên máy tính quầy và chưa bấm nút đồng bộ đơn hàng về máy chủ hệ thống đám mây, hoặc kết nối internet tại quầy bị mất cả ngày khiến đơn hàng không thể đẩy lên máy chủ thời gian thực.
* **Cách xử lý:** 
  1. Yêu cầu nhân viên quầy kiểm tra lại trạng thái kết nối mạng tại máy tính bán hàng POS.
  2. Truy cập màn hình POS, vào **Sync Queue (Hàng đợi đồng bộ)** bấm nút **[Đồng bộ ngay]** để đẩy toàn bộ đơn hàng lưu tạm lên máy chủ.
  3. F5 tải lại trang Báo cáo tổng quan, biểu đồ cột sẽ tự động vẽ đầy đủ số liệu tức thì.
