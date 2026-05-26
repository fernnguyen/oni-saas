# HƯỚNG DẪN: QUY TRÌNH ĐỔI MẬT KHẨU & CÀI ĐẶT BẢO MẬT 2FA

Để bảo vệ tài khoản của bạn trước các nguy cơ xâm nhập trái phép, ONI.vn cung cấp bảng cấu hình bảo mật cá nhân, cho phép tự đổi mật khẩu và kích hoạt bảo mật 2 lớp (2FA) nâng cao.

---

## 1. QUY TRÌNH ĐỔI MẬT KHẨU CÁ NHÂN

Tính năng này giúp bạn cập nhật mật khẩu định kỳ để nâng cao tính bảo mật.

### Các bước thực hiện:
1. Đăng nhập vào hệ thống, click vào **Ảnh đại diện** ở góc trên cùng bên phải màn hình -> Chọn mục **[Tài khoản của tôi]** (hoặc truy cập đường dẫn `/account`).
2. Kéo xuống phần **[Đổi mật khẩu]**.
3. **Các trường thông tin cần nhập (Inputs Scan):**
   * **Ô nhập [Mật khẩu hiện tại *]:** Điền mật khẩu bạn đang dùng để đăng nhập.
   * **Ô nhập [Mật khẩu mới *]:** Nhập mật khẩu mới mong muốn (yêu cầu bảo mật: tối thiểu 8 ký tự).
   * **Ô nhập [Xác nhận mật khẩu mới *]:** Nhập lại chính xác mật khẩu mới ở trên.
   * **Ô nhập [Mã xác thực 2FA]:** (Chỉ hiển thị nếu tài khoản của bạn đã kích hoạt bảo mật 2 lớp) Nhập mã OTP 6 số hiện tại trên điện thoại.
4. Bấm nút **[Cập nhật mật khẩu]** (màu xanh dương).
5. Khi hệ thống báo chữ xanh lá: *"Mật khẩu đã được cập nhật"* là bạn đã đổi mật khẩu thành công. Các lần đăng nhập sau sẽ dùng mật khẩu mới này.

`[HÌNH ẢNH: Form Đổi mật khẩu cá nhân với các trường Mật khẩu hiện tại, Mật khẩu mới, Xác nhận mật khẩu mới và nút Cập nhật mật khẩu]`

---

## 2. QUY TRÌNH KÍCH HOẠT BẢO MẬT 2 LỚP (2FA - RECOMMEND)

Bảo mật 2 lớp giúp tài khoản của bạn an toàn tuyệt đối. Khi đăng nhập, ngoài mật khẩu thông thường, hệ thống sẽ yêu cầu thêm một mã số gồm 6 chữ số thay đổi liên tục mỗi 30 giây trên ứng dụng điện thoại của bạn.

### Các bước kích hoạt:
1. Tại trang **[Tài khoản của tôi]**, quan sát cột bên phải mục **[Xác thực 2 yếu tố]**. Bấm nút **[Bật xác thực 2FA]**.
2. **Xác minh danh tính:** Nhập **Mật khẩu hiện tại** của bạn và bấm **[Tiếp tục]**.
3. **Quét mã QR để liên kết:**
   * Hệ thống sẽ hiển thị một **Mã QR hình vuông** trên màn hình cùng với một dòng **Mã khóa bí mật** (Secret Key) dạng chữ bên dưới.
   * Sử dụng ứng dụng quét OTP trên điện thoại (như *Google Authenticator*, *Microsoft Authenticator* hoặc *Authy*) để quét mã QR này, hoặc tự gõ mã khóa bí mật thủ công vào ứng dụng.
   * Ứng dụng điện thoại sẽ tự động thêm một tài khoản tên `ONI.vn (Email của bạn)` hiển thị mã 6 chữ số thay đổi liên tục.
4. **Kích hoạt:** 
   * **Ô nhập [Mã xác nhận *]:** Gõ mã 6 chữ số đang hiển thị trên ứng dụng điện thoại vào ô này.
   * Bấm nút **[Xác minh & Bật 2FA]**.
5. Giao diện sẽ hiển thị dòng chữ xanh lá: *"✓ 2FA đang hoạt động"*. Từ lần đăng nhập tiếp theo, sau khi nhập mật khẩu, bạn bắt buộc phải nhập mã OTP 6 số trên điện thoại mới có thể vào hệ thống.

`[HÌNH ẢNH: Màn hình quét QR Code và ô điền mã xác nhận 6 số để kích hoạt Bảo mật 2 lớp]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Báo lỗi "Mật khẩu hiện tại không đúng" hoặc "Mật khẩu xác nhận không khớp"
* **Hiện tượng:** Hệ thống báo lỗi đỏ tại ô nhập liệu và không cho đổi mật khẩu.
* **Nguyên nhân:** Bạn nhập sai mật khẩu cũ đang dùng hoặc ô nhập lại mật khẩu mới bị gõ lệch ký tự.
* **Cách xử lý:** 
  1. Hãy gõ từ từ và kiểm tra lại bàn phím xem có đang bật Tiếng Việt (Telex/VNI) khiến chữ bị nhảy ký tự đặc biệt không.
  2. Đảm bảo ô nhập lại mật khẩu mới trùng khớp 100% từng chữ viết hoa, viết thường và chữ số với ô mật khẩu mới ở trên.

### Tình huống 2: Báo lỗi "Mã không đúng. Vui lòng thử lại" khi bật hoặc tắt 2FA
* **Hiện tượng:** Bạn gõ mã 6 số từ ứng dụng điện thoại nhưng hệ thống báo lỗi không hợp lệ.
* **Nguyên nhân:** Thời gian trên điện thoại của bạn và thời gian trên hệ thống máy chủ của ONI.vn bị lệch nhau (dù chỉ lệch 1 phút cũng khiến mã OTP bị từ chối), hoặc bạn nhập mã đã quá 30 giây và ứng dụng đã đổi sang mã mới.
* **Cách xử lý:**
  1. Vào phần Cài đặt trên điện thoại di động của bạn, đảm bảo tính năng **[Đặt thời gian tự động / Automatic Time]** đã được bật để đồng bộ múi giờ thế giới chuẩn.
  2. Đợi mã trên ứng dụng nhảy sang một chu kỳ 30 giây mới (mã chuyển sang màu xanh đầy đủ), gõ thật nhanh 6 số mới và bấm Xác minh ngay.
