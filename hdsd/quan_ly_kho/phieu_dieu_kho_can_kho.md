# HƯỚNG DẪN: QUY TRÌNH KIỂM KHO THỰC TẾ & LẬP PHIẾU ĐIỀU KHO CÂN KHO (PDK)

Trong quá trình vận hành, số lượng tồn kho trên phần mềm và số lượng hàng hóa thực tế trên kệ luôn có khả năng bị chênh lệch do hư hỏng, nhầm lẫn khi bán hàng hoặc thất thoát chưa rõ nguyên nhân. 

Nghiệp vụ **Kiểm kho & Lập phiếu điều kho (mã PDK)** là bắt buộc để điều chỉnh số liệu trên phần mềm khớp chính xác 100% với thực tế đếm được tại quầy.

*   **Ai được quyền sử dụng:** Giám đốc chi nhánh (Manager), Thủ kho hoặc tài khoản được gán quyền duyệt kho (`warehouse.manage`).

---

## 1. QUY TRÌNH THỰC HIỆN KIỂM KHO
1.  Truy cập menu **[Kho]** -> Chọn **[Kiểm kho]** (hoặc **[Điều chỉnh kho]**).
2.  Bấm nút **[+ Tạo phiếu kiểm kho]** ở góc bên phải.
3.  Lần lượt quét mã vạch sản phẩm hoặc tìm kiếm tên để đưa vào danh sách kiểm đếm.
4.  Điền số lượng đếm thực tế và lý do chênh lệch (theo hướng dẫn bên dưới).
5.  Bấm **[Phê duyệt điều chỉnh]**. Tồn kho hệ thống lập tức thay đổi bằng số lượng thực tế.
6.  `[HÌNH ẢNH: Giao diện lập phiếu kiểm kho PDK, highlight cột "Tồn hệ thống", cột "Thực tế đếm" và ô báo "Chênh lệch" tự động tính]`

---

## 2. GIẢI THÍCH CHI TIẾT CÁC TRƯỜNG DỮ LIỆU (INPUTS SCAN)

Khi thực hiện nhập bảng đối chiếu kiểm kho, bạn cần quét qua các ô nhập liệu sau:

### A. Thông tin chung phiếu kiểm
*   **Hộp chọn [Chi nhánh kiểm kho *]:** Xác định chi nhánh thực hiện kiểm đếm để trừ/cộng tồn kho đúng kho của chi nhánh đó.

### B. Bảng đối chiếu chi tiết hàng hóa
Với mỗi sản phẩm được đưa vào danh sách kiểm, hệ thống hiển thị:
1.  **Dòng [Tồn hệ thống]:** Số lượng tồn kho lý thuyết hiện tại đang lưu trên phần mềm trước khi kiểm.
2.  **Ô nhập [Thực tế đếm (Actual Qty) *]:** Điền con số lượng thực tế bạn đếm được bằng tay trong kệ tủ hàng (ví dụ: *Hệ thống báo 15, đếm thực tế được 12 -> Nhập `12`*).
3.  **Dòng [Chênh lệch]:** Hệ thống tự động tính chênh lệch thực tế trừ lý thuyết (ví dụ: hiển thị **`-3`** sản phẩm).
4.  **Ô nhập [Lý do điều chỉnh *]:** Nhập lý do bắt buộc cho chênh lệch (ví dụ: *"Hao hụt rách nhãn", "Khách làm rơi vỡ", "Nhầm lẫn khi thu ngân bán hàng"*).
5.  `[HÌNH ẢNH: Chi tiết một dòng sản phẩm kiểm kho, highlight ô nhập "Thực tế đếm" và dòng chữ đỏ báo chênh lệch thiếu "-3"]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Lệch số lượng tồn kho cực lớn sau khi kiểm kho do nhầm lẫn Đơn vị tính
*   **Hiện tượng:** Bạn kiểm kho sản phẩm *Nước ngọt Pepsi* (hệ thống quy định đơn vị nhỏ nhất là Lon, 1 Thùng = 24 Lon). Bạn đếm thực tế thấy còn 2 Thùng nguyên, liền gõ nhập số lượng thực tế vào ô là **`2`**. Sau khi duyệt, hệ thống hiểu là bạn chỉ còn 2 Lon Pepsi, kho lập tức bị trừ đi mất 46 Lon vô lý.
*   **Nguyên nhân:** Nhân viên kiểm kho gõ số lượng theo Thùng vào ô nhập liệu, trong khi hệ thống yêu cầu khai báo theo Đơn vị tính cơ bản nhỏ nhất là Lon.
*   **Cách xử lý:** 
    1.  *Quy tắc bắt buộc:* **Mọi số lượng khai báo trong ô [Thực tế đếm] bắt buộc phải quy đổi và điền theo Đơn vị tính nhỏ nhất của sản phẩm**.
    2.  *Cách khắc phục:* Lập ngay một phiếu điều kho PDK mới cho sản phẩm Pepsi đó, gõ số lượng thực tế quy đổi đúng là **`48`** (2 thùng x 24 lon) vào ô thực tế đếm và bấm duyệt lại để phần mềm sửa sai.

### Tình huống 2: Phiếu kiểm kho đã tạo nhưng số lượng tồn kho trên POS vẫn báo số cũ
*   **Hiện tượng:** Bạn đã đếm xong và tạo phiếu kiểm kho, nhưng khi nhân viên POS bán hàng vẫn thấy hệ thống hiển thị số lượng tồn kho cũ trước khi kiểm.
*   **Nguyên nhân:** Phiếu kiểm kho mới chỉ được **[Lưu tạm (Draft)]** hoặc ở trạng thái **[Chờ duyệt]**. Hệ thống chưa chính thức chạy lệnh cân kho.
*   **Cách xử lý:** Người có thẩm quyền (Manager/Admin) cần mở phiếu kiểm kho đó ra, rà soát lại lý do chênh lệch và bấm nút **[Phê duyệt điều chỉnh]** để chính thức kích hoạt cân kho trên toàn bộ hệ thống bán lẻ.
