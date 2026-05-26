# HƯỚNG DẪN: QUẢN LÝ HỒ SƠ KHÁCH HÀNG CRM & CHÍNH SÁCH THÀNH VIÊN

Phân hệ **Quản lý khách hàng (CRM)** giúp cửa hàng lưu trữ thông tin liên hệ, lịch sử mua hàng, theo dõi công nợ mua ghi nợ và vận hành các chính sách chăm sóc thành viên như tích điểm thưởng, áp dụng bảng giá ưu đãi theo nhóm khách hàng để giữ chân khách quen.

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin), Giám đốc chi nhánh (Manager) hoặc Kế toán trưởng.

---

## 1. QUY TRÌNH THỰC HIỆN
1.  Truy cập menu **[Khách hàng]** trên bảng quản trị chi nhánh.
2.  Bấm nút **[+ Thêm khách hàng]** ở góc bên phải (hoặc bấm nút **[+]** nhanh tại quầy POS khi đang tạo đơn).
3.  Khai báo đầy đủ các trường thông tin của khách hàng (theo hướng dẫn bên dưới).
4.  Bấm **[Lưu thông tin]** để hoàn tất hồ sơ.
5.  `[HÌNH ẢNH: Giao diện Thêm mới hồ sơ khách hàng CRM, highlight các ô nhập "Số điện thoại", "Nhóm khách hàng" và "Hạn mức nợ"]`

---

## 2. GIẢI THÍCH CHI TIẾT CÁC TRƯỜNG DỮ LIỆU (INPUTS SCAN)

Khi lập hồ sơ thành viên mới, bạn cần lưu ý rà soát các trường thông tin quan trọng sau:

| Tên trường trên giao diện | Loại ô nhập | Ý nghĩa & Hướng dẫn nhập |
| :--- | :--- | :--- |
| **Số điện thoại \*** | Ô nhập số | Là thông tin quan trọng nhất. Dùng làm mã số thẻ thành viên để nhân viên thu ngân gõ tìm kiếm tích điểm tại POS. |
| **Tên khách hàng \*** | Ô nhập chữ | Tên hiển thị của khách (ví dụ: *Anh Minh*). Tên này sẽ in trên hóa đơn mua hàng. |
| **Mã khách hàng** | Ô nhập chữ | Mã định danh duy nhất (ví dụ: *KH001*). Nếu để trống hệ thống sẽ tự sinh mã tự động có tiền tố `C-`. |
| **Nhóm khách hàng \*** | Hộp chọn | Chọn nhóm phân loại: *Khách lẻ, Khách Sỉ, Khách VIP, Đại lý*. Dùng để tự động áp dụng giá bán sỉ/VIP tương ứng tại POS. |
| **Hạn mức nợ (Credit Limit)** | Ô nhập số | Số tiền nợ tối đa cho phép khách hàng này ghi nợ (ví dụ: *5.000.000đ*). Khi nợ vượt quá hạn mức, hệ thống POS sẽ tự động chặn không cho mua nợ. |
| **Ngày sinh nhật** | Chọn ngày | Nhập ngày sinh của khách để hệ thống gửi cảnh báo chúc mừng và áp dụng các khuyến mãi sinh nhật tự động. |
| **Điểm tích lũy (Points)** | Xem/Nhập | Hiển thị số điểm thưởng hiện tại khách đang có tích lũy từ các đơn hàng cũ. |

---

## 3. CHÍNH SÁCH TÍCH ĐIỂM & TIÊU DÙNG ĐIỂM THƯỞNG

ONI.vn cung cấp cơ chế vận hành điểm thưởng tự động nhằm tối ưu hóa trải nghiệm mua sắm:
*   **Tích điểm tự động:** Mỗi khi khách hàng mua đơn POS thành công, hệ thống tự động tính điểm dựa trên tỷ lệ cấu hình (ví dụ: *đơn 100.000đ được tích 10 điểm*). Điểm sẽ tự động cộng dồn vào trường **[Điểm tích lũy]** trong hồ sơ.
*   **Tiêu dùng điểm tại quầy POS:**
    *   Khi khách muốn đổi điểm lấy tiền giảm giá đơn hàng: Thu ngân gõ số điện thoại khách tại POS -> Nhập số điểm khách muốn tiêu (ví dụ: đổi *100 điểm*).
    *   Hệ thống tự động trừ điểm trong hồ sơ khách hàng và giảm giá tương ứng vào hóa đơn thanh toán theo tỷ lệ quy đổi (ví dụ: *trừ 10.000đ*).

---

## 4. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Hệ thống báo lỗi "Số điện thoại đã tồn tại" khi tạo khách hàng mới
*   **Hiện tượng:** Bạn bấm lưu hồ sơ khách hàng mới nhưng hệ thống hiện cảnh báo đỏ và chặn không cho lưu.
*   **Nguyên nhân:** Số điện thoại này trước đó đã được tạo hồ sơ trên hệ thống (có thể do một chi nhánh khác tạo). Hệ thống yêu cầu số điện thoại của mỗi khách hàng là độc nhất toàn cục để tránh trùng lặp điểm và công nợ.
*   **Cách xử lý:** 
    1.  Tắt bảng thêm mới khách hàng.
    2.  Gõ số điện thoại đó vào ô tìm kiếm nhanh để kiểm tra thông tin hồ sơ cũ.
    3.  Thực hiện cập nhật hoặc chỉnh sửa trên hồ sơ đã có sẵn thay vì tạo mới.

### Tình huống 2: Khách hàng mua giá sỉ nhưng POS vẫn tính giá lẻ
*   **Hiện tượng:** Khách hàng là đại lý sỉ đến mua hàng, thu ngân đã gõ chọn đúng tên khách hàng tại POS nhưng giỏ hàng vẫn tính theo đơn giá bán lẻ thông thường.
*   **Nguyên nhân:** Trong hồ sơ khách hàng đó, nhóm khách hàng đang bị chọn sai là *[Khách lẻ]* hoặc sản phẩm đó chưa được quản lý cấu hình **[Bảng giá sỉ (PriceLists)]** tương ứng.
*   **Cách xử lý:** 
    1.  Vào menu **[Khách hàng]**, kiểm tra và cập nhật lại ô **[Nhóm khách hàng]** của khách về đúng nhóm **[Khách sỉ]**.
    2.  Vào menu **[Sản phẩm]** -> **[Bảng giá]**, kiểm tra xem sản phẩm đó đã được điền mức giá sỉ chưa.
    3.  Bấm đồng bộ dữ liệu tại POS để cập nhật giá ưu đãi chính xác cho khách.
