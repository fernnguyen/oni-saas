# HƯỚNG DẪN: QUY TRÌNH LẬP PHIẾU XUẤT KHO NỘI BỘ (PX)

Bên cạnh việc xuất kho tự động khi thu ngân bán lẻ tại quầy POS, cửa hàng thường phát sinh các nghiệp vụ xuất kho phi thương mại (không thu tiền mặt trực tiếp).

Hệ thống ONI.vn cung cấp công cụ **Lập phiếu xuất kho (mã PX)** để ghi nhận chính xác dòng hàng đi ra ngoài vì các mục đích đặc thù của doanh nghiệp.

*   **Ai được quyền sử dụng:** Giám đốc chi nhánh (Manager), Thủ kho hoặc tài khoản có quyền quản lý kho (`warehouse.manage`).

---

## 1. CÁC MỤC ĐÍCH XUẤT KHO PHI THƯƠNG MẠI
Bạn cần lập phiếu xuất kho PX thủ công trong các trường hợp sau:
1.  **Tiêu dùng nội bộ:** Xuất nguyên vật liệu thô, sản phẩm để phục vụ hoạt động của cửa hàng (ví dụ: *xuất nước lau sàn để vệ sinh quán, xuất sữa tươi để nhân viên pha chế test thử công thức mới*).
2.  **Hủy hàng hỏng/hết hạn:** Xuất hủy hàng hóa bị vỡ, rách bao bì, cận date/hết hạn sử dụng không thể bán được nữa.
3.  **Hao hụt/Mất mát:** Xuất cân đối giảm kho khi phát hiện chênh lệch thiếu sau kiểm kho mà chưa rõ nguyên nhân.
4.  **Xuất trả hàng cho Nhà cung cấp:** Xuất trả lại hàng lỗi cho nhà sản xuất.

---

## 2. QUY TRÌNH THỰC HIỆN XUẤT KHO THỦ CÔNG
1.  Truy cập menu **[Kho]** -> Chọn **[Phiếu xuất kho]** -> Bấm **[Tạo phiếu xuất mới]**.
2.  **Các trường thông tin cần nhập (Inputs Scan):**
    *   **Hộp chọn [Chi nhánh xuất *]:** Chọn chi nhánh thực hiện xuất hàng.
    *   **Hộp chọn [Lý do xuất kho *]:** Chọn Tiêu dùng nội bộ, Xuất hủy hàng hỏng, Hao hụt kho, hoặc Xuất trả nhà cung cấp.
    *   **Danh sách sản phẩm xuất:** Tìm kiếm hoặc quét mã vạch để thêm sản phẩm cần xuất.
    *   **Ô nhập [Số lượng xuất *]:** Số lượng hàng thô thực tế xuất ra (đối chiếu theo đơn vị tính cơ bản).
    *   **Ô nhập [Ghi chú chi tiết]:** Ghi rõ lý do chi tiết (ví dụ: *"Hủy 2 chai sữa tươi do tủ lạnh bị hỏng block làm chua sữa ngày 25/05"*).
3.  Bấm **[Phê duyệt hoàn tất xuất kho]**.
    *   **Side-effect tự động:** Tồn kho sản phẩm tại chi nhánh sẽ lập tức giảm đi tương ứng, hệ thống ghi nhận một khoản chi phí hao hụt vào báo cáo tài chính cuối tháng.
4.  `[HÌNH ẢNH: Giao diện lập phiếu xuất kho PX, highlight hộp chọn Lý do xuất kho "Xuất hủy hàng hỏng", danh sách sản phẩm và nút "Phê duyệt hoàn tất"]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Nhân viên kho tự ý xuất hủy hàng hỏng làm lệch sổ sách tài chính
*   **Hiện tượng:** Kho thực tế bị hao hụt nhiều hàng, nhân viên tự ý lập hàng loạt phiếu PX loại *[Xuất hủy hàng hỏng]* để đưa tồn kho trên phần mềm về đúng số thực tế mà không báo cáo quản lý, gây thất thoát tài sản nghiêm trọng.
*   **Nguyên nhân:** Phân quyền vai trò nhân viên kho quá lỏng lẻo, cho phép tự duyệt phiếu xuất kho không cần sự phê duyệt của cấp trên.
*   **Cách xử lý:**
    1.  *Chỉnh sửa phân quyền (Quản trị viên):* Vào cài đặt Phân quyền vai trò (RBAC), tước quyền duyệt phiếu xuất kho (`warehouse.approve`) của vai trò nhân viên kho thông thường.
    2.  *Quy trình chuẩn:* Nhân viên kho chỉ được phép tạo phiếu xuất ở trạng thái **[Chờ duyệt (Pending)]**. 
    3.  Cửa hàng trưởng hoặc Giám đốc chi nhánh bắt buộc phải kiểm tra thực tế hàng vỡ hỏng tại quầy, sau đó mới dùng tài khoản quản lý bấm **[Duyệt hoàn tất]** thì kho mới chính thức trừ.
