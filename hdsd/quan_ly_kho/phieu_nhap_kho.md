# HƯỚNG DẪN: QUY TRÌNH LẬP PHIẾU NHẬP KHO TỪ NHÀ CUNG CẤP (PN)

Quy trình Nhập kho là khâu cốt lõi để đưa hàng hóa mới vào hệ thống chi nhánh, cập nhật số lượng tồn kho thực tế bán hàng và làm cơ sở hạch toán tính toán giá vốn chính xác, chống thất thoát tiền hàng.

Mọi giao dịch mua hàng từ Nhà cung cấp đều phải được ghi nhận thông qua **Phiếu nhập kho (mã PN)**.

*   **Ai được quyền sử dụng:** Giám đốc chi nhánh (Manager), Thủ kho hoặc tài khoản được phân quyền quản lý kho (`warehouse.manage`).

---

## 1. QUY TRÌNH THỰC HIỆN NHẬP KHO
1.  Truy cập menu **[Kho]** -> Chọn **[Phiếu nhập kho]** -> Bấm **[Tạo phiếu nhập mới]** ở góc trên bên phải.
2.  Thiết lập các thông tin nhà cung cấp và danh sách sản phẩm nhập (theo hướng dẫn bên dưới).
3.  Bấm **[Lưu tạm]** (phiếu ở trạng thái *Draft* hoặc *Chờ duyệt*) để thủ kho kiểm đếm thực tế khi dỡ hàng xe tải.
4.  Sau khi kiểm hàng khớp, bấm **[Phê duyệt hoàn tất nhập kho]** để chính thức cập nhật sổ sách.
5.  `[HÌNH ẢNH: Giao diện tạo Phiếu nhập kho PN, highlight hộp chọn Nhà cung cấp, danh sách hàng hóa và nút "Phê duyệt hoàn tất nhập kho"]`

---

## 2. GIẢI THÍCH CHI TIẾT CÁC TRƯỜNG DỮ LIỆU (INPUTS SCAN)

Khi lập phiếu nhập kho PN, bạn cần rà soát kỹ các trường thông tin sau:

### A. Thông tin chung hóa đơn nhập
*   **Hộp chọn [Nhà cung cấp *]:** Chọn nhà cung cấp giao hàng từ danh sách. Bắt buộc nhập để hệ thống hạch toán công nợ phải trả.
*   **Hộp chọn [Chi nhánh nhập *]:** Gán chi nhánh thực tế nhận hàng để kho của chi nhánh đó tăng tồn.
*   **Hộp chọn [Hình thức thanh toán *]:**
    *   *Tiền mặt / Chuyển khoản:* Nếu bạn trả tiền mặt/chuyển khoản thanh toán ngay cho nhà cung cấp tại chỗ. Hệ thống tự động sinh 1 Phiếu chi trong Sổ quỹ tương ứng.
    *   *Ghi nợ (Ghi nhận công nợ NCC):* Nếu bạn mua nợ, trả sau theo kỳ hạn. Hệ thống tự động cộng dồn số tiền này vào sổ công nợ nhà cung cấp.

### B. Danh sách Sản phẩm nhập kho
Bấm tìm kiếm hoặc quét mã vạch để thêm các sản phẩm vào danh sách, sau đó điền:
1.  **Ô nhập [Số lượng nhập *]:** Số lượng hàng thực tế nhận.
    *   *Lưu ý đơn vị tính:* Nhập đúng theo Đơn vị tính cơ bản nhỏ nhất của hệ thống (ví dụ: thuốc nhập theo viên, nước ngọt nhập theo lon lẻ) để tránh lệch tồn.
2.  **Ô nhập [Đơn giá nhập *]:** Giá vốn gốc nhập hàng thực tế từ nhà cung cấp (chưa trừ chiết khấu). Bắt buộc điền đúng để hệ thống tính giá vốn bình quân gia quyền.
3.  **Ô nhập [Chiết khấu dòng sản phẩm]:** % giảm giá hoặc số tiền nhà cung cấp giảm riêng cho sản phẩm này (nếu có).
4.  **Ô nhập [Số lô & Hạn sử dụng] (Dành riêng cho Dược phẩm/Thực phẩm):** Nhập mã lô và hạn dùng để hệ thống cảnh báo cận date sau này.

---

## 3. CƠ CHẾ TỰ ĐỘNG CỦA HỆ THỐNG KHI DUYỆT PHIẾU PN

Ngay khi bạn bấm **[Phê duyệt hoàn tất nhập kho]** (trạng thái phiếu chuyển sang `Completed` hoặc `Approved`):
1.  **Tồn kho tăng ngay:** Hệ thống cộng số lượng tồn kho sản phẩm thực tế của chi nhánh nhận hàng.
2.  **Cập nhật Giá Vốn di động:** Hệ thống tự động chạy công thức Bình quân gia quyền di động để cập nhật mức **Giá vốn mới** của sản phẩm trên Master Data dựa trên lượng tồn cũ và giá nhập mới.
3.  **Ghi nhận Công nợ:** Tự động tăng số tiền nợ phải trả nhà cung cấp trong CRM đối tác (nếu chọn hình thức ghi nợ).

---

## 4. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Nhập nhầm đơn giá vốn dẫn đến lệch báo cáo doanh thu tài chính
*   **Hiện tượng:** Sau khi duyệt phiếu nhập kho, bạn phát hiện đã nhập nhầm đơn giá mua của chai nước ngọt là 80.000đ (lẽ ra là 8.000đ). Hệ thống báo giá vốn của nước ngọt tăng vọt lên bất thường, làm báo cáo lợi nhuận gộp cuối tháng bị giảm âm nghiêm trọng.
*   **Nguyên nhân:** Phiếu PN đã duyệt hoàn tất bị khóa cứng, không cho phép sửa trực tiếp đơn giá vốn để bảo vệ tính toàn vẹn dữ liệu kế toán.
*   **Cách xử lý:** 
    1.  Kế toán trưởng cần lập tức làm **Phiếu điều chỉnh giá vốn / Cân đối giá vốn thủ công** trên sản phẩm đó để kéo giá vốn trung bình về đúng mức 8.000đ thực tế.
    2.  Lập phiếu thu/chi bù trừ chênh lệch công nợ đối ứng với Nhà cung cấp trong Sổ quỹ nếu có ghi nhận nợ sai lệch.

### Tình huống 2: Lệch số lượng tồn do nhân viên kho quên bấm "Phê duyệt"
*   **Hiện tượng:** Hàng hóa đã dỡ xếp đầy trên kệ cửa hàng, nhân viên bán hàng POS báo sản phẩm hết tồn không bán được, kiểm tra danh sách phiếu nhập thấy phiếu PN vẫn hiển thị.
*   **Nguyên nhân:** Phiếu nhập kho mới chỉ được **[Lưu tạm (Draft)]** hoặc ở trạng thái **[Chờ duyệt]**. Khi ở trạng thái này, tồn kho thực tế bán hàng trên POS sẽ chưa được tăng lên.
*   **Cách xử lý:** Quản lý chi nhánh hoặc thủ kho cần truy cập chi tiết phiếu PN đó, kiểm đếm lại nhanh và bấm nút **[Phê duyệt hoàn tất nhập kho]** để kích hoạt tăng tồn kho trên hệ thống ngay lập tức.
