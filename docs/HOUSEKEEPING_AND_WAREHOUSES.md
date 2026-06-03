# Tài Liệu Kỹ Thuật: Module Vận Hành Buồng Phòng, Minibar & Quản Lý Kho Hàng

Tài liệu này cung cấp mô tả toàn diện về thiết kế hệ thống, luồng nghiệp vụ, công thức tính toán SLA, phân hệ quản lý kho vật tư buồng phòng, và ma trận phân quyền (RBAC) chi tiết cho phân hệ **Housekeeping & Minibar** và **Warehouse Management** của hệ thống ONI.vn.

---

## 1. PHÂN HỆ VẬN HÀNH BUỒNG PHÒNG & MINIBAR (HOUSEKEEPING & MINIBAR)

Phân hệ Buồng phòng & Minibar được tích hợp nhằm tối ưu hóa quy trình làm sạch phòng nghỉ, kiểm đếm tiêu hao dịch vụ minibar, tự động đồng bộ hóa hóa đơn thanh toán của khách hàng, và tự động quản lý xuất kho bù đồ dùng vật tư buồng phòng.

### 1.1. Luồng Nhận Dọn Phòng Nhanh (Fast Claiming Workflow)
Quy trình nhận dọn dẹp phòng được thiết kế tinh gọn để nhân viên buồng phòng có thể tự chủ động nhận việc trực tiếp trên thiết bị di động mà không cần qua các bước chỉ định phức tạp:
*   **Xác thực Tự động (Auto-Identity Resolution):** Khi nhân viên bấm nút **"Tự nhận dọn"** (Claim), hệ thống không yêu cầu chọn tên nhân viên từ danh sách. Thông tin định danh được tự động phân giải ở Backend thông qua Supabase Auth Context của tài khoản đang đăng nhập (`user.user_metadata?.display_name`, `user.user_metadata?.full_name`, hoặc `user.email`).
*   **Hộp thoại Cảnh báo SLA (SLA Warning Modal):** Khi thực hiện nhận dọn phòng, một hộp thoại xác nhận được hiển thị cảnh báo thời gian SLA quy định bắt đầu chạy đếm ngược (được tính bằng phút dựa trên cấu hình phòng hoặc mặc định hệ thống), thúc đẩy nhân viên hoàn thành đúng hạn để đạt chỉ số SLA.

### 1.2. Động Cơ Đánh Giá Hiệu Suất SLA (Dynamic SLA Engine)
Hệ thống hỗ trợ cơ chế quản lý thời hạn dọn dẹp (SLA Mins) linh hoạt theo hai cấp độ:
1.  **Cài đặt SLA Toàn Hệ thống (Global SLA Fallback):** Được lưu tại bộ nhớ trình duyệt `localStorage` của máy POS và được truyền trong body yêu cầu hoàn tất dọn dẹp. Mức mặc định chuẩn là 30 phút.
2.  **Cài đặt SLA Chi Tiết Theo Từng Phòng (Room-Specific SLA):** Được lưu trữ trực tiếp dưới dạng JSON trong cột `metadata` (thuộc tính `sla_mins`) của bảng `location_resources` của phòng đó. Giá trị này có thể được tùy chỉnh thông qua nút "Tùy biến định mức" của từng phòng.

**Công thức Đánh giá trạng thái SLA ở Backend (`POST /api/shops/[shopId]/housekeeping/logs`):**
Khi nhận được yêu cầu kết thúc dọn dẹp (`finish_cleaning`), Backend sẽ tính toán:
$$\text{Thời gian dọn dẹp thực tế (phút)} = \frac{\text{Thời điểm hoàn tất} - \text{Thời điểm bắt đầu}}{60000}$$
*   Nếu $\text{Thời gian dọn dẹp thực tế} \le \text{SLA của Phòng (hoặc SLA Hệ thống)}$, log dọn dẹp được đánh dấu là `ontime`.
*   Nếu $\text{Thời gian dọn dẹp thực tế} > \text{SLA của Phòng (hoặc SLA Hệ thống)}$, log dọn dẹp được đánh dấu là `overtime`.

