# HƯỚNG DẪN P2P - BƯỚC 2: TÌM NGUỒN HÀNG & GÁN GIÁ VỐN (SOURCING PR)

Sau khi bộ phận chi nhánh lập phiếu đề xuất PR thành công, phiếu sẽ chuyển giao sang cho Bộ phận Mua sắm (Purchasing) để thực hiện khâu **Sourcing** - liên hệ các nhà cung cấp, thương thảo giá vốn tốt nhất và gán nguồn hàng vào phiếu đề xuất.

*   **Ai được quyền sử dụng:** Nhân viên mua hàng (Purchaser), Cửa hàng trưởng hoặc những tài khoản được cấp quyền quản lý mua sắm (`purchasing.manage`).

---

## 1. QUY TRÌNH THỰC HIỆN
1.  Truy cập menu **[Mua sắm]** -> Chọn **[Đề xuất mua hàng (PR)]**.
2.  Lọc danh sách các phiếu đang ở trạng thái **[Chờ báo giá (Pending Sourcing)]** hoặc **[Chờ điền giá (Pending Pricing)]**.
3.  Click mở chi tiết phiếu PR cần xử lý.
4.  **Thao tác gán nguồn và đơn giá (Inputs Scan):**
    *   **Hộp chọn [Nhà cung cấp *]:** Click chọn nhà cung cấp uy tín phù hợp từ danh mục đối tác (ví dụ chọn *"Công ty TNHH Coca-Cola Việt Nam"*).
    *   **Ô nhập [Đơn giá mua dự kiến *]:** Nhập mức đơn giá vốn đàm phán thành công cho từng dòng sản phẩm.
5.  Bấm nút **[Gửi duyệt tài chính]** ở phía cuối bảng.
    *   **Tác động tự động:** Hệ thống tự tính toán tổng trị giá dự kiến của phiếu và tự động chuyển trạng thái PR sang **[Chờ Kế toán duyệt (Pending KTT)]** (PR đã hoàn tất khâu Sourcing).
6.  `[HÌNH ẢNH: Chi tiết giao diện điền giá Sourcing của phiếu PR, highlight cột chọn Nhà cung cấp và ô nhập "Đơn giá mua dự kiến" cho sản phẩm]`

---

## 2. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Không tìm thấy tên Nhà cung cấp trong hộp chọn đối tác
*   **Hiện tượng:** Bạn muốn gán nguồn hàng từ một nhà cung cấp mới thương thảo lần đầu, nhưng khi click vào hộp chọn Nhà cung cấp thì không tìm thấy tên của họ.
*   **Nguyên nhân (Cơ chế dữ liệu):** Nhà cung cấp này chưa được đăng ký hồ sơ Master Data trong cơ sở dữ liệu của hệ thống.
*   **Cách xử lý:** 
    1.  Tạm thời giữ nguyên phiếu PR ở trạng thái nháp.
    2.  Vào menu **[Mua sắm / Đối tác]** -> Chọn **[Nhà cung cấp]** -> Bấm **[Thêm nhà cung cấp]** để khai báo nhanh hồ sơ đối tác mới đó (nhập tên, SĐT, điều khoản thanh toán).
    3.  Quay lại mở phiếu PR đang làm dở, click chọn lại hộp chọn, tên nhà cung cấp mới sẽ xuất hiện để bạn gán vào đơn hàng ngay lập tức.
