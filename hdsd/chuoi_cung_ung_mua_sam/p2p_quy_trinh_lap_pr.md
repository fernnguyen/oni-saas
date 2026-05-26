# HƯỚNG DẪN P2P - BƯỚC 1: LẬP ĐỀ XUẤT MUA HÀNG BAN ĐẦU (PR)

**Đề xuất mua hàng (PR - Purchase Requisition)** là điểm khởi đầu của chuỗi cung ứng P2P. Đây là chứng từ nội bộ giúp các chi nhánh đăng ký nhu cầu mua sắm sản phẩm hoặc trang thiết bị gửi lên ban quản trị doanh nghiệp phê duyệt trước khi chi tiền mua hàng.

*   **Ai được quyền sử dụng:** Nhân viên bán hàng, Thủ kho, Trưởng chi nhánh hoặc bất kỳ nhân sự nào phát hiện nhu cầu thiếu hàng hóa tại quầy.

---

## 1. QUY TRÌNH THỰC HIỆN
1.  Truy cập menu **[Mua sắm]** -> Chọn **[Đề xuất mua hàng (PR)]**.
2.  Bấm nút **[+ Tạo đề xuất mới]** ở góc bên phải.
3.  Khai báo chi nhánh và danh sách sản phẩm cần mua (theo hướng dẫn bên dưới).
4.  Bấm nút **[Lưu bản nháp]** (phiếu ở trạng thái *Draft*).
5.  Rà soát lại danh sách hàng hóa và bấm nút **[Gửi yêu cầu báo giá]** để gửi lên bộ phận mua hàng (PR chuyển sang trạng thái *Pending Sourcing*).
6.  `[HÌNH ẢNH: Giao diện Lập phiếu đề xuất mua sắm PR mới, highlight ô chọn Chi nhánh nhận, danh sách hàng hóa và nút "Gửi yêu cầu báo giá"]`

---

## 2. GIẢI THÍCH CHI TIẾT CÁC TRƯỜNG DỮ LIỆU (INPUTS SCAN)

Khi tạo phiếu PR mới, bạn cần lưu ý rà soát các trường thông tin quan trọng sau:

*   **Hộp chọn [Chi nhánh nhận hàng *]:** Chọn chi nhánh thực tế sẽ tiếp nhận và sử dụng lô hàng này sau khi mua về.
*   **Ô chọn [Ngày cần hàng *]:** Chọn ngày hạn cuối mong muốn hàng hóa phải được giao đến chi nhánh để phục vụ kinh doanh (ví dụ: cần có hàng trước ngày *05/06/2026*).
*   **Danh sách Sản phẩm đề xuất:**
    1.  **Ô tìm kiếm nhanh:** Gõ tên hoặc mã SKU sản phẩm để thêm vào danh sách.
    2.  **Ô nhập [Số lượng đề xuất *]:** Điền số lượng thực tế cần mua sắm (ví dụ: đề xuất mua thêm *50 hộp Sữa đặc*).
    3.  **Hộp chọn [Đơn vị tính]:** Chọn đơn vị tương ứng (Hộp, Thùng, Lon).
*   **Ô nhập [Lý do mua sắm *]:** Nhập lý do giải trình bắt buộc gửi ban giám đốc (ví dụ: *"Hàng tồn kho hiện tại còn dưới ngưỡng tối thiểu, cần nhập bổ sung phục vụ mùa cao điểm"*).

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Bị kẹt không gửi được phiếu PR lên cấp trên phê duyệt
*   **Hiện tượng:** Bạn đã nhập đầy đủ sản phẩm nhưng nút **[Gửi yêu cầu báo giá]** hoặc **[Gửi duyệt]** bị mờ xám và không thể click được.
*   **Nguyên nhân:** Có 2 nguyên nhân thường gặp:
    1.  Phiếu PR chưa được chọn **[Chi nhánh nhận hàng]** hoặc **[Ngày cần hàng]** bị để trống.
    2.  Ô **[Lý do mua sắm]** chưa được điền thông tin giải trình.
*   **Cách xử lý:** 
    1.  Rà soát kỹ các trường có đánh dấu sao đỏ (\*) trên giao diện.
    2.  Điền đầy đủ thông tin giải trình lý do mua sắm và chọn ngày giao hàng mong muốn để nút bấm sáng xanh trở lại.
