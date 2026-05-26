# HƯỚNG DẪN: QUY TRÌNH CHỈNH SỬA ĐƠN HÀNG ĐÃ THANH TOÁN (HỦY & SỬA ĐƠN)

Trên thực tế vận hành tại quầy POS, nhân viên thu ngân thường gặp tình huống vừa in hóa đơn thanh toán xong thì khách phát hiện mua thiếu hàng muốn mua thêm, hoặc nhân viên tính nhầm số lượng sản phẩm. 

Để bảo vệ tính minh bạch của sổ sách kế toán (audit trail), ONI.vn **không cho phép sửa trực tiếp đè lên hóa đơn cũ đã in**, mà áp dụng quy trình **[Hủy & Sửa đơn (Cancel & Edit)]** cực kỳ thông minh:
1.  Hủy đơn hàng cũ bị sai sót để hoàn kho.
2.  Tự động tải lại toàn bộ giỏ hàng cũ sang một đơn mới để thu ngân sửa nhanh và thanh toán lại hóa đơn mới thay thế dưới 5 giây.

*   **Ai được quyền sử dụng:** Thu ngân có quyền hủy đơn (`orders.delete`) hoặc được sự phê duyệt của Quản lý chi nhánh.

---

## 1. QUY TRÌNH THỰC HIỆN CHI TIẾT
Tại màn hình giao diện bán hàng POS quầy:
1.  Bấm vào nút **[Lịch sử đơn]** ở góc trên màn hình POS.
2.  Tìm và chọn đơn hàng bị sai sót cần sửa đổi thông tin.
3.  Bấm nút **[Hủy & Sửa đơn]** (hoặc nút biểu tượng cây bút sửa đơn).
4.  **Cơ chế tự động của hệ thống:**
    *   Hệ thống lập tức chuyển đơn hàng cũ đó sang trạng thái **[Đã hủy (Cancelled)]** và cộng trả lại tồn kho cũ.
    *   Đồng thời, hệ thống tự động mở ra một **Tab đơn hàng mới hoàn toàn trống** tại quầy POS, tự động tải nguyên trạng toàn bộ giỏ hàng, thông tin khách hàng, chiết khấu cũ của đơn vừa hủy vào tab mới này.
5.  **Nhiệm vụ của bạn (Chỉnh sửa nhanh):**
    *   Thêm/bớt sản phẩm hoặc sửa lại đúng số lượng bị nhầm.
    *   Đổi lại thông tin khách hàng hoặc phương thức thanh toán nếu khách yêu cầu.
6.  Bấm **[Thanh toán (F9)]** để in ra hóa đơn mới hoàn chỉnh cho khách.
7.  `[HÌNH ẢNH: Nút chức năng "Hủy & Sửa đơn" hiển thị nổi bật trong bảng chi tiết Lịch sử đơn hàng POS]`

---

## 2. LỢI ÍCH NGHIỆP VỤ & LƯU Ý KẾ TOÁN

*   **Minh bạch sổ sách:** Thay vì sửa đè thông tin làm kế toán không biết đơn hàng gốc ban đầu bị nhầm cái gì, quy trình này lưu giữ rõ ràng: 1 Đơn hàng bị hủy do sai sót (kèm lý do sửa đơn), và 1 Đơn hàng mới thay thế hoàn chỉnh.
*   **Tránh thất thoát kho:** Việc tự động hoàn kho đơn cũ và trừ kho đơn mới giúp số liệu kho luôn khớp 100% với thực tế đếm tại quầy.
*   **Đối soát két tiền:** Kế toán chỉ cần xác nhận hủy Phiếu thu của đơn hàng cũ trong Sổ quỹ để két tiền trên phần mềm luôn khớp với két thực tế.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: POS không cho bấm nút Hủy & Sửa đơn, báo "Không có quyền"
*   **Hiện tượng:** Thu ngân click vào đơn hàng cũ muốn sửa nhưng nút chức năng bị xám mờ hoặc hệ thống hiện cảnh báo chặn quyền.
*   **Nguyên nhân:** Tài khoản thu ngân của bạn chỉ được phân quyền bán hàng (`orders.create`), không có quyền hủy đơn hàng (`orders.delete`).
*   **Cách xử lý:** 
    1.  Báo cho Cửa hàng trưởng hoặc Quản lý chi nhánh đến quầy.
    2.  Quản lý thực hiện quét vân tay hoặc nhập mật khẩu/mã PIN phê duyệt đặc quyền trực tiếp trên màn hình POS của bạn để mở khóa tính năng Hủy & Sửa đơn này.

### Tình huống 2: Đơn hàng mới thanh toán lại bị lệch điểm tích lũy của khách
*   **Hiện tượng:** Khách hàng mua đơn cũ được tích 100 điểm. Sau khi hủy và sửa đơn mới có giá trị thấp hơn, bạn thấy điểm tích lũy của khách bị cộng dồn thành 180 điểm (bị thừa điểm).
*   **Nguyên nhân (Quy trình đồng bộ điểm):** Trình duyệt cục bộ chưa kịp đồng bộ cập nhật trừ đi số điểm tích lũy của đơn hàng cũ đã hủy trước khi cộng điểm của đơn hàng mới.
*   **Cách xử lý:** 
    1.  Yêu cầu nhân viên POS bấm nút **[Đồng bộ dữ liệu]** trên thanh trạng thái POS.
    2.  Hệ thống sẽ đồng bộ lệnh hủy đơn lên server -> Server tự động trừ 100 điểm của đơn cũ và cộng lại 80 điểm của đơn mới, đưa tài khoản điểm của khách về đúng con số chính xác.
