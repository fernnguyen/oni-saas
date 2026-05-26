# HƯỚNG DẪN: CẤU HÌNH VÀ ÁP DỤNG PHÍ VAT & PHÍ DỊCH VỤ TRÊN HÓA ĐƠN

Để đảm bảo tuân thủ các quy định về thuế suất và hạch toán đúng các khoản phụ thu hoạt động (phí phòng VIP, phí phục vụ cuối tuần), ONI.vn cung cấp công cụ tự động tính toán **Thuế giá trị gia tăng (VAT)** và **Phí dịch vụ** trực tiếp trên hóa đơn thanh toán của khách.

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin) hoặc Kế toán trưởng.

---

## 1. CẤU HÌNH THUẾ GIÁ TRỊ GIA TĂNG (VAT)
Hệ thống hỗ trợ 2 lớp cấu hình thuế linh hoạt:

### Lớp 1: Cấu hình Thuế suất mặc định (Áp dụng cho toàn cửa hàng)
Nếu hầu hết hàng hóa của bạn có chung một mức thuế:
1.  Vào menu **[Cài đặt]** -> **[Cài đặt chung]**.
2.  **Ô nhập [Thuế suất mặc định (%)]:** Điền mức thuế quy định (ví dụ: điền **`8`** hoặc **`10`**).
3.  Bấm Lưu. Tất cả sản phẩm mới tạo ra sau này sẽ tự động áp dụng mức thuế suất chung này khi tính hóa đơn.

### Lớp 2: Ghi đè Thuế suất riêng biệt trên từng sản phẩm
Đối với các mặt hàng đặc thù được miễn thuế hoặc có mức thuế riêng biệt:
1.  Vào menu **[Sản phẩm]** -> Chọn sản phẩm cần điều chỉnh.
2.  **Ô nhập [Thuế suất GTGT (%) (Tax Rate)]:** Nhập mức thuế riêng của sản phẩm đó (ví dụ nhập **`0`** nếu là mặt hàng được miễn thuế).
3.  Bấm Lưu. Khi bán sản phẩm này, hệ thống sẽ ưu tiên áp dụng mức thuế `0%` riêng lẻ này thay vì mức thuế mặc định 8% của cửa hàng.
4.  `[HÌNH ẢNH: Chi tiết thông tin thuế suất trên trang thêm/sửa sản phẩm, highlight ô nhập "Thuế suất GTGT (%)"]`

### Cơ chế tính toán Thuế tự động trên hóa đơn
Khi nhân viên POS bán hàng, hệ thống tự động cộng dồn thuế của từng dòng sản phẩm dựa trên công thức chuẩn:
$$\text{Thuế sản phẩm} = (\text{Số lượng} \times \text{Đơn giá} - \text{Chiết khấu}) \times \text{Thuế suất sản phẩm}$$
Tổng số thuế này được hiển thị rõ ràng tại dòng **[Thuế (Tax Amount)]** trên bảng thanh toán và được in chi tiết trên bill của khách.

---

## 2. CẤU HÌNH PHÍ DỊCH VỤ (PHỤ THU)
Áp dụng cho các cửa hàng có phụ thu dịch vụ (ví dụ: *5% phí phục vụ cuối tuần, phụ thu phòng VIP 10%*):
1.  Vào **[Cài đặt]** -> **[Phí dịch vụ & Phụ thu]** -> Bấm **[Thêm phí dịch vụ]**.
2.  **Các trường thông tin cần nhập (Inputs Scan):**
    *   **Ô nhập [Tên phí dịch vụ]:** Tên hiển thị (ví dụ: *"Phí phục vụ VIP 10%"*, *"Phụ thu cuối tuần"*).
    *   **Hộp chọn [Loại phí]:** Chọn **[% theo giá trị đơn]** hoặc **[Số tiền cố định]**.
    *   **Ô nhập [Giá trị *]:** Điền % (ví dụ: **`10`** để phụ thu 10% tổng đơn) hoặc số tiền mặt cố định.
3.  Bấm Lưu. Khi thanh toán tại POS, thu ngân có thể tích chọn áp dụng loại phí dịch vụ này để hệ thống tự động tính toán phụ thu vào hóa đơn.
4.  `[HÌNH ẢNH: Bảng cấu hình Phí dịch vụ phụ thu, highlight ô chọn loại phí "% theo giá trị đơn" và nút Lưu]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Hóa đơn tính sai tiền thuế VAT khi áp dụng giảm giá tổng đơn
*   **Hiện tượng:** Khách hàng được chiết khấu 10% tổng đơn hàng, tiền thuế VAT hiển thị trên bill bị lệch so với tính toán thủ công của kế toán.
*   **Nguyên nhân (Quy tắc tính thuế):** Thuế VAT được tính trên **Giá trị thực thanh toán sau khi đã trừ đi khuyến mãi/chiết khấu** của đơn hàng, chứ không tính trên tổng số tiền ban đầu trước khi giảm giá.
*   *Công thức chuẩn hệ thống:* `Thuế thực tế = (Tổng tiền hàng - Tiền giảm giá tổng đơn) x Thuế suất`.
*   **Cách xử lý:** Giải thích cho khách hàng và nhân viên hiểu rõ quy tắc tính thuế của cơ quan thuế nhà nước được cài đặt chuẩn xác trong hệ thống để tránh hiểu lầm.
