# HƯỚNG DẪN: THÊM MỚI SẢN PHẨM THÔNG THƯỜNG

Tính năng này giúp bạn khai báo một sản phẩm vật lý thông thường lên hệ thống (ví dụ: quần áo, thực phẩm đóng gói, đồ gia dụng...) để có thể thực hiện bán hàng tại quầy POS và quản lý số lượng tồn kho.

*   **Ai được quyền sử dụng:** Tài khoản có vai trò **Chủ doanh nghiệp (Owner)**, **Giám đốc (Admin)** hoặc **Giám đốc chi nhánh (Manager)** có quyền hạn tạo sản phẩm (`products.create`).

---

## 1. QUY TRÌNH THỰC HIỆN
1.  Truy cập vào menu **[Sản phẩm]** trên thanh nghiệp vụ.
2.  Bấm nút **[+ Thêm mới]** ở góc trên bên phải màn hình.
3.  Lần lượt điền đầy đủ các thông tin của sản phẩm (theo hướng dẫn bên dưới).
4.  Bấm nút **[Lưu sản phẩm]** để hoàn tất.
5.  `[HÌNH ẢNH: Giao diện màn hình Thêm mới sản phẩm, highlight nút "Lưu sản phẩm" ở góc dưới]`

---

## 2. GIẢI THÍCH CHI TIẾT CÁC TRƯỜNG DỮ LIỆU (INPUTS SCAN)

Khi bảng thêm sản phẩm hiện ra, bạn cần lưu ý rà soát kỹ các ô nhập liệu và hộp chọn sau:

| Tên trường trên giao diện | Loại ô nhập | Ý nghĩa & Hướng dẫn nhập |
| :--- | :--- | :--- |
| **Tên sản phẩm \*** | Ô nhập chữ | Tên hiển thị của sản phẩm (ví dụ: *Áo Polo Nam Premium*). Tên này sẽ in trên hóa đơn bán hàng cho khách. |
| **Mã sản phẩm (SKU) \*** | Ô nhập chữ | Mã số định danh độc nhất của sản phẩm (ví dụ: *POLO-NAM-01*). Nếu bạn để trống, hệ thống sẽ tự động sinh mã ngẫu nhiên. |
| **Mã vạch (Barcode)** | Ô nhập chữ | Mã số in trên nhãn vạch sản phẩm. Bạn có thể dùng máy quét bắn mã vạch trực tiếp vào ô này để tự động điền, giúp quét bán hàng cực nhanh tại POS. |
| **Danh mục \*** | Hộp chọn | Chọn nhóm phân loại sản phẩm (ví dụ: *Thời trang nam*). Giúp sắp xếp thực đơn bán hàng ngăn nắp. |
| **Đơn vị tính cơ bản \*** | Hộp chọn/Chữ | Đơn vị bán lẻ nhỏ nhất (ví dụ: *Cái, Hộp, Chai, Lon*). |
| **Giá bán lẻ (VND) \*** | Ô nhập số | Đơn giá niêm yết bán cho khách hàng vãng lai tại POS (ví dụ: *250.000*). |
| **Giá vốn (VND)** | Ô nhập số | Giá gốc nhập hàng (ví dụ: *150.000*). Chỉ những tài khoản quản trị cao cấp mới nhìn thấy trường này, nhân viên thu ngân bị chặn hoàn toàn. |
| **Giá sàn (VND)** | Ô nhập số | Giá bán tối thiểu cho phép (ví dụ: *220.000*). Nhân viên thu ngân tại POS không được phép tự ý giảm giá sản phẩm thấp hơn mức giá sàn này. |
| **Thuế suất GTGT (%)** | Ô nhập số | Thuế GTGT riêng cho sản phẩm này (ví dụ: *8* hoặc *10*). Để trống nếu muốn dùng mức thuế mặc định của hệ thống. |
| **Trọng lượng (Gram)** | Ô nhập số | Dùng để hệ thống tự động tính phí vận chuyển khi giao hàng (ví dụ: *200*). |
| **Theo dõi tồn kho** | Nút bật/tắt | **Bật (Khuyên dùng):** Hệ thống sẽ trừ tồn kho tương ứng mỗi khi bán sản phẩm và hiển thị cảnh báo khi sắp hết hàng. **Tắt:** Dành cho các mặt hàng dịch vụ không giới hạn số lượng. |
| **Ảnh sản phẩm** | Chọn file/URL | Tải hình ảnh thực tế sản phẩm lên để hiển thị trực quan trên lưới sản phẩm POS. |
| **Mô tả chi tiết** | Ô nhập văn bản | Nhập các thông tin ghi chú thêm về chất liệu, nguồn gốc sản phẩm. |

*Chú ý: Các trường có đánh dấu sao đỏ (\*) là bắt buộc phải điền.*

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Hệ thống báo lỗi "Mã SKU hoặc Mã vạch đã tồn tại" khi bấm Lưu
*   **Hiện tượng:** Bạn bấm lưu nhưng hệ thống hiển thị cảnh báo đỏ và không cho lưu sản phẩm.
*   **Nguyên nhân:** Mã SKU hoặc Mã vạch (Barcode) bạn vừa nhập đã bị trùng với một sản phẩm khác có sẵn trong hệ thống của cửa hàng.
*   **Cách xử lý:** 
    1.  Kiểm tra xem sản phẩm đó đã được tạo trước đây chưa bằng cách gõ mã vào ô tìm kiếm sản phẩm.
    2.  Nếu đây là sản phẩm mới hoàn toàn, bạn cần đổi lại mã SKU khác hoặc kiểm tra xem máy quét mã vạch có bắn nhầm mã của sản phẩm khác hay không.

### Tình huống 2: Giá trị "Tồn kho ban đầu" không hiển thị khi tạo sản phẩm
*   **Hiện tượng:** Bạn tạo sản phẩm mới và muốn nhập số lượng tồn kho ban đầu nhưng không tìm thấy ô nhập số lượng tồn.
*   **Nguyên nhân (Quy tắc vận hành):** Để đảm bảo tính chặt chẽ về mặt kế toán kiểm toán dòng hàng, hệ thống ONI.vn yêu cầu mọi hoạt động tăng tồn kho phải được truy vết thông qua **Phiếu nhập kho (PN)** hoặc **Phiếu điều kho (PDK)** chứ không cho phép điền số lượng tồn tùy tiện khi tạo sản phẩm mới.
*   **Cách xử lý:** 
    1.  Bấm Lưu sản phẩm mới với số lượng kho mặc định bằng 0.
    2.  Sau đó, vào menu **[Kho]** -> **[Phiếu nhập kho]** -> Lập một phiếu nhập hàng để khai báo số lượng tồn kho thực tế của sản phẩm này.
