# HƯỚNG DẪN: QUY TRÌNH TẠO ĐƠN TRẢ HÀNG & ĐỔI TRẢ TỪNG PHẦN

Trong quá trình kinh doanh, cửa hàng luôn phát sinh các trường hợp khách hàng muốn trả lại sản phẩm đã mua do lỗi sản xuất, sai quy cách hoặc đổi ý. Hệ thống ONI.vn hỗ trợ quy trình đổi trả hàng hóa chặt chẽ và linh hoạt:
1.  Cho phép liên kết đối chiếu trực tiếp với Đơn hàng mua gốc để lấy đúng đơn giá cũ.
2.  **Đổi trả từng phần (Partial Return):** Khách hàng mua 5 món nhưng chỉ muốn trả lại 1 món, hệ thống hỗ trợ lọc bóc tách cực kỳ dễ dàng.
3.  Cho phép tự điền số tiền hoàn trả cho khách để linh hoạt cấn trừ chi phí hao mòn, phí ship.

*   **Ai được quyền sử dụng:** Tài khoản có vai trò **Giám đốc chi nhánh (Manager)**, **Kế toán trưởng** hoặc những nhân viên được cấp quyền tạo phiếu trả (`returns.create`).

---

## 1. QUY TRÌNH THỰC HIỆN ĐỔI TRẢ CHI TIẾT

### Bước 1: Khởi tạo Phiếu trả hàng
1.  Truy cập menu **[Đơn trả hàng]** trên thanh nghiệp vụ chính chi nhánh.
2.  Bấm nút **[Tạo phiếu trả]** ở góc trên bên phải màn hình.
3.  **Các trường thông tin cần nhập (Inputs Scan):**
    *   **Ô nhập [Mã đơn hàng gốc *]:** Nhập chính xác mã đơn hàng khách đã mua trước đây (ví dụ: `ORD-2026-0045`). Hệ thống bắt buộc nhập mã này để làm cơ sở đối chiếu sổ sách.
    *   **Ô nhập [Số đơn hàng]:** Nhập lại mã đơn hiển thị để tra cứu nhanh.
    *   **Ô nhập [Tên khách hàng]:** Điền tên khách hàng trả hàng.
    *   **Hộp chọn [Lý do trả]:** Chọn Hàng lỗi (defective), Hàng hỏng (damaged), Sai hàng (wrong_item), Khách đổi ý (changed_mind) hoặc Khác (other).
    *   **Hộp chọn [Hình thức hoàn tiền]:** Chọn Tiền mặt, Chuyển khoản hoặc Ghi nợ vào ví trả trước CRM của khách.
    *   **Ô nhập [Số tiền hoàn]:** Nhập số tiền thực tế bạn sẽ hoàn trả lại cho khách hàng.
        *   *Lưu ý quan trọng:* Số tiền này cho phép bạn điền tự do để linh hoạt khấu trừ chi phí vận chuyển hoặc chiết khấu cũ của cửa hàng chứ không bắt buộc bằng 100% giá trị sản phẩm.
    *   **Ô nhập [Ghi chú]:** Ghi chú rõ tình trạng sản phẩm lúc nhận lại (ví dụ: *"Hộp hơi bóp méo, sản phẩm còn nguyên tem mác"*).
4.  Bấm nút **[Tạo phiếu]**. Phiếu sẽ ở trạng thái **[Chờ duyệt (Pending)]**.
5.  `[HÌNH ẢNH: Bảng tạo phiếu trả hàng mới, highlight trường "Mã đơn hàng gốc", "Số tiền hoàn" và nút "Tạo phiếu"]`

---

### Bước 2: Thiết lập sản phẩm trả từng phần (Partial Return)
Nếu khách hàng mua nhiều món nhưng chỉ muốn trả lại một phần:
1.  Click vào mã phiếu trả hàng vừa tạo ở danh sách để mở chi tiết phiếu.
2.  Tại khu vực sản phẩm trả, bấm nút **[Thêm sản phẩm trả]**.
3.  **Các trường thông tin sản phẩm (Inputs Scan):**
    *   **Ô nhập [Mã sản phẩm *]:** Nhập mã sản phẩm khách muốn trả lại.
    *   **Ô nhập [Số lượng trả *]:** Nhập số lượng thực tế khách trả (ví dụ: Đơn gốc mua 5 cái, khách chỉ trả 2 cái -> Nhập **`2`**).
    *   **Ô nhập [Đơn giá]:** Nhập đơn giá của sản phẩm đó lấy từ hóa đơn gốc. Hệ thống tự động nhân với số lượng để hiển thị thành tiền.
