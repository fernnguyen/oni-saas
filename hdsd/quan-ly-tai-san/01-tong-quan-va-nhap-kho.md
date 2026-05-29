# Hướng dẫn 1: Tổng quan & Nhập kho Kích hoạt Tài sản (CCDC / TSCĐ)

Hệ thống Quản lý Tài sản (Asset Management) trong **ONI ERP** được thiết kế để quản lý toàn diện vòng đời của Công cụ dụng cụ (CCDC) và Tài sản cố định (TSCĐ). Quy trình bắt đầu từ khâu mua sắm nhập kho cho đến khi bàn giao sử dụng, trích khấu hao định kỳ và thanh lý.

---

## 1. Phân loại Tài sản trong Hệ thống

Hệ thống phân chia thẻ tài sản thành hai loại chính để áp dụng các chính sách kế toán khác nhau:

*   **CCDC (Công cụ dụng cụ)**: Các thiết bị, dụng cụ có giá trị nhỏ hơn tiêu chuẩn TSCĐ hoặc có thời gian sử dụng ngắn (Ví dụ: bàn ghế, ga trải giường, máy sấy tóc cầm tay...).
*   **TSCĐ (Tài sản cố định)**: Các tài sản có giá trị lớn (theo tiêu chuẩn kế toán) và thời gian sử dụng dài hạn (Ví dụ: Máy siêu âm 5D, Tivi 75 Inch, xe đẩy y tế, điều hòa trung tâm...).

---

## 2. Quy trình Nhập kho & Kích hoạt Thẻ Tài sản

Tài sản vật lý sau khi mua sắm thông qua Phiếu nhập kho (GRN) sẽ được lưu trữ tạm thời tại kho tổng tài sản mang mã **`WH-ASSET`** ở trạng thái chưa kích hoạt. Để đưa tài sản vào sử dụng và bắt đầu tính khấu hao, bạn thực hiện theo các bước sau:

### Bước 1: Truy cập màn hình Quản lý Tài sản
1. Đăng nhập vào hệ thống ONI ERP.
2. Di chuyển đến mục **Thiết lập hệ thống** ➔ chọn **Quản lý tài sản** (`settings/assets`).

### Bước 2: Kích hoạt thẻ tài sản mới (Bàn giao từ kho)
1. Trên giao diện Quản lý Tài sản, nhấn vào nút **Bàn giao từ kho** (hoặc **Đăng ký tài sản**).
2. Hệ thống sẽ mở SlideOver điền thông tin chứng từ:
    *   **Sản phẩm**: Chọn sản phẩm tương ứng từ danh sách tồn kho của kho `WH-ASSET`.
    *   **Số lượng**: Nhập số lượng bàn giao thực tế.
    *   **Bộ phận nhận (Cost Center)**: Chọn phòng ban thụ hưởng trực tiếp thiết bị này (Ví dụ: *Khoa Chẩn đoán hình ảnh*, *Bộ phận Buồng phòng*...).
    *   **Loại tài sản**: Chọn `CCDC` hoặc `TSCĐ`.
    *   **Thời gian khấu hao (tháng)**: Nhập số tháng dự kiến trích khấu hao (Ví dụ: `12` tháng cho CCDC, `36` hoặc `60` tháng cho TSCĐ).
    *   **Thông tin chi tiết**: Nhập mã sê-ri (`Serial No`), nhà sản xuất, hạn bảo hành, nhà cung cấp và ngày mua thực tế để theo dõi sau này.
3. Nhấn **Xác nhận bàn giao**.

---

## 3. Nhật ký kiểm toán tự động (Audit Trail)

Hệ thống ONI ERP tự động ghi nhận dữ liệu kiểm toán để đảm bảo tính minh bạch và bảo mật thông tin:
*   **Người tạo (Created By)**: Lưu trữ chính xác tài khoản nhân viên thực hiện thao tác tạo thẻ hoặc kích hoạt bàn giao tài sản.
*   **Người cập nhật (Updated By)**: Lưu vết người gần nhất chỉnh sửa thông tin thẻ tài sản.
*   *Lưu ý*: Các thông tin này hiển thị rõ ràng trực tiếp trong bảng danh sách và SlideOver chi tiết dưới dạng tên hiển thị đầy đủ (Ví dụ: `Nguyễn Văn A (Admin)` thay vì các mã UUID thô).
