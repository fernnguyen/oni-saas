# HƯỚNG DẪN: TÍNH NĂNG ĐÁNH DẤU BÁO XẤU KHÁCH HÀNG (BLACKLIST / BAD CREDIT)

Để bảo vệ cửa hàng khỏi các rủi ro tài chính phát sinh từ việc khách hàng bùng nợ, có hành vi gian lận thương mại hoặc có lịch sử mua sắm thiếu thiện chí (ví dụ: *thường xuyên boom đơn hàng, có thái độ không đúng mực với nhân viên...*), ONI.vn cung cấp tính năng **Đánh dấu Báo xấu khách hàng (Blacklist)**.

Tính năng này giúp cảnh báo tức thì cho nhân viên thu ngân nâng cao cảnh giác và tự động áp dụng các giới hạn giao dịch nghiêm ngặt đối với khách hàng đó tại quầy.

*   **Ai được quyền sử dụng:** Chủ doanh nghiệp (Owner), Giám đốc (Admin) hoặc Giám đốc chi nhánh (Manager).

---

## 1. QUY TRÌNH THỰC HIỆN ĐÁNH DẤU BÁO XẤU
1.  Truy cập vào menu **[Khách hàng]** trên bảng quản trị chi nhánh.
2.  Tìm kiếm và chọn hồ sơ khách hàng cần đưa vào danh sách xấu.
3.  Tìm tới khu vực cài đặt tài khoản thành viên, chọn mục **[Trạng thái tài khoản]**.
4.  **Các trường thông tin cần nhập (Inputs Scan):**
    *   **Nút bật/tắt [Đánh dấu Báo xấu / Đưa vào Blacklist]:** Bật chuyển sang màu đỏ.
    *   **Ô nhập [Lý do báo xấu *]:** Bắt buộc ghi rõ hành vi vi phạm (ví dụ: *"Có lịch sử bùng nợ hóa đơn sỉ 3.000.000đ", "Thường xuyên boom hàng đặt online"*). Lý do này sẽ lưu trong hồ sơ để các quản lý khác cùng nắm thông tin.
5.  Bấm **[Lưu thông tin]** để cập nhật trạng thái.
6.  `[HÌNH ẢNH: Giao diện chi tiết hồ sơ Khách hàng, highlight nút bật "Đánh dấu Báo xấu" và ô nhập lý do vi phạm]`

---

## 2. TÁC ĐỘNG TỰ ĐỘNG KHI KHÁCH HÀNG BỊ BÁO XẤU TẠI QUẦY POS

Ngay sau khi một khách hàng bị đưa vào danh sách Blacklist, khi nhân viên chọn tên khách hàng này tại màn hình bán hàng POS:

1.  **Hiển thị Cảnh báo nổi bật:** Hệ thống lập tức hiển thị một thanh thông báo màu Đỏ chói và nhấp nháy trên màn hình POS của thu ngân kèm dòng chữ: **`⚠️ CẢNH BÁO: Khách hàng này có lịch sử xấu - [Lý do báo xấu]`**.
2.  **Khóa tính năng Ghi nợ:** Hệ thống **khóa tuyệt đối** không cho phép khách hàng này mua hàng ghi nợ, bất kể hạn mức nợ còn lại là bao nhiêu. Khách hàng bắt buộc phải thanh toán 100% bằng Tiền mặt hoặc Chuyển khoản ngân hàng trước khi xuất hàng.
3.  **Khóa sử dụng Ví/Điểm thành viên:** Tự động chặn quyền tiêu dùng điểm tích lũy hoặc rút tiền từ ví trả trước (nếu có) để cấn trừ các khoản công nợ cũ chưa giải quyết.
4.  `[HÌNH ẢNH: Màn hình bán hàng POS khi chọn một khách hàng bị Blacklist, highlight thanh thông báo cảnh báo đỏ chói ở góc trên cùng và phương thức thanh toán "Ghi nợ" bị xám khóa 🔒]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Khách hàng phản ứng gay gắt khi nhìn thấy dòng chữ "Cảnh báo xấu" trên màn hình POS quay ra ngoài
*   **Hiện tượng:** Quầy POS có màn hình phụ quay ra ngoài cho khách xem giỏ hàng. Khi chọn khách hàng, dòng chữ cảnh báo đỏ hiện lên làm khách hàng nhìn thấy và phản ứng tiêu cực.
*   **Nguyên nhân (Quy tắc hiển thị thiết bị):** Màn hình phụ của POS chưa được cấu hình ẩn các thông báo nội bộ của nhân viên.
*   **Cách xử lý:** 
    1.  *Xử lý tức thời:* Thu ngân giải thích khéo léo đây là lỗi hệ thống đang kiểm tra thông tin, hoặc tạm thời gỡ khách hàng khỏi đơn hàng để thanh toán dưới dạng Khách lẻ vãng lai.
    2.  *Cài đặt hệ thống:* Quản trị viên cần vào phần cấu hình màn hình phụ POS, bật tùy chọn **[Ẩn cảnh báo nội bộ trên màn hình phụ (Hide Internal Alerts on Customer Display)]** để các cảnh báo bảo mật Blacklist chỉ hiển thị duy nhất trên màn hình máy tính của thu ngân.
