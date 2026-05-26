# HƯỚNG DẪN P2P - BƯỚC 4: TẠO ĐƠN ĐẶT HÀNG CHÍNH THỨC (PO) & BẢO MẬT ẨN GIÁ

Sau khi đề xuất mua hàng PR được duyệt cấp cao thành công, Bộ phận Mua sắm (Purchasing) tiến hành lập **Đơn đặt hàng chính thức (PO - Purchase Order)** để gửi cho Nhà cung cấp thực hiện giao hàng đến chi nhánh.

Tài liệu này hướng dẫn cách tạo đơn PO và giải thích chính sách bảo mật che ẩn giá vốn nhạy cảm đối với nhân sự cấp dưới.

*   **Ai được quyền sử dụng:** Nhân viên mua hàng (Purchaser), Cửa hàng trưởng hoặc Kế toán trưởng (`purchasing.manage`).

---

## 1. QUY TRÌNH THỰC HIỆN TẠO ĐƠN PO
1.  Truy cập menu **[Mua sắm]** -> Chọn **[Đơn đặt hàng (PO)]**.
2.  Bấm nút **[Tạo đơn PO từ PR đã duyệt]**.
3.  Hệ thống hiển thị danh sách các phiếu PR ở trạng thái `APPROVED`. Chọn phiếu PR tương ứng.
4.  **Cấu hình thông tin bổ sung (Inputs Scan):**
    *   Hệ thống tự động sao chép toàn bộ danh sách sản phẩm, số lượng và đơn giá mua đàm phán trước đó từ phiếu PR sang đơn PO.
    *   **Ô chọn [Ngày dự kiến giao hàng]:** Xác nhận lại ngày hẹn nhà cung cấp phải chở hàng tới.
    *   **Ô nhập [Ghi chú đặt hàng]:** Điền ghi chú yêu cầu đóng gói hoặc vận chuyển gửi nhà cung cấp.
5.  Bấm nút **[Tạo đơn đặt hàng PO]**. Mã đơn PO được sinh ra (ví dụ: `PO-2026-0001`). 
6.  Bấm nút **[In đơn PO]** (hoặc **[Xuất PDF]**) để lưu trữ file gửi qua Zalo/Email cho nhà cung cấp thực hiện giao hàng.
7.  `[HÌNH ẢNH: Giao diện tạo mới đơn hàng PO từ PR đã duyệt, highlight nút "In đơn PO" và nút xuất file PDF đặt hàng]`

---

## 2. CHÍNH SÁCH BẢO MẬT CHE ẨN GIÁ VỐN (UI GATING)

Nhằm bảo vệ thông tin thương mại nhạy cảm, ngăn ngừa việc rò rỉ giá mua sỉ/giá đàm phán gốc của doanh nghiệp cho các đối thủ cạnh tranh hoặc nhân viên quầy:

*   **Cơ chế che giá tự động:** Đối với các tài khoản đăng nhập ở vai trò **Thu ngân (Cashier)** hoặc **Nhân viên bán lẻ (Staff)**, khi họ truy cập vào xem chi tiết đơn hàng PO này:
    *   Hệ thống sẽ tự động che mờ và ẩn toàn bộ thông số ở cột **[Đơn giá mua]** và ô **[Tổng số tiền thanh toán PO]**.
    *   Các số liệu này được thay thế hiển thị bằng nhãn bảo mật **`🔒 ***.***`**.
*   **Mở khóa hiển thị:** Chỉ những tài khoản có vai trò Admin, Owner, Kế toán trưởng hoặc Trưởng chi nhánh được phân quyền quản lý tài chính mới hiển thị con số thực tế.
*   `[HÌNH ẢNH: Chi tiết đơn hàng PO dưới góc nhìn tài khoản Nhân viên thu ngân, highlight cột Đơn giá và Tổng tiền bị che kín bằng nhãn 🔒 ***.***]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Nhà cung cấp báo thay đổi giá đột ngột ngay khi chuẩn bị xuất đơn PO
*   **Hiện tượng:** Phiếu PR đã duyệt với giá sữa đặc là 18.000đ/hộp, nhưng khi bạn chuẩn bị tạo đơn PO gửi nhà cung cấp thì họ gọi điện báo tăng giá lên 19.000đ/hộp do biến động thị trường. Bạn muốn sửa đơn giá trực tiếp trên màn hình tạo PO nhưng ô giá bị khóa cứng.
*   **Nguyên nhân (Quy tắc bảo mật hạn mức):** Đơn PO được kế thừa trực tiếp từ PR đã duyệt tài chính. Hệ thống chặn không cho sửa tăng giá trên PO để tránh việc nhân viên tự ý nâng giá mua khống sau khi BGĐ đã duyệt.
*   **Cách xử lý:** 
    1.  *Nếu chênh lệch giá nhỏ và được Kế toán duyệt:* Bạn bắt buộc phải quay lại lập một phiếu đề xuất PR bổ sung hoặc làm phiếu giải trình tăng giá.
    2.  *Nếu bắt buộc phải sửa đơn:* Kế toán trưởng phải thực hiện thao tác **[Hủy phiếu PR cũ]** và hướng dẫn nhân viên tạo một đề xuất PR mới có đơn giá cập nhật là 19.000đ để chạy lại quy trình duyệt từ đầu, đảm bảo tính hợp pháp của dòng tiền mua sắm.
    3.  Sau khi PR mới được duyệt, Purchaser tiến hành tạo đơn PO mới với giá trị chuẩn xác.
