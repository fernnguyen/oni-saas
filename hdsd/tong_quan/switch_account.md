# HƯỚNG DẪN: QUY TRÌNH CHUYỂN ĐỔI CHI NHÁNH & TÀI KHOẢN (SWITCH ACCOUNT)

Để hỗ trợ các mô hình chuỗi cửa hàng và doanh nghiệp đa ngành, ONI.vn cung cấp các tính năng chuyển đổi linh hoạt ngay trên màn hình làm việc mà không cần phải đăng xuất rồi đăng nhập lại.

---

## 1. QUY TRÌNH CHUYỂN ĐỔI GIỮA CÁC CHI NHÁNH (SHOP BRANCH)

Khi doanh nghiệp của bạn có nhiều cửa hàng/chi nhánh, bạn có thể dễ dàng nhảy qua lại giữa các chi nhánh để quản lý hoặc bán hàng (nếu tài khoản được phân quyền).

### Các bước thực hiện:
1. Quan sát góc trên cùng của thanh menu bên trái (Sidebar), bạn sẽ thấy ô hiển thị **Tên Chi nhánh Hiện tại** kèm biểu tượng chữ cái đầu tiên (ví dụ: `[M] Chi nhánh Quận 1`).
2. Bấm chuột trái vào ô Tên Chi nhánh này. Một danh sách thả xuống (Dropdown) sẽ hiển thị toàn bộ các chi nhánh bạn có quyền truy cập.
3. **Các thông tin hiển thị và thao tác:**
   * **Danh sách các Chi nhánh:** Hiển thị Tên chi nhánh và Địa chỉ cụ thể. Chi nhánh hiện tại đang đứng sẽ được đánh dấu tích xanh `✓` và nền xanh dương nhạt.
   * **Số lượng giới hạn chi nhánh:** Hệ thống hiển thị số lượng chi nhánh hiện tại trên tổng giới hạn của gói cước (ví dụ: `2/5` chi nhánh).
   * **Nút bấm [Chi nhánh mới]:** (Chỉ hiển thị cho Chủ cửa hàng - Owner) để mở nhanh bảng tạo chi nhánh mới.
4. Bấm chọn vào Tên chi nhánh bạn muốn chuyển đến.
5. Hệ thống sẽ tự động tải lại giao diện nghiệp vụ của chi nhánh mới và gửi thông báo toast tích xanh ở góc màn hình: *"Đã chuyển sang chi nhánh [Tên chi nhánh]"*.

`[HÌNH ẢNH: Menu thả xuống đổi chi nhánh ở góc trên menu bên trái, chỉ rõ danh sách chi nhánh và nút "Chi nhánh mới"]`

---

## 2. QUY TRÌNH TẠO CHI NHÁNH MỚI (DÀNH CHO CHỦ DOANH NGHIỆP)

Nếu gói cước còn lượt tạo chi nhánh, bạn có thể tạo nhanh chi nhánh mới ngay tại bảng đổi chi nhánh.

### Các bước thực hiện:
1. Bấm vào ô Chi nhánh ở menu bên trái -> Chọn **[Chi nhánh mới]**.
2. **Các trường thông tin cần nhập (Inputs Scan) trên Modal:**
   * **Ô nhập [Tên chi nhánh *]:** Điền tên đầy đủ của chi nhánh mới (ví dụ: *"Cơ sở 2 - Bình Thạnh"*).
   * **Ô nhập [Slug *]:** Hệ thống tự động chuyển tên chi nhánh thành chuỗi không dấu, cách nhau bằng gạch ngang (ví dụ: `co-so-2-binh-thanh`). Bạn có thể chỉnh sửa lại ngắn gọn hơn.
   * **Ô nhập [Địa chỉ (tùy chọn)]:** Điền địa chỉ vật lý cụ thể của chi nhánh để sau này in lên hóa đơn POS.
3. Bấm nút **[Tạo chi nhánh]** (màu xanh dương). Hệ thống sẽ tạo và tự động chuyển bạn sang chi nhánh mới tinh này.

`[HÌNH ẢNH: Hộp thoại Modal "Tạo chi nhánh mới" với các trường thông tin Tên chi nhánh, Slug, Địa chỉ và nút "Tạo chi nhánh"]`

---

## 3. QUY TRÌNH CHUYỂN ĐỔI KHÔNG GIAN TỔ CHỨC DOANH NGHIỆP (TENANT SUITE)

Nếu bạn sở hữu hoặc làm việc cho nhiều tổ chức doanh nghiệp khác nhau trên ONI.vn (ví dụ: bạn vừa quản trị chuỗi `capheminh.oni.vn` vừa quản trị cửa hàng thời trang `minhboutique.oni.vn`), bạn sẽ thực hiện chuyển đổi như sau:

### Các bước thực hiện:
1. Nhìn lên thanh Header góc trên cùng bên phải, click vào **Ảnh đại diện** tài khoản của bạn.
2. Chọn dòng **[Quản lý tổ chức / Control Plane]** (hoặc truy cập trực tiếp đường dẫn `/dashboard`).
3. Màn hình Control Plane sẽ liệt kê danh sách toàn bộ các **Workspace Doanh nghiệp** mà bạn là thành viên hoặc chủ sở hữu.
4. Bấm vào nút **[Truy cập]** bên cạnh doanh nghiệp bạn muốn làm việc.
5. Hệ thống sẽ chuyển hướng bạn sang subdomain của doanh nghiệp đó và yêu cầu bạn đăng nhập lại nếu phiên làm việc tại đó đã hết hạn.

---

## 4. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Không thấy nút [Chi nhánh mới] trong menu thả xuống
* **Hiện tượng:** Bạn bấm vào đổi chi nhánh nhưng danh sách hiển thị không hề có nút "Chi nhánh mới" hay "+ Tạo mới".
* **Nguyên nhân:** Tài khoản của bạn được gán vai trò nhân viên thu ngân (cashier), thủ kho hoặc kế toán, không có đặc quyền tạo mới hạ tầng chi nhánh.
* **Cách xử lý:** 
  1. Liên hệ với Chủ sở hữu (Owner) của tổ chức để thực hiện tạo chi nhánh mới.
  2. Chỉ có tài khoản Owner mới có toàn quyền tạo và phân quyền trên các chi nhánh mới.

### Tình huống 2: Bấm tạo chi nhánh mới hệ thống báo "Đã đạt giới hạn gói hiện tại" hoặc "Vui lòng nâng cấp gói"
* **Hiện tượng:** Bạn bấm Tạo chi nhánh nhưng nhận được thông báo lỗi màu đỏ dạng cảnh báo gói cước.
* **Nguyên nhân:** Doanh nghiệp của bạn đang dùng gói cước giới hạn số lượng chi nhánh (ví dụ: gói Mini miễn phí chỉ cho phép 1 chi nhánh) và bạn đang cố tạo thêm chi nhánh vượt quá hạn ngạch.
* **Cách xử lý:**
  1. Vào mục **[Thanh toán / Billing]** ở Control Plane.
  2. Thực hiện nâng cấp lên gói Pro hoặc Enterprise để mở khóa giới hạn chi nhánh (tối đa không giới hạn đối với gói Enterprise).
  3. Sau khi nâng cấp hoàn tất, quay lại và thực hiện tạo chi nhánh như bình thường.
