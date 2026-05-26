# HƯỚNG DẪN: THÊM SẢN PHẨM CÓ TÙY CHỌN ĐI KÈM (TOPPING / MODIFIER)

Đối với các mô hình kinh doanh ăn uống (F&B), café, trà sữa, trà chanh..., sản phẩm thường đi kèm với các yêu cầu pha chế riêng (ít đá, nhiều đường) hoặc thêm các món đi kèm (thêm trân châu, thêm thạch). 

Hệ thống ONI.vn hỗ trợ tính năng **Tùy chọn đi kèm (Modifier)** giúp thu ngân chọn nhanh yêu cầu của khách tại POS, in phiếu báo bếp chính xác và tự động cộng thêm tiền vào hóa đơn nếu có.

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin) hoặc Cửa hàng trưởng (Manager).

---

## 1. QUY TRÌNH THỰC HIỆN
Để thiết lập tùy chọn đi kèm cho sản phẩm, bạn cần đi qua 2 bước đơn giản:

### Bước 1: Liên kết Nhóm lựa chọn vào Sản phẩm
1.  Truy cập menu **[Sản phẩm]** -> Tìm và chọn sản phẩm muốn thiết lập tùy chọn (ví dụ: *Trà sữa truyền thống*).
2.  Cuộn xuống khu vực **[Thuộc tính & Tùy chọn (Modifiers)]**.
3.  **Hộp chọn [Liên kết Nhóm lựa chọn]:** Chọn một hoặc nhiều nhóm tùy chọn đã tạo sẵn (ví dụ: chọn nhóm *"Mức đường đá"*, nhóm *"Topping trà sữa"*).
4.  Bấm nút **[Cập nhật sản phẩm]** để liên kết.
5.  `[HÌNH ẢNH: Khu vực Thuộc tính Modifier trên trang chi tiết sản phẩm, highlight hộp chọn liên kết Nhóm lựa chọn và danh sách nhóm đã được gắn thành công]`

### Bước 2: Hiển thị và Chọn tùy chọn trên giao diện POS F&B
Khi bạn đã liên kết thành công, tại quầy bán hàng POS F&B:
1.  Nhân viên thu ngân click vào sản phẩm *Trà sữa truyền thống* trong menu.
2.  Một bảng **[Tùy chọn món ăn (Modifier Picker Modal)]** sẽ tự động hiện lên giữa màn hình.
3.  **Thao tác chọn (Inputs Scan):**
    *   **Nhóm [Mức đá]:** Click chọn ô tròn *Ít đá*, *Đá riêng* hoặc *Không đá*.
    *   **Nhóm [Topping]:** Tích chọn các ô vuông để thêm topping như *Trân châu đen (+5.000đ)*, *Thạch nha đam (+5.000đ)*.
4.  Bấm nút **[Xác nhận]** để thêm vào giỏ hàng. Tổng số tiền hóa đơn sẽ tự động cộng thêm phí topping và hiển thị ghi chú pha chế rõ ràng dưới dòng sản phẩm trên bill.
5.  `[HÌNH ẢNH: Bảng Modifier Picker Modal hiển thị trên POS khi click chọn sản phẩm, highlight các ô chọn Topping kèm giá cộng thêm và nút "Xác nhận"]`

---

## 2. LƯU Ý QUAN TRỌNG VỀ TRỪ TỒN KHO TOPPING

Kế toán và Thủ kho cần chú ý cơ chế trừ kho của Topping đi kèm:
*   Mỗi loại Topping có cộng tiền (ví dụ: *Trân châu đen*) có thể được khai báo là một sản phẩm độc lập có theo dõi kho.
*   Khi bán sản phẩm trà sữa có tích chọn thêm *Trân châu đen*: Hệ thống sẽ tự động trừ đi số lượng tồn kho của món trà sữa **và đồng thời trừ đi 1 phần tồn kho của mặt hàng Trân châu đen** trong kho.
*   Điều này giúp hạn chế tối đa thất thoát nguyên liệu chế biến của cửa hàng.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: POS không tự động hiện bảng tùy chọn Modifier khi click vào sản phẩm
*   **Hiện tượng:** Bạn đã gắn nhóm lựa chọn cho sản phẩm trên trang quản trị, nhưng khi thu ngân click vào món tại POS thì sản phẩm nhảy thẳng vào giỏ hàng mà không hiện bảng tùy chọn đá/topping.
*   **Nguyên nhân:** Có 2 nguyên nhân thường gặp:
    1.  Cửa hàng đang sử dụng giao diện **POS Bán lẻ (Retail)** chứ không phải giao diện **POS F&B (Café/Nhà hàng)**. POS Retail thiết kế cho thanh toán nhanh nên sẽ bỏ qua bảng tùy chọn này.
    2.  Dữ liệu POS trên thiết bị chưa được cập nhật (stale cache).
*   **Cách xử lý:** 
    1.  Vào phần cài đặt chung để kiểm tra và chuyển đổi loại ngành hàng sang **[F&B (Café/Phòng bàn)]**.
    2.  Tại màn hình POS, bấm nút **[Đồng bộ dữ liệu]** ở thanh trạng thái phía trên để làm mới dữ liệu lưu trữ cục bộ của trình duyệt.

### Tình huống 2: Giá trị cộng thêm của Topping bị hiển thị sai trên hóa đơn
*   **Hiện tượng:** Bạn thiết lập thêm trân châu là +5.000đ nhưng khi nhân viên bán tại quầy, bill in ra lại tính tiền trân châu là 0đ hoặc sai số tiền.
*   **Nguyên nhân:** Giá trị cộng thêm được sửa đổi trực tiếp trên nhóm lựa chọn nhưng chưa được lưu lại chính xác hoặc chưa đồng bộ về thiết bị bán hàng POS.
*   **Cách xử lý:** 
    1.  Vào menu **[Danh mục]** -> **[Nhóm lựa chọn]**, kiểm tra và cập nhật lại mức phí cộng thêm của từng món topping.
    2.  Yêu cầu nhân viên POS tải lại trang hoặc bấm **[Đồng bộ dữ liệu]** trước khi tiếp tục bán hàng.