### 1.3. Luồng Phân Quyền & Vai Trò (Role Gating & Permissions)
*   **Nhân Viên Buồng Phòng (Housekeeping Staff):** Được cấp các quyền cơ bản `orders.view` và `orders.edit` để xem sơ đồ phòng và thực hiện bắt đầu dọn dẹp, kiểm minibar, báo sạch. Họ **không** có quyền `settings.manage` hoặc `products.edit`, do đó biến `isManager` là `false`. Điều này làm ẩn tất cả các tính năng quản trị: Giao việc, Cài đặt định mức, Cài đặt SLA.
*   **Quản Lý Vận Hành (HK Manager):** Có các quyền quản lý (`settings.manage` hoặc `products.edit`), cho phép thực hiện phân công dọn dẹp, tùy biến định lượng, cài đặt SLA và các chức năng hệ thống nâng cao khác.

### 1.4. Đếm Thời Gian Chờ Dọn Dẹp (Idle State Waiting Time Tracking)
Khi lễ tân làm thủ tục Checkout và bấm hoàn tất đơn hàng, trạng thái phòng nghỉ tự động chuyển về `dirty` (chưa dọn dẹp) và cột `updated_at` trong cơ sở dữ liệu lưu lại mốc thời gian checkout này.
*   **Công thức tính thời gian chờ dọn:**
    $$\text{Thời gian đã chờ dọn dẹp} = \text{Thời điểm hiện tại} - \text{Mốc updated\_at của phòng}$$
*   **Hiển thị trực quan:**
    *   **Dạng lưới:** Thẻ phòng `dirty` hiển thị thêm một Badge cảnh báo màu đỏ với icon đồng hồ: `"Chờ dọn dẹp. Đã chờ: X phút / X giờ Y phút"`.
    *   **Dạng bảng:** Trong cột "Tiến độ SLA", phòng chưa dọn hiển thị `"Chờ dọn: X phút / X giờ Y phút"` kèm biểu tượng đồng hồ màu đỏ, giúp quản lý biết chính xác phòng nào bị bỏ quên lâu nhất.

---

## 2. GIAO DIỆN SƠ ĐỒ VẬN HÀNH (OPERATIONS DASHBOARD LAYOUT)

Giao diện **Sơ đồ vận hành** (Tab 1) hỗ trợ hai chế độ hiển thị linh hoạt phục vụ các đối tượng vận hành khác nhau:

### 2.1. Chế Độ Dạng Lưới (Grid Matrix View)
*   Hiển thị các phòng dưới dạng các Card trực quan, màu sắc của Card thay đổi linh hoạt theo trạng thái phòng nghỉ:
    *   **Trống sẵn sàng (Available):** Viền xám nhạt, nền chuyển sắc trắng sang xám siêu nhẹ, thanh trạng thái trên cùng màu Xanh lá.
    *   **Đang có khách ở (Occupied):** Viền đỏ Rose nhạt, nền đỏ Rose siêu nhẹ, thanh trạng thái trên cùng màu Đỏ Rose.
    *   **Chưa dọn dẹp (Dirty) / Đang dọn dẹp (Cleaning):** Viền vàng hổ phách nhạt, nền hổ phách siêu nhẹ, thanh trạng thái trên cùng màu Vàng hổ phách.
