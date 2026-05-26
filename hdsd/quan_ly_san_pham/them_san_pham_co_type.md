# HƯỚNG DẪN: THÊM SẢN PHẨM THEO PHÂN LOẠI (HÀNG HÓA / DỊCH VỤ / COMBO)

ONI.vn hỗ trợ 3 loại sản phẩm khác nhau phù hợp với mọi mô hình kinh doanh hỗn hợp, giúp quản lý kho và bán hàng chính xác:
1.  **Hàng hóa:** Sản phẩm vật lý thông thường, có theo dõi nhập-xuất-tồn kho.
2.  **Dịch vụ:** Sản phẩm phi vật lý (ví dụ: *giờ chơi bóng, dịch vụ spa, cắt tóc, phí vận chuyển...*), không cần quản lý số lượng tồn kho.
3.  **Combo / Gói sản phẩm:** Đóng gói nhiều sản phẩm thành phần lại bán chung với mức giá ưu đãi (ví dụ: *Gói Combo 1 Nước + 1 Bánh*).

*   **Ai được quyền sử dụng:** Quản trị viên doanh nghiệp (Owner/Admin) hoặc Cửa hàng trưởng (Manager).

---

## 1. QUY TRÌNH THỰC HIỆN VỚI TỪNG LOẠI SẢN PHẨM

### A. Thiết lập Sản phẩm dịch vụ (Service)
Nếu cửa hàng của bạn cung cấp dịch vụ hoặc tính phí giờ:
1.  Tại màn hình thêm mới sản phẩm, tìm tới trường **[Loại sản phẩm (Type)]** -> Chọn **[Dịch vụ]**.
2.  Hệ thống sẽ **tự động TẮT** nút *"Theo dõi tồn kho"*.
3.  **Ô nhập [Đơn giá dịch vụ]:** Điền giá bán của dịch vụ.
4.  Bấm nút **[Lưu]**. Nhân viên thu ngân tại POS có thể bán dịch vụ này không giới hạn số lượng mà không sợ bị chặn lỗi hết hàng trong kho.
5.  `[HÌNH ẢNH: Chọn Loại sản phẩm là "Dịch vụ", highlight nút "Theo dõi tồn kho" tự động bị tắt mờ đi]`

### B. Thiết lập Gói sản phẩm Combo
Combo giúp kích thích khách hàng mua nhiều hàng hóa hơn bằng cách đóng gói các món bán chạy lại với nhau:
1.  Tại màn hình thêm sản phẩm, chọn **[Loại sản phẩm (Type)]** -> Chọn **[Combo / Gói sản phẩm]**.
2.  Màn hình sẽ hiển thị thêm một bảng **[Thành phần Combo]**.
3.  **Thao tác gán thành phần (Inputs Scan):**
    *   **Ô tìm kiếm sản phẩm:** Gõ tên hoặc quét mã vạch sản phẩm thành phần muốn đưa vào combo.
    *   **Ô nhập [Số lượng]:** Điền số lượng của sản phẩm thành phần đó (ví dụ: Combo trà sữa ăn kèm gồm *1 Trà sữa sữa đá* số lượng 1, và *1 Bánh mì ngọt* số lượng 1).
4.  **Ô nhập [Giá bán Combo]:** Điền giá bán trọn gói của Combo (thường rẻ hơn tổng giá trị mua lẻ từng món).
5.  Bấm nút **[Lưu]**.
6.  `[HÌNH ẢNH: Giao diện thêm Combo, highlight khu vực thêm danh sách sản phẩm thành phần và ô nhập giá bán trọn gói của Combo]`

---

## 2. CƠ CHẾ TRỪ TỒN KHO CỦA COMBO (ĐẶC THÙ NGHIỆP VỤ)

Một điểm cực kỳ quan trọng kế toán cần lưu ý khi quản lý Combo:
*   Bản thân gói Combo **không có số lượng tồn kho độc lập**.
*   Tồn kho của Combo phụ thuộc hoàn toàn vào tồn kho của các sản phẩm thành phần cấu thành bên trong nó.
*   **Khi bán 1 Combo tại POS:** Hệ thống sẽ tự động tìm kiếm và **trừ đi số lượng tồn kho của từng sản phẩm thành phần tương ứng** có trong kho chi nhánh.
*   *Ví dụ:* Bạn bán 1 "Combo Trà sữa Bánh ngọt" (gồm 1 trà sữa và 1 bánh ngọt). Tồn kho của mặt hàng *Trà sữa* sẽ tự động giảm đi 1, và tồn kho của mặt hàng *Bánh ngọt* cũng tự động giảm đi 1.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: POS báo lỗi không cho bán Combo vì "Hết hàng trong kho"
*   **Hiện tượng:** Thu ngân chọn gói Combo ở POS để bán nhưng hệ thống hiện thông báo lỗi đỏ *"Sản phẩm thành phần đã hết hàng trong kho"* và chặn không cho thanh toán.
*   **Nguyên nhân:** Một trong những sản phẩm thành phần bên trong Combo đã thực tế hết hàng trong kho của chi nhánh (tồn kho bằng 0) và hệ thống đang ở chế độ chặn bán khống.
*   **Cách xử lý:** 
    1.  Kiểm tra xem sản phẩm thành phần nào bị hết hàng bằng cách tra cứu tồn kho từng mặt hàng.
    2.  Tiến hành lập Phiếu nhập kho (PN) cho sản phẩm thành phần bị thiếu đó, hoặc tạm thời gỡ sản phẩm đó ra khỏi Combo để nhân viên bán các mặt hàng khác.

### Tình huống 2: Sửa giá sản phẩm thành phần nhưng giá Combo không tự động thay đổi
*   **Hiện tượng:** Bạn tăng giá bán lẻ của sản phẩm *Trà sữa* lên 5.000đ, nhưng giá gói "Combo Trà sữa Bánh ngọt" vẫn giữ nguyên giá cũ.
*   **Nguyên nhân (Cơ chế giá):** Giá bán Combo được cấu hình cố định độc lập để phục vụ chương trình khuyến mãi đóng gói ưu đãi. Giá Combo không tự động cộng dồn theo giá bán lẻ của các món thành phần.
*   **Cách xử lý:** Khi thay đổi giá các món lẻ, bạn cần vào lại cài đặt của gói Combo để điều chỉnh thủ công mức **[Giá bán Combo]** cho phù hợp với chính sách mới của cửa hàng.
