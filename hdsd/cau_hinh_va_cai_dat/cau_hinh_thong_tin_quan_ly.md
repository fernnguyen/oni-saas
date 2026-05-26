# HƯỚNG DẪN: CẤU HÌNH THÔNG TIN QUẢN LÝ, HÓA ĐƠN & THANH TOÁN (BILL SETTINGS)

Việc thiết lập các thông tin quản lý quy chuẩn giúp hóa đơn in ra chuyên nghiệp, đồng thời tự động hóa phương thức thanh toán chuyển khoản thông minh (VietQR) tại quầy để tránh thất thoát và sai lệch dòng tiền.

---

## 1. QUY TRÌNH THIẾT LẬP THÔNG TIN IN TRÊN HÓA ĐƠN (BILL INFO)

Chỉ có tài khoản **Chủ cửa hàng (Owner)** hoặc **Giám đốc (Admin)** mới có quyền truy cập thay đổi cấu hình này.

### Các bước thực hiện:
1. Đăng nhập hệ thống -> Chọn mục **[Cấu hình và Cài đặt]** -> **[Cấu hình chi nhánh]**.
2. Tìm đến phần **[Thông tin Hóa đơn]**.
3. **Các trường thông tin cần nhập (Inputs Scan):**
   * **Ô nhập [Mã số thuế (Tax ID)]:** Điền mã số thuế của hộ kinh doanh hoặc công ty để hiển thị trên bill thanh toán khi khách yêu cầu thông tin.
   * **Ô nhập [Thông tin Wi-Fi]:** Nhập thông tin mạng Wi-Fi tại quầy theo định dạng `Tên Wifi / Mật khẩu` (ví dụ: `Minh Cafe / caphe999`). Thông tin này sẽ tự động in lên hóa đơn để khách tự kết nối mạng không cần hỏi nhân viên.
   * **Hộp chọn [Ngân hàng nhận thanh toán]:** Click chọn tên Ngân hàng thụ hưởng trong danh mục thả xuống (hệ thống hỗ trợ 100% các ngân hàng Việt Nam như *Vietcombank, Techcombank, BIDV, MBBank...*).
   * **Ô nhập [Số tài khoản]:** Nhập chính xác số tài khoản ngân hàng dùng để nhận tiền thanh toán từ khách.
   * **Ô nhập [Tên chủ tài khoản]:** Nhập tên chủ thẻ viết hoa không dấu (ví dụ: `NGUYEN HUY HOANG`).
   * **Hộp chọn [Giao diện QR]:** Mẫu QR động dùng để tự động in lên bill POS hoặc hiển thị trên màn hình phụ cho khách quét:
     * *Compact 2*: Mẫu tinh gọn kèm Logo ONI và đầy đủ thông tin số TK, tên chủ TK.
     * *Compact*: Chỉ gồm ảnh QR và logo.
     * *QR Only*: Chỉ hiện duy nhất mã QR động.
     * *Print*: Khổ in đầy đủ thông tin chuẩn đối soát ngân hàng.
   * **Bảng [Xem trước mã QR] (QR Preview):** Khung hiển thị trực quan mã VietQR động tự sinh ra bên cạnh dựa trên thông tin ngân hàng bạn vừa gõ để bạn tự dùng điện thoại quét test thử.
   * **Ô nhập [Lời cảm ơn (Cuối bill)]:** Nhập thông điệp gửi tới khách hàng ở chân hóa đơn (ví dụ: *"Cảm ơn quý khách đã mua hàng! Hẹn gặp lại quý khách!"*).
4. Bấm nút **[Lưu thay đổi]** ở chân trang.

`[HÌNH ẢNH: Khung cấu hình thông tin Hóa đơn in kèm khung Xem trước mã QR động VietQR]`

---

## 2. QUY TRÌNH THIẾT LẬP CÁC THAM SỐ TÀI CHÍNH MẶC ĐỊNH

Phần này giúp tự động hóa tính toán thuế và đồng bộ mã hóa đơn cho kế toán.

### Các bước thực hiện:
1. Tại giao diện Cấu hình chi nhánh, tìm đến phần **[Cài đặt bán hàng]**.
2. **Các trường thông tin cần nhập (Inputs Scan):**
   * **Hộp chọn [Đơn vị tiền tệ]:** Chọn `VND` (mặc định) hoặc `USD`.
   * **Hộp chọn [Múi giờ]:** Chọn múi giờ hoạt động (mặc định là `Asia/Ho_Chi_Minh`).
   * **Ô nhập [Thuế GTGT mặc định (%) *]:** Nhập thuế suất VAT mặc định sẽ tự động cộng vào hóa đơn thanh toán tại POS (ví dụ: gõ `8` hoặc `10`. Nếu không tính thuế thì gõ `0`).
   * **Ô nhập [Tiền tố số đơn hàng *]:** Nhập chuỗi ký tự viết tắt tối đa 10 chữ dùng làm mã số hóa đơn bán hàng (ví dụ: gõ `ORD` thì mã đơn hàng khi in ra sẽ tự động sinh dạng `ORD-2026-0001`, `ORD-2026-0002`... giúp kế toán đối soát chuyên nghiệp).
   * **Hộp chọn [Loại giá mặc định]:** Chọn bảng giá mặc định khi nhân viên mở màn hình POS bán hàng (cho phép chọn: *Bán lẻ / Bán sỉ / VIP / Nội bộ*).
3. Bấm nút **[Lưu thay đổi]**.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Khách hàng quét mã VietQR trên hóa đơn bị báo lỗi "Tài khoản thụ hưởng không hợp lệ"
* **Hiện tượng:** Khách dùng ứng dụng ngân hàng quét mã QR in trên bill thanh toán nhưng ứng dụng báo lỗi đỏ không thực hiện được giao dịch chuyển khoản.
* **Nguyên nhân:** Admin đã gõ sai một chữ số trong ô **[Số tài khoản]** ngân hàng, hoặc chọn nhầm tên ngân hàng trong hộp chọn nhận tiền.
* **Cách xử lý:**
  1. Admin truy cập Cài đặt chi nhánh -> Thông tin Hóa đơn.
  2. Rà soát thật kỹ từng con số của **[Số tài khoản]** và tên Ngân hàng thụ hưởng.
  3. Quan sát khung **[Xem trước mã QR]** bên cạnh, dùng điện thoại cá nhân mở app ngân hàng quét thử xem thông tin tài khoản đích hiện lên đã chuẩn xác chưa.
  4. Bấm **[Lưu thay đổi]** để hệ thống đồng bộ mã QR chuẩn mới cho các bill in tiếp theo.

### Tình huống 2: Hóa đơn POS tính sai số tiền thuế VAT
* **Hiện tượng:** Thuế suất mặc định là 8% nhưng khi tính tiền hệ thống lại tính thuế gấp 100 lần hoặc không tính thuế.
* **Nguyên nhân:** Nhập sai định dạng trong ô nhập liệu. Nhiều phần mềm khác yêu cầu nhập số thập phân (ví dụ gõ `0.08` cho 8%), nhưng trên ONI.vn bạn chỉ cần nhập số tự nhiên phần trăm trực tiếp (gõ số `8`). Nếu gõ nhầm thành `0.8` hệ thống sẽ hiểu là thuế suất 0.8%.
* **Cách xử lý:**
  1. Vào lại ô nhập **[Thuế GTGT mặc định (%)]**, xóa sạch và gõ đúng số nguyên phần trăm (ví dụ: gõ `8` hoặc `10`).
  2. Bấm **[Lưu thay đổi]**.
