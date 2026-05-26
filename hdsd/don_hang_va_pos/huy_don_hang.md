# HƯỚNG DẪN: QUY TRÌNH HỦY ĐƠN HÀNG VÀ CƠ CHẾ HOÀN KHO/TIỀN TỰ ĐỘNG

Khi khách hàng muốn hủy một giao dịch mua hàng đã thanh toán (do nhân viên nhập nhầm hóa đơn, khách muốn đổi ý lập tức, hoặc đơn hàng online bị giao thất bại), bạn cần thực hiện nghiệp vụ hủy đơn hàng trên hệ thống. 

Việc hủy đơn hàng được thiết kế với cơ chế tự động bù trừ kho và sổ sách thông minh để đảm bảo số liệu kinh doanh luôn đồng bộ chính xác.

*   **Ai được quyền sử dụng:** Tài khoản có vai trò **Chủ doanh nghiệp (Owner)**, **Giám đốc (Admin)** hoặc nhân viên được cấp quyền hủy đơn (`orders.delete`).

---

## 1. QUY TRÌNH THỰC HIỆN HỦY ĐƠN HÀNG

### A. Hủy đơn hàng tại Giao diện quản trị (Admin Dashboard)
1.  Truy cập menu **[Đơn hàng]** trên thanh nghiệp vụ.
2.  Tìm kiếm và chọn đơn hàng cần hủy trong danh sách.
3.  Bấm nút **[Hủy đơn hàng]** ở góc trên màn hình chi tiết đơn.
4.  **Ô nhập [Lý do hủy đơn *]:** Bắt buộc điền lý do rõ ràng (ví dụ: *"Thu ngân nhập nhầm số lượng hàng", "Khách trả lại do không mang đủ tiền"*).
5.  Bấm **[Xác nhận hủy]**. Trạng thái đơn hàng lập tức chuyển sang **[Đã hủy (Cancelled)]**.
6.  `[HÌNH ẢNH: Chi tiết đơn hàng hiển thị nút "Hủy đơn hàng" và bảng xác nhận lý do hủy đơn]`

### B. Hủy đơn hàng trực tiếp tại Giao diện bán hàng POS (Order History Panel)
Đối với thu ngân tại quầy cần xử lý nhanh đơn vừa bán:
1.  Bấm vào biểu tượng **[Lịch sử đơn]** trên màn hình POS (hoặc nhấn phím tắt xem đơn hàng).
2.  Chọn đơn hàng vừa thanh toán bị sai sót.
3.  Bấm nút **[Hủy đơn]**. Hệ thống sẽ kiểm tra quyền hạn của tài khoản thu ngân:
    *   *Nếu có quyền:* Bảng xác nhận lý do sẽ hiện ra. Điền lý do và bấm xác nhận.
    *   *Nếu không có quyền:* Hệ thống yêu cầu quét vân tay hoặc nhập mã xác nhận (PIN) của Giám đốc/Quản lý chi nhánh để phê duyệt hủy đơn.

---

## 2. CƠ CHẾ TỰ ĐỘNG HOÀN KHO VÀ ĐỐI SOÁT SỔ QUỸ (SIDE-EFFECTS)

Ngay khi đơn hàng được chuyển sang trạng thái **[Đã hủy (Cancelled)]**, hệ thống sẽ tự động thực hiện các thao tác bù trừ sau:

### A. Tự động hoàn tồn kho thực tế
*   Hệ thống tự động đọc danh sách các sản phẩm có trong đơn hàng bị hủy.
*   Thực hiện cộng trả lại số lượng tồn kho sản phẩm tương ứng vào kho chi nhánh.
*   **Quy đổi đơn vị tính:** Nếu sản phẩm được bán theo đơn vị quy đổi (ví dụ: bán 1 Vỉ thuốc), hệ thống tự động nhân với tỷ lệ quy đổi (ví dụ: 1 Vỉ = 10 Viên) để **cộng trả lại đúng số lượng tồn gốc nhỏ nhất là 10 Viên** vào kho hàng.

### B. Đối soát dòng tiền két (Sổ Quỹ) - Nhiệm vụ của Kế toán
*   **Lưu ý cực kỳ quan trọng:** Đơn hàng POS khi hoàn tất sẽ tự động sinh 1 Phiếu thu trong Sổ quỹ. Khi đơn hàng bị hủy, để đảm bảo két tiền thực tế không bị lệch, Kế toán trưởng cần:
    1.  Vào menu **[Sổ quỹ]**, tìm Phiếu thu tự động liên kết với mã đơn hàng vừa hủy đó (phiếu thu có mã tham chiếu trùng mã đơn).
    2.  Bấm vào chi tiết phiếu thu, chọn **[Vô hiệu hóa / Hủy phiếu thu]**.
    3.  Số dư tiền két trên phần mềm sẽ lập tức cân đối chính xác với két tiền thực tế tại quầy.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: POS báo lỗi "Cần kết nối mạng để hủy đơn hàng"
*   **Hiện tượng:** Thu ngân bấm hủy một đơn hàng cũ trong lịch sử đơn POS nhưng hệ thống hiện thông báo lỗi đỏ và chặn thao tác.
*   **Nguyên nhân:** Đơn hàng này trước đó đã được đồng bộ trực tuyến lên cloud (Server). Khi offline (mất mạng), trình duyệt cục bộ không thể gửi lệnh hủy lên server để đồng bộ và cập nhật quyền hạn được, nên hệ thống chặn để tránh sai lệch dữ liệu giữa máy cục bộ và cloud.
*   **Cách xử lý:** 
    1.  Kiểm tra lại kết nối Wifi/Internet của quầy.
    2.  Bấm kết nối mạng ổn định trở lại (thanh trạng thái báo màu Xanh).
    3.  Thực hiện bấm nút hủy đơn hàng lại.

### Tình huống 2: Đơn hàng đã hủy trên POS nhưng tồn kho thực tế không tăng lại
*   **Hiện tượng:** Bạn kiểm tra trạng thái đơn đã báo hủy đỏ thành công, nhưng số lượng tồn kho của sản phẩm đó vẫn giữ nguyên số lượng cũ, không thấy cộng trả lại.
*   **Nguyên nhân:** Sản phẩm đó khi tạo ban đầu đã bị **TẮT** nút *"Theo dõi tồn kho"*. Hệ thống coi sản phẩm này là dịch vụ nên không quản lý số lượng tồn kho, dẫn đến không có hành động hoàn kho khi hủy đơn.
*   **Cách xử lý:** 
    1.  Vào kiểm tra cài đặt sản phẩm xem nút *[Theo dõi tồn kho]* có đang bật hay không.
    2.  Nếu muốn quản lý số lượng tồn, hãy bật nút này lên.
    3.  Lập phiếu điều kho PDK để cân lại số lượng tồn kho thực tế hiện tại về đúng con số chính xác.
