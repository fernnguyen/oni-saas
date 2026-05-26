# HƯỚNG DẪN: QUY TRÌNH PHÂN NHÓM KHÁCH HÀNG & CẤU HÌNH TÍCH ĐIỂM CRM (MEMBERSHIP TIERS)

Để tối ưu hóa doanh thu và giữ chân khách hàng trung thành, ONI.vn tích hợp phân hệ quản lý quan hệ khách hàng (CRM) chuyên nghiệp. Hệ thống cho phép bạn tự thiết lập tỷ lệ tích điểm thưởng và xây dựng bảng hạng thành viên (Membership Tiers) tự động áp dụng chiết khấu khi mua hàng.

---

## 1. QUY TRÌNH THIẾT LẬP TÍCH ĐIỂM THƯỞNG CRM

Chỉ có tài khoản **Chủ cửa hàng (Owner)** hoặc **Giám đốc (Admin)** mới có quyền cấu hình chính sách tích điểm của chi nhánh.

### Các bước thực hiện:
1. Đăng nhập hệ thống -> Chọn mục **[Cấu hình và Cài đặt]** -> **[Cấu hình chi nhánh]**.
2. Kéo xuống phần **[Cấu hình CRM & Hạng thành viên]**.
3. **Kích hoạt tính năng:** Click nút gạt **[Tích lũy điểm CRM]** để chuyển sang màu xanh dương (Đang bật tích lũy điểm & tiêu dùng điểm cho khách).
4. **Các trường thông tin cần nhập (Inputs Scan):**
   * **Ô nhập [Tỷ lệ Tích điểm *]:** Số tiền khách hàng chi tiêu để được quy đổi thành 1 điểm thưởng (ví dụ: gõ `100.000` đồng = 1 điểm).
   * **Ô nhập [Giá trị Tiêu điểm *]:** Giá trị quy đổi từ 1 điểm thưởng sang số tiền giảm trừ trực tiếp trên bill thanh toán (ví dụ: gõ `1.000` đồng/điểm. Khách có 50 điểm sẽ được trừ 50.000đ khi mua hàng).
5. Bấm **[Lưu thay đổi]** ở cuối trang để kích hoạt.

`[HÌNH ẢNH: Khung Cấu hình tích lũy điểm CRM với các ô nhập Tỷ lệ tích điểm và Giá trị tiêu điểm]`

---

## 2. QUY TRÌNH XÂY DỰNG HẠNG THÀNH VIÊN VÀ CHIẾT KHẤU TỰ ĐỘNG

Hệ thống hỗ trợ cơ chế thăng hạng thẻ tự động dựa trên doanh thu tích lũy cộng dồn của khách hàng.

### Các bước thực hiện:
1. Tại phần cấu hình CRM, tìm đến mục **[Cấu hình Hạng thành viên]**.
2. **Ô nhập [Năm xét hạng *]:** Nhập số năm hệ thống dùng để tính tổng doanh thu tích lũy thăng/giữ hạng thẻ (ví dụ: nhập `3` năm).
3. **Thiết lập bảng hạng thẻ (Dynamic Tier Builder):** Hệ thống có sẵn 3 hạng tiêu chuẩn (Đồng, Bạc, Vàng). Bạn có thể bấm nút **[Thêm hạng mới]** hoặc sửa thông tin từng hạng:
   * **Ô nhập [Tên hạng thành viên *]:** Điền tên phân hạng (ví dụ: *Đồng / Bạc / Vàng / Kim Cương / VIP*).
   * **Ô nhập [Doanh thu tối thiểu (VNĐ) *]:** Ngưỡng doanh thu mua hàng cộng dồn tối thiểu để khách tự động thăng lên hạng này (ví dụ: Hạng Đồng = `5.000.000`đ, Bạc = `15.000.000`đ, Vàng = `35.000.000`đ).
   * **Ô nhập [Chiết khấu bill (%) *]:** Tỷ lệ % giảm giá tự động áp dụng trực tiếp lên tổng hóa đơn khi khách có hạng thẻ tương ứng thực hiện thanh toán tại POS (ví dụ: Hạng Đồng = `2%`, Bạc = `5%`, Vàng = `10%`).
   * **Hộp chọn [Màu sắc / Template *]:** Chọn biểu tượng và màu thẻ hiển thị trên ứng dụng (ví dụ: chọn *Vàng Gold 👑*, *Bạc Silver 🥈*, *Ngọc lục bảo 🟢*...).
4. **Xóa hạng thẻ:** Bấm nút biểu tượng **[Thùng rác 🗑]** ở cuối dòng hạng thẻ tương ứng nếu muốn xóa bỏ.
5. Bấm nút **[Lưu thay đổi]** ở chân trang.

`[HÌNH ẢNH: Bảng xây dựng hạng thành viên với các trường tên hạng, doanh thu tối thiểu, % chiết khấu và nút Thêm hạng mới]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Màn hình CRM hiện thông báo ổ khóa "Tính năng CRM đang bị khóa"
* **Hiện tượng:** Bạn truy cập cài đặt CRM nhưng giao diện hiển thị hình ổ khóa lớn `🔒` màu cam và không cho nhập liệu.
* **Nguyên nhân:** Workspace của bạn đang sử dụng gói dịch vụ Mini (Miễn phí). Tính năng CRM thành viên và tích điểm tự động chỉ khả dụng từ gói cước **Chuyên nghiệp (Pro)** trở lên.
* **Cách xử lý:** 
  1. Click vào nút **[Nâng cấp gói ngay]** bên dưới cảnh báo (hoặc truy cập mục *Thanh toán* ở Control Plane).
  2. Thực hiện thanh toán nâng cấp lên gói Pro hoặc Enterprise để mở khóa toàn bộ phân hệ CRM ngay lập tức.

### Tình huống 2: Khách mua hàng đạt mốc doanh số sỉ nhưng POS không tự giảm giá
* **Hiện tượng:** Khách hàng đã có tổng chi tiêu đạt trên 15 triệu (đủ điều kiện hạng Bạc giảm 5%) nhưng khi nhân viên chọn tên khách trên quầy POS, hóa đơn vẫn tính nguyên giá, không tự động giảm giá 5%.
* **Nguyên nhân:**
  1. Tính năng gạt **[Tích lũy điểm CRM]** đang bị tắt trong cài đặt chi nhánh.
  2. Doanh thu của khách đạt mốc ngoài chu kỳ xét hạng quy định (ví dụ: mua từ 4 năm trước trong khi cài đặt *Năm xét hạng* chỉ là 3 năm).
* **Cách xử lý:**
  1. Admin vào Cấu hình chi nhánh -> CRM -> Đảm bảo nút gạt **[Tích lũy điểm CRM]** đang bật xanh dương.
  2. Kiểm tra lại hồ sơ khách hàng xem doanh thu tích lũy thực tế trong 3 năm gần nhất có đúng đạt mốc không.
  3. Yêu cầu nhân viên thu ngân tại POS bấm xóa tên khách khỏi đơn rồi chọn lại để hệ thống nạp lại (hydrate) chính sách chiết khấu hạng thẻ mới nhất.
