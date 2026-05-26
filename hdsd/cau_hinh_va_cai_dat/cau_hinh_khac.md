# HƯỚNG DẪN: CẤU HÌNH CÀI ĐẶT KHÁC, QUY TẮC BÁN HÀNG & PHÍM TẮT VẬN HÀNH (MISC SETTINGS)

Để hệ thống hoạt động phù hợp nhất với mô hình cửa hàng của bạn (Bán lẻ, Cafe/Nhà hàng, hay Dịch vụ), ONI.vn cung cấp các nút gạt chuyển đổi tính năng linh hoạt giúp tinh chỉnh quy trình bán hàng, đóng mở ca làm việc và in ấn hóa đơn.

---

## 1. QUY TRÌNH THỰC HIỆN CẤU HÌNH VẬN HÀNH

Chỉ tài khoản **Chủ cửa hàng (Owner)** hoặc **Giám đốc (Admin)** mới được gạt các công tắc cấu hình này.

### Các bước thực hiện:
1. Đăng nhập hệ thống -> Chọn mục **[Cấu hình và Cài đặt]** -> **[Cấu hình chi nhánh]**.
2. Tìm đến phần **[Cài đặt bán hàng]**.
3. **Các nút gạt cấu hình (Inputs Scan):**
   * **Nút gạt [Bán khi hết hàng]:**
     * *Tắt (Không cho bán)*: Khuyên dùng cho bán lẻ. Khi sản phẩm có tồn kho bằng 0, hệ thống POS sẽ chặn không cho thanh toán để tránh làm lệch số liệu kho thực tế.
     * *Bật (Cho phép bán)*: Khuyên dùng cho quán cafe, ăn uống. Hệ thống cho phép bán hàng bình thường kể cả khi tồn kho bằng 0 (kho sẽ ghi nhận giá trị âm và tự động cấn trừ khi bạn lập phiếu nhập kho PN bù sau).
   * **Nút gạt [Quản lý ca làm việc (POS)]:**
     * *Bật*: Bắt buộc nhân viên thu ngân POS phải làm thủ tục **Mở ca** (nhập số tiền quỹ ban đầu), **Kiểm quỹ** và **Chốt ca** cuối ngày. Nhân viên không thể tạo đơn nếu chưa mở ca làm việc.
     * *Tắt*: Bán hàng liên tục, không chia ca bàn giao tiền mặt.
   * **Nút gạt [Chế độ bảo mật chốt ca nghiêm ngặt]:** (Chỉ hiển thị khi bật quản lý ca)
     * *Bật*: Ẩn số tiền mặt thực tế lý thuyết trên màn hình chốt ca (Blind Close - nhân viên phải tự đếm tiền mặt và gõ số thực đếm, hệ thống tự đối chiếu chênh lệch sau). Ca đã chốt sẽ bị khóa cứng không thể chỉnh sửa.
     * *Tắt*: Hiện số tiền lý thuyết, cho phép Admin chỉnh sửa thông tin ca chốt tự do.
   * **Nút gạt [Tự động in hóa đơn]:**
     * *Bật*: Ngay sau khi bấm nút [Thanh toán] trên POS, hệ thống tự động gửi lệnh in hóa đơn ra máy in nhiệt (không cần nhân viên click nút In).
   * **Nút gạt [Âm thanh POS]:**
     * *Bật*: Hệ thống phát ra tiếng bíp bíp vui tai mỗi khi nhân viên click chọn món hoặc quét mã vạch sản phẩm thành công tại POS.
   * **Nút gạt [Bỏ qua dọn dẹp]:** (Dành riêng cho F&B / Nhà hàng)
     * *Bật*: Bàn ăn tự động chuyển sang trạng thái trống ngay khi thanh toán xong.
     * *Tắt*: Bàn ăn chuyển sang trạng thái màu vàng "Chờ dọn dẹp", nhân viên dọn xong click xác nhận mới chuyển sang trạng thái xanh "Trống".
   * **Nút gạt [Bỏ qua duyệt trả hàng]:**
     * *Bật*: Phiếu trả hàng từ khách sẽ được duyệt tự động, sản phẩm tự cộng lại vào kho và sổ quỹ tự lập phiếu chi hoàn tiền ngay lập tức.
     * *Tắt*: Phiếu trả hàng ở trạng thái "Chờ duyệt", cần quản lý vào xác nhận mới hoàn tất kho và quỹ.
   * **Nút gạt [Tự động mở bàn khi quét QR]:**
     * *Bật*: Khách ngồi tại bàn quét mã QR gọi món sẽ tự động kích hoạt phiên sử dụng bàn.
     * *Tắt*: Nhân viên phải click duyệt xác nhận trên màn hình thu ngân mới mở bàn cho khách.
4. Bấm nút **[Lưu thay đổi]** ở chân trang.

`[HÌNH ẢNH: Danh sách các công tắc gạt bật/tắt tính năng bán hàng và quản lý ca tại trang cài đặt chi nhánh]`

---

## 2. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Nhân viên báo lỗi đỏ tại POS "Vui lòng mở ca làm việc để bắt đầu bán hàng"
* **Hiện tượng:** Nhân viên chọn sản phẩm tại POS nhưng khi bấm thanh toán hệ thống chặn lại và hiển thị cảnh báo yêu cầu mở ca.
* **Nguyên nhân:** Admin đã bật tính năng **[Quản lý ca làm việc (POS)]** trong cài đặt chi nhánh, và nhân viên ca mới chưa làm thủ tục khai báo quỹ ban đầu (Mở ca).
* **Cách xử lý:** 
  1. Yêu cầu nhân viên thu ngân nhìn lên thanh Topbar góc trên bên phải màn hình POS, bấm vào nút **[Mở ca]** (hoặc biểu tượng ca làm việc).
  2. **Ô nhập [Tiền quỹ ban đầu *]:** Nhập số tiền mặt có sẵn trong ngăn kéo tiền dùng để thối (ví dụ: `2.000.000`đ).
  3. Bấm nút **[Mở ca làm việc]**. Hệ thống sẽ kích hoạt màn hình bán hàng bình thường.

### Tình huống 2: Kho bị lệch âm nghiêm trọng không đối soát được
* **Hiện tượng:** Cuối tháng kiểm kho thực tế thấy thiếu hàng trăm mặt hàng trong khi số liệu lý thuyết trên ONI.vn ghi nhận tồn kho bị âm rất nhiều.
* **Nguyên nhân:** Cửa hàng bật chế độ **[Bán khi hết hàng / Cho phép bán khống]** trong thời gian dài nhưng thủ kho lười không lập phiếu nhập kho (PN) khi hàng về, dẫn đến việc bán hàng vẫn chạy nhưng kho bị âm ảo liên tục.
* **Cách xử lý:**
  1. Nếu cửa hàng bán sản phẩm vật lý đóng gói sẵn (Retail), khuyến nghị Admin nên **Tắt** tính năng Bán khi hết hàng. Chỉ khi nào nhập kho tăng số lượng thực tế mới cho phép bán.
  2. Lập một phiếu **Kiểm kho PDK** để đếm lại thực tế toàn bộ sản phẩm và cân bằng kho về số liệu thực đếm chính xác.
