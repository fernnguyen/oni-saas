# HƯỚNG DẪN: THÊM SẢN PHẨM PHÂN HỆ DƯỢC PHẨM

Đối với ngành hàng Dược phẩm, Nhà thuốc, và Phòng khám, việc quản lý hàng hóa đòi hỏi tính chính xác cực cao về mặt pháp lý và y tế. ONI.vn cung cấp phân hệ **Dược phẩm chuyên sâu** hỗ trợ đầy đủ các nghiệp vụ:
1.  Quản lý số lô sản xuất (Batch No) & Hạn sử dụng (Expiry Date) để tránh bán hàng hết hạn.
2.  Bảng quy đổi Đơn vị tính phức tạp (ví dụ: *1 Hộp = 10 Vỉ = 100 Viên*), cho phép bán theo vỉ/viên và tự động quy đổi kho chính xác.
3.  Quản lý nhóm thuốc bán theo đơn (yêu cầu toa bác sĩ).

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin) hoặc Giám đốc chi nhánh (Manager).

---

## 1. QUY TRÌNH THỰC HIỆN VÀ CẤU HÌNH CHI TIẾT

### Bước 1: Khai báo thông tin thuốc & Bán theo đơn
1.  Tại giao diện thêm mới sản phẩm, chọn nhóm ngành hàng kinh doanh là **[Dược phẩm]**.
2.  **Các trường thông tin đặc thù (Inputs Scan):**
    *   **Ô nhập [Hoạt chất chính]:** Điền tên hoạt chất của thuốc (ví dụ: *Paracetamol 500mg*). Giúp nhân viên tra cứu nhanh thuốc thay thế khi quầy hết hàng.
    *   **Ô nhập [Hàm lượng]:** Hàm lượng hoạt chất (ví dụ: *500mg*).
    *   **Nút bật/tắt [Thuốc bán theo đơn (Prescription Required)]:** Nếu **BẬT**, hệ thống POS sẽ hiển thị biểu tượng cảnh báo toa thuốc đỏ. Thu ngân bắt buộc phải điền tên Bác sĩ kê đơn và số toa thuốc mới cho phép hoàn tất thanh toán.
3.  `[HÌNH ẢNH: Giao diện thêm sản phẩm Dược phẩm, highlight các ô nhập "Hoạt chất chính" và nút bật/tắt "Thuốc bán theo đơn"]`

---

### Bước 2: Thiết lập Bảng Quy đổi Đơn vị tính phức tạp
Thuốc thường được nhập theo Hộp lớn nhưng bán lẻ theo Vỉ hoặc Viên. Bạn cần thiết lập bảng quy đổi đơn vị để kho tự động bù trừ chính xác:
1.  Tại mục **[Đơn vị tính]**, khai báo **[Đơn vị cơ bản (Nhỏ nhất) *]:** Điền đơn vị nhỏ nhất bán lẻ được (ví dụ: *Viên*). Tất cả giá vốn và tồn kho gốc sẽ được tính toán theo Viên.
2.  Bấm **[+ Thêm đơn vị quy đổi]**:
    *   *Đơn vị quy đổi 1:* Điền *"Vỉ"*.
    *   *Tỷ lệ quy đổi 1:* Nhập **`10`** (nghĩa là *1 Vỉ = 10 Viên*).
    *   *Giá bán lẻ của Vỉ:* Nhập giá bán lẻ cho 1 vỉ.
    *   *Đơn vị quy đổi 2:* Điền *"Hộp"*.
    *   *Tỷ lệ quy đổi 2:* Nhập **`100`** (nghĩa là *1 Hộp = 100 Viên* hoặc *1 Hộp = 10 Vỉ*).
    *   *Giá bán lẻ của Hộp:* Nhập giá bán lẻ cho 1 hộp (thường rẻ hơn mua lẻ 100 viên đơn lẻ).
