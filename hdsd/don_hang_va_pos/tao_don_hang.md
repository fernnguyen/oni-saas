# HƯỚNG DẪN: QUY TRÌNH TẠO ĐƠN HÀNG MỚI TẠI QUẦY POS

Giao diện bán hàng POS là trái tim của hoạt động kinh doanh hàng ngày. Hệ thống ONI.vn hỗ trợ 2 loại giao diện bán hàng chuyên biệt tự động thay đổi theo ngành hàng của bạn:
1.  **POS Bán lẻ (Retail):** Thiết kế cho các cửa hàng bán lẻ, siêu thị mini, thời trang... quét mã vạch bán hàng nhanh.
2.  **POS F&B (Café, Nhà hàng, Phòng bàn):** Thiết kế cho mô hình ăn uống, đặt chỗ, tính tiền sau.

Tài liệu này sẽ hướng dẫn nhân viên thu ngân quy trình tạo đơn hàng hoàn chỉnh trên cả 2 giao diện.

*   **Ai được quyền sử dụng:** Tài khoản có vai trò **Thu ngân (Cashier)**, **Nhân viên (Staff)** hoặc Quản lý chi nhánh.

---

## 1. QUY TRÌNH TẠO ĐƠN TRÊN POS BÁN LẺ (RETAIL)

### Bước 1: Thêm sản phẩm vào giỏ hàng
*   Sử dụng máy bắn mã vạch quét trực tiếp lên nhãn sản phẩm, món hàng sẽ tự động nhảy vào giỏ hàng với số lượng là 1.
*   Hoặc nhấn phím **F3** trên bàn phím, gõ Tên hoặc mã SKU của sản phẩm để tìm nhanh, bấm Enter để chọn.

### Bước 2: Chọn Khách hàng & Bảng giá áp dụng
*   Mặc định đơn hàng là **[Khách lẻ]** và áp dụng giá bán lẻ.
*   Để tích điểm hoặc bán giá ưu đãi cho khách VIP: Nhấn phím **F4**, gõ Số điện thoại khách hàng.
    *   Hệ thống hiển thị thông tin khách hàng -> Bảng giá bán hàng sẽ tự động chuyển sang **[Giá VIP]** hoặc **[Giá sỉ]** nếu khách hàng đó thuộc nhóm khách được giảm giá.

### Bước 3: Áp dụng chương trình Khuyến mãi
*   Nếu sản phẩm bạn chọn đang nằm trong chương trình khuyến mãi còn hạn dùng, hệ thống sẽ tự động trừ tiền chiết khấu trực tiếp trên hóa đơn.
*   Để giảm giá thủ công trực tiếp trên đơn hàng (nếu có sự đồng ý của quản lý): Bấm vào ô **[Chiết khấu/Giảm giá]** ở cuối giỏ hàng, điền số % hoặc số tiền mặt muốn giảm trừ.

### Bước 4: Thanh toán và In Bill (F9)
1.  Nhấn phím **F9** để mở bảng **Thanh toán**.
2.  **Các trường cần nhập & rà soát (Inputs Scan):**
    *   **Hộp chọn [Phương thức thanh toán *]:** Tiền mặt, Chuyển khoản, hoặc Ví CRM.
    *   **Ô nhập [Tiền khách đưa *]:** Nhập số tiền khách đưa cho bạn (ví dụ khách mua đơn 170K đưa tờ 200K -> nhập `200000`).
    *   **Dòng [Tiền trả lại khách]:** Hệ thống tự tính số tiền thối lại (ví dụ: `30.000đ`). Rà soát kỹ để thối tiền mặt chính xác cho khách.
3.  Bấm nút **[Hoàn tất thanh toán]** hoặc nhấn Enter -> Đơn hàng được đẩy lên hệ thống và máy in sẽ tự động in hóa đơn nhiệt 80mm giao cho khách.
4.  `[HÌNH ẢNH: Giao diện thanh toán POS Retail, highlight ô nhập "Tiền khách đưa", ô báo "Tiền trả lại khách" và nút "Hoàn tất thanh toán"]`

---

## 2. QUY TRÌNH TẠO ĐƠN TRÊN POS F&B (CAFÉ/NHÀ HÀNG)

Đối với quán café, nhà hàng, khách sẽ gọi món trước và thanh toán sau khi dùng xong dịch vụ tại bàn.

