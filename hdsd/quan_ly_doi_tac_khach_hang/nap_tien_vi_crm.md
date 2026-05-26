# HƯỚNG DẪN: QUY TRÌNH NẠP VÀ TIÊU DÙNG VÍ TRẢ TRƯỚC CRM (CRM WALLET)

Tính năng **Ví trả trước CRM (CRM Wallet)** cho phép khách hàng quen gửi trước một khoản tiền mặt hoặc chuyển khoản vào tài khoản thành viên của họ tại cửa hàng để tiêu dùng dần khi mua sắm. 

Tính năng này giúp tăng doanh số thu tiền trước, gắn kết khách hàng thành viên trung thành và rút ngắn thời gian thanh toán tại quầy POS chỉ còn 2 giây không cần thối tiền lẻ.

*   **Ai được quyền sử dụng:** Kế toán trưởng, Quản trị viên doanh nghiệp (Owner/Admin) hoặc Cửa hàng trưởng (Manager).

---

## 1. QUY TRÌNH NẠP TIỀN VÀO VÍ TRẢ TRƯỚC CRM
Khi khách hàng muốn nạp tiền sẵn vào ví thành viên:
1.  Truy cập menu **[Khách hàng]** -> Chọn hồ sơ khách hàng muốn nạp tiền.
2.  Bấm vào nút **[Nạp ví / Điều chỉnh ví]** (hoặc biểu tượng ví tiền trên hồ sơ).
3.  **Các trường thông tin cần nhập (Inputs Scan):**
    *   **Ô nhập [Số tiền nạp *]:** Nhập số tiền khách muốn nạp (ví dụ: *1.000.000đ*).
    *   **Hộp chọn [Hình thức thu tiền *]:** Chọn Tiền mặt hoặc Chuyển khoản ngân hàng.
    *   **Ô nhập [Ghi chú nạp ví]:** Điền ghi chú (ví dụ: *"Khách nạp tiền ví hưởng khuyến mãi tặng 5% ngày vàng"*).
4.  Bấm **[Xác nhận nạp ví]**.
    *   **Side-effects tự động của hệ thống:**
        1.  Số dư Ví tiền của khách hàng lập tức tăng thêm 1.000.000đ.
        2.  Hệ thống tự động sinh 1 **Phiếu thu (Receipt)** trong Sổ quỹ (Cashbook) của chi nhánh có danh mục là *[Nạp ví khách hàng]* để cân đối quỹ tiền mặt thực thu tại quầy.
5.  `[HÌNH ẢNH: Bảng nạp tiền Ví CRM, highlight ô nhập "Số tiền nạp", hình thức "Chuyển khoản" và nút "Xác nhận nạp ví"]`

---

## 2. QUY TRÌNH TIÊU DÙNG VÍ THANH TOÁN TẠI POS
Tại quầy bán hàng POS khi thanh toán đơn hàng cho khách:
1.  Thu ngân gõ số điện thoại chọn khách hàng thành viên.
2.  Bấm **[Thanh toán (F9)]** -> Chọn phương thức thanh toán là **[Ví CRM]**.
3.  Hệ thống hiển thị rõ số dư ví hiện tại của khách (ví dụ: *Ví: 1.000.000đ*).
4.  **Các kịch bản thanh toán ví:**
    *   *Số dư ví lớn hơn giá trị đơn hàng (Đơn 300K):* Nhấn hoàn tất, hệ thống trừ trực tiếp 300.000đ vào ví khách hàng, in bill thành công. Số dư ví còn lại hiển thị trên bill là 700.000đ.
    *   *Số dư ví nhỏ hơn giá trị đơn (Ví còn 200K, đơn 500K):* Thu ngân chọn trừ hết 200.000đ của ví khách, số tiền thiếu 300.000đ còn lại chọn thanh toán thêm bằng *[Tiền mặt]* hoặc *[Chuyển khoản]*.
5.  `[HÌNH ẢNH: Giao diện bảng thanh toán POS, highlight phương thức chọn "Ví CRM", ô báo Số dư ví của khách và nút Hoàn tất]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Sổ quỹ bị lệch tiền mặt do kế toán nạp nhầm số tiền ví cho khách
*   **Hiện tượng:** Khách đưa 500.000đ nạp ví, kế toán gõ nhầm thêm một số 0 thành **`5.000.000đ`** và bấm xác nhận. Ví khách tăng 5 triệu vô lý, sổ quỹ trên phần mềm cũng tự động tăng thêm phiếu thu 5 triệu, lệch két nghiêm trọng.
*   **Cách xử lý (Quy trình sửa sai tài chính):**
    1.  *Tuyệt đối không* cho khách hàng sử dụng ví trước khi sửa xong.
    2.  Vào lại hồ sơ khách hàng -> Bấm nút **[Điều chỉnh ví / Rút ví]**.
    3.  Nhập số tiền điều chỉnh giảm là **`-4.500.000đ`** (mã số âm để trừ bớt tiền ví) kèm lý do ghi rõ: *"Sửa sai sót nạp nhầm tiền ví ngày 26/05"*.
    4.  Bấm xác nhận để đưa số dư ví khách về đúng 500.000đ thực tế.
    5.  Vào **[Sổ quỹ]** -> Tìm Phiếu thu tự động nạp ví 5 triệu cũ, bấm **[Hủy phiếu thu]** để két tiền mặt trên hệ thống cân đối hoàn toàn chính xác.
