# TỔNG QUAN HỆ THỐNG VÀ LUỒNG NGHIỆP VỤ VẬN HÀNH CƠ BẢN

Hệ thống ONI.vn được thiết kế chuyên nghiệp chia làm **2 không gian giao diện riêng biệt** tương ứng với 2 cấp độ quản trị doanh nghiệp:

1.  **Bảng điều khiển tổ chức (Control Plane - `/dashboard`):** Dành cho chủ doanh nghiệp quản lý vĩ mô toàn bộ tổ chức (danh sách chi nhánh, phân quyền nhân sự, cấu hình kết nối dữ liệu nâng cao, và thanh toán gói cước subscription).
2.  **Dashboard nghiệp vụ chi nhánh (Shop Dashboard - `/t/[slug]/[branch]`):** Màn hình vi mô điều hành hoạt động bán hàng hàng ngày tại từng chi nhánh cụ thể (Bán hàng POS, quản lý Đơn hàng, quản lý Kho hàng, CRM khách hàng, mua sắm nội bộ P2P và các báo cáo doanh số).

---

## 1. LUỒNG NGHIỆP VỤ VẬN HÀNH TIÊU CHUẨN (6 BƯỚC)

Để đưa cửa hàng của bạn đi vào hoạt động trơn tru không thất thoát, hãy thực hiện theo đúng luồng nghiệp vụ 6 bước tiêu chuẩn sau:

```
[Bước 1] Đăng ký không gian làm việc Workspace doanh nghiệp mới
   │
   ▼
[Bước 2] Tạo chi nhánh và Mời nhân viên, gán vai trò phân quyền (RBAC)
   │
   ▼
[Bước 3] Lập danh mục Sản phẩm, Topping/Modifier và thiết lập Giá bán lẻ/Giá sỉ
   │
   ▼
[Bước 4] Lập phiếu Nhập kho (PN) để tăng tồn kho nguyên vật liệu và sản phẩm thô
   │
   ▼
[Bước 5] Nhân viên mở ca làm việc, thực hiện bán hàng POS Retail hoặc F&B tại quầy
   │
   ▼
[Bước 6] Cuối ngày: Thu ngân chốt ca kiểm quỹ, Kế toán đối soát doanh thu và Sổ quỹ
```

---

## 2. GIỚI THIỆU NHANH CÁC KHU VỰC CHỨC NĂNG

Khi bạn đăng nhập vào **Dashboard nghiệp vụ chi nhánh**, menu điều hướng bên trái (Sidebar) sẽ cung cấp đầy đủ các phân hệ chức năng:
*   **Mục [Tổng quan]:** Xem nhanh biểu đồ xu hướng doanh thu hàng ngày, xếp hạng sản phẩm bán chạy nhất, các chỉ số KPI doanh thu hôm nay và thống kê phương thức thanh toán tiền mặt/chuyển khoản.
*   **Mục [Bán tại quầy (POS)]:** Giao diện chuyên nghiệp cho nhân viên thu ngân quét mã vạch bán hàng hoặc đặt bàn/gọi món F&B.
*   **Mục [Đơn hàng]:** Theo dõi danh sách hóa đơn, in lại bill và thực hiện các nghiệp vụ đổi trả hoặc hủy đơn.
*   **Mục [Kho]:** Quản lý phiếu nhập kho PN, xuất kho PX, điều chuyển kho giữa các chi nhánh và cân kho PDK.
*   **Mục [Khách hàng & Đối tác]:** Quản lý hồ sơ CRM thành viên, ví trả trước nạp tiền và danh sách công nợ Nhà cung cấp.
*   **Mục [Mua sắm (P2P)]:** Quy trình lập đề xuất PR, báo giá mua hàng và nhập kho đối chiếu GRN từ nhà cung cấp.
*   **Mục [Báo cáo]:** Thống kê chi tiết tài chính doanh thu, dòng tiền thực thu chi sổ quỹ phục vụ kế toán.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Sidebar menu bị trống trơn, không hiển thị các phân hệ Đơn hàng/Kho/POS
*   **Hiện tượng:** Bạn đăng nhập thành công vào chi nhánh, nhưng thanh điều hướng bên trái trống trơn, không có các nút Đơn hàng, Sản phẩm hay Kho để click.
*   **Nguyên nhân (Quyền truy cập và Ngữ cảnh):**
    1.  Tài khoản của bạn đang ở giao diện *Control Plane* quản trị tổ chức (tại đây hệ thống chỉ hiển thị menu quản lý chi nhánh, quản lý vai trò và billing).
    2.  Vai trò tài khoản của bạn bị phân quyền ở cấp độ *Chỉ xem (Viewer)* hoặc bị tước hết các quyền xem nghiệp vụ.
*   **Cách xử lý:** 
    1.  Click chọn một **Chi nhánh** cụ thể từ danh sách để hệ thống chuyển ngữ cảnh sang giao diện Shop Dashboard nghiệp vụ, menu bên trái sẽ tự động hiển thị đầy đủ.
    2.  Nếu vẫn trống, liên hệ Chủ cửa hàng (Owner) kiểm tra lại quyền hạn của tài khoản bạn trong mục Thành viên để đảm bảo được phân quyền đầy đủ.
