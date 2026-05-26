# HƯỚNG DẪN: QUY TRÌNH QUẢN LÝ NGƯỜI DÙNG & THÀNH VIÊN (TEAM MANAGEMENT)

Để mở rộng quy mô vận hành, Chủ doanh nghiệp (Owner) hoặc Giám đốc điều hành (Admin) có thể thêm nhân sự mới vào hệ thống, phân công vai trò rõ ràng và chỉ định chi nhánh làm việc cụ thể.

---

## 1. QUY TRÌNH THÊM MỚI THÀNH VIÊN

Chỉ tài khoản Chủ sở hữu (Owner) hoặc Giám đốc (Admin) mới có quyền truy cập tính năng này.

### Các bước thực hiện:
1. Đăng nhập hệ thống, từ Control Plane hoặc Dashboard tổ chức -> Chọn mục **[Thành viên / Team]** trên thanh menu bên trái.
2. Bấm nút **[Thêm thành viên]** màu xanh dương ở góc trên bên phải.
3. **Lựa chọn Loại tài khoản (Tab Toggle):**
   * **Tab [Tài khoản workspace]:** Thích hợp tạo nhanh tài khoản nội bộ dạng tên viết tắt cho nhân viên (không cần email).
   * **Tab [Email cá nhân]:** Thích hợp mời nhân sự dùng địa chỉ email cá nhân riêng của họ để đăng nhập.
4. **Các trường thông tin cần nhập (Inputs Scan) trên Form:**
   * **Ô nhập [Tên đăng nhập *]** (Chỉ hiển thị ở tab Workspace): Điền tên tài khoản viết liền không dấu, số, hoặc dấu gạch dưới (ví dụ: `hoang_cashier`).
   * **Ô nhập [Email cá nhân *]** (Chỉ hiển thị ở tab Email): Điền email chính chủ của nhân viên (ví dụ: `hoang@gmail.com`).
   * **Ô nhập [Tên hiển thị (Tùy chọn)]:** Điền họ tên đầy đủ của nhân viên (ví dụ: *"Nguyễn Huy Hoàng"*).
   * **Ô nhập [Mật khẩu *]:** Nhập mật khẩu ban đầu cấp cho nhân viên (tối thiểu 6 ký tự). Bấm biểu tượng Con mắt để kiểm tra ký tự đã gõ.
   * **Hộp chọn [Vai trò & phạm vi *]:** Tích chọn 1 trong các vai trò hệ thống:
     * *Chủ sở hữu (Owner)*: Toàn quyền tối cao hệ thống.
     * *Giám đốc (Admin)*: Quản trị nhân sự, tạo chi nhánh, danh mục sản phẩm.
     * *Nhân viên Thu ngân (Staff)*: Chỉ được bán hàng POS và xem CRM tại chi nhánh phân công.
     * *Cổ đông / Giám sát (Viewer)*: Chỉ xem số liệu báo cáo chi nhánh ở chế độ đọc.
   * **Hộp chọn [Chi nhánh được phân công *]:** (Chỉ hiển thị nếu bạn chọn vai trò *Nhân viên Thu ngân - Staff* hoặc *Giám sát - Viewer*) Chọn chi nhánh cụ thể từ danh sách để giới hạn phạm vi làm việc của nhân viên đó.
5. Bấm nút **[Thêm thành viên]**.
6. Hệ thống sẽ tạo tài khoản và gửi thông báo tích xanh: *"Đã thêm thành viên thành công"*. Nhân viên của bạn có thể sử dụng thông tin này để đăng nhập ngay lập tức.

`[HÌNH ẢNH: Form Thêm thành viên mới, highlight các tab Workspace/Email cá nhân, các trường nhập liệu và phân công chi nhánh làm việc]`

---

## 2. QUY TRÌNH PHÂN QUYỀN LẠI VÀ ĐẶT LẠI MẬT KHẨU NHÂN VIÊN

Admin có thể sửa quyền hạn hoặc đặt lại mật khẩu cho nhân sự bất kỳ lúc nào ngay trên bảng danh sách.

### Thay đổi vai trò / chi nhánh của nhân viên:
1. Tại bảng danh sách Thành viên, tìm đến dòng nhân sự cần sửa -> Bấm nút **[Phân quyền]**.
2. **Thao tác trên Modal:** Chọn lại Vai trò mới hoặc chọn lại Chi nhánh làm việc được chỉ định.
3. Bấm **[Cập nhật]**. Hệ thống sẽ áp dụng quyền hạn mới ngay lập tức cho tài khoản đó ở phiên làm việc tiếp theo.

### Đặt lại mật khẩu cho nhân viên (chỉ dành cho tài khoản Workspace):
1. Tìm đến dòng nhân sự cần đổi mật khẩu -> Bấm nút **[Mật khẩu]**.
2. **Ô nhập [Mật khẩu mới *]:** Điền mật khẩu mới (tối thiểu 6 ký tự).
3. Bấm nút **[Đặt lại mật khẩu]**. Admin gửi mật khẩu mới này cho nhân viên đăng nhập.

### Xóa thành viên ra khỏi hệ thống:
1. Bấm nút **[Xóa]** trên dòng thành viên tương ứng.
2. Một hộp thoại cảnh báo hiện ra: *"Hành động này không thể hoàn tác"*. Bấm nút **[Xóa thành viên]** màu đỏ để xác nhận trục xuất tài khoản ra khỏi Workspace.

`[HÌNH ẢNH: Hộp thoại xác nhận xóa thành viên với nút Xóa màu đỏ]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Báo lỗi "Tên đăng nhập đã tồn tại" hoặc "Email đã được mời"
* **Hiện tượng:** Bạn bấm tạo thành viên nhưng hệ thống báo lỗi đỏ và không lưu được.
* **Nguyên nhân:** Tên đăng nhập (ví dụ: `hoang_cashier`) hoặc email cá nhân đó đã được sử dụng để đăng ký hoặc mời cho một thành viên khác trong hệ thống của bạn trước đó.
* **Cách xử lý:** 
  1. Kiểm tra lại danh sách thành viên hiện tại xem người này đã có tài khoản chưa.
  2. Nếu trùng tên đăng nhập, hãy thêm số hoặc ký tự viết tắt vào sau tên đăng nhập (ví dụ đổi thành `hoang_cashier_q1` hoặc `hoangnh2026`).

### Tình huống 2: Nhân viên đăng nhập vào báo lỗi "Không có quyền truy cập chi nhánh nào"
* **Hiện tượng:** Nhân viên đăng nhập thành công nhưng màn hình trống trơn và không thể click chọn chi nhánh để làm việc.
* **Nguyên nhân:** Khi phân quyền nhân viên dưới vai trò *Nhân viên Thu ngân (Staff)*, Admin đã bỏ trống không chọn trường **[Chi nhánh được phân công]** trên form, khiến tài khoản của họ không được gán vào bất kỳ điểm bán hàng vật lý nào.
* **Cách xử lý:**
  1. Admin truy cập danh sách thành viên, bấm nút **[Phân quyền]** trên tài khoản nhân viên đó.
  2. Tại ô **Chi nhánh làm việc**, chọn đúng chi nhánh (ví dụ: *Chi nhánh Quận 1*) từ danh mục thả xuống.
  3. Bấm **[Cập nhật]**. Yêu cầu nhân viên bấm phím F5 tải lại trang để bắt đầu bán hàng bình thường.
