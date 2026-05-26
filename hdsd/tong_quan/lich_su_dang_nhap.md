# HƯỚNG DẪN: THEO DÕI NHẬT KÝ LỊCH SỬ ĐĂNG NHẬP

Để bảo vệ an toàn cho dữ liệu bán hàng và tài chính của cửa hàng, ONI.vn tự động ghi chép nhật ký của mọi lượt đăng nhập vào hệ thống. Việc này giúp bạn kiểm soát việc truy cập, phát hiện sớm các truy cập lạ từ người ngoài.

---

## 1. QUY TRÌNH TRA CỨU LỊCH SỬ ĐĂNG NHẬP

Mỗi tài khoản cá nhân (cả nhân viên và chủ cửa hàng) đều có thể tự xem nhật ký đăng nhập của chính mình.

### Các bước thực hiện:
1. Đăng nhập vào hệ thống, click vào **Ảnh đại diện** ở góc trên bên phải màn hình -> Chọn mục **[Tài khoản của tôi]** (hoặc truy cập đường dẫn `/account`).
2. Nhìn vào thanh menu phụ của mục tài khoản (hoặc kéo xuống chân trang), click vào mục **[Lịch sử đăng nhập]**.
3. **Các thông tin hiển thị trên bảng Nhật ký (Inputs & Fields Scan):**
   * **Cột [Thời gian]:** Ngày và giờ chính xác phát sinh lượt đăng nhập (ví dụ: `26/05/2026 10:15:30`).
   * **Cột [Thiết bị & Hệ điều hành]:** Nhận diện thiết bị bạn dùng (ví dụ: *Macintosh / Windows PC / iPhone / Samsung*).
   * **Cột [Trình duyệt]:** Trình duyệt web thực hiện truy cập (ví dụ: *Chrome 124, Safari, Edge*).
   * **Cột [Địa chỉ IP]:** Địa chỉ mạng internet tại nơi đăng nhập (ví dụ: `14.232.245.89`).
   * **Cột [Địa điểm dự kiến]:** Tỉnh/Thành phố phát hiện dựa trên địa chỉ IP (ví dụ: *Hà Nội, Việt Nam*).
   * **Cột [Trạng thái]:** 
     * **[Thành công]** (Chữ xanh lá): Nhập đúng tài khoản mật khẩu và vào hệ thống.
     * **[Thất bại]** (Chữ đỏ): Nhập sai mật khẩu hoặc xác thực 2FA thất bại.

`[HÌNH ẢNH: Bảng lịch sử đăng nhập hiển thị chi tiết IP, thiết bị, trình duyệt và trạng thái đăng nhập]`

---

## 2. HÀNH ĐỘNG KHẨN CẤP KHI PHÁT HIỆN LƯỢT ĐĂNG NHẬP BẤT THƯỜNG

Nếu bạn thấy xuất hiện thiết bị lạ (ví dụ: bạn chỉ dùng iPhone nhưng nhật ký báo có máy Android đăng nhập thành công) hoặc vị trí địa lý lạ (ở tỉnh khác đăng nhập):

### Các bước xử lý ngay lập tức (Failed Cases):
1. **Đổi mật khẩu ngay lập tức:** Truy cập ngay tab **[Đổi mật khẩu]** trên cùng giao diện tài khoản, đặt một mật khẩu mới hoàn toàn khác mật khẩu cũ.
2. **Kích hoạt bảo mật 2 lớp (2FA):** Nếu tài khoản chưa bật 2 yếu tố, hãy thực hiện bật ngay theo Hướng dẫn 2FA để kẻ xấu dù biết mật khẩu cũng không thể vào được hệ thống.
3. **Đăng xuất khỏi tất cả các thiết bị:** Bấm nút **[Đăng xuất tất cả thiết bị khác]** ở dưới cùng bảng nhật ký lịch sử để buộc hệ thống hủy bỏ phiên làm việc của kẻ gian đang truy cập trái phép.
4. **Báo cáo Admin:** Báo cho Chủ cửa hàng hoặc Quản trị viên để họ rà soát lại nhật ký hoạt động bán hàng/kho xem tài khoản của bạn có bị thực hiện hành vi gian lận nào không.
