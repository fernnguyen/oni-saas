# HƯỚNG DẪN P2P - BƯỚC 5: NHẬP KHO ĐỐI CHIẾU THỰC NHẬN (GRN) & HOÀN TẤT HẠCH TOÁN

**Phiếu nhập kho đối chiếu (GRN - Goods Receipt Note)** là bước cuối cùng khép lại chu trình mua sắm P2P. Đây là khâu đối chiếu thực tế cực kỳ quan trọng khi hàng được chở đến cửa hàng, giúp bạn so sánh số lượng thực nhận so với số lượng đã đặt mua trên đơn PO, ngăn ngừa thất thoát hàng hóa giao thiếu.

*   **Ai được quyền sử dụng:** Thủ kho, Nhân viên kho trực tiếp nhận hàng (`warehouse.manage`) và Cửa hàng trưởng hoặc Kế toán trưởng duyệt hoàn tất.

---

## 1. QUY TRÌNH THỰC HIỆN ĐỐI CHIẾU NHẬP KHO

### Bước 1: Khởi tạo phiếu đối chiếu GRN từ PO gốc
Khi xe chở hàng của nhà cung cấp tới chi nhánh của bạn:
1.  Truy cập menu **[Mua sắm]** -> Chọn **[Nhập kho GRN]** -> Bấm **[Tạo phiếu GRN mới từ PO]**.
2.  Chọn đúng mã đơn đặt hàng PO tương ứng (ví dụ: `PO-2026-0001`) để hệ thống tự động tải danh sách sản phẩm đặt mua.
3.  **Thao tác kiểm đếm thực tế (Inputs Scan):**
    *   Thủ kho tiến hành dỡ hàng và đếm thủ công từng thùng sản phẩm.
    *   **Ô nhập [Số lượng thực nhận (Actual Qty) *]:** Điền chính xác số lượng thực tế đếm được bằng tay (ví dụ: PO đặt 100 cái, thực tế nhận đủ -> điền `100`).
    *   **Ô nhập [Số lượng lỗi/hỏng]:** Nhập số lượng hàng bị móp méo, vỡ hỏng trong quá trình vận chuyển giao trả lại xe (ví dụ: có 2 chai bị vỡ -> nhập `2`).
4.  Bấm **[Lưu tạm]** -> Phiếu ở trạng thái **[Chờ duyệt nhập kho (Pending GRN)]**.
5.  `[HÌNH ẢNH: Giao diện lập phiếu đối chiếu GRN, highlight cột "Số lượng đặt PO", ô nhập "Số lượng thực nhận" và cột "Hao hụt lỗi hỏng"]`

---

### Bước 2: Phê duyệt hoàn tất nhập kho
Sau khi thủ kho đã kiểm đếm xong, Cửa hàng trưởng hoặc Kế toán trưởng mở phiếu GRN kiểm tra chênh lệch lần cuối và duyệt:
1.  Mở phiếu GRN đang ở trạng thái *[Pending GRN]*.
2.  Bấm nút **[Phê duyệt hoàn tất nhập kho]**.
3.  **Side-effects tự động cực kỳ mạnh mẽ của hệ thống:**
    *   **Cập nhật kho thực:** Tồn kho sản phẩm tại chi nhánh lập tức tăng lên đúng bằng số lượng ghi nhận tại ô *[Số lượng thực nhận]*.
    *   **Tính toán lại Giá Vốn di động:** Hệ thống tự động lấy giá mua thực tế của phiếu GRN này để chạy lại công thức bình quân gia quyền di động, cập nhật giá vốn mới cho sản phẩm.
    *   **Hạch toán Công nợ:** Tự động tạo một khoản công nợ phải trả tương ứng cho Nhà cung cấp trong sổ sách CRM.
4.  `[HÌNH ẢNH: Phiếu GRN sau khi được phê duyệt hoàn tất, hiển thị trạng thái "Đã nhập kho" màu xanh lá và thông báo cập nhật tồn kho thành công]`

---

## 2. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Nhà cung cấp giao hàng thiếu so với đơn đặt hàng PO
*   **Hiện tượng:** Đơn PO đặt mua 50 thùng bia, nhưng nhà cung cấp hết hàng nên chỉ chở đến giao 40 thùng bia.
*   **Cách xử lý (Quy trình hạch toán hàng thiếu):**
    1.  Tại Bước 1 lập phiếu GRN, thủ kho **chỉ gõ nhập đúng con số thực đếm được là `40`** vào ô *[Số lượng thực nhận]*. Tuyệt đối không gõ 50 theo lý thuyết PO.
    2.  Hệ thống tự động tính toán chênh lệch thiếu là 10 thùng bia.
    3.  Khi bấm Duyệt hoàn tất GRN:
        *   Tồn kho chi nhánh chỉ tăng thêm đúng **`40`** thùng bia.
        *   Công nợ phải trả NCC cũng tự động tính toán trên giá trị của **`40`** thùng thực nhận, đảm bảo doanh nghiệp không bị trả thừa tiền cho đối tác.
        *   Đơn PO gốc sẽ tự động chuyển sang trạng thái **[Giao thiếu (Partially Received)]**. Bạn có thể chờ NCC giao nốt 10 thùng còn lại (lập phiếu GRN lần 2 từ PO này), hoặc nếu NCC không giao nữa thì bấm nút **[Đóng đơn PO]** để tất toán đơn đặt hàng.

### Tình huống 2: Thủ kho nhập nhầm số lượng làm sai lệch giá vốn và tồn kho
*   **Hiện tượng:** Phiếu GRN đã được duyệt hoàn tất (Processed), sau đó bạn phát hiện thủ kho đã gõ nhầm số lượng thực nhận từ 10 hộp thành 100 hộp. Tồn kho phần mềm bị thừa 90 hộp, giá vốn bình quân gia quyền bị tính sai lệch.
*   **Nguyên nhân:** Phiếu GRN khi đã duyệt hoàn tất sẽ bị khóa cứng hoàn toàn, không thể xóa hay chỉnh sửa để bảo vệ tính toàn vẹn dữ liệu kế toán kho.
*   **Cách xử lý:** 
    1.  *Cân lại tồn kho:* Cửa hàng trưởng lập tức tạo một **Phiếu điều kho (PDK)** kiểm và cân lại tồn kho sản phẩm đó giảm đi 90 hộp về đúng thực tế.
    2.  *Cân lại công nợ & giá vốn:* Kế toán trưởng lập phiếu thu/chi thủ công cấn trừ chênh lệch công nợ sai của nhà cung cấp trong Sổ quỹ, và tiến hành chạy lệnh cân bằng thủ công giá vốn sản phẩm đó trên phần mềm.
    3.  Hướng dẫn thủ kho quy trình kiểm đếm nghiêm ngặt hai người cùng ký biên bản trước khi bấm nút Duyệt trên phần mềm.
