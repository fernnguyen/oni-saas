# HƯỚNG DẪN: QUẢN LÝ NHÀ CUNG CẤP & ĐỐI SOÁT CÔNG NỢ PHẢI TRẢ

Để duy trì chuỗi cung ứng hàng hóa ổn định, việc quản lý thông tin nhà cung cấp và đối soát công nợ phải trả (các khoản mua hàng ghi nợ) là vô cùng quan trọng đối với kế toán doanh nghiệp. 

Hệ thống ONI.vn cung cấp phân hệ **Quản lý nhà cung cấp** liên kết tự động với Kho hàng (Phiếu nhập PN) và Sổ quỹ (Phiếu chi) để quản lý dòng công nợ chính xác 100%.

*   **Ai được quyền sử dụng:** Kế toán trưởng, Quản trị viên doanh nghiệp (Owner/Admin) hoặc Cửa hàng trưởng (Manager).

---

## 1. QUY TRÌNH KHAI BÁO NHÀ CUNG CẤP MỚI
1.  Truy cập menu **[Mua sắm]** (hoặc **[Đối tác]**), chọn **[Nhà cung cấp]**.
2.  Bấm nút **[+ Thêm nhà cung cấp]** ở góc trên bên phải.
3.  **Các trường thông tin cần nhập (Inputs Scan):**
    *   **Ô nhập [Tên nhà cung cấp *]:** Tên chính thức của đối tác (ví dụ: *"Công ty TNHH Coca-Cola Việt Nam"*).
    *   **Ô nhập [Mã nhà cung cấp]:** Mã định danh (ví dụ: `SUP-COCA`). Nếu để trống hệ thống tự sinh mã `SUP-XXX`.
    *   **Ô nhập [Số điện thoại *] & [Địa chỉ]:** Thông tin liên hệ giao nhận hàng.
    *   **Hộp chọn [Điều khoản thanh toán]:** Chọn hình thức thanh toán thỏa thuận (ví dụ: chọn `COD` nếu trả tiền mặt ngay khi giao hàng, chọn `Net 30` nếu được gối đầu nợ 30 ngày).
4.  Bấm **[Lưu nhà cung cấp]** để tạo hồ sơ.
5.  `[HÌNH ẢNH: Giao diện Thêm mới nhà cung cấp, highlight các trường "Tên nhà cung cấp", "Điều khoản thanh toán" và nút Lưu]`

---

## 2. CƠ CHẾ GHI NHẬN VÀ TRỪ CÔNG NỢ NHÀ CUNG CẤP

Hệ thống vận hành cơ chế bù trừ công nợ tự động hoàn toàn khép kín thông qua các chứng từ thực tế:

### A. Cơ chế tăng Công nợ (Khi nhập hàng gối đầu)
*   Khi Cửa hàng trưởng duyệt **Phiếu nhập kho (PN)** từ Nhà cung cấp Coca-Cola với hình thức thanh toán chọn là **[Ghi nợ (Gối đầu)]**:
*   Hệ thống lập tức tự động cộng giá trị đơn hàng nhập này vào mục **[Công nợ phải trả (Debt Amount)]** trong hồ sơ của nhà cung cấp Coca-Cola.

### B. Cơ chế giảm Công nợ (Khi thủ quỹ chuyển khoản trả tiền nợ)
*   Khi doanh nghiệp của bạn thực hiện chuyển khoản trả tiền nợ cũ cho nhà cung cấp:
    1.  Vào menu **[Sổ quỹ]** -> Bấm **[Tạo phiếu chi]**.
    2.  Điền số tiền thực tế trả vào ô **[Số tiền]**.
    3.  Chọn Danh mục chi là **[Chi tiền nhập hàng / Trả nợ NCC (import)]**.
    4.  **Ô nhập [Mã tham chiếu]:** Nhập chính xác mã nhà cung cấp Coca-Cola (ví dụ: `SUP-COCA`).
    5.  Bấm Lưu phiếu chi.
    6.  **Tác động tự động:** Dòng tiền trong Sổ quỹ giảm đi, và đồng thời số tiền công nợ phải trả trong hồ sơ của nhà cung cấp Coca-Cola sẽ tự động giảm trừ tương ứng.
*   `[HÌNH ẢNH: Phiếu chi trả nợ NCC trong Sổ quỹ, highlight mục danh mục chọn "import" và ô nhập mã tham chiếu đối tác]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Số nợ nhà cung cấp báo trên hệ thống bị lệch so với biên bản đối soát thực tế
*   **Hiện tượng:** Nhà cung cấp gửi biên bản đối soát đòi nợ 20 triệu, nhưng trên phần mềm ONI của bạn chỉ báo nợ nhà cung cấp 15 triệu.
*   **Nguyên nhân:** Có 2 nguyên nhân thường gặp:
    1.  *Chưa duyệt phiếu nhập kho:* Xe hàng đã dỡ xong, bạn đã ký biên bản nhận hàng của NCC, nhưng thủ kho mới chỉ lưu tạm phiếu PN trên phần mềm ở trạng thái *[Draft]* mà chưa bấm *[Phê duyệt hoàn tất]*, làm công nợ chưa được hạch toán tăng.
    2.  *Nhập nhầm mã NCC khi lập phiếu chi:* Khi chi tiền trả nợ, kế toán lập phiếu chi thủ công nhưng gõ nhầm mã tham chiếu sang nhà cung cấp khác, làm nợ của NCC này không giảm mà NCC khác lại được giảm nợ vô lý.
*   **Cách xử lý:** 
    1.  Vào kiểm tra lại danh sách phiếu nhập kho xem có phiếu PN nào của nhà cung cấp đó đang ở trạng thái chờ duyệt hay không để duyệt hoàn tất.
    2.  Mở lịch sử phiếu chi trong Sổ quỹ của tháng, lọc danh mục `import` để kiểm tra mã tham chiếu NCC trên từng phiếu chi xem có bị nhập nhầm lẫn hay không để hủy phiếu chi sai và lập lại phiếu chi đúng.
