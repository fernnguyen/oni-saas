# Bản Thiết Kế Ý Tưởng Giao Diện & Kiến Trúc ONI Mobile App

Bản thiết kế này trình bày định hướng phát triển ứng dụng di động **ONI Mobile** (iOS & Android) được xây dựng trên nền tảng **Expo (React Native)**. Kiến trúc kế thừa trực tiếp mô hình Multi-tenant SaaS, cấu trúc adapters linh hoạt của WebApp và tối ưu hóa sâu sắc cho trải nghiệm bán hàng di động (Mobile POS), offline-first và in ấn phần cứng.

---

## 🎨 Trải Nghiệm Giao Diện Nhận Diện Thương Hiệu (Brand Mobile UI/UX)

Giao diện ONI Mobile được định hướng đồng bộ 100% phong cách với WebApp: **Sạch sẽ, hiện đại (Light-first) với màu sắc tươi sáng và các yếu tố bo tròn tinh tế**, kết hợp khả năng chuyển đổi giao diện Sáng/Tối linh hoạt.

### 1. Hệ Thống Giao Diện Sáng & Tối (Light & Dark Mode)
Ứng dụng hỗ trợ cả hai giao diện Sáng và Tối, trong đó **Giao diện Sáng (Light Mode) là mặc định**:

#### A. Giao diện Sáng (Light Mode - Mặc định)
*   **Màu nền chính (Background):** `#f8fafc` (Slate-50) – Sáng sủa, sạch sẽ, giống hệt với WebApp.
*   **Nền thẻ thành phần (Card Background):** `#ffffff` (Trắng tinh) – Kết hợp đổ bóng nhẹ (subtle shadow) để tạo khối phân tách.
*   **Màu chữ chính (Text Color):** `#0f172a` (Slate-900) – Đậm nét, dễ đọc dưới mọi điều kiện ánh sáng.
*   **Đường viền & Ngăn cách (Border):** `#e2e8f0` (Slate-200) – Thanh mảnh, tinh tế.

#### B. Giao diện Tối (Dark Mode)
*   **Màu nền chính (Background):** `#020617` (Slate-950) – Tông tối sâu, dịu mắt cho ca đêm.
*   **Nền thẻ thành phần (Card Background):** `#0f172a` (Slate-900).
*   **Màu chữ chính (Text Color):** `#f1f5f9` (Slate-100).
*   **Đường viền & Ngăn cách (Border):** `#1e293b` (Slate-800).

### 2. Đồng Bộ Phối Màu Thương Hiệu (Brand Identity Color)
Màu sắc nhận dạng thương hiệu được đồng bộ hóa hoàn toàn từ WebApp:
*   **Màu nhấn chính (Primary Color):** `#fa5908` (Cam đặc trưng của ONI) – Dùng cho các nút hành động chính (Thanh toán, Xác nhận), trạng thái nổi bật, logo và các thẻ active.
*   **Màu nhấn tối (Primary Dark Color):** `#d14604` – Dùng cho trạng thái nhấn giữ/active sâu hơn.
*   **Nút bấm và Các Yếu Tố Bo Tròn (Design Elements):** Tái sử dụng các bo góc dạng `rounded-2xl` và `rounded-3xl` của WebApp để tạo cảm giác mềm mại, thân thiện trên màn hình di động.

### 3. Giao Diện Tùy Biến Theo Ngành Hàng (Adaptive Vertical Layouts)

Nhờ thừa hưởng `VERTICAL_REGISTRY` từ `@oni/core`, giao diện màn hình bán hàng (POS) sẽ tự động biến đổi giao diện tối ưu nhất cho từng ngành hàng:

```carousel
Giao diện Sáng Bán lẻ / Thời trang (Nền Slate-50, thẻ trắng, nút Cam thương hiệu)
<!-- slide -->
Giao diện Sáng FnB & Bi-a / Sân thể thao (Bản đồ bàn/sân trực quan kèm ticker đếm giờ)
<!-- slide -->
Quy trình Thanh toán & In ấn hóa đơn qua máy in Bluetooth
```

#### A. Giao diện Bán lẻ & Thời trang (Grid Layout & Barcode Scans)
*   **Tập trung vào màu nhấn Cam:** Nút thanh toán nổi bật, các thẻ giảm giá và giỏ hàng được điểm khuyết bằng tông cam thương hiệu `#fa5908`.
*   **Thiết kế cử chỉ:** Nhấn giữ sản phẩm để xem nhanh thông tin tồn kho hoặc biến thể (Size/Color), vuốt ngang sản phẩm trong giỏ để xóa nhanh.

#### B. Giao diện Nhà hàng, Cafe, Bi-a & Sân thể thao (Floor Map)
*   **Bản đồ bàn/sân trực quan (Visual Table Map):** Các ô bàn bo góc hiện đại.
*   **Trạng thái bàn/sân (Light Mode):** Ô màu Trắng viền nhạt (Bàn trống) $\rightarrow$ Ô màu Viền Cam Sáng `#fa5908` kèm hiệu ứng pulse nhẹ (Đang chơi) $\rightarrow$ Ô màu Cam sẫm (Đang chờ thanh toán).
*   **Bộ đếm giờ thời gian thực:** Trên ô bàn/sân hiển thị trực tiếp đồng hồ đếm giây hoạt động liên tục và số tiền dịch vụ tạm tính.

