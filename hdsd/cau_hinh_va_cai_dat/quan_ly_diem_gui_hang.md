# HƯỚNG DẪN: QUẢN LÝ ĐIỂM GỬI HÀNG & CHI NHÁNH (SHOP BRANCHES)

Trong hệ thống ONI.vn, mỗi cửa hàng vật lý hoặc kho hàng độc lập được quản lý dưới dạng một **Chi nhánh / Điểm gửi hàng (Shops / Branches)**. Việc thiết lập đúng thông tin chi nhánh giúp tối ưu hóa việc phân chia dữ liệu tồn kho, gán ca nhân viên và tự động hóa in hóa đơn chính xác.

---

## 1. QUY TRÌNH THỰC HIỆN CẬP NHẬT THÔNG TIN CHI NHÁNH

Để chỉnh sửa thông tin của chi nhánh hiện tại (Tên hiển thị, Địa chỉ giao nhận, Số điện thoại liên hệ):

### Các bước thực hiện:
1. Đăng nhập vào chi nhánh cần cấu hình -> Click chọn mục **[Cấu hình và Cài đặt]** -> **[Cấu hình chi nhánh]** trên thanh menu bên trái.
2. Tìm đến mục đầu tiên: **[Thông tin cơ bản]**.
3. **Các trường thông tin cần nhập (Inputs Scan):**
   * **Ô nhập [Tên chi nhánh *]:** Nhập tên cửa hàng cụ thể (ví dụ: *"Cà Phê Minh - Chi nhánh Quận 1"*). Tên này sẽ hiển thị ở tiêu đề thanh Sidebar bên trái và in lên đầu hóa đơn POS.
   * **Ô nhập [Địa chỉ *]:** Điền địa chỉ vật lý chính xác của chi nhánh. Đây cũng là địa chỉ làm căn cứ tính phí ship khi kết nối với các đối tác vận chuyển (GHTK/GHN) và in trên bill thanh toán.
   * **Ô nhập [Số điện thoại *]:** Số hotline liên hệ riêng của chi nhánh để khách gọi khi cần hỗ trợ hoặc shipper liên hệ lấy hàng.
4. Bấm nút **[Lưu thay đổi]** ở góc dưới cùng bên trái. Hệ thống hiển thị dòng chữ xanh lá: *"Đã lưu cấu hình chi nhánh!"*.

`[HÌNH ẢNH: Khung Cấu hình Thông tin cơ bản chi nhánh gồm Tên chi nhánh, Địa chỉ, Số điện thoại và nút Lưu thay đổi]`

---

## 2. QUY TRÌNH THÊM MỚI CHI NHÁNH TRÊN TỔ CHỨC (CONTROL PLANE)

Chỉ có tài khoản **Chủ sở hữu (Owner)** mới có quyền tạo thêm chi nhánh mới cho tổ chức.

### Các bước thực hiện:
1. Nhấp vào selector Chi nhánh ở đầu menu bên trái -> Chọn **[Chi nhánh mới]** (hoặc vào Control Plane `/dashboard` -> chọn mục **[Chi nhánh]** -> bấm **[Tạo chi nhánh mới]**).
2. **Các trường thông tin cần nhập (Inputs Scan) trên Modal:**
   * **Ô nhập [Tên chi nhánh *]:** VD: *Chi nhánh Quận 3*.
   * **Ô nhập [Slug *]:** Tên viết tắt không dấu tự sinh dạng `chi-nhanh-quan-3` dùng để làm đường dẫn URL truy cập nhanh (ví dụ: `capheminh.oni.vn/t/capheminh/chi-nhanh-quan-3`).
   * **Ô nhập [Địa chỉ (Tùy chọn)]:** Địa chỉ vật lý của chi nhánh mới.
3. Bấm nút **[Tạo chi nhánh]**.
4. Hệ thống khởi tạo nhanh hạ tầng dữ liệu kho và quầy POS trống cho chi nhánh mới này và tự động chuyển bạn sang chi nhánh vừa tạo để thiết lập.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Nhân viên tự sửa thông tin địa chỉ chi nhánh nhưng không lưu được
* **Hiện tượng:** Nút "Lưu thay đổi" bị mờ (disable) hoặc bấm vào báo lỗi quyền hạn đỏ.
* **Nguyên nhân:** Tài khoản đăng nhập chỉ mang vai trò *Nhân viên Thu ngân (Staff)* hoặc *Giám sát (Viewer)*. Hệ thống chỉ cho phép tài khoản Owner hoặc Admin chỉnh sửa các cấu hình hạ tầng chi nhánh nhằm tránh rủi ro nhân viên sửa sai thông tin liên hệ/in hóa đơn.
* **Cách xử lý:** 
  1. Liên hệ với Quản lý chuỗi hoặc Chủ cửa hàng để thực hiện cập nhật thông tin địa chỉ/hotline mới.

### Tình huống 2: Đẩy đơn vận chuyển hệ thống báo lỗi "Địa chỉ lấy hàng không hợp lệ"
* **Hiện tượng:** Khi nhân viên quầy đẩy đơn sang đơn vị giao hàng GHTK/GHN, hệ thống báo lỗi không kết nối được dịch vụ.
* **Nguyên nhân:** Địa chỉ chi nhánh của bạn đang để trống, viết quá chung chung (ví dụ chỉ ghi *"Quận 1, TP.HCM"*) hoặc sai chính tả, khiến API của bên vận chuyển không định vị được điểm lấy hàng để tính phí ship.
* **Cách xử lý:**
  1. Vào lại mục Cấu hình chi nhánh -> Thông tin cơ bản.
  2. Cập nhật lại ô **[Địa chỉ]** chi tiết gồm: *Số nhà, Tên đường, Phường/Xã, Quận/Huyện, Tỉnh/Thành phố* chính xác.
  3. Bấm **[Lưu thay đổi]** và thực hiện đẩy lại đơn hàng bên POS.
