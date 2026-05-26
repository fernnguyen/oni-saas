# HƯỚNG DẪN: QUY TRÌNH ĐĂNG KÝ WORKSPACE DOANH NGHIỆP MỚI

Để bắt đầu sử dụng ONI.vn, bạn cần tạo một không gian làm việc riêng biệt (gọi là **Workspace**) cho doanh nghiệp của mình. Mỗi Workspace sẽ sở hữu một địa chỉ đường dẫn (subdomain) độc lập, giúp cô lập dữ liệu an toàn tuyệt đối và xây dựng thương hiệu riêng.

---

## 1. QUY TRÌNH THỰC HIỆN ĐĂNG KÝ
1.  Truy cập trang chủ của ONI.vn và bấm nút **[Đăng ký ngay]** (hoặc truy cập trực tiếp đường dẫn `/register`).
2.  **Các trường thông tin cần nhập (Inputs Scan):**
    *   **Ô nhập [Tên doanh nghiệp *]:** Điền tên cửa hàng hoặc thương hiệu của bạn (ví dụ: *"Cà Phê Minh"*).
    *   **Ô nhập [Đường dẫn Workspace (Slug) *]:** Điền tên viết tắt không dấu của cửa hàng để làm địa chỉ trang web truy cập sau này (ví dụ: gõ `capheminh` thì địa chỉ web đăng nhập của bạn sẽ là `capheminh.oni.vn`).
    *   **Ô nhập [Email quản trị *]:** Điền email chính xác của bạn (dùng làm tài khoản Chủ sở hữu - Owner có quyền tối cao sau này).
    *   **Ô nhập [Mật khẩu *]:** Nhập mật khẩu bảo mật (tối thiểu 8 ký tự).
    *   **Hộp chọn [Gói dịch vụ *]:** Chọn gói Mini (Miễn phí), Pro hoặc Enterprise.
3.  Bấm nút **[Tạo không gian làm việc]**.
4.  **Màn hình Khởi tạo (Provisioning):** Hệ thống sẽ hiển thị một checklist chạy tự động gồm:
    *   *✓ Tạo tài khoản người dùng.*
    *   *✓ Cấu hình không gian làm việc.*
    *   *✓ Tạo chi nhánh mặc định.*
    *   *✓ Kích hoạt gói dịch vụ.*
5.  **Hoàn tất đăng ký:** Hệ thống gửi một email xác nhận đến hòm thư của bạn. Bấm vào liên kết xác nhận trong email để kích hoạt tài khoản và hệ thống sẽ hiển thị thông tin Workspace đã sẵn sàng. Bấm **[Truy cập Workspace]** để chuyển sang màn hình Đăng nhập.
6.  `[HÌNH ẢNH: Form đăng ký tạo không gian làm việc Workspace tại đường dẫn /register, highlight các ô nhập "Tên doanh nghiệp", "Đường dẫn Workspace" và nút "Tạo không gian làm việc"]`

---

## 2. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Hệ thống báo lỗi "Đường dẫn Workspace (slug) đã được sử dụng"
*   **Hiện tượng:** Bạn bấm tạo tài khoản nhưng hệ thống báo lỗi đỏ tại ô đường dẫn.
*   **Nguyên nhân:** Tên slug bạn chọn (ví dụ: `minhcafe`) đã có một doanh nghiệp khác đăng ký trước đó trên hệ thống ONI.vn.
*   **Cách xử lý:** 
    1.  Chọn một tên viết tắt khác độc đáo hơn hoặc thêm mã vùng, số vào sau tên (ví dụ: đổi thành `capheminhq1` hoặc `minhcafe2026`).
    2.  Khi ô nhập liệu hiển thị tích xanh báo *"Hợp lệ"*, bạn có thể tiếp tục bấm đăng ký.

### Tình huống 2: Bạn không nhận được email kích hoạt tài khoản
*   **Hiện tượng:** Bạn đã đăng ký thành công và hệ thống báo đã gửi email kích hoạt, nhưng bạn chờ lâu vẫn không thấy thư gửi đến hòm thư của mình.
*   **Nguyên nhân:** Thư kích hoạt tự động bị bộ lọc bảo mật của Google/Yahoo hiểu lầm là thư quảng cáo và đưa vào thư mục rác, hoặc bạn đã gõ sai chính tả địa chỉ email lúc đăng ký.
*   **Cách xử lý:**
    1.  Kiểm tra kỹ trong thư mục **[Thư rác (Spam)]** hoặc thư mục **[Quảng cáo (Promotions)]** trong hòm thư của bạn.
    2.  Nếu vẫn không thấy, quay lại màn hình đăng ký và bấm nút **[Gửi lại email kích hoạt]**.
    3.  Nếu hệ thống báo email chưa đăng ký, hãy kiểm tra xem bạn có gõ nhầm ký tự nào lúc đăng ký trước đó không và thực hiện đăng ký lại với email đúng chính tả.
