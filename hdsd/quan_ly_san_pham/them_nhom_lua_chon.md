# HƯỚNG DẪN: TẠO VÀ QUẢN LÝ NHÓM LỰA CHỌN (MODIFIER GROUPS)

**Nhóm lựa chọn** là tập hợp các tùy chọn pha chế, kích thước hoặc các món kèm theo (Topping) có chung tính chất. Việc tạo nhóm lựa chọn giúp bạn dễ dàng quản lý tập trung và tái sử dụng bằng cách gắn nhóm này vào nhiều sản phẩm khác nhau mà không cần cấu hình thủ công từng món.

*   *Ví dụ:* Tạo một nhóm có tên *"Topping Trà sữa"*, sau đó gắn nhóm này vào cả *Trà sữa truyền thống*, *Hồng trà sữa*, và *Sữa tươi trân châu đường đen*.

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin) hoặc Cửa hàng trưởng (Manager).

---

## 1. QUY TRÌNH THỰC HIỆN
1.  Vào menu **[Sản phẩm]** (hoặc **[Danh mục]**), chọn **[Nhóm lựa chọn]**.
2.  Bấm nút **[+ Thêm nhóm lựa chọn]** ở góc trên bên phải.
3.  Khai báo các quy tắc và chi tiết lựa chọn (theo hướng dẫn bên dưới).
4.  Bấm **[Lưu nhóm]** để hoàn tất.
5.  `[HÌNH ẢNH: Giao diện tạo mới Nhóm lựa chọn, highlight khu vực cấu hình ràng buộc lựa chọn và nút "Lưu nhóm"]`

---

## 2. GIẢI THÍCH CHI TIẾT CÁC CẤU HÌNH (INPUTS SCAN)

Khi tạo một Nhóm lựa chọn mới, bạn cần quét qua các trường thông tin quan trọng sau:

### A. Thông tin chung & Ràng buộc lựa chọn
*   **Ô nhập [Tên nhóm lựa chọn *]:** Đặt tên dễ nhớ và trực quan (ví dụ: *"Chọn mức đường"*, *"Thêm Topping"*). Tên này sẽ hiển thị làm tiêu đề nhóm trên bảng POS cho nhân viên chọn.
*   **Hộp chọn [Số lượng chọn tối thiểu]:**
    *   **Nhập `0`:** Khách hàng **không bắt buộc** phải chọn tùy chọn trong nhóm này (ví dụ: nhóm Topping, khách có thể không thêm topping nào).
    *   **Nhập `1`:** Khách hàng **bắt buộc phải chọn ít nhất 1 tùy chọn** trong nhóm mới được thanh toán (ví dụ: nhóm Mức đường, bắt buộc phải chọn 100% đường, 50% đường hoặc không đường).
*   **Hộp chọn [Số lượng chọn tối đa]:**
    *   **Nhập `1`:** Khách hàng **chỉ được chọn duy nhất 1** tùy chọn (nút chọn hình tròn - radio button). Phù hợp cho nhóm size ly (M hoặc L), nhóm mức đường/đá.
    *   **Nhập số lớn hơn 1 (hoặc không giới hạn):** Khách hàng được phép tích chọn nhiều tùy chọn cùng lúc (nút chọn hình vuông - checkbox). Phù hợp cho nhóm Topping, khách có thể vừa thêm trân châu vừa thêm thạch nha đam.

### B. Danh sách Lựa chọn chi tiết
Bấm nút **[+ Thêm dòng tùy chọn]** để nhập các giá trị lựa chọn:
1.  **Ô nhập [Tên tùy chọn *]:** Nhập giá trị cụ thể (ví dụ: *"Trân châu đen"*, *"Ít đá"*).
2.  **Ô nhập [Giá cộng thêm (VND)]:** 
    *   Điền **`0`** nếu tùy chọn này hoàn toàn miễn phí (ví dụ: *"Ít đá"*, *"Không đường"*).
    *   Điền số tiền (ví dụ: **`5000`**) nếu khách chọn tùy chọn này sẽ phải trả thêm tiền. Tiền này sẽ tự cộng dồn vào giá trị sản phẩm chính trên hóa đơn.
3.  Lặp lại thao tác để thêm đầy đủ các lựa chọn trong nhóm.
4.  `[HÌNH ẢNH: Bảng nhập danh sách lựa chọn chi tiết, highlight cột "Tên tùy chọn" và cột "Giá cộng thêm"]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Nhân viên POS bị kẹt không thể bấm xác nhận thêm món vào giỏ hàng
*   **Hiện tượng:** Thu ngân click chọn trà sữa, bảng tùy chọn hiện ra nhưng nút **[Xác nhận]** bị xám mờ và không thể click được.
*   **Nguyên nhân:** Nhóm lựa chọn đó có cấu hình **[Số lượng chọn tối thiểu]** từ `1` trở lên (bắt buộc chọn), nhưng nhân viên thu ngân đã bỏ qua và không tích chọn bất kỳ tùy chọn nào trong nhóm đó.
*   **Cách xử lý:** 
    1.  Nhìn vào các nhóm tùy chọn có đánh dấu sao đỏ hoặc ghi chú *"Bắt buộc chọn"*.
    2.  Tích chọn đúng 1 yêu cầu của khách (ví dụ chọn *"Đá riêng"* hoặc *"100% Đường"*) để nút **[Xác nhận]** sáng xanh trở lại.

### Tình huống 2: Sửa tên tùy chọn trên Nhóm lựa chọn làm lệch lịch sử đơn cũ
*   **Hiện tượng:** Bạn đổi tên tùy chọn *"Trân châu đen"* thành *"Trân châu hoàng kim"* trên nhóm lựa chọn. Khi xem lại các đơn hàng cũ đã bán tuần trước, hệ thống hiển thị tên topping của đơn cũ cũng bị đổi sang *"Trân châu hoàng kim"*, gây khó khăn cho việc đối soát.
*   **Nguyên nhân (Cơ chế lưu trữ):** Việc sửa trực tiếp tên tùy chọn trên Master Data của nhóm lựa chọn sẽ cập nhật toàn bộ tham chiếu dữ liệu.
*   **Cách xử lý:** Để giữ nguyên lịch sử báo cáo của đơn hàng cũ:
    1.  Không nên sửa tên các tùy chọn cũ đã có phát sinh giao dịch bán hàng.
    2.  Hãy tắt hoạt động (Deactive) tùy chọn cũ đó.
    3.  Tạo thêm 1 dòng tùy chọn mới hoàn toàn có tên là *"Trân châu hoàng kim"* trong nhóm lựa chọn đó.
    4.  Như vậy đơn hàng cũ vẫn giữ nguyên nhãn *"Trân châu đen"*, và đơn mới bán từ nay về sau sẽ dùng nhãn *"Trân châu hoàng kim"*.
