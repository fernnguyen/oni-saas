# HƯỚNG DẪN: TRA CỨU BÁO CÁO MUA SẮM & ĐỐI SOÁT CHÉO P2P (PROCUREMENT REPORT)

Báo cáo Mua sắm và Phê duyệt P2P (Procure-to-Pay) trên ONI.vn là công cụ quản trị cung ứng chuyên nghiệp cho phép Giám đốc (Admin) và bộ phận Thu mua (Purchaser) kiểm soát chặt chẽ ngân sách chi tiêu mua hàng, đo lường hiệu quả đàm phán giảm thiểu chi phí đầu vào và tự động đối soát chênh lệch 3 bên (3-Way Match).

---

## 1. QUY TRÌNH TRA CỨU BÁO CÁO MUA SẮM

Để đảm bảo tính bảo mật của các hợp đồng giá sỉ nhạy cảm, hệ thống chỉ cho phép tài khoản Chủ sở hữu (Owner), Giám đốc (Admin) hoặc Nhân sự mua sắm được phân quyền chuyên biệt (`reports.view_shop` hoặc `purchasing.manage`) mới có thể truy cập số liệu này.

### Các bước thực hiện:
1. Đăng nhập hệ thống chi nhánh -> Click mục **[Mua sắm / P2P]** trên thanh Sidebar bên trái -> Chọn mục con **[Báo cáo mua sắm]**.
2. Hệ thống sẽ đối chiếu tự động cơ sở dữ liệu các phiếu đặt hàng PO, phiếu nhập kho thực nhận GRN và danh mục sản phẩm để xuất báo cáo.

---

## 2. GIẢI THÍCH CHI TIẾT CÁC KHU VỰC SỐ LIỆU (FIELDS SCAN)

### Khu vực A: Các chỉ số mua sắm cốt lõi
Hiển thị ở đầu trang dưới dạng 4 thẻ số liệu lớn:
* **Tổng chi mua sắm thực:** Tổng ngân sách chi tiêu mua hàng ghi nhận trên tất cả đơn đặt hàng PO thành công (ở trạng thái Đã nhập hàng hoặc Đã duyệt).
* **Tiền tiết kiệm đàm phán:** Tổng số tiền tiết kiệm được nhờ thương lượng đơn giá sỉ mua đầu vào thấp hơn so với đơn giá bán lẻ niêm yết mặc định trong danh mục sản phẩm.
* **Đã nhập đối soát (GRN):** Số lượng phiếu nhập kho GRN được ghi nhận khớp 100% về cả số lượng và đơn giá so với đơn đặt hàng PO ban đầu.
* **Tỷ lệ tiết kiệm bình quân:** % tối ưu hóa chi tiêu trung bình của toàn bộ các mặt hàng đã mua (giúp đánh giá năng lực đàm phán của nhân viên thu mua).

`[HÌNH ẢNH: 4 thẻ chỉ số P2P: Tổng chi mua sắm, Tiền tiết kiệm đàm phán, Số phiếu GRN đối soát và Tỷ lệ tiết kiệm bình quân]`

---

### Khu vực B: Hệ thống 3 Tab báo cáo chuyên sâu
Bấm chọn từng tab để xem bảng dữ liệu đối soát chi tiết:

#### Tab 1: Đối chiếu chéo 3 bên (3-Way Match)
Tính năng chốt chặn tối cao giúp kiểm soát chênh lệch thực tế giữa đơn đặt hàng (PO) gửi NCC và hàng thực nhận (GRN) do thủ kho đếm tại quầy:
* **Các trường thông tin trên bảng đối soát:**
  * **Cột [Mã phiếu GRN]:** Mã số phiếu nhập kho thực nhận (có nút copy nhanh mã số).
  * **Cột [PO liên kết]:** Mã đơn đặt hàng gốc tương ứng được duyệt trước đó.
  * **Cột [Sản phẩm đối chiếu]:** Tên mặt hàng thực nhận.
  * **Cột [Đặt (PO)]:** Số lượng đặt mua lý thuyết được duyệt trên PO.
  * **Cột [Thực nhận (GRN)]:** Số lượng thực tế thủ kho đếm nhận tại cửa hàng.
  * **Cột [Chênh lệch giá trị]:**
    * *0 đ* (Chữ xám): Khớp hoàn toàn 100%.
    * *-[Số tiền] đ (Thiếu [X])* (Chữ vàng cam): NCC giao thiếu hàng.
    * *+[Số tiền] đ (Lệch giá)* (Chữ đỏ): NCC tính sai đơn giá mua thực tế.
  * **Cột [Kết quả đối soát] (TagBadge):**
    * **[Khớp 100%]** (Màu xanh lá): Giao đủ hàng, đúng đơn giá.
    * **[Giao thiếu hàng]** (Màu vàng): Số lượng nhận nhỏ hơn số lượng đặt mua.
    * **[Lệch giá NCC]** (Màu đỏ): Đơn giá trên hóa đơn giao hàng sai lệch so với đơn giá thỏa thuận trên PO.

