# HƯỚNG DẪN: TÌM KIẾM ĐƠN HÀNG NÂNG CAO & XUẤT FILE EXCEL ĐỐI SOÁT

Để phục vụ công tác đối soát doanh thu cuối ngày, báo cáo thuế cuối tháng và phân tích hiệu quả bán hàng, ONI.vn cung cấp công cụ **Tìm kiếm đơn hàng nâng cao** kết hợp tính năng **Xuất dữ liệu ra file Excel** cực kỳ mạnh mẽ và nhanh chóng.

*   **Ai được quyền sử dụng:** Chủ doanh nghiệp (Owner), Giám đốc (Admin), Giám đốc chi nhánh (Manager) hoặc Kế toán trưởng (`orders.view` và `reports.view`).

---

## 1. QUY TRÌNH THỰC HIỆN TÌM KIẾM & XUẤT EXCEL
1.  Truy cập vào menu **[Đơn hàng]** trên bảng quản trị nghiệp vụ.
2.  Sử dụng các thanh bộ lọc thông minh để giới hạn danh sách đơn hàng cần xuất (theo hướng dẫn bên dưới).
3.  Bấm vào nút **[Xuất Excel (Export Excel)]** ở góc trên danh sách đơn.
4.  Hệ thống sẽ lập tức xử lý và tải xuống máy tính của bạn 1 file Excel chứa đầy đủ thông tin chi tiết của các đơn hàng thỏa mãn bộ lọc.
5.  `[HÌNH ẢNH: Giao diện danh sách Đơn hàng, highlight các nút bộ lọc Thời gian, Nhân viên và nút "Xuất Excel" màu xanh lá]`

---

## 2. GIẢI THÍCH CÁC BỘ LỌC THÔNG MINH (INPUTS SCAN)

Để tìm kiếm chính xác các đơn hàng cần xuất, bạn cần tận dụng các công cụ lọc trực quan sau:

### A. Bộ lọc Thời gian (Date Range Picker)
*   Click vào ô chọn ngày để chọn các khoảng thời gian có sẵn: *Hôm nay, Hôm qua, 7 ngày qua, 30 ngày qua, Tháng này, Tháng trước*.
*   Hoặc click chọn **[Khoảng ngày tự chọn]** để thiết lập khoảng thời gian cụ thể (ví dụ: *từ ngày 01/05/2026 đến ngày 15/05/2026*).

### B. Các hộp chọn lọc nâng cao (Select Filters)
*   **Hộp chọn [Trạng thái đơn]:** Lọc theo các trạng thái Hoàn thành (completed), Đang xử lý (processing), Chờ duyệt (confirmed), Đã hủy (cancelled), hoặc Trả hàng (refunded).
*   **Hộp chọn [Chi nhánh / Cửa hàng]:** Dành cho Admin muốn xem đơn hàng của một chi nhánh cụ thể hoặc tất cả các chi nhánh.
*   **Hộp chọn [Nhân viên bán hàng]:** Xem doanh số của một nhân viên cụ thể để đối soát doanh số tính hoa hồng.
*   **Hộp chọn [Kênh bán hàng]:** Lọc đơn bán trực tiếp tại quầy (`pos`) hoặc khách đặt qua (`online`, `Zalo`, `Facebook`).

### C. Ô tìm kiếm nhanh (Search Box)
*   Gõ mã đơn hàng (ví dụ: `ORD-2026-0005`), Số điện thoại khách hàng, hoặc Tên khách hàng để hệ thống truy vết tức thì trong vòng 1 giây.

---

## 3. CƠ CẤU FILE EXCEL ĐỐI SOÁT XUẤT RA

File Excel tải xuống được thiết kế chuẩn hóa cho kế toán sử dụng trực tiếp:
*   **Tab 1 (Hóa đơn tổng):** Chứa các cột Mã đơn, Ngày bán, Khách hàng, Trạng thái, Phương thức thanh toán, Tổng tiền hàng, Giảm giá, Thuế, Phí ship, Tổng thanh toán thực tế, Tiền khách đã trả, Tiền còn nợ, Nhân viên bán.
*   **Tab 2 (Chi tiết dòng sản phẩm - Order Items):** Bóc tách chi tiết từng sản phẩm bán ra của mỗi đơn hàng gồm: Tên sản phẩm, Mã SKU, Đơn vị tính, Số lượng bán, Đơn giá vốn, Đơn giá bán, Tổng tiền dòng sản phẩm. Giúp kiểm kho và tính toán giá vốn chính xác.

---

## 4. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Bấm nút Xuất Excel nhưng không thấy file tải xuống máy tính
*   **Hiện tượng:** Bạn click vào nút Xuất Excel, hệ thống báo *"Đang xuất dữ liệu..."* rồi tắt đi nhưng không thấy file Excel nào lưu vào máy.
*   **Nguyên nhân:** Có 2 nguyên nhân thường gặp:
    1.  *Trình duyệt chặn cửa sổ Pop-up tự động tải xuống:* Trình duyệt Chrome/Safari đang bật chế độ bảo mật chặn các file tự động download.
    2.  *Dữ liệu xuất quá lớn:* Bạn chọn khoảng thời gian quá dài (ví dụ cả năm) với hàng chục ngàn đơn hàng vượt quá giới hạn xử lý tức thời của trình duyệt.
*   **Cách xử lý:**
    1.  Nhìn lên thanh địa chỉ của trình duyệt, kiểm tra xem có biểu tượng dấu nhân đỏ báo chặn tải xuống (Pop-up blocked) không. Click vào chọn **[Luôn cho phép tải xuống từ trang web này]**.
    2.  Nếu dữ liệu quá lớn, hãy chia nhỏ khoảng ngày để xuất (ví dụ: xuất theo từng tháng hoặc từng tuần) để đảm bảo file Excel tải xuống nhanh chóng và không bị lỗi đầy bộ nhớ.
