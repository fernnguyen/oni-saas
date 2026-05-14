# Hướng Dẫn Tích Hợp Telegram Push Notification

Hệ thống ONI SaaS hỗ trợ thông báo tự động (Push Notification) qua Telegram. Tính năng này được phân làm hai luồng riêng biệt để phục vụ các cấp độ khách hàng khác nhau:

1. **Push Notification (ONI Bot / Shared Bot)**: Dành cho các gói cơ bản. Người dùng cấu hình nhanh bằng cách thêm Bot chung của hệ thống vào Group và gửi mã ghép nối (Pairing Code).
2. **Custom Notification (Private Bot)**: Dành cho các gói cao cấp (Premium/Enterprise). Tổ chức (Tenant) sẽ tự cấp Bot Token riêng để hệ thống sử dụng.

---

## 1. Biến Môi Trường (Environment Variables)

Để hệ thống (cụ thể là tính năng Shared Bot) có thể hoạt động, bạn cần khai báo Token của con Bot Telegram chung vào file `.env.local`:

```bash
# Telegram Bot dùng chung cho hệ thống (ONI Bot)
TELEGRAM_BOT_TOKEN=1234567890:AAH_xxxxxxxxxxxx_xxxxxxxxxxx
```

*Lưu ý: Nếu không khai báo biến này, luồng Push Notification cơ bản (mã ghép nối) sẽ không thể bắn được tin nhắn do không có Token khởi tạo.*

---

## 2. Thiết Lập Webhook (Dành Cho Server/Dev)

Hệ thống giao tiếp với Telegram thông qua cơ chế **Webhook**. Bạn cần nói cho Telegram biết địa chỉ API nào sẽ hứng tin nhắn của người dùng gửi tới Bot. 

**API Endpoint của hệ thống:** `https://<domain_của_bạn>/api/webhooks/telegram`

Bạn hãy mở Terminal hoặc Trình duyệt và gọi request sau (Thay thế `<BOT_TOKEN>` và `<DOMAIN>` bằng giá trị thực tế):

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<DOMAIN>/api/webhooks/telegram"
```

*Ví dụ:*
`https://api.telegram.org/bot123456789:AAH_xxx/setWebhook?url=https://saas.oni.vn/api/webhooks/telegram`

Nếu nhận được kết quả `{"ok":true,"result":true,"description":"Webhook was set"}`, quá trình thiết lập đã thành công.

---

## 3. Kiến Trúc Cơ Sở Dữ Liệu

Tính năng này phụ thuộc vào 3 bảng (tables) trên Supabase:

1. **`tenant_notification_channels`**: Lưu cấu hình kết nối.
   - Luồng ONI Bot: Cấu hình chỉ chứa `{"chat_id": "-100xxxx"}` (không chứa `bot_token`).
   - Luồng Custom Bot: Cấu hình chứa `{"chat_id": "-100xxxx", "bot_token": "..."}`.
2. **`tenant_notification_events`**: Lưu các sự kiện mà Tenant muốn theo dõi (Vd: `ORDER_CREATED` = `true`).
3. **`bot_pairing_codes`**: Lưu Mã ghép nối (Pairing Code) dùng một lần, có thời hạn (15 phút) để nối Group Telegram với Tenant.

---

## 4. Phân Quyền Bằng Superadmin

Với tư cách là **Superadmin**, bạn có thể bật/tắt quyền sử dụng hệ thống thông báo cho từng Gói dịch vụ (Plan) trong giao diện `/super/plans`. 

Có 2 cờ trong `metadata` của Plan tương ứng với 2 tính năng:
- `can_use_push_notify` (`boolean`): Cấp quyền dùng Bot chung của ONI (Shared Bot).
- `can_use_custom_notify` (`boolean`): Cấp quyền tự cài đặt Token riêng (Private Bot).

---

## 5. Trải Nghiệm Người Dùng (User Flow)

### 5.1. Luồng Onboarding nhanh (Dùng ONI Bot)
1. **Khởi tạo**: Tenant Admin truy cập `/t/[slug]/settings` -> Cuộn xuống khu vực **Push Notification**.
2. **Tạo mã**: Nhấn nút "Tạo mã ghép nối". Hệ thống sinh ra mã, ví dụ: `ONI-1A2B3C`.
3. **Mời Bot**: Admin tạo một Group Telegram mới cho cửa hàng và Invite con bot chung (VD: `@OniSaasBot`) vào nhóm.
4. **Xác nhận**: Gửi tin nhắn có nội dung `/connect ONI-1A2B3C` trực tiếp vào Group.
5. **Thành công**: Bot Telegram sẽ phản hồi xác nhận, và giao diện trên ONI sẽ chuyển sang trạng thái "Đã kết nối thành công".

### 5.2. Luồng Nâng cao (Custom Bot)
1. **Thiết lập**: Tenant Admin truy cập `/t/[slug]/settings` -> Cuộn xuống khu vực **Custom Notification**.
2. **Tạo Bot**: Lên Telegram tìm `@BotFather` và tạo 1 con bot mới.
3. **Nhập liệu**: Dán **Bot Token** và **Chat ID** (ID của group, vd `-100123...`) trực tiếp vào form cài đặt. Lưu lại là hệ thống sẽ ưu tiên dùng Token này để gửi tin.

---

## 6. Lập Trình Và Bắn Sự Kiện (For Developers)

Hàm lõi để gửi thông báo nằm tại `apps/web/lib/server/notifications.ts`. 

Bất cứ khi nào bạn viết thêm API xử lý logic (ví dụ: tạo đơn, tạo khách hàng, báo cáo), chỉ cần gọi hàm `dispatchNotification` mà không cần `await` (để tránh gây treo response của client).

**Ví dụ:**
```typescript
import { dispatchNotification } from '@/lib/server/notifications';

// ... sau khi lưu đơn hàng xong:
dispatchNotification(tenantId, 'ORDER_CREATED', {
  title: '📦 Đơn hàng mới',
  message: `Khách hàng: Anh A\nTổng tiền: 5.000.000đ`,
  url: 'https://saas.oni.vn/.../orders'
}).catch(console.error);
```

**Service sẽ tự động xử lý các bước:**
1. Check xem Plan của Tenant có hỗ trợ thông báo không.
2. Check xem Tenant có tích chọn bật sự kiện `ORDER_CREATED` trên UI không.
3. Tự xác định xem Tenant đang dùng Shared Bot hay Custom Bot để sử dụng đúng API Token.
4. Xử lý escape ký tự đặc biệt cho Telegram MarkdownV2 để không bị lỗi.
