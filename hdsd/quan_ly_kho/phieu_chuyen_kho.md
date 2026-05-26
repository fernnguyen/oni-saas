# HƯỚNG DẪN: QUY TRÌNH ĐIỀU CHUYỂN HÀNG HÓA GIỮA CÁC CHI NHÁNH

Đối với các doanh nghiệp sở hữu chuỗi nhiều cửa hàng/chi nhánh, việc luân chuyển hàng hóa qua lại để hỗ trợ nhau khi một chi nhánh bị cháy hàng và chi nhánh khác bị tồn đọng là nghiệp vụ diễn ra thường xuyên.

ONI.vn cung cấp quy trình **Chuyển kho liên chi nhánh** cực kỳ chặt chẽ qua 3 bước trạng thái, giúp theo dõi chính xác lượng hàng "đang đi đường" và ngăn ngừa thất thoát trong quá trình vận chuyển.

*   **Ai được quyền sử dụng:** Giám đốc chi nhánh (Manager) của cả 2 chi nhánh nguồn/đích, Thủ kho hoặc tài khoản có quyền `warehouse.manage`.

---

## 1. QUY TRÌNH ĐIỀU CHUYỂN KHO 3 BƯỚC CHUẨN HÓA

```
[Bước 1: Lập phiếu] Khởi tạo phiếu điều chuyển (Draft / Pending)
       │
       ▼
[Bước 2: Xuất đi] Chi nhánh Nguồn xác nhận xuất hàng đi (Trạng thái: Shipped / CKX)
       │
       ▼
[Bước 3: Nhận hàng] Chi nhánh Đích nhận hàng & xác nhận tăng tồn (Trạng thái: Received / CKV)
```

---

## 2. HƯỚNG DẪN CHI TIẾT TỪNG BƯỚC THAO TÁC

### Bước 1: Lập Phiếu Đề xuất điều chuyển kho
1.  Truy cập menu **[Kho]** -> Chọn **[Chuyển kho]** -> Bấm **[Tạo phiếu chuyển kho]**.
2.  **Các trường thông tin cần nhập (Inputs Scan):**
    *   **Hộp chọn [Chi nhánh nguồn *]:** Chọn chi nhánh sẽ đóng vai trò xuất hàng đi.
    *   **Hộp chọn [Chi nhánh đích *]:** Chọn chi nhánh của bạn (sẽ nhận hàng về).
    *   **Danh sách sản phẩm điều chuyển:** Chọn các sản phẩm cần mượn hàng và điền số lượng tương ứng tại cột **[Số lượng điều chuyển]**.
    *   **Ô nhập [Ghi chú]:** Ghi chú lý do chuyển (ví dụ: *"Điều chuyển 10 áo thun từ Quận 3 về Quận 1 do Quận 1 đang cháy hàng"*).
3.  Bấm **[Lưu tạm]** -> Phiếu ở trạng thái **[Chờ xuất (Pending)]**.

---

### Bước 2: Chi nhánh nguồn thực hiện Xuất kho (CKX)
1.  Thủ kho hoặc quản lý tại **Chi nhánh nguồn** nhận được thông báo yêu cầu chuyển kho.
2.  Mở chi tiết phiếu chuyển kho đang ở trạng thái *[Pending]*.
3.  Kiểm đếm hàng hóa thực tế và đóng gói sản phẩm.
4.  Bấm nút **[Xác nhận xuất hàng đi (Shipped)]**.
    *   **Tác động tức thì:** Tồn kho sản phẩm tại Chi nhánh nguồn lập tức **bị trừ đi**. Hàng hóa lúc này nằm ở trạng thái *"Đang vận chuyển"* trên xe và chưa được cộng vào chi nhánh đích.
5.  `[HÌNH ẢNH: Chi tiết phiếu chuyển kho, highlight nút bấm "Xác nhận xuất hàng đi (Shipped)" nổi bật màu xanh dương]`

---

### Bước 3: Chi nhánh đích thực hiện Nhận kho (CKV)
1.  Khi xe chở hàng chuyển tới **Chi nhánh đích** của bạn:
2.  Thủ kho chi nhánh đích mở chi tiết phiếu chuyển kho đang ở trạng thái *[Shipped]*.
3.  Thực hiện kiểm đếm thực tế số lượng hàng hóa được bàn giao từ xe chuyển hàng.
4.  Bấm nút **[Xác nhận đã nhận hàng (Received)]**.
    *   **Tác động tức thì:** Tồn kho tại Chi nhánh đích của bạn lập tức **được cộng tăng lên** chính xác. Phiếu chuyển kho hoàn thành và khóa dữ liệu.
5.  `[HÌNH ẢNH: Chi tiết phiếu chuyển kho trạng thái Shipped dưới góc nhìn chi nhánh đích, highlight nút "Xác nhận đã nhận hàng (Received)" màu xanh lá]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Hàng bị thất thoát hoặc hư hỏng trong quá trình vận chuyển trên xe
*   **Hiện tượng:** Chi nhánh nguồn bấm xác nhận xuất đi 10 sản phẩm (trạng thái `Shipped`), nhưng khi xe chở đến chi nhánh đích, thủ kho đếm thực tế chỉ nhận được 8 sản phẩm (do bị rơi mất hoặc vỡ hỏng dọc đường).
*   **Cách xử lý (Quy tắc nhận hàng):**
    1.  Thủ kho chi nhánh đích **tuyệt đối không** bấm xác nhận nhận đủ 10 sản phẩm.
    2.  Tại giao diện nhận hàng, click vào dòng sản phẩm bị thiếu, sửa lại ô số lượng thực nhận là **`8`**.
    3.  Bấm **[Xác nhận đã nhận hàng (Received)]**.
    4.  *Cơ chế tự động:* Chi nhánh đích chỉ tăng tồn kho thêm **`8`** sản phẩm. Hệ thống ghi nhận 2 sản phẩm chênh lệch bị thiếu vào cột **[Hao hụt vận chuyển (Transit Loss)]** gắn trách nhiệm cho tài xế hoặc quy vào chi phí tổn thất chi nhánh.