---

## 📸 Thiết Kế Trải Nghiệm Quét Mã Vạch (Barcode Scanning UX)

Để đạt tốc độ bán hàng tối đa ở các cửa hàng bán lẻ hoặc thời trang, chúng ta sẽ thiết kế trải nghiệm quét mã vạch dựa trên phân tích các ứng dụng POS hàng đầu thế giới (như Shopify POS, Square POS):

### 1. Tại sao KHÔNG DÙNG màn hình camera quét Toàn màn hình (Full-screen Overlay)?
*   Các ứng dụng giá rẻ thường mở camera toàn màn hình khi quét. Điều này buộc thu ngân phải tắt camera đi để kiểm tra xem sản phẩm đã vào giỏ hàng chưa, giá có đúng không, số lượng là bao nhiêu $\rightarrow$ **Cực kỳ mất thời gian và dễ gây lỗi**.

### 2. Giải pháp Quét Mã Vạch của ONI Mobile:
*   **Cửa sổ quét thu nhỏ (Half-Screen Bottom Sheet):** Khi thu ngân nhấn nút "Quét sản phẩm", một cửa sổ camera nhỏ sẽ trượt lên từ phía dưới (Bottom Sheet) chiếm khoảng 40% màn hình phía trên.
*   **Phản hồi tức thì trực quan (Instant Feedback Loop):** Thu ngân đưa sản phẩm vào vùng quét. Khi quét thành công, thiết bị sẽ phát ra âm thanh *beep* native và **danh sách giỏ hàng ở 60% màn hình phía dưới sẽ lập tức cập nhật** (sản phẩm trượt vào giỏ hàng, số lượng tăng lên, tổng tiền nhảy số). Thu ngân có thể liên tục đưa sản phẩm mới vào quét mà không cần tắt camera.
*   **Hỗ trợ đầu đọc mã vạch cứng (Hardware Barcode Gun):** Nếu cửa hàng có súng quét mã vạch Bluetooth (Barcode Scanner) cầm tay chuyên dụng, ứng dụng sẽ có một Listener lắng nghe luồng nhập từ bàn phím (Keyboard Input Stream) ở chế độ nền để tự động cộng dồn sản phẩm vào giỏ hàng mà không cần bật camera điện thoại.

---

## 🔄 Chiến Lược Đồng Bộ Hóa SQLite Cục Bộ (3-Tier Sync Strategy)

Để đảm bảo hiệu năng tối đa và tính ổn định cao nhất khi mất mạng, ONI Mobile sẽ sử dụng kiến trúc **Offline-First & Event Sourcing**.

### 1. Đồng bộ Đầu Phiên (Session-Start Sync - Cấp độ 1)
*   **Khi nào hoạt động:** Ngay khi thu ngân bấm nút "Mở Ca" (Bắt đầu ca làm việc) trên Mobile.
*   **Cách thức:** Ứng dụng sẽ thực hiện một đợt **Đồng bộ hóa toàn phần (Full Sync)**. Nó sẽ xóa sạch dữ liệu cũ đã lưu và tải toàn bộ danh mục sản phẩm, bảng giá mới, danh sách sơ đồ phòng/bàn từ Supabase/Google Sheets về lưu vào SQLite. Điều này đảm bảo ca làm việc luôn khởi đầu với dữ liệu chính xác 100%.

### 2. Đồng bộ Ngầm Định Kỳ (Idle-Triggered Sync - Cấp độ 2)
*   **Khi nào hoạt động:** Tự động chạy ngầm khi thiết bị ở trạng thái rảnh rỗi (idle) **hoặc** khi thời điểm hoạt động cuối cùng (Last Active) đã vượt quá 60 phút.
*   **Cách thức:** Tác vụ chạy ngầm sẽ gọi API cập nhật dạng Delta (chỉ tải về các dòng dữ liệu mới thêm/sửa/xóa từ Web Admin kể từ lần sync trước) để cập nhật nhẹ nhàng vào SQLite mà không gây đơ máy hay ảnh hưởng đến thao tác vuốt chạm của thu ngân.

### 3. Đồng bộ Theo Yêu Cầu (On-Demand Force Sync - Cấp độ 3)
*   **Khi nào hoạt động:** Thu ngân thực hiện thao tác **Vuốt xuống để làm mới (Pull-to-Refresh)** tại màn hình danh sách sản phẩm hoặc bản đồ phòng bàn.
*   **Cách thức:** Ứng dụng sẽ lập tức kích hoạt tiến trình kiểm tra thay đổi (Force Sync) với server để kéo về ngay lập tức các thay đổi (ví dụ: Chủ cửa hàng vừa ngồi ở nhà cập nhật giá sản phẩm trên Web Admin và gọi điện báo cho nhân viên tại quầy cập nhật ngay).
