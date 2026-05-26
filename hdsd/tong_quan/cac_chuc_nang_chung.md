# HƯỚNG DẪN: CÁC TÍNH NĂNG VÀ THAO TÁC SỬ DỤNG CHUNG TRÊN ONI.VN

Hệ thống ONI.vn được thiết kế với giao diện nhất quán. Các bảng danh sách (sản phẩm, đơn hàng, khách hàng, phiếu kho...) đều sở hữu chung bộ công cụ thao tác thông minh giúp bạn tìm kiếm, lọc và xuất dữ liệu nhanh chóng.

---

## 1. CÔNG CỤ TÌM KIẾM NHANH (GLOBAL SEARCH)

Ở góc trên cùng của bất kỳ bảng danh sách nào, bạn luôn thấy một **Ô tìm kiếm** có biểu tượng chiếc kính lúp 🔍.

* **Cách hoạt động:** Chỉ cần gõ thông tin và hệ thống sẽ tự động lọc danh sách ngay lập tức (không cần bấm phím Enter).
* **Mẹo tìm kiếm:**
  * **Tại trang Sản phẩm:** Có thể gõ Tên sản phẩm, mã vạch (Barcode), hoặc mã SKU.
  * **Tại trang Đơn hàng:** Gõ Mã đơn hàng (ví dụ: `ORD-1002`), Số điện thoại khách hàng, hoặc Tên khách hàng.
  * **Tại trang Khách hàng:** Gõ Số điện thoại, Email hoặc Họ tên.

---

## 2. BỘ LỌC DỮ LIỆU THÔNG MINH (FILTERS)

Nằm ngay cạnh ô tìm kiếm là các nút bộ lọc để thu hẹp phạm vi dữ liệu cần xử lý.

* **Bộ lọc Thời gian:** Cho phép chọn xem dữ liệu theo: *Hôm nay, Hôm qua, 7 ngày qua, 30 ngày qua, Tháng này, Tháng trước* hoặc click chọn *Khoảng ngày tự chọn* (nhập ngày bắt đầu và kết thúc cụ thể).
* **Bộ lọc Trạng thái:** Hộp chọn thả xuống để lọc nhanh đơn hàng (đang giao, đã hoàn thành, đã hủy) hoặc phiếu kho (phiếu nháp, đã hoàn thành).
* **Bộ lọc Chi nhánh:** Đối với vai trò Admin/Owner, có thể lọc xem số liệu của một chi nhánh cụ thể hoặc xem tổng thể toàn bộ chuỗi.

---

## 3. PHÂN TRANG DỮ LIỆU (PAGINATION)

Dưới đáy của mỗi bảng dữ liệu là thanh phân trang, giúp giao diện tải mượt mà không bị chậm khi cửa hàng có hàng triệu bản ghi.

* **Các nút điều hướng:** Bấm nút mũi tên sang trái `◀` để về trang trước, mũi tên sang phải `▶` để sang trang kế tiếp, hoặc bấm trực tiếp vào số trang (ví dụ: `1`, `2`, `3`).
* **Hộp chọn hiển thị số dòng:** Click vào hộp chọn góc phải để đổi số lượng dòng hiển thị trên một màn hình (cho phép chọn hiển thị: *10 dòng, 20 dòng, 50 dòng, hoặc 100 dòng* mỗi trang).

`[HÌNH ẢNH: Thanh phân trang dưới đáy bảng dữ liệu hiển thị các nút chuyển trang và hộp chọn số lượng dòng]`

---

## 4. TÙY CHỈNH ẨN / HIỆN CỘT TRONG BẢNG (COLUMN VISIBILITY)

Để giao diện gọn gàng phù hợp với nhu cầu của từng nhân sự, bạn có thể tự thiết lập cột nào hiển thị trong bảng.

* **Cách thực hiện:** Bấm vào **[Biểu tượng Bánh răng ⚙]** hoặc nút **[Chọn cột]** ở góc trên bên phải tiêu đề bảng.
* **Thao tác:** Tích chọn vào các cột muốn hiện và bỏ tích các cột muốn ẩn đi (ví dụ: nhân viên thu ngân có thể ẩn cột "Giá vốn" để tránh lộ thông tin nhạy cảm, chỉ để hiện cột "Giá bán" và "Tồn kho").
* **Ghi nhớ cấu hình:** Hệ thống sẽ tự động lưu lại thiết lập ẩn/hiện cột này trên trình duyệt của riêng bạn cho các lần làm việc tiếp theo.

---

## 5. XUẤT FILE BÁO CÁO EXCEL (EXPORT TO EXCEL)

Hệ thống cho phép xuất toàn bộ dữ liệu đang hiển thị ra file Excel phục vụ cho kế toán đối soát hoặc lưu trữ ngoại tuyến.

* **Cách thực hiện:** Bấm nút **[Xuất File / Excel]** ở góc trên bên phải bảng.
* **Lưu ý quan trọng:**
  1. Nếu bạn đang áp dụng bộ lọc (ví dụ: chỉ lọc đơn đã hủy trong tháng 5), file Excel tải về sẽ chỉ chứa đúng danh sách đơn hàng đã hủy trong tháng 5 đó.
  2. Thời gian tải file tùy thuộc vào số lượng dữ liệu lớn hay nhỏ.
  3. Quyền xuất file Excel có thể bị giới hạn tùy theo vai trò nhân sự do Admin phân quyền (để chống thất thoát thông tin khách hàng).

---

## 6. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Bảng dữ liệu trống trơn "Không tìm thấy kết quả"
* **Hiện tượng:** Bạn truy cập trang Đơn hàng hoặc Khách hàng nhưng bảng không hiện dòng nào, chỉ có thông báo trống.
* **Nguyên nhân:** Có thể bạn đang để bộ lọc thời gian quá ngắn (ví dụ: hôm nay không có đơn nào) hoặc ô Tìm kiếm của bạn đang chứa ký tự gõ thừa/dấu cách ẩn từ lần tìm trước.
* **Cách xử lý:**
  1. Kiểm tra lại ô tìm kiếm, xóa sạch các chữ và bấm nút xóa `x` nếu có.
  2. Bấm nút **[Reset bộ lọc]** hoặc chỉnh lại Bộ lọc thời gian thành **[Tháng này]** hoặc **[Tất cả thời gian]** để hiển thị lại dữ liệu.

### Tình huống 2: Bấm nút xuất Excel nhưng không thấy file tải về
* **Hiện tượng:** Bạn bấm xuất Excel, trình duyệt chạy vòng tròn xoay nhưng không có file lưu về máy.
* **Nguyên nhân:** Trình duyệt web của bạn đang bật tính năng **Chặn cửa sổ bật lên (Pop-up Blocked)** nên đã chặn đường link tải file tự động.
* **Cách xử lý:**
  1. Nhìn lên góc thanh địa chỉ trình duyệt, click vào biểu tượng ô vuông có dấu nhân đỏ báo chặn Pop-up.
  2. Chọn **[Luôn cho phép Pop-up từ oni.vn]** rồi bấm Hoàn tất.
  3. Thực hiện bấm nút xuất Excel lại một lần nữa để tải file thành công.