4.  Bấm **[Thêm]**. Sản phẩm sẽ được đưa vào danh sách sản phẩm trả. Các mặt hàng khác khách giữ lại sẽ không được đưa vào phiếu trả này.
5.  `[HÌNH ẢNH: Bảng thêm sản phẩm trả từng phần, highlight ô nhập "Mã sản phẩm", "Số lượng trả" và dòng "Thành tiền" tự động tính toán]`

---

### Bước 3: Phê duyệt hoàn tất hoàn tiền & Nhập kho
Sau khi rà soát đầy đủ thông tin, người có thẩm quyền sẽ thực hiện duyệt phiếu trả hàng:
1.  Tại chi tiết phiếu trả hàng, bấm nút **[Duyệt]** để xác nhận thông tin (trạng thái chuyển sang `Approved`).
2.  Bấm nút **[Xử lý & nhập kho]** để kết thúc quy trình.
3.  **Side-effects tự động của hệ thống:**
    *   *Tồn kho:* Sản phẩm trả lại sẽ tự động được cộng lại vào tồn kho thực tế của chi nhánh (tự sinh phiếu `return_in` trong Lịch sử kho).
    *   *Sổ quỹ dòng tiền:* Hệ thống tự động tạo 1 **Phiếu chi** tương ứng trong Sổ quỹ (Cashbook) của chi nhánh với số tiền bằng đúng con số ở dòng *[Số tiền hoàn]* để hoàn tất tất toán sổ sách kế toán.

---

## 2. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Phiếu trả hàng bị nhập sai tiền hoàn nhưng nút chỉnh sửa bị khóa cứng
*   **Hiện tượng:** Bạn đã duyệt hoàn tất phiếu trả hàng sang trạng thái **[Đã xử lý (Processed)]**, sau đó phát hiện đã điền sai số tiền hoàn trả cho khách. Bạn muốn bấm Sửa hoặc Xóa phiếu nhưng nút chức năng đã bị xám mờ/ẩn hoàn toàn.
*   **Nguyên nhân (Quy tắc kế toán):** Khi phiếu trả hàng đã sang trạng thái `Processed`, hệ thống lập tức cập nhật tăng kho và tạo phiếu chi quỹ tiền mặt. Để đảm bảo tính minh bạch, chống gian lận và sai lệch sổ sách, hệ thống khóa cứng tuyệt đối không cho phép can thiệp xóa/sửa phiếu này.
*   **Cách xử lý:** 
    1.  Giữ nguyên phiếu trả hàng đó trên hệ thống.
    2.  Vào menu **[Sổ quỹ]** -> Tạo một phiếu thu/chi bù trừ thủ công đối ứng để cân bằng lại đúng két tiền mặt thực tế của cửa hàng.
    3.  Ghi chú rõ trên phiếu thu chi thủ công: *"Điều chỉnh sai sót số tiền hoàn của phiếu trả RET-XXXX"*.

### Tình huống 2: Lệch tồn kho do nhập nhầm mã sản phẩm trả
*   **Hiện tượng:** Khách mang trả lại chai nước hoa hồng hãng A, nhưng thủ kho khi lập phiếu trả trên phần mềm đã gõ nhầm mã sản phẩm của hãng B. Khi duyệt hoàn tất, tồn kho hãng B tăng lên vô lý, còn kho hãng A thực tế vẫn bị thiếu.
*   **Cách xử lý:** Do phiếu đã duyệt hoàn tất không thể xóa, bạn cần thực hiện cân lại kho:
    1.  Vào menu **[Kho]** -> **[Kiểm kho]** -> Lập một phiếu PDK điều chỉnh kho.
    2.  Khai báo giảm tồn kho sản phẩm hãng B đi 1 đơn vị (Chênh lệch -1).
    3.  Khai báo tăng tồn kho sản phẩm hãng A lên 1 đơn vị (Chênh lệch +1).
    4.  Bấm xác nhận PDK để kho thực tế trên phần mềm cân đối chính xác trở lại.