*   **Quy trình Phân công Giao việc trực quan (Click-to-Assign):** Nút "Giao việc" thô sơ đã được ẩn khỏi card chung. Thay vào đó, khi người dùng có vai trò quản lý (`isManager === true`) click trực tiếp vào thẻ phòng (đang ở trạng thái `dirty` hoặc `available`), hệ thống sẽ mở ngay modal Phân công dọn dẹp. Các nút bấm hành động riêng lẻ (như Báo sạch, Bắt đầu dọn dẹp) sử dụng `e.stopPropagation()` để không kích hoạt nhầm modal giao việc.
*   **Bắt đầu dọn dẹp (Quick Claim):** Nút "Nhận dọn" được đổi tên thành **"Bắt đầu dọn dẹp"** với thiết kế màu vàng hổ phách nổi bật (`bg-amber-500 hover:bg-amber-600`) kèm icon `BrushCleaning` để tăng độ tập trung trải nghiệm nhân viên.

### 2.2. Chế Độ Dạng Bảng Nhóm Vị Trí (Grouped Table View)
*   Để tối ưu hóa không gian hiển thị danh sách phòng buồng, chế độ Dạng bảng **loại bỏ hoàn toàn cột vị trí/tầng** rời rạc kém thẩm mỹ.
*   Thay vào đó, danh sách phòng được **nhóm trực tiếp (group) theo Tầng/Khu vực (Floor/Zone)** thành các hàng tiêu đề phân cách nằm ngang (Separator Rows) sắc nét.
*   Mỗi hàng phân cách hiển thị biểu tượng Ghim bản đồ (`MapPin`), tên Tầng/Khu vực và tổng số lượng phòng thuộc tầng đó (ví dụ: `Tầng 1 (8 phòng)`).
*   **Tương tác nhanh tại bảng:** Hỗ trợ nhấp chuột trực tiếp vào dòng của từng phòng để mở modal Phân công giao việc cho quản lý, và hiển thị nút **"Bắt đầu dọn dẹp"** màu vàng hổ phách kèm icon chổi dọn dẹp trực quan.
*   Chế độ này giúp lễ tân dễ dàng theo dõi live-status dọn phòng theo luồng di chuyển vật lý của nhân viên.

---

## 3. PHÂN HỆ QUẢN LÝ KHO VÀ TIÊU HAO MINIBAR (WAREHOUSE & MINIBAR INVENTORY)

Hệ thống kho vận buồng phòng được xây dựng đồng bộ với phân hệ Minibar nhằm quản lý chính xác luồng xuất nhập vật tư tiêu hao.

### 3.1. Cơ Chế Tự Động Tính Tiêu Hao & Khớp Đồ (Minibar Consumption Sync)
1.  **Định mức minibar phòng (`minibar-setup`):** Mỗi phòng được cài đặt một định mức số lượng đồ uống/đồ ăn vặt tiêu chuẩn (ví dụ: 2 lon Coca, 2 chai Nước suối).
2.  **Đếm thực tế và đối chiếu:** Khi khách làm thủ tục trả phòng, nhân viên buồng phòng mở màn hình **"Kiểm Minibar"** và nhập số lượng thực tế đếm được trong tủ lạnh.
3.  **Tự động tính chênh lệch:**
    $$\text{Số lượng tiêu hao} = \max(0, \text{Định mức tiêu chuẩn} - \text{Số lượng đếm thực tế})$$
4.  **Tự động tạo đơn F&B:** Số lượng tiêu hao được hệ thống tự động thêm vào đơn hàng POS của khách hàng nghỉ tại phòng đó dưới dạng dịch vụ phụ thu "Tiêu hao Minibar", tự động tính vào tổng hóa đơn checkout.
5.  **Tự động xuất kho bù đồ:** Hệ thống tự động tạo phiếu xuất kho lẻ (`stock_movements` loại `issue` với lý do `Tiêu hao Minibar Phòng [Tên phòng]`) từ **Kho bộ phận Buồng phòng (`lodging_hskp`)**, đồng thời tự động cập nhật lại số lượng tồn kho thực tế của sản phẩm tại kho buồng phòng.
6.  **Tái thiết lập định mức phòng:** Trạng thái tồn kho tại phòng (`room_minibar_stock`) của các sản phẩm trên được cập nhật về mức tiêu chuẩn (đầy đủ định mức) sau khi nhân viên hoàn tất bù đồ.

