# HƯỚNG DẪN: ĐỌC VÀ TRA CỨU BÁO CÁO KẾ TOÁN & TÀI CHÍNH (ACCOUNTING REPORTS)

Phân hệ Báo cáo Kế toán trên ONI.vn cung cấp cái nhìn toàn diện về tình hình tài chính của cửa hàng. Báo cáo tự động tổng hợp số liệu doanh thu, chi phí hoàn trả, cơ cấu thanh toán và số liệu công nợ phải thu/phải trả thời gian thực.

---

## 1. QUY TRÌNH TRA CỨU BÁO CÁO KẾ TOÁN

Chỉ các tài khoản có vai trò **Chủ sở hữu (Owner)**, **Giám đốc (Admin)** hoặc nhân sự được phân quyền `cashbook.view` / `cashbook.audit` mới có thể truy cập số liệu này.

### Các bước thực hiện:
1. Đăng nhập hệ thống chi nhánh -> Click mục **[Báo cáo]** -> Chọn **[Kế toán]** trên thanh menu bên trái (Sidebar).
2. Hệ thống sẽ tự động tổng hợp dữ liệu và hiển thị bảng biểu số liệu tài chính trực quan.

---

## 2. GIẢI THÍCH CHI TIẾT CÁC KHU VỰC SỐ LIỆU (FIELDS SCAN)

### Khu vực A: Các chỉ số tài chính tổng hợp (Summary KPIs)
Hiển thị ngay đầu trang dưới dạng 5 thẻ số liệu lớn:
* **Tổng doanh thu:** Tổng số tiền bán hàng lý thuyết ghi nhận trên tất cả hóa đơn thành công.
* **Tổng hoàn trả:** Tổng số tiền đã chi ra để hoàn trả lại cho khách khi có phát sinh đổi trả hàng (hiển thị màu đỏ cảnh báo).
* **Doanh thu thuần:** Doanh thu thực tế sau khi cấn trừ các khoản trả hàng (`Doanh thu thuần = Tổng doanh thu - Tổng hoàn trả`).
* **Nợ cần thu:** Tổng tiền khách mua nợ chưa thanh toán (tô viền đỏ).
* **Nợ cần trả:** Tổng tiền nhập hàng từ nhà cung cấp chưa thanh toán (tô viền cam).

`[HÌNH ẢNH: 5 thẻ chỉ số tài chính tổng hợp: Doanh thu, Hoàn trả, Thuần, Nợ cần thu, Nợ cần trả]`

---

### Khu vực B: Doanh thu 12 tháng gần nhất (Bảng thống kê xu hướng)
Bảng số liệu chi tiết phân tích sâu theo chu kỳ từng tháng:
* **Cột [Tháng]:** Định dạng `Tháng/Năm` (ví dụ: `T05/2026`).
* **Cột [Đơn hàng]:** Tổng số lượng hóa đơn bán ra trong tháng đó.
* **Cột [Doanh thu]:** Doanh số gộp của tháng.
* **Cột [Hoàn trả]** (Chữ đỏ): Số tiền hoàn trả khách trong tháng.
* **Cột [Công nợ]** (Chữ cam): Dòng tiền ghi nợ phát sinh.
* **Cột [Thuần]** (Chữ in đậm): Doanh số thực thu sau cấn trừ.
* **Dòng [Tổng cộng]:** Nằm dưới đáy bảng, tự động cộng dồn số liệu của cả 12 tháng gần nhất.

---

### Khu vực C: Phân bổ phương thức thanh toán (Payment Breakdown)
Biểu đồ phân tích hành vi thanh toán của khách hàng tại cửa hàng:
* Hiển thị tỷ lệ % đóng góp và số tiền cụ thể của từng phương thức: **Tiền mặt (Cash)**, **Quẹt thẻ (Card)**, **Chuyển khoản (Bank transfer)**, ví điện tử **MoMo / VNPay / ZaloPay**, và **Ghi nợ (Debt)**.
* Có thanh tiến trình (Progress Bar) màu xanh lá hiển thị trực quan tỷ lệ % chiếm dụng dòng tiền của từng kênh.

`[HÌNH ẢNH: Biểu đồ thanh ngang phân bổ các phương thức thanh toán Tiền mặt, Chuyển khoản, MoMo...]`

---

### Khu vực D: Bảng đối soát công nợ chi tiết
Nằm ở cột bên phải, chia làm 2 bảng giúp kế toán kiểm soát dòng nợ:
1. **Khách hàng nợ:** Liệt kê danh sách tên khách và số tiền nợ cụ thể cần đi thu (tô đỏ số tiền nợ).
2. **Nợ nhà cung cấp:** Liệt kê danh sách Nhà cung cấp và số tiền mua hàng chưa trả cần lập phiếu chi để thanh toán (tô cam số tiền nợ).

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Doanh thu thuần bị lệch so với số tiền mặt trong két quỹ thực tế
* **Hiện tượng:** Báo cáo ghi nhận Doanh thu thuần rất cao nhưng khi kiểm két tiền mặt thực tế lại thiếu hụt rất nhiều.
* **Nguyên nhân:** Khách mua hàng chọn chuyển khoản ngân hàng hoặc thanh toán ví điện tử MoMo/VNPay nhưng thu ngân POS quên không tích chọn đúng phương thức, vẫn để mặc định là "Tiền mặt". Việc này khiến cơ cấu dòng tiền mặt bị sai lệch lớn.
* **Cách xử lý:**
  1. Kế toán quan sát bảng **[Phân bổ thanh toán]** xem dòng tiền chuyển khoản và tiền mặt đang ghi nhận bao nhiêu.
  2. Truy cập mục **[Đơn hàng]**, lọc bộ lọc phương thức thanh toán để đối soát từng hóa đơn so với lịch sử biến động số dư ngân hàng thực tế.
  3. Yêu cầu thu ngân tại POS từ ca sau bắt buộc phải kiểm tra và tích chọn đúng nút phương thức (Tiền mặt / Chuyển khoản / Ví điện tử) trước khi bấm nút Thanh toán đơn hàng.

### Tình huống 2: Báo cáo hiển thị quay vòng vô tận "Đang tải..." hoặc lỗi kết nối
* **Hiện tượng:** Click vào mục Báo cáo kế toán nhưng màn hình chỉ hiện các thanh xám nhấp nháy chạy vô tận.
* **Nguyên nhân:** Cơ sở dữ liệu của bạn có số lượng đơn hàng quá lớn và kết nối mạng internet của bạn đang bị chập chờn, hoặc máy chủ database (Shared/BYOD) phản hồi chậm quá thời gian quy định (timeout).
* **Cách xử lý:**
  1. Hãy tải lại trang (nhấn phím F5 hoặc nút Reload trên trình duyệt).
  2. Báo cáo kế toán được ONI.vn áp dụng cơ chế bộ nhớ đệm (Cache) tối ưu trong vòng 5 phút (staleTime 5 phút) để tránh tải đè database. Hãy chờ một lát và hạn chế click liên tục vào menu để tránh làm nghẽn hàng đợi truy vấn.