3.  Bấm Lưu sản phẩm. Khi nhân viên bán hàng tại POS, họ có thể gõ chọn bán *"1 Hộp"* hoặc *"2 Vỉ"*, hệ thống sẽ tự động trừ tồn kho gốc tương ứng là 100 viên hoặc 20 viên chính xác.
4.  `[HÌNH ẢNH: Khu vực thiết lập bảng Đơn vị tính quy đổi, highlight các dòng nhập đơn vị "Vỉ", "Hộp" và tỷ lệ quy đổi tương ứng]`

---

### Bước 3: Nhập số Lô & Hạn sử dụng (Batches)
Để quản lý chất lượng và theo dõi lô hàng thực tế, bạn không nhập số lượng tồn trực tiếp mà khai báo qua **Phiếu nhập kho (PN)**:
1.  Khi lập Phiếu nhập kho (PN) cho mặt hàng dược phẩm, hệ thống bắt buộc hiển thị thêm 2 ô nhập liệu:
    *   **[Số Lô (Batch No) *]:** Nhập mã lô ghi trên bao bì thuốc của nhà sản xuất (ví dụ: *LOT2026-A*).
    *   **[Hạn sử dụng (Expiry Date) *]:** Chọn ngày hết hạn của lô thuốc đó.
2.  Bấm duyệt nhập kho. Kho hàng sẽ tự động phân chia số lượng tồn theo từng lô cụ thể.

---

## 2. CƠ CHẾ CẢNH BÁO CẬN HẠN DÙNG (STALE DATE WARNING)

*   Hệ thống sở hữu công cụ tự động quét hạn dùng của toàn bộ lô thuốc trong kho hàng ngày.
*   Khi một lô thuốc có hạn sử dụng còn lại dưới số ngày bạn đã cấu hình trong cài đặt cửa hàng (ví dụ: *dưới 90 ngày*), hệ thống sẽ:
    1.  Hiển thị cảnh báo màu Đỏ nổi bật tại danh sách kho của sản phẩm đó.
    2.  Hiển thị biểu tượng cảnh báo hết hạn kế bên sản phẩm tại màn hình POS để nhân viên thu ngân biết và ngưng xuất bán lô này, tránh rủi ro y tế cho khách.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: POS báo lỗi "Lô hàng đã hết hạn sử dụng" khi quét thuốc bán
*   **Hiện tượng:** Thu ngân quét mã vạch thuốc, hệ thống hiện cảnh báo lỗi đỏ *"Lô thuốc LOT2026-A đã hết hạn sử dụng ngày 20/05/2026"* và khóa cứng không cho thanh toán món này.
*   **Nguyên nhân:** Lô thuốc thực tế trong kho đã vượt quá ngày hết hạn khai báo trên phần mềm.
*   **Cách xử lý:** 
    1.  Nhân viên phải lập tức thu hồi hộp thuốc đó khỏi quầy bán để hủy hoặc trả lại nhà sản xuất.
    2.  Tìm hộp thuốc thuộc lô khác còn hạn dùng tốt, quét mã vạch và chọn đúng số lô còn hạn trên màn hình POS để tiếp tục bán cho khách.

### Tình huống 2: Tồn kho bị lệch hàng chục đơn vị do hiểu sai đơn vị tính quy đổi
*   **Hiện tượng:** Báo cáo kho báo tồn 10 nhưng thực tế đếm trong tủ chỉ còn 1 hộp thuốc.
*   **Nguyên nhân:** Nhân viên khi lập Phiếu nhập kho (PN) đã chọn đơn vị nhập là *"Hộp"* nhưng điền số lượng là `10` viên (lẽ ra phải điền 10 hộp hoặc quy đổi ra 1000 viên). Hệ thống hiểu là nhập 10 viên lẻ, dẫn đến lệch số liệu nghiêm trọng.
*   **Cách xử lý:** 
    1.  Kế toán trưởng cần vào lập Phiếu điều kho PDK để kiểm và cân lại tồn kho gốc về đúng số lượng viên thực tế.
    2.  Hướng dẫn nhân viên quy tắc: **Mọi số lượng nhập trong phiếu PN hoặc cân kho PDK bắt buộc phải quy đổi và điền theo Đơn vị tính cơ bản nhỏ nhất (Viên)**.
