# HƯỚNG DẪN: TRA CỨU BÁO CÁO TỒN KHO & LƯU LƯỢNG BIẾN ĐỘNG (INVENTORY REPORT)

Báo cáo Kho trên ONI.vn cung cấp các chỉ số quan trọng giúp Thủ kho và Kế toán kiểm soát chặt chẽ tổng lượng hàng hiện hữu, giá trị dòng vốn đang tồn đọng trong kho, cùng cơ cấu xuất/nhập hàng ngày tại chi nhánh.

---

## 1. QUY TRÌNH TRA CỨU BÁO CÁO KHO

Chỉ các tài khoản được phân quyền xem báo cáo hoặc quản lý kho (`reports.view_shop` hoặc `inventory.manage`) mới có quyền truy cập số liệu này.

### Các bước thực hiện:
1. Đăng nhập hệ thống chi nhánh -> Click mục **[Báo cáo]** -> Chọn **[Báo cáo kho]** trên thanh menu bên trái.
2. Hệ thống sẽ truy vấn số liệu và dựng biểu đồ lưu lượng biến động kho tức thời.

---

## 2. GIẢI THÍCH CHI TIẾT CÁC KHU VỰC SỐ LIỆU (FIELDS SCAN)

### Khu vực A: Các chỉ số kho cốt lõi (KPIs)
Hiển thị ở đầu trang dưới dạng 4 thẻ số liệu lớn:
* **Tổng lượng tồn kho:** Tổng số lượng sản phẩm vật lý thực tế đang có sẵn trong kho (ví dụ: `12.500` sản phẩm).
* **Tổng giá trị tồn kho:** Tổng giá trị bằng tiền mặt của toàn bộ số hàng đang tồn trữ, được tính toán tự động dựa trên công thức **Giá vốn Bình quân Gia quyền di động (MAC)** thời gian thực (ví dụ: `150.000.000đ`).
* **Giao dịch hôm nay:** Tổng số lượng phiếu kho phát sinh và hoàn tất trong ngày hôm nay (gồm phiếu nhập PN, xuất PX, chuyển CK, cân kho PDK).
* **Giao dịch tháng này:** Tổng số lượng phiếu kho hoàn tất trong tháng hiện tại.

`[HÌNH ẢNH: 4 thẻ chỉ số kho: Lượng tồn kho, Giá trị tồn kho theo giá vốn, Giao dịch hôm nay và Giao dịch tháng này]`

---

### Khu vực B: Biểu đồ cột kép Lưu lượng xuất/nhập 30 ngày qua
Biểu đồ phân tích khối lượng hàng lưu thông qua kho hàng ngày:
* **Mô tả:** Biểu đồ gồm các **Cặp cột song song kép** đứng cạnh nhau:
  * **Cột màu xanh dương:** Lượng sản phẩm nhập vào kho (Inbound).
  * **Cột màu cam:** Lượng sản phẩm xuất ra khỏi kho (Outbound).
* **Cách thao tác:** Di chuột (hoặc chạm tay) vào một ngày cụ thể trên biểu đồ. Hộp thông tin nhỏ (Tooltip) sẽ hiện lên chi tiết số lượng sản phẩm lưu thông của ngày đó (ví dụ: *Ngày 25/05/2026 - Nhập: 500 sp / Xuất: 320 sp*).
* Giúp thủ kho đánh giá tốc độ lưu thông hàng hóa và phát hiện nhanh các ngày có lượng xuất/nhập đột biến.

`[HÌNH ẢNH: Biểu đồ cột kép màu xanh dương và cam thể hiện lưu lượng Nhập/Xuất kho hàng ngày]`

---

### Khu vực C: Tỷ lệ các loại phiếu kho phát sinh (Proportion Breakdown)
Khung phân tích cơ cấu lý do biến động kho trong tháng:
* Hệ thống tự động phân loại tỷ lệ % và số lượng sản phẩm của từng loại giao dịch kho dưới dạng thanh màu xanh dương:
  * **Nhập hàng (purchase_in) & Nhập hàng P2P (p2p_purchase_in):** Hàng nhập tăng kho từ nhà cung cấp.
  * **Bán hàng (sale_out):** Hàng xuất kho đi bán lẻ tại quầy POS.
  * **Hàng trả về (return_in):** Khách trả hàng hoàn lại kho.
  * **Xuất/Nhập chuyển kho (transfer_out/transfer_in):** Luân chuyển hàng nội bộ chi nhánh.
  * **Điều chỉnh (adjustment):** Cân bằng kho sau kiểm thực tế.
* Hiển thị chi tiết số lượng sản phẩm thực tế đã luân chuyển và số lượng phiếu kho tương ứng ở cuối dòng.

---

### Khu vực D: Top sản phẩm nhập kho & Tỷ lệ xuất kho
Bảng xếp hạng danh mục sản phẩm biến động kho mạnh nhất:
* Hiển thị danh sách sản phẩm kèm 2 thanh ngang trượt song song cho từng mặt hàng:
  * **Thanh trượt màu xanh dương:** Lượng Nhập kho tích lũy trong tháng.
  * **Thanh trượt màu cam:** Lượng Xuất kho tích lũy trong tháng.
* **Ý nghĩa thực tiễn:** Giúp quản lý kho dễ dàng nhận biết sản phẩm có tính thanh khoản kém (nhập vào rất nhiều - thanh xanh dài, nhưng xuất ra bán được rất ít - thanh cam ngắn) để lên phương án giải phóng hàng tồn đọng kịp thời.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Tổng giá trị tồn kho hiển thị bằng 0đ hoặc sai lệch lớn so với thực tế
* **Hiện tượng:** Kho vẫn có hàng ngàn sản phẩm nhưng số tiền "Tổng giá trị tồn kho" lại báo 0đ hoặc một con số cực kỳ nhỏ bé.
* **Nguyên nhân:** Khi lập phiếu nhập kho (PN), thủ kho để trống trường đơn giá mua hoặc gõ nhầm số 0. Hệ thống ghi nhận giá vốn bằng 0đ, dẫn đến việc tính toán tổng giá trị tài sản kho bị sai lệch.
* **Cách xử lý:** 
  1. Vào danh sách phiếu kho -> Tìm kiếm các phiếu nhập hàng PN gần đây.
  2. Rà soát xem có phiếu nào bị nhập sai hoặc bỏ trống đơn giá mua hay không.
  3. Lập phiếu điều chỉnh giá vốn hoặc cập nhật lại giá vốn chuẩn trong phần chi tiết sản phẩm.
  4. Nhắc nhở thủ kho bắt buộc phải điền chính xác đơn giá mua trên phiếu nhập hàng PN.

### Tình huống 2: Số lượng tồn kho hiển thị giá trị âm đỏ âm ảo
* **Hiện tượng:** Lượng tồn kho của một số sản phẩm báo số âm đỏ (ví dụ: `-15` sản phẩm).
* **Nguyên nhân:** Cửa hàng bật chế độ **[Cho phép bán khi hết hàng / Bán khống]** tại cài đặt chi nhánh. Nhân viên POS vẫn bấm bán hàng bình thường trong khi thủ kho thực tế có nhập hàng về nhưng lười không lập phiếu nhập kho PN trên phần mềm.
* **Cách xử lý:**
  1. Thủ kho lập tức gom lại hóa đơn mua hàng, tạo phiếu nhập kho PN tương ứng để bù lại số lượng âm ảo.
  2. Nếu không xác định được số lượng, thực hiện quy trình **Kiểm kho PDK** để đếm thực tế và bấm Cân kho để đưa tồn kho về giá trị dương chính xác.