### Bước 1: Mở Bàn trống và Gọi món (Order)
1.  Tại sơ đồ phòng bàn, click chọn một bàn trống màu Xám (ví dụ: *Bàn số 05*).
2.  Chọn các món ăn/đồ uống khách yêu cầu trong thực đơn.
3.  **Bảng tùy biến món (Modifier):** Nếu khách yêu cầu riêng (ví dụ: *Trà sữa trân châu ít đá, ít đường*), tích chọn các thuộc tính đá, đường và topping rồi bấm **[Xác nhận]**.
4.  Bấm nút **[Lưu tạm / Gửi bếp]** để lưu đơn hàng vào bàn đó. Trạng thái bàn trên sơ đồ sẽ lập tức chuyển sang màu **Xanh dương (Đang có khách)**.
5.  `[HÌNH ẢNH: Sơ đồ bàn POS F&B chuyển sang màu Xanh dương khi có khách ngồi, highlight tên món ăn và ghi chú pha chế trong giỏ hàng]`

### Bước 2: Nghiệp vụ trong quá trình khách dùng món (Chuyển/Ghép bàn)
*   *Khách muốn đổi bàn:* Bấm nút **[Chuyển bàn]** -> Click bàn hiện tại -> Click chọn bàn trống mới.
*   *Khách muốn gộp hóa đơn:* Bấm nút **[Ghép bàn]** -> Click chọn các bàn muốn gộp chung hóa đơn.

### Bước 3: In Tạm tính & Thanh toán
1.  Khi khách gọi tính tiền, bấm chọn bàn của khách trên sơ đồ.
2.  Bấm nút **[In tạm tính]** để in ra phiếu tính tiền cho khách kiểm tra trước tại bàn.
3.  Bấm nút **[Thanh toán (F9)]** -> Mở bảng thanh toán.
4.  Nhập số tiền khách đưa -> Bấm **[Hoàn tất thanh toán]** -> Bàn số 5 sẽ tự động chuyển trạng thái về màu Xám (Bàn trống) để sẵn sàng đón khách tiếp theo.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: POS báo lỗi "Vượt quá hạn mức nợ cho phép" khi chọn thanh toán ghi nợ
*   **Hiện tượng:** Thu ngân chọn phương thức thanh toán là **[Ghi nợ (Debt)]** cho khách quen nhưng hệ thống hiện thông báo lỗi đỏ và không cho hoàn tất đơn hàng.
*   **Nguyên nhân:** Tổng số tiền nợ cũ cộng với giá trị đơn hàng hiện tại của khách đã vượt quá con số giới hạn nợ tối đa (**[Hạn mức nợ - Credit Limit]**) do kế toán thiết lập trong hồ sơ khách hàng.
*   **Cách xử lý:** 
    1.  Yêu cầu khách hàng thanh toán bớt nợ cũ bằng tiền mặt/chuyển khoản ngân hàng trước để giảm số nợ hiện tại xuống dưới hạn mức.
    2.  Hoặc thu ngân chuyển phương thức thanh toán đơn hàng này sang Tiền mặt/Chuyển khoản thay vì ghi nợ.

### Tình huống 2: Hóa đơn in ra bị mất dòng chữ hoặc lệch khổ giấy
*   **Hiện tượng:** Máy in hóa đơn nhiệt chạy ra giấy nhưng lề bị lệch hẳn sang một bên, chữ bị che mất hoặc trống một khoảng giấy dài ngoằng.
*   **Nguyên nhân:** Khổ giấy trong cài đặt in của trình duyệt máy tính đang cấu hình sai kích thước (ví dụ máy in nhiệt dùng giấy 80mm nhưng trình duyệt đang chọn in khổ A4).
*   **Cách xử lý:**
    1.  Nhấn phím thanh toán in hóa đơn, khi cửa sổ chọn máy in của Google Chrome hiện ra, click vào mục **[Cài đặt khác (More settings)]**.
    2.  Tại dòng **[Khổ giấy (Paper size)]**, chọn đúng khổ **[80mm x Receipt]** hoặc khổ giấy tương đương của máy in nhiệt.
    3.  Tích chọn ô **[Bỏ lề (Margins: None)]** và **[Ẩn tiêu đề và chân trang (Headers and footers: Unchecked)]**.
    4.  Bấm in lại, bill sẽ được in ra cực kỳ ngay ngắn và sắc nét.