### 3.2. Cấu Trúc Kho Hàng & Chính Sách CRUD Kho (Warehouse CRUD & Protection Policies)
Hệ thống cung cấp màn hình quản lý danh sách Kho hàng chi nhánh (Thêm mới, Sửa, Xóa). Để bảo toàn tính toàn vẹn của dữ liệu báo cáo kế toán, hệ thống áp dụng các chính sách nghiêm ngặt sau:
*   **Kho Tiêu Chuẩn Mặc Định (Built-in Warehouses):** Mỗi chi nhánh khi khởi tạo sẽ tự động được provision 3 kho tiêu chuẩn bắt buộc:
    *   `sale` (Kho Kinh doanh / Bán lẻ)
    *   `supply` (Kho Vật tư & Tiêu hao)
    *   `asset` (Kho Tài sản chờ bàn giao)
*   **Kho Buồng Phòng Chuyên Dụng (`lodging_hskp`):** Được sử dụng riêng cho bộ phận buồng phòng, lưu giữ tồn kho các loại nước giải khát, đồ ăn vặt minibar và vật tư tiêu hao (bàn chải, xà phòng, khăn tắm).
*   **Chính Sách Bảo Vệ (Deletion Protection):** Backend chặn tuyệt đối hành vi XÓA hoặc SỬA MÃ các kho tiêu chuẩn hệ thống (`sale`, `supply`, `asset`, `default`). Chỉ cho phép tạo mới, sửa đổi hoặc xóa các kho hàng tự tạo (Custom Warehouses) của chi nhánh.

> [!TIP]
> **Khuyến nghị Thiết kế UX (System-Managed Identifier):** 
> Để tối ưu hóa trải nghiệm người dùng, trường `code` (mã kho hoặc mã bộ phận) **không nên bắt người dùng nhập thủ công** mà nên được hệ thống tự động quản lý:
> 1. *Đối với Kho/Bộ phận mặc định:* Mã hệ thống (`sale`, `supply`, `lodging_hskp`,...) được sinh tự động (auto-provision) và bị ẩn/khóa không cho người dùng sửa đổi. Người dùng chỉ có quyền đổi Tên hiển thị thân thiện.
> 2. *Đối với Kho/Bộ phận tạo mới:* Trường `code` sẽ tự động sinh (Auto-generate unique slug) từ Tên hiển thị (ví dụ: "Kho Phụ Tầng 1" -> `kho-phu-tang-1`) hoặc sinh chuỗi UUID ngẫu nhiên. Người dùng chỉ làm việc bằng giao diện chọn Dropdown trực quan, không bao giờ cần biết mã định danh database này.

### 3.3. Cơ chế phân chia Kho hàng theo Bộ phận (Department-Warehouse Mapping)
Trong các mô hình vận hành không tách chi nhánh (nhưng có nhiều bộ phận độc lập cùng làm việc như Lễ tân, Buồng phòng, Nhà hàng/F&B), luồng dữ liệu kho được quản lý theo mô hình phân quyền **Phòng ban/Bộ phận (Departments)**:
1.  **Thiết lập Liên kết (Association):** 
    *   Mỗi kho hàng (Warehouse) có thể được bổ sung thuộc tính liên kết `department_code` (ví dụ: kho `lodging_hskp` liên kết với bộ phận `buong_phong`).
2.  **Định danh Nhân sự theo Bộ phận (User-Department Link):**
    *   Nhân viên khi đăng nhập sẽ có thông tin phòng ban từ bảng `user_departments` (ví dụ: Nhân sự A có vai trò thuộc phòng ban có code `buong_phong`).
