# Hướng dẫn 3: Nghiệp vụ Trích khấu hao & Hạch toán Sổ quỹ (Cashbook)

Nghiệp vụ trích khấu hao là trung tâm của phân hệ Quản lý Tài sản trong **ONI ERP**. Hệ thống tự động hóa việc tính toán hao mòn lũy kế, sinh phiếu chi chi phí khớp với Sổ quỹ, và ngăn ngừa tuyệt đối các sai sót kế toán nhờ cơ chế khống chế nghiêm ngặt theo chu kỳ.

---

## 1. Hai phương thức Trích khấu hao

Hệ thống hỗ trợ 2 cơ chế trích khấu hao linh hoạt tùy vào quy mô doanh nghiệp:

### Phương thức 1: Trích khấu hao đơn lẻ (Từng thiết bị)
*   **Khi nào cần**: Thích hợp khi bạn vừa đưa một tài sản lớn vào sử dụng giữa tháng và muốn hạch toán riêng lẻ ngay lập tức.
*   **Cách thực hiện**: 
    1. Tìm tài sản trong danh sách.
    2. Nhấn vào nút **Trích khấu hao** ở cột hành động cuối dòng.
    3. Hộp thoại xác nhận hiển thị chi tiết nghiệp vụ sẽ mở ra. Nhấn **Xác nhận trích**.
*   **Kết quả**: Hệ thống tính chi phí hao mòn tháng của riêng thiết bị này, cập nhật lũy kế đã khấu hao trên thẻ tài sản, và tự động lập các phiếu chi tương ứng gán trực tiếp cho từng phòng ban thụ hưởng trong Sổ quỹ (Cashbook).

### Phương thức 2: Trích khấu hao hàng loạt (Cuối tháng)
*   **Khi nào cần**: Phương thức chuẩn áp dụng vào ngày cuối cùng của tháng để đồng loạt hạch toán chi phí cho tất cả thiết bị đang hoạt động.
*   **Cách thực hiện**:
    1. Nhấn nút **Trích khấu hao hàng loạt** ở góc trên bên phải màn hình.
    2. Hộp thoại xác nhận mở ra và hiển thị tổng số lượng tài sản đang ở trạng thái Hoạt động cần xử lý.
    3. **Nhập Tên giao dịch Sổ quỹ**: Hệ thống cho phép bạn tùy chỉnh tên giao dịch cơ sở (Mặc định điền sẵn là: `Hao mòn Kỳ MM/YYYY`, ví dụ: `Hao mòn Kỳ 05/2026`).
    4. Nhấn **⚡️ Bắt đầu trích hàng loạt**. Nút đồng ý sẽ hiển thị trạng thái loading xoay tròn, khóa tương tác để bạn an tâm chờ đợi hệ thống quét hàng ngàn tài sản.
*   **Thuật toán gom nhóm tối ưu Sổ quỹ**: 
    Để tránh làm rác Sổ quỹ (nếu có 1.000 thiết bị sẽ sinh ra 1.000 phiếu chi gây nghẽn sổ kế toán), ONI ERP tự động **gom nhóm tất cả chi phí khấu hao theo từng Bộ phận (Cost Center)**. Máy chủ sẽ lập **chính xác 1 phiếu chi tổng hợp duy nhất cho mỗi phòng ban** trong tháng đó. Tên phiếu chi sẽ được tự động gán theo định dạng: `[Tên bạn nhập] - BP [Tên bộ phận]` (Ví dụ: `Hao mòn Kỳ 05/2026 - BP Buồng phòng`). Phiếu chi này hiển thị công khai ở Sổ quỹ (`is_virtual: 'FALSE'`).

---

## 2. Cơ chế Khống chế theo kỳ ("Khống chế theo kỳ")

Để ngăn ngừa tuyệt đối lỗi vô tình bấm trích khấu hao nhiều lần cho cùng một thiết bị trong một tháng (gây sai lệch số liệu tài chính), ONI ERP tích hợp cơ chế khóa chu kỳ nghiêm ngặt:
*   Mỗi thẻ tài sản chỉ được phép trích khấu hao tối đa **1 lần duy nhất trong một tháng** (tương ứng với một kỳ kế toán).
*   Trước khi thực hiện tính toán (cả đơn lẻ và hàng loạt), máy chủ sẽ tự động quét cơ sở dữ liệu lịch sử khấu hao của tháng hiện tại (`YYYY-MM`).
*   Nếu tài sản đã được trích rồi, hệ thống sẽ tự động bỏ qua (khi chạy hàng loạt) hoặc chặn lại và báo lỗi rõ ràng (khi chạy đơn lẻ): *"Tài sản này đã được trích khấu hao trong Kỳ MM/YYYY. Không thể thực hiện lại."*

---

## 3. Tracing Chi tiết Thiết bị đóng góp (Lịch sử khấu hao chi tiết)

Mặc dù ở Sổ quỹ (Cashbook) chỉ hiển thị 1 phiếu chi tổng hợp cho mỗi phòng ban để tinh gọn sổ sách, bạn vẫn có thể **đối soát và truy vết (trace) chính xác tuyệt đối** xem phiếu chi đó gồm những thiết bị cụ thể nào đóng góp vào bằng cách:

1.  Nhấp vào tài sản cần kiểm tra trong bảng danh sách để mở SlideOver chi tiết.
2.  Cuộn xuống phần **Lịch sử trích khấu hao hàng tháng**.
3.  Tại đây, hệ thống hiển thị dòng thời gian đối soát chi tiết của từng kỳ trích:
    *   **Số kỳ (Kỳ 1, Kỳ 2...)**: Giúp theo dõi tiến độ khấu hao.
    *   **Số tiền trích**: Số tiền hao mòn thực tế của thiết bị trong kỳ đó (Ví dụ: `-666.667 đ`).
    *   **Bộ phận gán chi phí**: Tên phòng ban chịu chi phí hao mòn của thiết bị trong kỳ này.
    *   **Ngày trích**: Ngày giờ hệ thống thực hiện thao tác.
    *   **Tiến trình lũy kế**: Biểu diễn trực quan giá trị hao mòn lũy kế trước và sau khi trích (Ví dụ: `Lũy kế: 0 đ ➔ 666.667 đ`).
    *   **Người thực hiện**: Hiển thị tên hiển thị đầy đủ của nhân viên kích hoạt lệnh trích khấu hao.
    *   **Liên kết Sổ quỹ**: Hiển thị chính xác mã phiếu chi tổng hợp (`CSB-DEP-BATCH-...` hoặc `CSB-DEP-...`) liên kết trong Sổ quỹ. Bạn có thể copy mã này sang Sổ quỹ để đối chiếu ngược lại bất kỳ lúc nào!
