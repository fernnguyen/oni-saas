# Push Notifications — Hướng dẫn Triển khai & Vận hành

> Tài liệu mô tả toàn bộ kiến trúc, cài đặt, và vận hành hệ thống Push Notification cho ONI Mobile App — đồng bộ hoàn toàn với Web notification system.

## Mục lục

1. [Kiến trúc tổng quan](#1-kiến-trúc-tổng-quan)
2. [Cài đặt môi trường phát triển](#2-cài-đặt-môi-trường-phát-triển)
3. [Setup EAS Build](#3-setup-eas-build)
4. [Cấu hình Push Notification cho Android](#4-cấu-hình-push-notification-cho-android)
5. [Cấu hình Push Notification cho iOS](#5-cấu-hình-push-notification-cho-ios)
6. [Database & Backend API](#6-database--backend-api)
7. [Mobile Client Architecture](#7-mobile-client-architecture)
8. [Testing & Debug](#8-testing--debug)
9. [Troubleshooting](#9-troubleshooting)
10. [Checklist triển khai Production](#10-checklist-triển-khai-production)

---

## 1. Kiến trúc tổng quan

Hệ thống sử dụng kiến trúc **2 tầng song song**:

### Tầng 1: In-App Realtime (khi app đang mở)
```
Business Event → realtimeEngine.sendNotification()
    → INSERT in_app_notifications (PostgreSQL)
    → Supabase Realtime broadcast (postgres_changes)
    → Mobile Supabase Client nhận event
    → Haptic feedback + Badge count + In-app alert
```

### Tầng 2: OS Push Notification (khi app đóng hoặc background)
```
Business Event → realtimeEngine.sendNotification()
    → Query push_tokens table (active tokens)
    → Expo Push API (https://exp.host/--/api/v2/push/send)
    → APNs (iOS) / FCM (Android)
    → OS notification tray + Sound + Badge
```

### Luồng đồng bộ Web ↔ Mobile
```
┌──────────────────────────────────┐
│  Backend: realtimeEngine         │
│  .sendNotification(msg)          │
│                                  │
│  1. INSERT in_app_notifications  │ ──→ Supabase Realtime ──→ Web Client (toast)
│  2. sendExpoPushNotifications()  │ ──→ Expo Push API ──→ Mobile Client (OS push)
│                                  │                    ──→ Mobile Client (realtime)
└──────────────────────────────────┘
         ↓
  notification_reads table
  (Đồng bộ trạng thái read/unread giữa Web & Mobile)
```

---

## 2. Cài đặt môi trường phát triển

### 2.1 Cài đặt dependencies cho mobile app

```bash
cd apps/mobile

# Cài đặt các packages cần thiết cho push notifications
npx expo install expo-notifications expo-device expo-constants
```

### 2.2 Chạy database migration

```bash
# Chạy migration để tạo bảng push_tokens
supabase db push

# Hoặc chạy migration cụ thể
supabase migration up 20260606000001_push_tokens
```

### 2.3 Verify cài đặt

```bash
# Kiểm tra packages đã cài
cd apps/mobile
npx expo config --json | grep -A5 notifications
```

---

## 3. Setup EAS Build

> ⚠️ **Push notifications KHÔNG hoạt động trên Expo Go**. Bạn cần tạo Development Build thông qua EAS.

### 3.1 Cài đặt EAS CLI

```bash
# Cài đặt EAS CLI toàn cục
npm install -g eas-cli

# Đăng nhập vào tài khoản Expo
eas login
```

### 3.2 Cấu hình EAS cho project

```bash
cd apps/mobile

# Khởi tạo cấu hình EAS (tạo file eas.json)
eas build:configure
```

Khi được hỏi, chọn:
- Platform: **All** (để cấu hình cả Android và iOS)

File `eas.json` sẽ được tạo. Chỉnh sửa theo mẫu sau:

```json
{
  "cli": {
    "version": ">= 13.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### 3.3 Đăng ký Project ID

```bash
cd apps/mobile

# Link project với Expo account
eas init

# Hoặc nếu đã có project trên expo.dev
eas init --id <your-project-id>
```

Sau bước này, `app.json` sẽ có thêm:
```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "your-project-uuid"
      }
    }
  }
}
```

> **QUAN TRỌNG**: `projectId` này được sử dụng bởi `expo-notifications` để lấy Expo Push Token. Nếu thiếu, push token sẽ không hoạt động.

---

## 4. Cấu hình Push Notification cho Android

### 4.1 Tạo Firebase Project

1. Truy cập [Firebase Console](https://console.firebase.google.com/)
2. Tạo project mới hoặc chọn project hiện có
3. Thêm Android app với package name: `vn.oni.mobile`
4. Tải file `google-services.json`
5. Đặt file vào: `apps/mobile/google-services.json`

### 4.2 Kiểm tra app.json

File `app.json` đã được cấu hình sẵn:
```json
{
  "expo": {
    "android": {
      "package": "vn.oni.mobile",
      "googleServicesFile": "./google-services.json",
      "useNextNotificationsApi": true
    },
    "plugins": [
      ["expo-notifications", {
        "color": "#fa5908",
        "defaultChannel": "default"
      }]
    ]
  }
}
```

### 4.3 Build Development APK cho Android

```bash
cd apps/mobile

# Build APK cho development (cài trực tiếp trên thiết bị)
eas build --platform android --profile development

# Sau khi build xong, tải APK và cài trên thiết bị Android
```

### 4.4 Chạy Development Server

```bash
cd apps/mobile

# Chạy Metro server
npx expo start --dev-client

# Mở app trên thiết bị Android đã cài Development Build
# App sẽ tự connect đến Metro server
```

---

## 5. Cấu hình Push Notification cho iOS

### 5.1 Yêu cầu

- Mac với Xcode đã cài đặt
- Apple Developer Account (cần cho APNs)
- Thiết bị iOS thật (push không chạy trên simulator)

### 5.2 Tạo APNs Key

1. Đăng nhập [Apple Developer Console](https://developer.apple.com/account/)
2. Vào **Certificates, Identifiers & Profiles** → **Keys**
3. Tạo key mới với checkbox **Apple Push Notifications service (APNs)**
4. Tải file `.p8` key
5. Ghi nhận **Key ID** và **Team ID**

### 5.3 Upload APNs Key lên Expo

```bash
# Upload APNs key cho Expo sử dụng khi gửi push
eas credentials

# Chọn: iOS → Production → Push Notifications
# Upload file .p8 key đã tải
```

Hoặc cấu hình thủ công:
```bash
eas credentials --platform ios
# Chọn "Push Notifications: Manage your Apple Push Notifications Key"
# Chọn "Upload a new key" → Chọn file .p8
```

### 5.4 Build Development cho iOS

```bash
cd apps/mobile

# Build cho thiết bị iOS thật
eas build --platform ios --profile development

# Sau khi build xong, quét QR code hoặc tải IPA
# Cài trên thiết bị qua Expo Orbit hoặc Apple Configurator
```

### 5.5 Cấu hình Info.plist (đã tự động)

File `app.json` đã cấu hình:
```json
{
  "ios": {
    "infoPlist": {
      "UIBackgroundModes": ["remote-notification"]
    }
  }
}
```

---

## 6. Database & Backend API

### 6.1 Bảng `push_tokens`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK → auth.users) | User sở hữu token |
| `tenant_id` | UUID (FK → tenants) | Tenant scope |
| `token` | TEXT | Expo Push Token (`ExponentPushToken[xxx]`) |
| `device_name` | TEXT | Tên thiết bị (nullable) |
| `platform` | TEXT | `ios` hoặc `android` |
| `is_active` | BOOLEAN | `true` = đang hoạt động |
| `created_at` | TIMESTAMPTZ | Thời điểm đăng ký |
| `updated_at` | TIMESTAMPTZ | Thời điểm cập nhật cuối |

**UNIQUE constraint**: `(user_id, token)` — Ngăn đăng ký trùng lặp.

**RLS Policies**:
- `users_manage_own_push_tokens` — User quản lý token của mình
- `service_role_manage_push_tokens` — Backend query tokens để gửi push

### 6.2 API Endpoints

#### `POST /api/push-tokens` — Đăng ký token

```bash
curl -X POST https://your-domain/api/push-tokens \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "ExponentPushToken[xxxx]",
    "tenantId": "uuid-of-tenant",
    "platform": "android",
    "deviceName": "Pixel 8 Pro"
  }'
```

#### `DELETE /api/push-tokens` — Hủy token (khi logout)

```bash
curl -X DELETE https://your-domain/api/push-tokens \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "ExponentPushToken[xxxx]"
  }'
```

### 6.3 Expo Push Delivery (trong `realtime.ts`)

Khi `realtimeEngine.sendNotification()` được gọi:

1. **INSERT** vào `in_app_notifications` (trigger Supabase Realtime cho web + mobile foreground)
2. **Fire-and-forget** gọi `sendExpoPushNotifications()`:
   - Query `push_tokens` WHERE `tenant_id = X` AND `is_active = true`
   - Nếu có `recipientId`, filter thêm `user_id = recipientId`
   - Gửi chunks of 100 tokens đến `https://exp.host/--/api/v2/push/send`
   - Auto-deactivate tokens với lỗi `DeviceNotRegistered`

---

## 7. Mobile Client Architecture

### 7.1 File Structure

```
apps/mobile/lib/notifications/
├── NotificationContext.tsx  ← React Context (Tầng 1: Supabase Realtime)
└── push.ts                  ← Expo Push module (Tầng 2: OS Push)
```

### 7.2 NotificationContext (Tầng 1)

**File**: `lib/notifications/NotificationContext.tsx`

- **Provider** wraps toàn bộ app trong `_layout.tsx`
- **Supabase Realtime** subscription lắng nghe INSERT trên `in_app_notifications`
- **Client-side filtering**: tenant_id, branch_id, recipient_id (y hệt web)
- **Haptic feedback** khi nhận notification mới
- **AppState listener** — refresh khi app trở lại foreground
- **API integration** — markAsRead, markAllAsRead gọi backend

Usage:
```tsx
import { useNotifications } from '../lib/notifications/NotificationContext';

function MyComponent() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  
  return (
    <View>
      <Text>Bạn có {unreadCount} tin chưa đọc</Text>
      {notifications.map(n => (
        <TouchableOpacity key={n.id} onPress={() => markAsRead(n.id)}>
          <Text>{n.title}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

### 7.3 Push Module (Tầng 2)

**File**: `lib/notifications/push.ts`

- **Lazy imports** — không crash nếu `expo-notifications` chưa cài
- **Permission handling** — xin quyền notification
- **Token registration** — lấy Expo Push Token + gửi lên server
- **Foreground handler** — hiển thị notification khi app đang mở
- **Response listener** — xử lý khi user tap notification

Flow khởi tạo (trong `_layout.tsx`):
```
App launch → initializePushNotifications()
  → setupNotificationHandlers() (foreground display config)
  → registerForPushNotifications() (permissions + token)
  → savePushTokenToServer() (register token on backend)
```

### 7.4 Header Notification UI

**File**: `components/layout/Header.tsx`

- Bell icon với badge count (unread)
- Dropdown drawer với arrow connector trỏ về bell icon
- SafeArea-aware positioning (`insets.top + 52`)
- Tabs: Tất cả / Yêu cầu QR / Cảnh báo
- Icon mapping cho tất cả notification types
- Connected to `useNotifications()` context (real data, not mock)

---

## 8. Testing & Debug

### 8.1 Test push notification qua Expo Push Tool

1. Truy cập [Expo Push Tool](https://expo.dev/notifications)
2. Nhập Expo Push Token (copy từ console log)
3. Điền title, body, data
4. Gửi thử notification

### 8.2 Test push notification qua cURL

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxxxxxxx]",
    "title": "🔔 Test Push",
    "body": "Đây là push notification test từ ONI ERP",
    "data": {
      "type": "system",
      "path": "/(tabs)"
    },
    "sound": "default",
    "badge": 1
  }'
```

### 8.3 Test end-to-end (Backend → Mobile)

```sql
-- Tạo notification trực tiếp trên database
INSERT INTO in_app_notifications (tenant_id, type, title, content, metadata)
VALUES (
  'your-tenant-uuid',
  'system',
  'Test Notification',
  'Đây là notification test cho mobile app',
  '{"path": "/(tabs)/pos"}'::jsonb
);
```

### 8.4 Debug logs

```bash
# Xem logs từ Development Build
npx expo start --dev-client

# Tìm logs với prefix [PushNotifications] hoặc [NotificationContext]
```

### 8.5 Kiểm tra push token đã đăng ký

```sql
-- Kiểm tra tokens trong database
SELECT id, user_id, token, platform, is_active, updated_at
FROM push_tokens
WHERE tenant_id = 'your-tenant-uuid'
ORDER BY updated_at DESC;
```

---

## 9. Troubleshooting

### Push token là `null`

| Nguyên nhân | Giải pháp |
|---|---|
| Chạy trên Expo Go | Sử dụng Development Build (`eas build --profile development`) |
| Chạy trên simulator | Sử dụng thiết bị thật |
| Thiếu `projectId` | Chạy `eas init` để link project |
| User từ chối permission | Hướng dẫn user bật notification trong Settings |

### Notification không hiển thị trên Android

| Nguyên nhân | Giải pháp |
|---|---|
| Thiếu `google-services.json` | Tải từ Firebase Console và đặt vào `apps/mobile/` |
| Channel không được tạo | Kiểm tra `setNotificationChannelAsync()` trong `push.ts` |
| App bị kill bởi Battery Optimization | Tắt Battery Optimization cho app trong Settings |

### Notification không hiển thị trên iOS

| Nguyên nhân | Giải pháp |
|---|---|
| Thiếu APNs Key | Upload `.p8` key qua `eas credentials` |
| Bundle ID không khớp | Kiểm tra `vn.oni.mobile` trong app.json và Apple Developer Console |
| Entitlements thiếu | Rebuild Development Build |

### Supabase Realtime không nhận event

| Nguyên nhân | Giải pháp |
|---|---|
| `active_tenant_id` rỗng | Kiểm tra AsyncStorage sau login |
| RLS chặn | Kiểm tra `user_has_tenant_access()` function |
| WebSocket bị firewall chặn | Thử trên network khác |

---

## 10. Checklist triển khai Production

### Trước khi release

- [ ] **Firebase**: Tạo project + tải `google-services.json` cho Android
- [ ] **APNs**: Tạo key + upload lên Expo cho iOS
- [ ] **EAS**: Setup `eas.json` + link project ID
- [ ] **Database**: Chạy migration `20260606000001_push_tokens.sql`
- [ ] **Dependencies**: `npx expo install expo-notifications expo-device expo-constants`
- [ ] **Build**: Tạo Development Build cho testing
- [ ] **Test**: Gửi push thử qua Expo Push Tool

### Sau khi release

- [ ] **Monitor**: Theo dõi `DeviceNotRegistered` errors (auto-deactivated)
- [ ] **Cleanup**: Xóa tokens không hoạt động > 30 ngày
- [ ] **Analytics**: Track notification open rate (tap response)
- [ ] **Rate Limits**: Expo Free plan giới hạn 600 notifications/phút

### Quota & Giới hạn

| Plan | Rate Limit | Ghi chú |
|---|---|---|
| Expo Free | 600 req/min | Đủ cho hầu hết SMBs |
| Expo EAS Production | Unlimited | Cần Expo paid plan |
| Firebase FCM | 500K/ngày | Miễn phí |
| APNs | Không giới hạn | Cần Apple Developer Account ($99/năm) |

---

## Appendix: Notification Types

| Type | Icon | Mô tả | Priority |
|---|---|---|---|
| `qr_order` | 🍽️ | Khách gọi món qua QR | High |
| `qr_session` | 🚪 | Khách quét QR mở bàn | High |
| `low_stock` | ⚠️ | Cảnh báo tồn kho thấp | Medium |
| `system` | 📦 | Thông báo hệ thống | Low |
| `system_broadcast` | 📢 | Broadcast toàn hệ thống | Medium |
| `payment` | 💳 | Thông báo thanh toán | Medium |
| `booking` | 📅 | Đặt chỗ/đặt bàn | Medium |
| `order_expiring` | ⏰ | Đơn hàng sắp hết hạn | High |
| `debt_alert` | 🔴 | Cảnh báo công nợ | High |
| `return_approval` | ✅ | Duyệt đổi trả hàng | Medium |
| `purchase_approval` | ✅ | Duyệt đơn mua hàng | Medium |
