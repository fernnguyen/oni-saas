# HƯỚNG DẪN: QUY TRÌNH QUẢN LÝ VAI TRÒ & PHÂN QUYỀN THÀNH VIÊN (RBAC)

Để đảm bảo an toàn tuyệt đối cho dữ liệu doanh nghiệp và tránh gian lận, ONI.vn áp dụng cơ chế phân quyền theo vai trò (RBAC - Role-Based Access Control). Bạn có thể gán các quyền hạn chi tiết cho từng nhân viên theo đúng phần việc của họ.

---

## 1. PHÂN BIỆT VAI TRÒ HỆ THỐNG & VAI TRÒ TỰ TẠO

Hệ thống chia làm hai loại vai trò chính:

1. **Vai trò Hệ thống (System Roles):** 
   * Là các vai trò có sẵn của ONI.vn gồm: **Owner (Chủ sở hữu)**, **Admin (Giám đốc)**, **Staff (Thu ngân)**, **Viewer (Giám sát)**.
   * Các vai trò này được thiết lập quyền mặc định tối ưu theo nghiệp vụ thực tế. Bạn **không thể sửa đổi hay xóa** các vai trò này mà chỉ có thể gán cho nhân viên hoặc xem chi tiết.
2. **Vai trò Tự tạo (Custom Roles):** 
   * Dành riêng cho các gói nâng cao (Pro/Enterprise).
   * Cho phép bạn tự tạo các chức danh đặc thù như *"Nhân viên Bếp"*, *"Kế toán trưởng"*, *"Quản lý kho chi nhánh"*... và tự tay chọn từng quyền hạn nhỏ nhất.

---

## 2. QUY TRÌNH TẠO MỚI / CHỈNH SỬA VAI TRÒ TỰ CHỌN

Chỉ tài khoản Chủ sở hữu (Owner) hoặc Giám đốc (Admin) mới có quyền truy cập tính năng này.

### Các bước thực hiện:
1. Đăng nhập hệ thống -> Chọn mục **[Phân quyền / Roles]** trên thanh menu bên trái.
2. Bấm nút **[Tạo vai trò]** màu xanh dương ở góc trên bên phải.
3. **Các trường thông tin cần nhập (Inputs Scan) trên Form:**
   * **Ô nhập [Tên vai trò *]:** Điền chức danh công việc (ví dụ: *"Thủ kho chi nhánh"*).
   * **Hộp chọn [Phạm vi áp dụng *]:**
     * *Toàn bộ Workspace (Tất cả chi nhánh)*: Thích hợp cho vai trò quản lý chuỗi, kế toán tổng.
     * *Chi nhánh cụ thể (Được gán sau)*: Chỉ hoạt động trong phạm vi cửa hàng được chỉ định (thích hợp cho thu ngân, thủ kho).
   * **Ô nhập [Mô tả vai trò]:** Mô tả ngắn gọn chức năng để tránh nhầm lẫn khi gán.
   * **Khu vực [Phân quyền chi tiết *]:** Danh sách các quyền được nhóm lại theo từng phân hệ nghiệp vụ (Sản phẩm, Đơn hàng, Kho, Sổ quỹ, Mua sắm P2P...).
     * Tích chọn checkbox trước mỗi quyền cụ thể để cấp quyền đó cho vai trò.
     * Bấm nút **[Chọn tất cả]** ở đầu nhóm quyền để gán nhanh tất cả quyền trong phân hệ đó.
4. Bấm nút **[Lưu vai trò]** (hoặc **[Cập nhật]** nếu là chỉnh sửa).
5. Hệ thống sẽ lưu và gán tích xanh thành công.

`[HÌNH ẢNH: Giao diện tạo vai trò mới, minh họa bảng phân quyền chi tiết theo từng nhóm như Sản phẩm, Đơn hàng, Báo cáo]`

---

## 3. TÍNH NĂNG NHÂN BẢN NHANH (SAO CHÉP VAI TRÒ)

Nếu bạn muốn tạo một vai trò mới gần giống vai trò có sẵn (ví dụ: tạo vai trò "Phó kho" dựa trên quyền của "Trưởng kho" nhưng bớt đi quyền phê duyệt cân kho):
1. Tại màn hình danh sách Vai trò, tìm đến vai trò gốc -> Bấm nút **[Sao chép]**.
2. Hệ thống mở form tạo vai trò mới với các checkbox quyền được copy y nguyên từ vai trò gốc.
3. Bạn đổi lại **Tên vai trò**, tích bỏ bớt một vài quyền không cần thiết, rồi bấm **[Lưu vai trò]** là hoàn tất.

---

## 4. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Hệ thống chặn không cho xóa vai trò và báo lỗi đỏ "Vai trò đang được sử dụng"
* **Hiện tượng:** Bạn bấm nút Xóa vai trò tùy chỉnh nhưng hệ thống hiện bảng thông báo lỗi màu vàng cam và liệt kê danh sách người dùng.
* **Nguyên nhân:** Có nhân viên trong cửa hàng đang được gán vai trò này. Việc xóa vai trò sẽ khiến tài khoản của họ bị lỗi mất quyền truy cập đột ngột, nên hệ thống chặn lại để đảm bảo an toàn.
* **Cách xử lý:**
  1. Đọc kỹ danh sách tên nhân viên hiển thị trên bảng thông báo chặn.
  2. Vào mục **[Thành viên / Team]**, tìm đến từng nhân viên đó, bấm nút **[Phân quyền]** để chuyển họ sang một vai trò khác (ví dụ: chuyển tạm sang vai trò *Nhân viên Thu ngân*).
  3. Sau khi không còn nhân viên nào mang vai trò cần xóa, quay lại mục Phân quyền và thực hiện bấm nút **[Xóa]** bình thường.

### Tình huống 2: Biểu tượng Ổ khóa `🔒` hiển thị tại các ô phân quyền nâng cao
* **Hiện tượng:** Trên bảng chọn quyền xuất hiện các ô phân quyền bị khóa kèm biểu tượng ổ khóa xám.
* **Nguyên nhân:** Các tính năng phân quyền chuyên sâu (như quyền duyệt chi tiêu P2P, xem báo cáo tài chính nâng cao) chỉ khả dụng ở các gói cước cao hơn (Pro/Enterprise).
* **Cách xử lý:**
  1. Liên hệ Chủ doanh nghiệp nâng cấp gói dịch vụ của Workspace để mở khóa toàn bộ đặc quyền phân bổ nhân sự nâng cao.
