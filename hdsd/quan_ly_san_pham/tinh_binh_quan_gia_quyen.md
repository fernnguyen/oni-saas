# HƯỚNG DẪN NGHIỆP VỤ: CÔNG THỨC TÍNH GIÁ VỐN BÌNH QUÂN GIA QUYỀN DI ĐỘNG

Trong quản lý bán lẻ, giá nhập hàng từ nhà cung cấp luôn biến động theo thời gian (ví dụ: *hôm nay nhập sữa đặc giá 15.000đ/hộp, tuần sau tăng lên 17.000đ/hộp*). Để tính toán chính xác lợi nhuận gộp của cửa hàng, ONI.vn áp dụng phương pháp tính giá vốn tiên tiến nhất: **Bình quân gia quyền di động (Moving Weighted Average)**.

Tài liệu này sẽ giải thích bản chất công thức này bằng các ví dụ số học bình dân nhất để bạn và kế toán dễ dàng nắm bắt.

---

## 1. BẢN CHẤT CÔNG THỨC

Mỗi khi bạn duyệt một **Phiếu nhập kho (PN)** mới có đơn giá nhập khác với giá vốn hiện tại, hệ thống ONI.vn sẽ tự động tính toán lại giá vốn của sản phẩm theo công thức sau:

$$\text{Giá vốn mới} = \frac{(\text{Số lượng tồn kho cũ} \times \text{Giá vốn cũ}) + (\text{Số lượng nhập mới} \times \text{Đơn giá nhập mới})}{\text{Số lượng tồn kho cũ} + \text{Số lượng nhập mới}}$$

---

## 2. VÍ DỤ SỐ LIỆU MINH HỌA THỰC TẾ

Hãy cùng đi qua một ví dụ thực tế cực kỳ dễ hiểu đối với mặt hàng **Sữa đặc**:

*   **Trạng thái ban đầu trong kho:**
    *   Số lượng tồn kho cũ: **`10`** hộp.
    *   Giá vốn cũ đang lưu trên hệ thống: **`15.000đ`** / hộp.
    *   *Tổng giá trị kho hiện tại:* `10 hộp x 15.000đ = 150.000đ`.
*   **Phát sinh Phiếu nhập kho (PN) mới:**
    *   Số lượng nhập mới: **`20`** hộp.
    *   Đơn giá nhập mới từ nhà cung cấp (do tăng giá): **`18.000đ`** / hộp.
    *   *Tổng giá trị lô hàng mới nhập:* `20 hộp x 18.000đ = 360.000đ`.
*   **Hệ thống tự động tính toán lại Giá vốn sau khi duyệt phiếu PN:**
    1.  Cộng tổng giá trị hàng cũ và hàng mới: `150.000đ (cũ) + 360.000đ (mới) = 510.000đ`.
    2.  Cộng tổng số lượng hàng trong kho: `10 hộp (cũ) + 20 hộp (mới) = 30 hộp`.
    3.  **Giá vốn bình quân mới:** `510.000đ / 30 hộp = 17.000đ / hộp`.

Như vậy, sau khi nhập kho, giá vốn của mặt hàng sữa đặc trong hệ thống của bạn sẽ tự động thay đổi từ **`15.000đ`** lên **`17.000đ`**. Các đơn hàng bán ra sau thời điểm này sẽ được tính giá vốn là 17.000đ để làm cơ sở tính toán chính xác lợi nhuận gộp.

---

## 3. LƯU Ý NGHIỆP VỤ CỰC KỲ QUAN TRỌNG DÀNH CHO KẾ TOÁN & KHO

Để công thức tính toán giá vốn luôn chính xác 100%, bạn bắt buộc phải tuân thủ các nguyên tắc sau:

1.  **Nhập đúng Đơn giá mua trên Phiếu nhập kho (PN):** 
    *   *Sai lầm thường gặp:* Nhân viên kho khi lập phiếu nhập kho chỉ quan tâm đến số lượng mà quên điền hoặc điền bừa đơn giá mua bằng 0đ hoặc bằng giá bán lẻ.
    *   *Hậu quả:* Hệ thống sẽ hiểu là bạn nhập hàng miễn phí giá 0đ, kéo giá vốn của sản phẩm tụt xuống rất thấp, làm báo cáo lợi nhuận gộp bị phóng đại sai thực tế.
2.  **Thời điểm duyệt phiếu Nhập kho (PN):**
    *   Hãy luôn duyệt phiếu nhập kho **trước khi** thu ngân thực hiện xuất bán lô hàng đó tại POS. 
    *   Nếu thu ngân bán hàng trước khi duyệt phiếu nhập (bán âm kho), hệ thống tạm thời lấy giá vốn cũ để tính lợi nhuận. Khi phiếu nhập được duyệt sau đó, hệ thống sẽ phải tính toán bù trừ hồi quy phức tạp, dễ gây sai lệch số liệu đối soát cuối tháng.