`[HÌNH ẢNH: Bảng đối soát chênh lệch 3 bên 3-Way Match hiển thị các mốc cảnh báo đỏ lệch giá và vàng giao thiếu hàng]`

#### Tab 2: Hiệu quả tiết kiệm chi tiêu (Savings Table)
Bảng chứng minh hiệu quả tài chính của bộ phận thu mua:
* Bảng chi tiết: *Tên sản phẩm*, *Nhà cung cấp giao*, *Số lượng*, *Giá niêm yết (Danh mục)*, *Giá mua thực tế (PO)*, *Tỷ lệ % giảm giá*, và *Tổng tiền tiết kiệm được*.

#### Tab 3: Phân bổ chi tiêu & NCC (Spend breakdown)
* **Biểu đồ phân bổ chi mua:** Phân tích tỷ trọng ngân sách chi mua sắm thực tiễn chảy về các nhà cung cấp khác nhau dưới dạng Progress Bar và tỷ lệ %. Giúp đàm phán hợp đồng đặc quyền với NCC chiếm tỷ trọng lớn nhất.
* **Quy chuẩn đồng bộ:** Giải thích quy trình tự động đồng bộ công nợ NCC, tăng kho chi nhánh và cập nhật lại giá vốn MAC thời gian thực sau khi phiếu GRN được hoàn tất.

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống 1: Giao diện báo lỗi "Quyền truy cập Báo cáo bị hạn chế" hình ổ khóa đỏ
* **Hiện tượng:** Click vào trang báo cáo mua sắm nhưng màn hình chỉ hiện thông báo lỗi quyền hạn hình ổ khóa đỏ.
* **Nguyên nhân:** Nhân sự đăng nhập tài khoản có vai trò *Nhân viên Thu ngân (Staff)* hoặc vai trò tự tạo không được cấp quyền xem báo cáo chi nhánh (`reports.view_shop`).
* **Cách xử lý:** 
  1. Liên hệ với Chủ cửa hàng (Owner) truy cập mục **[Phân quyền]**.
  2. Chọn sửa vai trò của tài khoản của bạn, tích chọn cấp quyền **[Xem báo cáo chi nhánh / reports.view_shop]**.
  3. Bấm Lưu và yêu cầu nhân viên nhấn F5 để truy cập lại báo cáo bình thường.

### Tình huống 2: Báo cáo hiển thị ký tự che giá bảo mật nhạy cảm `🔒 ***.*** đ`
* **Hiện tượng:** Bạn vào xem báo cáo bình thường nhưng toàn bộ các ô số tiền đều bị che khuất bởi ký tự sao `🔒 ***.***`.
* **Nguyên nhân (Cơ chế bảo mật che giá):** Dù bạn có quyền xem báo cáo, nhưng tài khoản của bạn không được cấp quyền **Quản trị mua hàng / xem giá vốn sỉ** (`purchasing.manage` hoặc `chief_accountant`). Hệ thống tự động che ẩn các đơn giá mua nhạy cảm để tránh rò rỉ thông tin biên lợi nhuận sỉ của doanh nghiệp với nhân viên quầy.
* **Cách xử lý:**
  1. Nếu bạn là kế toán trưởng hoặc trưởng bộ phận thu mua cần xem số tiền cụ thể để đối soát, liên hệ với Owner để được cấp thêm quyền `chief_accountant` hoặc `purchasing.manage` trong mục Phân quyền vai trò người dùng.
