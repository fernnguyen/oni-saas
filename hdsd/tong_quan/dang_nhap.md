# HƯỚNG DẪN: QUY TRÌNH ĐĂNG NHẬP HỆ THỐNG ONI.VN

Sau khi đã đăng ký không gian làm việc (Workspace) thành công, bạn và nhân viên của mình cần đăng nhập hệ thống để bắt đầu vận hành. ONI.vn hỗ trợ cơ chế đăng nhập bảo mật đa phương thức thông qua subdomain doanh nghiệp riêng biệt.

---

## 1. QUY TRÌNH THỰC HIỆN ĐĂNG NHẬP

Hệ thống có hai cấp độ đăng nhập chính:

### Bước A: Xác định Không gian làm việc (Subdomain)
1. Truy cập trang đăng nhập chính của hệ thống (ví dụ: `https://oni.vn/login`).
2. **Các trường thông tin cần nhập (Inputs Scan):**
   * **Ô nhập [Subdomain *]:** Gõ địa chỉ viết tắt không dấu của cửa hàng bạn đã đăng ký (ví dụ: gõ `capheminh` thì hệ thống sẽ ghép thành địa chỉ đầy đủ `capheminh.oni.vn`).
3. Bấm nút **[Tiếp tục]**. Hệ thống sẽ tự động chuyển hướng bạn đến giao diện đăng nhập dành riêng cho doanh nghiệp của bạn tại địa chỉ phụ đó.

### Bước B: Nhập thông tin tài khoản cá nhân
Tại trang đăng nhập riêng của cửa hàng bạn (ví dụ: `capheminh.oni.vn`):
1. **Các trường thông tin cần nhập (Inputs Scan):**
   * **Ô nhập [Tên đăng nhập hoặc Email *]:** Điền tên tài khoản nhân viên (được Admin cấp) hoặc địa chỉ Email chính xác của bạn lúc đăng ký.
   * **Ô nhập [Mật khẩu *]:** Điền mật khẩu đăng nhập cá nhân. Bạn có thể bấm vào **[Biểu tượng Con mắt 👁]** ở góc phải ô nhập để hiển thị mật khẩu dạng chữ rõ ràng, giúp tránh gõ nhầm ký tự.
   * **Xác thực bảo mật [Cloudflare Turnstile]**: Tích chọn xác thực chống robot (nếu hệ thống yêu cầu).
2. **Các nút bấm tùy chọn:**
   * **Nút [Tiếp tục với Google]:** Đăng nhập nhanh bằng tài khoản Google liên kết (chỉ khả dụng sau khi tài khoản của bạn đã được Admin gán liên kết Email Google).
   * **Nút [Quên mật khẩu?]:** Hướng dẫn khôi phục mật khẩu nếu lỡ quên.
3. Bấm nút **[Đăng nhập]** (màu xanh dương).
4. Sau khi đăng nhập thành công, nếu tài khoản của bạn đã kích hoạt bảo mật 2 lớp, hệ thống sẽ yêu cầu nhập mã OTP gửi qua ứng dụng xác thực. Nếu không, hệ thống sẽ tự động đưa bạn vào màn hình **Dashboard nghiệp vụ chi nhánh**.

`[HÌNH ẢNH: Form đăng nhập hệ thống tại subdomain riêng, highlight các ô nhập "Tên đăng nhập hoặc Email", "Mật khẩu", nút "Đăng nhập" và nút "Tiếp tục với Google"]`

---

## 2. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Hệ thống báo lỗi đỏ "Vui lòng nhập subdomain workspace" hoặc "Subdomain không tồn tại"
* **Hiện tượng:** Bạn gõ tên subdomain và bấm tiếp tục nhưng hệ thống báo lỗi hoặc đứng im không chuyển hướng.
* **Nguyên nhân:** Bạn đã gõ sai chính tả tên viết tắt của cửa hàng, hoặc cửa hàng của bạn đã bị khóa/tạm ngưng do hết hạn gói cước dịch vụ mà chưa gia hạn.
* **Cách xử lý:**
  1. Kiểm tra lại email kích hoạt lúc đăng ký ban đầu để xác định chính xác tên slug viết tắt (ví dụ: `cafe-minh` thay vì viết liền `cafeminh`).
  2. Đảm bảo không gõ các ký tự đặc biệt, dấu cách hoặc chữ tiếng Việt có dấu vào ô Subdomain.
  3. Liên hệ với Chủ sở hữu (Owner) hoặc bộ phận hỗ trợ kỹ thuật của ONI.vn để kiểm tra tình trạng hoạt động của Workspace tổ chức.

### Tình huống 2: Báo lỗi "Tên đăng nhập/Email hoặc mật khẩu không chính xác"
* **Hiện tượng:** Bạn bấm nút Đăng nhập và hệ thống báo dải chữ đỏ báo lỗi thông tin sai.
* **Nguyên nhân:** Gõ sai địa chỉ email, gõ sai chữ viết hoa/viết thường của mật khẩu hoặc phím Caps Lock trên bàn phím đang bật.
* **Cách xử lý:**
  1. Bấm vào **[Biểu tượng Con mắt 👁]** trong ô mật khẩu để kiểm tra xem mật khẩu đang hiển thị đúng ký tự chưa.
  2. Kiểm tra phím **Caps Lock** trên bàn phím máy tính đã tắt chưa.
  3. Nếu bạn là nhân viên, hãy liên hệ với quản trị viên (Admin) chi nhánh để kiểm tra xem Tên đăng nhập của bạn có bị đổi hoặc viết sai chính tả trên trang Quản lý thành viên hay không.

### Tình huống 3: Báo lỗi "Vui lòng hoàn thành xác thực bảo mật (Turnstile)"
* **Hiện tượng:** Bạn nhập đúng tài khoản mật khẩu nhưng bấm Đăng nhập hệ thống vẫn chặn lại và báo lỗi Turnstile.
* **Nguyên nhân:** Bạn chưa tích chọn ô xác thực robot hoặc kết nối mạng internet của bạn chập chờn khiến mã bảo mật của Cloudflare bị hết hạn.
* **Cách xử lý:**
  1. Bấm tích lại vào ô xác thực robot hình tròn xoay để nhận tích xanh.
  2. Nếu ô xác thực bị lỗi quay vô tận, hãy tải lại trang (nhấn phím F5 hoặc Ctrl+R / Cmd+R) rồi nhập lại thông tin tài khoản từ đầu.
