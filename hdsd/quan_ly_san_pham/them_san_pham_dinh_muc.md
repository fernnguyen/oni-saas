# HƯỚNG DẪN: THÊM SẢN PHẨM CÓ ĐỊNH MỨC NGUYÊN VẬT LIỆU (BOM)

Đối với các mô hình kinh doanh tự pha chế, sản xuất hoặc chế biến (ví dụ: *quán café, trà sữa, nhà hàng, tiệm bánh...*), việc bán 1 sản phẩm thành phẩm (ly nước, chiếc bánh) sẽ làm tiêu hao nhiều nguyên vật liệu thô (bột café, sữa đặc, đường, ly nhựa).

ONI.vn cung cấp tính năng **Định mức nguyên vật liệu (BOM - Bill of Materials)** giúp tự động trừ tồn kho của từng nguyên liệu cấu thành ngay khi bạn bán thành phẩm tại quầy POS, giúp kiểm soát thất thoát nguyên liệu chính xác đến từng gram.

*   *Ví dụ:* Bán 1 ly *"Café sữa"* -> Hệ thống tự động trừ kho: *20g bột café*, *30ml sữa đặc*, và *1 chiếc ly nhựa*.

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin) hoặc Cửa hàng trưởng (Manager).

---

## 1. QUY TRÌNH THỰC HIỆN VÀ CẤU HÌNH ĐỊNH LƯỢNG

### Bước 1: Khai báo các Nguyên vật liệu thô (NVL)
Trước khi thiết lập công thức pha chế cho thành phẩm, bạn bắt buộc phải khai báo các nguyên liệu thô này như những sản phẩm thông thường:
1.  Vào thêm sản phẩm mới cho từng nguyên liệu (ví dụ: tạo sản phẩm *"Bột café"* đơn vị là *Gram*, *"Sữa đặc"* đơn vị là *Mililit*, *"Ly nhựa"* đơn vị là *Cái*).
2.  Bật tính năng **[Theo dõi tồn kho]** cho các nguyên liệu này.
3.  Lập phiếu nhập kho để khai báo số lượng tồn thực tế của các nguyên liệu thô đó.

### Bước 2: Thiết lập Công thức định lượng (BOM) cho Thành phẩm
1.  Vào thêm sản phẩm mới cho món thành phẩm bán cho khách (ví dụ: tạo sản phẩm *"Café sữa"* đơn vị là *Ly*).
2.  Tại mục **[Loại sản phẩm (Type)]**, chọn **[Sản phẩm chế biến/Pha chế]**.
3.  Màn hình sẽ hiển thị thêm bảng **[Định mức nguyên vật liệu (BOM)]**.
4.  **Thao tác thiết lập công thức (Inputs Scan):**
    *   **Ô tìm kiếm Nguyên liệu:** Tìm và chọn nguyên liệu thô (ví dụ: gõ tìm *"Bột café"*).
    *   **Ô nhập [Định lượng hao phí *]:** Nhập số lượng tiêu hao cho 1 ly thành phẩm (ví dụ: nhập **`20`** gram).
    *   *Tiếp tục thêm dòng:* Tìm chọn *"Sữa đặc"*, điền tiêu hao **`30`** ml. Tìm chọn *"Ly nhựa"*, điền tiêu hao **`1`** cái.
5.  Bấm nút **[Lưu sản phẩm]** để khóa công thức pha chế.
6.  `[HÌNH ẢNH: Giao diện thiết lập công thức định lượng BOM cho ly Café Sữa, highlight các nguyên liệu bột café, sữa đặc, ly nhựa và cột "Định lượng hao phí"]`

---

## 2. CƠ CHẾ TỰ ĐỘNG TRỪ KHO NVL THỜI GIAN THỰC

*   Món thành phẩm chính (*Café sữa*) **không** cần quản lý số lượng tồn kho trực tiếp. Hệ thống sẽ tự động tắt theo dõi kho của ly nước.
*   **Khi bán 1 ly Café sữa tại POS:** Hệ thống tự động chạy ngầm công thức định lượng, lập tức **trừ tồn kho của các nguyên liệu thô tương ứng**:
    *   Tồn kho Bột café giảm đi 20g.
    *   Tồn kho Sữa đặc giảm đi 30ml.
    *   Tồn kho Ly nhựa giảm đi 1 cái.
*   Cơ chế này giúp bạn nắm bắt chính xác lượng hao hụt nguyên liệu thô theo doanh số bán ra thực tế hàng ngày mà không cần phải đếm cân từng túi bột cuối ngày.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: POS báo lỗi "Không thể bán do hết nguyên vật liệu thô"
*   **Hiện tượng:** Thu ngân bấm chọn bán 1 ly Café sữa, POS hiện thông báo lỗi đỏ *"Không đủ nguyên liệu: Sữa đặc trong kho hiện tại bằng 0ml"* và khóa nút thanh toán.
*   **Nguyên nhân:** Lượng sữa đặc thực tế khai báo trong kho phần mềm đã cạn kiệt (bằng 0), không đủ 30ml để pha 1 ly theo công thức định mức, và hệ thống đang bật chế độ chặn bán khống.
*   **Cách xử lý:** 
    1.  Nếu trong tủ lạnh vẫn còn sữa đặc (nhưng nhân viên quên chưa nhập phiếu lên phần mềm): Yêu cầu quản lý lập ngay Phiếu nhập kho (PN) cho mặt hàng *Sữa đặc* để cập nhật tồn kho phần mềm tăng lên. Bấm đồng bộ dữ liệu tại POS để bán tiếp.
    2.  Nếu cửa hàng thực sự hết sữa và chấp nhận bán nợ kho (kho âm sữa đặc để bù hàng sau): Yêu cầu Quản trị viên vào Cài đặt bật tính năng *"Cho phép bán khống khi hết hàng"* để tạm thời bỏ qua lỗi chặn này.

### Tình huống 2: Giá vốn của thành phẩm hiển thị sai hoặc bằng 0đ
*   **Hiện tượng:** Bạn xem báo cáo tài chính thấy lợi nhuận gộp của ly Café sữa bị sai lệch nghiêm trọng, hoặc giá vốn hiển thị bằng 0đ.
*   **Nguyên nhân:** Khi tạo các nguyên vật liệu thô (bột café, sữa đặc), bạn đã quên điền **[Giá vốn]** của nguyên liệu thô đó hoặc nhập phiếu nhập kho PN với đơn giá nhập bằng 0đ. Hệ thống không có cơ sở để cộng dồn tính toán giá vốn của ly nước thành phẩm.
*   **Cách xử lý:** 
    1.  Vào lại chi tiết các sản phẩm nguyên vật liệu thô, kiểm tra và điền đầy đủ giá vốn của chúng.
    2.  Hệ thống sẽ tự động tính toán lại giá vốn của ly nước thành phẩm theo công thức: `Giá vốn ly Café sữa = (20g x Giá vốn bột café/g) + (30ml x Giá vốn sữa đặc/ml) + (1 x Giá vốn ly nhựa)`.
