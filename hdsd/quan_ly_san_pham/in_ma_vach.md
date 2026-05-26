# HƯỚNG DẪN: THIẾT LẬP VÀ THỰC HIỆN IN MÃ VẠCH (BARCODE)

Để tối ưu hóa tốc độ bán hàng tại quầy POS, việc dán nhãn mã vạch lên từng sản phẩm để quét bằng máy bắn là vô cùng quan trọng. ONI.vn cung cấp công cụ **In mã vạch chuyên nghiệp** cho phép bạn tự thiết kế tem nhãn và thực hiện in hàng loạt ra máy in tem chuyên dụng hoặc giấy in decal A4 thông thường.

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin) hoặc Cửa hàng trưởng (Manager).

---

## 1. QUY TRÌNH THỰC HIỆN
1.  Vào menu **[Sản phẩm]** -> Chọn **[In mã vạch]** (hoặc tích chọn các sản phẩm trong danh sách và bấm nút **[In tem mã vạch]**).
2.  Thiết lập các thông số hiển thị và chọn khổ giấy in (theo hướng dẫn bên dưới).
3.  Nhập số lượng tem nhãn cần in cho từng sản phẩm.
4.  Bấm nút **[Xem trước & In]**.
5.  Hệ thống sẽ mở ra một cửa sổ in của trình duyệt. Bấm **[In (Print)]** để xuất ra máy in tem.
6.  `[HÌNH ẢNH: Giao diện cấu hình In tem mã vạch, highlight khu vực chọn Khổ giấy, các tùy chọn hiển thị và nút "Xem trước & In"]`

---

## 2. GIẢI THÍCH CHI TIẾT CÁC CẤU HÌNH TEM NHÃN (INPUTS SCAN)

Khi bảng cấu hình in mã vạch hiện ra, bạn cần lưu ý rà soát các trường thông tin sau để tem nhãn in ra được đẹp mắt:

### A. Tùy chọn Thông tin hiển thị trên Tem
Tích chọn các ô vuông để bật/tắt thông tin in lên nhãn tem:
*   **[Hiển thị Tên cửa hàng]:** In tên thương hiệu của bạn lên đầu tem nhãn để tăng tính nhận diện chuyên nghiệp.
*   **[Hiển thị Tên sản phẩm]:** Bắt buộc bật để nhân viên dán đúng tem vào chai lọ, hộp sản phẩm.
*   **[Hiển thị Giá bán lẻ]:** In giá tiền lên tem giúp khách hàng dễ dàng xem giá trực tiếp khi chọn hàng trên kệ.
*   **[Hiển thị Mã vạch (Barcode)]:** In hình ảnh thanh mã vạch để máy quét bắn được.

### B. Lựa chọn Khổ giấy in phù hợp với thiết bị
ONI.vn hỗ trợ 2 loại khổ in tem phổ biến nhất thị trường:
1.  **Khổ giấy cuộn chuyên dụng (Máy in nhiệt tem nhãn - ví dụ khổ 35x22mm):** 
    *   Thường là cuộn decal 2 tem hoặc 3 tem một hàng. Phù hợp cho các máy in tem chuyên nghiệp như Xprinter.
2.  **Khổ giấy Decal A4 thông thường (ví dụ giấy Tomy 109, Tomy 110):**
    *   Tận dụng trực tiếp máy in văn phòng A4 thông thường. Giấy Tomy có chia sẵn các ô decal lột dán tiện lợi.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Mã vạch in ra bị mờ hoặc máy quét không thể bắn được
*   **Hiện tượng:** Tem nhãn in ra đầy đủ chữ, nhưng khi cầm máy quét bắn vào mã vạch thì máy không kêu beep và không nhận sản phẩm.
*   **Nguyên nhân:** Có 3 nguyên nhân thường gặp:
    1.  *Khổ in quá nhỏ hoặc độ phân giải máy in thấp:* Làm các vạch đen trắng bị dính vào nhau.
    2.  *Sản phẩm chưa được khai báo Mã vạch:* Ô nhập Barcode của sản phẩm đó trên phần mềm đang bị trống, hệ thống tự lấy mã SKU để sinh mã vạch tạm thời dẫn đến sai lệch.
    3.  *Mực in nhiệt bị mờ:* Đầu in máy in tem bị bám bụi bẩn.
*   **Cách xử lý:** 
    1.  Vào lại chi tiết sản phẩm kiểm tra xem đã điền chuẩn số mã vạch (ví dụ mã EAN-13 hoặc mã vạch tự sinh) chưa.
    2.  Vệ sinh đầu in máy in bằng tăm bông tẩm cồn.
    3.  Trong bảng cấu hình in, điều chỉnh tăng cỡ chữ hoặc chọn khổ tem lớn hơn (ví dụ chuyển từ tem 35x22 sang tem 50x30).

### Tình huống 2: Tem in ra bị lệch lề, mất chữ hoặc nhảy dòng giấy
*   **Hiện tượng:** Khi in ra máy in tem nhiệt cuộn, dòng chữ trên tem bị lệch hẳn sang một bên, hoặc máy in chạy trống vài mét giấy tem mới in được một nhãn.
*   **Nguyên nhân:** Chưa cấu hình đúng kích thước khổ tem trong Driver của máy in trên máy tính (lỗi lệt Page Size).
*   **Cách xử lý:**
    1.  Khi bảng in của trình duyệt hiện ra, bấm vào mục **[Cài đặt khác (More settings)]**.
    2.  Tại dòng **[Khổ giấy (Paper size)]**, chọn đúng tên kích thước tem cuộn thực tế đang lắp trong máy in (ví dụ: *User Defined* hoặc *35x22mm*).
    3.  Tại dòng **[Tỷ lệ (Scale)]**, chọn chế độ **[Vừa khít trang (Fit to page)]** hoặc nhập tỷ lệ thủ công `100%`.
    4.  Thực hiện in thử 1 hàng tem trước để đối chiếu lề trước khi bấm in hàng loạt.
