# HƯỚNG DẪN: KẾT NỐI ĐỐI TÁC VẬN CHUYỂN & ĐẨY ĐƠN GIAO HÀNG TỰ ĐỘNG

Đối với các đơn hàng bán online hoặc khách hàng yêu cầu ship tận nhà, việc tích hợp trực tiếp với các đơn vị giao hàng giúp bạn tính toán phí ship chính xác theo khoảng cách/trọng lượng và đẩy đơn vận chuyển tự động chỉ bằng một cú click chuột mà không cần copy paste thông tin sang app ngoài.

ONI.vn hỗ trợ kết nối trực tiếp với các hãng vận chuyển phổ biến nhất: **Giao Hàng Nhanh (GHN), Giao Hàng Tiết Kiệm (GHTK), Viettel Post...**

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin) hoặc Kế toán trưởng.

---

## 1. QUY TRÌNH THIẾT LẬP KẾT NỐI ĐỐI TÁC
Để kích hoạt tính năng đẩy đơn giao vận tự động:
1.  Vào menu **[Cài đặt]** -> Chọn **[Đối tác vận chuyển]**.
2.  Bấm chọn đối tác muốn kết nối (ví dụ: *Giao Hàng Nhanh*).
3.  **Các trường thông tin cấu hình (Inputs Scan):**
    *   **Ô nhập [Mã API Token *]:** Lấy mã khóa API bảo mật từ trang quản trị của tài khoản GHN/GHTK của bạn dán vào đây để liên kết hai hệ thống.
    *   **Ô nhập [Mã cửa hàng (Client ID / Shop ID)]:** Điền mã định danh shop vận chuyển của bạn.
    *   **Hộp chọn [Hình thức thanh toán phí ship]:** Chọn *[Shop trả tiền ship]* (bằng tài khoản GHN cấn trừ ví) hoặc *[Khách trả tiền ship khi nhận hàng]*.
4.  Bấm **[Kiểm tra & Kết nối]**. Khi trạng thái báo **[Đã kết nối (Connected)]**, tính năng đẩy đơn đã sẵn sàng hoạt động.
5.  `[HÌNH ẢNH: Giao diện kết nối API hãng vận chuyển Giao Hàng Nhanh, highlight ô nhập "Mã API Token" và nút "Kiểm tra & Kết nối"]`

---

## 2. QUY TRÌNH ĐẨY ĐƠN GIAO HÀNG TỪ HÓA ĐƠN BÁN
Khi có đơn hàng cần giao đi:
1.  Vào menu **[Đơn hàng]** -> Chọn đơn hàng cần giao đi đang ở trạng thái *[Đã xác nhận (Confirmed)]*.
2.  Bấm nút **[Giao hàng / Đẩy vận chuyển]**.
3.  **Bảng thông tin giao hàng hiện ra (Inputs Scan):**
    *   **Ô nhập [Họ tên & SĐT người nhận]:** Hệ thống tự điền từ hồ sơ khách đặt mua.
    *   **Ô nhập [Địa chỉ chi tiết]:** Điền số nhà, tên đường.
    *   **Hộp chọn [Tỉnh/Thành phố, Quận/Huyện, Phường/Xã]:** Chọn chính xác để hệ thống tính phí ship.
    *   **Ô nhập [Trọng lượng (Gram) *]:** Hệ thống tự động cộng dồn trọng lượng của các sản phẩm có trong giỏ hàng (khai báo lúc tạo sản phẩm). Bạn có thể điều chỉnh lại nếu đóng hộp to nặng hơn.
    *   **Hộp chọn [Đơn vị vận chuyển]:** Chọn hãng vận chuyển (ví dụ chọn *GHN*). Hệ thống sẽ tự động gọi API sang GHN để hiển thị các mức giá ship và thời gian giao dự kiến.
    *   **Hộp chọn [Gói dịch vụ]:** Chọn *Giao nhanh* hoặc *Giao tiết kiệm*.
    *   **Ô nhập [Tiền thu hộ COD]:** Hệ thống tự điền bằng số tiền khách còn nợ của hóa đơn.
4.  Bấm nút **[Tạo vận đơn chính thức]**.
    *   **Side-effect tự động:** 
        1.  Thông tin đơn hàng lập tức được đồng bộ sang hệ thống của GHN/GHTK.
        2.  Hệ thống ONI tự động trả về **Mã vận đơn** (ví dụ: `GHN123456789`) và nút **[In nhãn giao hàng]** để dán lên thùng hàng.
        3.  Bưu tá của hãng sẽ tự động nhận được thông báo lịch đến cửa hàng của bạn để lấy hàng đi giao.
5.  `[HÌNH ẢNH: Bảng thông tin tạo vận đơn, highlight các cột chọn nhà vận chuyển, dòng hiển thị Giá cước cấn trừ tự động và nút "Tạo vận đơn chính thức"]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Hệ thống báo lỗi "Không tìm thấy gói cước hoặc địa chỉ người nhận không hợp lệ"
*   **Hiện tượng:** Bạn điền đầy đủ thông tin địa chỉ khách nhưng khi chọn đơn vị vận chuyển thì hệ thống hiện cảnh báo lỗi đỏ và không hiển thị bảng giá ship.
*   **Nguyên nhân:** Tên Phường/Xã hoặc Quận/Huyện bạn nhập thủ công bằng tay không khớp với danh mục địa chính chuẩn trong cơ sở dữ liệu của hãng vận chuyển.
*   **Cách xử lý:** 
    1.  Không tự ý gõ tay hoàn toàn địa chỉ.
    2.  Hãy sử dụng hộp chọn thả xuống (Select Box) cấp Tỉnh/Thành -> Quận/Huyện -> Phường/Xã do hệ thống cung cấp sẵn để đảm bảo định dạng địa chỉ trùng khớp 100% với danh mục của GHN/GHTK.

### Tình huống 2: Tiền cước ship thực tế bị bưu tá tính đắt hơn nhiều so với hệ thống tính trước
*   **Hiện tượng:** Phần mềm tính cước ship đơn hàng là 22.000đ, nhưng khi bưu tá đến lấy hàng đo đạc và tính phí trên app hãng lại báo cước là 45.000đ.
*   **Nguyên nhân:** Trọng lượng sản phẩm trong đơn hàng chưa được khai báo (đang để bằng 0g) hoặc kích thước thùng hàng đóng gói thực tế cồng kềnh vượt quá quy chuẩn trọng lượng quy đổi thể tích của hãng.
*   **Cách xử lý:** 
    1.  Vào lại danh mục sản phẩm, kiểm tra và khai báo chính xác ô **[Trọng lượng (Gram)]** của sản phẩm.
    2.  Lưu ý bưu tá tính phí dựa trên nguyên tắc: `Trọng lượng tính cước = Giá trị lớn nhất giữa Cân nặng thực tế và Cân nặng quy đổi thể tích (Dài x Rộng x Cao / 5000)`. Khi đóng gói các mặt hàng cồng kềnh (ví dụ như gấu bông, hộp xốp), bạn cần tự đo và điền số Gram quy đổi thể tích lớn hơn vào ô trọng lượng trước khi bấm tạo vận đơn.
