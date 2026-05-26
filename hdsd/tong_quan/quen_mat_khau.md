# HƯỚNG DẪN: QUY TRÌNH KHÔI PHỤC MẬT KHẨU KHI BỊ QUÊN (QUÊN MẬT KHẨU)

Khi không thể nhớ được mật khẩu đăng nhập, hệ thống ONI.vn hỗ trợ 2 cơ chế xử lý nhanh chóng tùy thuộc vào chức vụ và vai trò của tài khoản của bạn.

---

## 1. LUỒNG XỬ LÝ 1: DÀNH CHO NHÂN VIÊN (THU NGÂN, THỦ KHO, KẾ TOÁN)

Nhân viên không thể tự khôi phục mật khẩu qua email trên trang đăng nhập chi nhánh nhằm đảm bảo an ninh hệ thống và tránh bị tấn công giả mạo.

### Quy trình thực hiện:
1. Khi bấm nút **[Quên mật khẩu?]** tại trang đăng nhập chi nhánh, hệ thống sẽ hiển thị thông báo toast: *"Vui lòng liên hệ người quản trị của hệ thống để lấy lại mật khẩu"*.
2. Bạn cần liên hệ trực tiếp với **Chủ cửa hàng (Owner)** hoặc **Quản trị viên (Admin)** có quyền quản lý người dùng của cửa hàng.
3. Người quản trị sẽ đăng nhập vào hệ thống, truy cập mục **[Cấu hình và Cài đặt]** -> **[Quản lý người dùng]**.
4. Tìm đến tên tài khoản của bạn, bấm nút **[Chỉnh sửa]** hoặc **[Đặt lại mật khẩu]**.
5. Admin gõ mật khẩu mới trực tiếp (ví dụ: `12345678a`) rồi gửi mật khẩu này cho bạn.
6. Bạn đăng nhập bằng mật khẩu tạm do Admin cấp, sau đó truy cập ngay mục **[Tài khoản của tôi]** để tiến hành đổi lại mật khẩu cá nhân bảo mật theo ý muốn.

---

## 2. LUỒNG XỬ LÝ 2: DÀNH CHO CHỦ DOANH NGHIỆP (OWNER)

Là chủ sở hữu tối cao của Workspace, bạn có thể tự khôi phục mật khẩu qua Email cá nhân đã đăng ký với hệ thống.

### Quy trình thực hiện:
1. Truy cập trang chủ chính của hệ thống tại đường dẫn `https://oni.vn/auth/forgot-password` (hoặc click nút quên mật khẩu trên Control Plane).
2. **Các trường thông tin cần nhập (Inputs Scan):**
   * **Ô nhập [Email đã đăng ký *]:** Điền chính xác địa chỉ email chính chủ lúc bạn đăng ký Workspace.
   * Tích chọn xác thực chống robot **Cloudflare Turnstile** (nếu có).
3. Bấm nút **[Gửi yêu cầu khôi phục]**.
4. Hệ thống sẽ gửi một email tự động có chứa **Đường dẫn đặt lại mật khẩu** vào hộp thư của bạn.
5. Mở email từ ONI.vn, click vào nút **[Đặt lại mật khẩu mới]**.
6. Hệ thống chuyển hướng bạn đến một trang web bảo mật để nhập mật khẩu mới.
7. **Các trường thông tin cần nhập (Inputs Scan) tại trang Đặt lại mật khẩu:**
   * **Ô nhập [Mật khẩu mới *]:** Điền mật khẩu mới (tối thiểu 8 ký tự, nên có cả chữ và số).
   * **Ô nhập [Xác nhận mật khẩu mới *]:** Nhập lại mật khẩu mới ở trên.
8. Bấm nút **[Xác nhận thay đổi]**. Hệ thống sẽ thông báo đặt lại mật khẩu thành công và bạn có thể đăng nhập Workspace bình thường bằng mật khẩu mới này.

`[HÌNH ẢNH: Form gửi yêu cầu quên mật khẩu, highlight ô nhập Email đăng ký và nút Gửi yêu cầu khôi phục]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Chủ doanh nghiệp không nhận được email khôi phục mật khẩu
* **Hiện tượng:** Bạn bấm gửi yêu cầu thành công, hệ thống báo đã gửi email nhưng kiểm tra hộp thư mãi không thấy.
* **Nguyên nhân:** Email bị lọc vào thư mục Spam/Quảng cáo, hoặc bạn đã nhập sai chính tả địa chỉ email của mình lúc gửi yêu cầu.
* **Cách xử lý:** 
  1. Kiểm tra kỹ hòm thư **Spam (Thư rác)** hoặc tab **Promotions (Quảng cáo)** trên Gmail/Outlook.
  2. Quay lại giao diện quên mật khẩu, kiểm tra kỹ từng chữ cái của địa chỉ email xem có bị gõ nhầm không và bấm gửi lại yêu cầu.

### Tình huống 2: Đường dẫn đặt lại mật khẩu trong email bị hết hạn
* **Hiện tượng:** Bạn nhận được email, bấm vào nút đặt lại mật khẩu nhưng trang web hiển thị thông báo lỗi *"Đường dẫn đã hết hạn hoặc không hợp lệ"*.
* **Nguyên nhân:** Đường dẫn khôi phục mật khẩu chỉ có hiệu lực trong vòng **15 - 30 phút** kể từ lúc gửi để đảm bảo an toàn. Nếu bạn bấm quá muộn, liên kết sẽ tự động bị hủy.
* **Cách xử lý:**
  1. Xóa email khôi phục cũ đi để tránh nhầm lẫn.
  2. Thực hiện lại quy trình gửi yêu cầu quên mật khẩu từ đầu để hệ thống sinh ra một liên kết mới.
  3. Mở hòm thư và click kích hoạt đặt lại mật khẩu ngay lập tức.
