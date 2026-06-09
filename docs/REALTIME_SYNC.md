# Realtime Sync Architecture for POS

ONI SaaS sử dụng mô hình "Offline-First" trên Mobile POS và "Online-First" trên Web POS. Để giải quyết vấn đề đồng bộ hóa trạng thái phòng bàn và đơn hàng tức thì giữa nhiều thiết bị, nền tảng tích hợp cơ chế đồng bộ thời gian thực qua **Supabase Realtime Broadcast**.

## 1. Cơ sở hạ tầng (Infrastructure)

Cơ chế Realtime được xây dựng trên Broadcast Channels của Supabase, cho phép truyền nhận message (Low-latency WebSockets) giữa các clients (Web và Mobile) mà không ghi trực tiếp vào Database, do đó không tạo gánh nặng lưu trữ (Zero Postgres DB load) và tiết kiệm chi phí.

- **Kích hoạt/Tắt bật:** Quản trị viên Super Admin có thể kiểm soát cờ `enable_realtime_sync`.
- **Channel Format:** `pos_sync_{tenant_code}_{shop_id}` 
  (Đảm bảo thông điệp chỉ được publish tới đúng tenant và shop, bảo mật và cô lập).

## 2. Kiến trúc Web POS

Web POS hoạt động chủ yếu dựa trên Server-Side Rendering và Client-Side Fetching. Khi tính năng Realtime được bật:
- Tại `TableMapPOS.tsx`: Kết nối kênh (Channel) để lắng nghe sự thay đổi của toàn bộ bản đồ bàn (`REFRESH_TABLE_MAP`). Bất cứ thao tác mở bàn, đóng ca từ bất kì đâu cũng làm Web tự gọi lại API để load trạng thái bàn mới nhất.
- Tại `ResourceSlideOver.tsx`: Kết nối kênh để nhận event của duy nhất một bàn cụ thể đang mở. 
  - **Silent Refresh (Cập nhật ngầm):** Nếu thu ngân đang không chỉnh sửa thông tin (Không có `dirtyItems` trong giỏ hàng, không mở Modal sửa khách hàng, v.v.), hệ thống sẽ âm thầm `fetchOrder()` lấy thông tin mới nhất hiển thị.
  - **Cảnh báo thay đổi (Dirty State Warning):** Nếu thu ngân đang nhập liệu, màn hình sẽ hiển thị Banner cảnh báo màu cam "Phòng/bàn này vừa có thay đổi từ thiết bị khác...", yêu cầu thu ngân chọn Reload để lấy dữ liệu.
- Mọi thao tác Mutation trên Web POS (Lưu món, Hủy món, Đổi bàn, Gộp bàn, Thanh toán) đều phát (Broadcast) một Event đi kèm ID của phòng/bàn (`source: 'web_app'`).

## 3. Kiến trúc Mobile POS

Mobile POS sử dụng SQLite local. Quá trình gửi nhận được quản lý qua hook: `useRealtimeSync.ts`.
- **Lắng nghe Broadcast:** Khi có tín hiệu, Mobile gọi API qua cơ chế đồng bộ cục bộ (vd: `syncActiveTableSession()`) và refresh local store để UI cập nhật theo.
- **Phát tín hiệu (Broadcast):** Bất cứ khi nào Mobile Sync Manager hoặc các hành động `syncOrderItemsOnline`, `handlePayTable` hoàn tất đồng bộ với Server, nó sẽ gọi `broadcastSync` với `source: 'mobile_app'` để kích hoạt các thiết bị Web hoặc Mobile khác thay đổi tương ứng.

## 4. Các loại Event thông dụng

- `TABLE_OPENED`: Phòng/bàn được mở.
- `TABLE_CHECKIN`: Phòng/bàn bắt đầu tính giờ.
- `TABLE_PAID` / `SESSION_CLOSED`: Hóa đơn đã thanh toán.
- `ITEMS_UPDATED`: Thêm, sửa, hoặc xóa các món ăn/dịch vụ.
- `GROUP_CHECKOUT`: Khách trả tiền cho nhiều phòng/bàn cùng lúc.

## 5. Xử lý lỗi và Fallback

- **Fallback cơ chế cũ:** Nếu Super Admin tắt tính năng, hệ thống tự động fallback về cơ chế `setInterval` (15 giây 1 lần lấy dữ liệu tại Web POS) và thủ công/SyncManager cho Mobile.
- **Kết nối mất mạng (Offline):** Khi client bị rớt mạng, Supabase Channel sẽ reconnect. Trong lúc offline, Mobile POS vẫn chạy cục bộ. Sau khi có mạng, App gửi batch sync lên API và kích hoạt Broadcast tới Web.