3.  **Tự động Lọc Phạm vi Kho (Automatic Scoping Filter):**
    *   Khi nhân viên mở giao diện kiểm minibar hoặc xuất vật tư, hệ thống sẽ tự động đối chiếu mã phòng ban của nhân viên để lọc danh sách kho khả dụng:
      ```typescript
      // Chỉ cho phép nhân viên thao tác trên kho được gán cho bộ phận của họ
      const allowedWarehouses = warehouses.filter(wh => wh.department_code === userDepartmentCode);
      ```
    *   Nhờ cơ chế này, nhân viên dọn dẹp thuộc bộ phận Buồng phòng sẽ mặc định thao tác trên đúng kho buồng phòng (`lodging_hskp`) mà không nhìn thấy hay sửa đổi nhầm số liệu của Kho Kinh doanh (`sale`) hay Kho tài sản (`asset`).

---

## 4. MA TRẬN PHÂN QUYỀN AN TOÀN (SECURITY & PERMISSIONS AUDIT MATRIX)

Mọi API route và giao diện người dùng đều được bảo vệ nghiêm ngặt bằng cơ chế kiểm soát truy cập hai lớp (UI Gating ở Client-side và API Enforcement ở Server-side).

### 4.1. Bảng Tra Cứu Phân Quyền Theo Route API

| API Endpoint | Phương Thức | Mã Quyền Hạn Yêu Cầu | Logic Nghiệp Vụ Thực Thi |
| :--- | :---: | :--- | :--- |
| `/api/shops/[shopId]/housekeeping/logs` | `GET` | `orders.view` | Xem danh sách nhật ký dọn dẹp và SLA của nhân viên. |
| `/api/shops/[shopId]/housekeeping/logs` | `POST` | `orders.edit` | Ghi nhận bắt đầu dọn phòng (`start_cleaning`) hoặc hoàn thành dọn dẹp tính toán SLA (`finish_cleaning`). |
| `/api/shops/[shopId]/housekeeping/minibar-setup` | `GET` | `orders.view` | Tải cấu hình định mức Minibar mặc định của phòng. |
| `/api/shops/[shopId]/housekeeping/minibar-setup` | `POST` | `orders.edit` | Thiết lập định mức Minibar và khởi tạo lượng tồn tủ lạnh của phòng. |
| `/api/shops/[shopId]/housekeeping/report-consumption` | `POST` | `orders.edit` | Tính tiêu hao minibar, nạp phí vào hóa đơn, xuất kho vật tư và bù đồ phòng. |
| `/api/shops/[shopId]/location-resources/[id]` | `PATCH` | `products.edit` | Cập nhật cấu hình SLA riêng biệt của phòng vào cột `metadata`. |
| `/api/shops/[shopId]/warehouses` | `GET` | Có quyền Shop | Tải danh sách kho hoạt động của chi nhánh và tự động merge kho rác nếu có. |
| `/api/shops/[shopId]/warehouses` | `POST` | `settings.manage` | Tạo mới kho hàng chi nhánh hoặc seed các kho mặc định. |
| `/api/shops/[shopId]/warehouses/[id]` | `PATCH` | `settings.manage` | Cập nhật tên, mã hoặc trạng thái kho tự cấu hình. |
| `/api/shops/[shopId]/warehouses/[id]` | `DELETE` | `settings.manage` | Xóa kho tự cấu hình (Chặn xóa kho mặc định `sale`, `supply`, `asset`). |

### 4.2. Ghi Chú Thiết Kế UI/UX Hài Hòa (Aesthetics & Typography Rules)
*   **Không sử dụng Font chữ dạng Monospace (`font-mono`):** Để giữ giao diện đồng bộ, thanh nhã và cao cấp, tuyệt đối không áp dụng kiểu chữ mono cho bất kỳ phần tử nào (kể cả số lượng, mã kho hay thời gian).
*   **Không sử dụng Emoji thô:** Tránh việc dùng các ký tự emoji gốc (`📍`, `⏱️`, `🟢`, `🔴`, `🟡`). Toàn bộ các chỉ báo trực quan phải sử dụng Icon Vector độ sắc nét cao từ thư viện `lucide-react` kết hợp màu sắc HSL được thiết kế hài hòa.
