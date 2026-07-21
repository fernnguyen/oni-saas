# Hướng dẫn Thiết lập và Khắc phục sự cố Đăng nhập Mạng Xã Hội (Social Auth) & Số Điện Thoại trên Mobile

Tài liệu này tổng hợp lại các cấu hình quan trọng và các lỗi thường gặp trong quá trình tích hợp Zalo, Google và hệ thống đăng nhập đa phương thức (SĐT / Username / Email) cho ứng dụng Mobile (React Native / Expo).

---

## 1. Zalo Login

### 1.1. Cấu hình Expo Config Plugin (với Expo 50+)
Từ Expo SDK 50 trở đi, file `AppDelegate` mặc định được sinh ra bằng **Swift** (`AppDelegate.swift`) thay vì Objective-C (`AppDelegate.mm`). Do đó, file plugin `withZaloKit.js` **bắt buộc** phải hỗ trợ đọc/ghi trên file Swift.

*   **Info.plist**: Bắt buộc phải inject trường `ZaloAppID`. Nếu thiếu trường này, Zalo SDK trên iOS sẽ **bị crash ngay lập tức** khi gọi hàm `login`.
*   **AppDelegate.swift**: Cần chèn mã khởi tạo SDK (`ZaloSDK.sharedInstance().initialize(withAppId:)`) và xử lý deep link (`ZaloSDK.sharedInstance().application(app, open: url, options: options)`).

### 1.2. Cách sử dụng `react-native-zalo-kit`
Phiên bản mới của `react-native-zalo-kit` sử dụng _Named Exports_ thay vì _Default Export_. Đồng thời, hằng số cấu hình cũng thay đổi.

**Code đúng:**
```typescript
let ZaloKit: any;
try {
  ZaloKit = require('react-native-zalo-kit'); // Không dùng .default
} catch (e) {
  // ...
}

// Khi gọi login, truyền thẳng String thay vì hằng số của class
const zaloResult = await ZaloKit.login('AUTH_VIA_APP_OR_WEB');
```

---

## 2. Google Login (Supabase)

### 2.1. Cấu hình
Google login trên mobile yêu cầu phải tạo riêng các Client ID cho iOS và Android trên Google Cloud Console, sau đó truyền vào `app.json`:
```json
{
  "expo": {
    "extra": {
      "googleIosClientId": "YOUR_IOS_CLIENT_ID",
      "googleAndroidClientId": "YOUR_ANDROID_CLIENT_ID",
      "googleWebClientId": "YOUR_WEB_CLIENT_ID"
    }
  }
}
```

### 2.2. Lỗi thường gặp: `Unacceptable audience in id_token`
*   **Mô tả:** Người dùng đăng nhập Google trên điện thoại thành công, trả về token, nhưng khi gửi token này lên Supabase thì báo lỗi.
*   **Nguyên nhân:** Supabase không nhận diện được Client ID của ứng dụng mobile (iOS hoặc Android) vì nó chưa được khai báo trên Supabase.
*   **Cách khắc phục:** 
    1. Truy cập **Supabase Dashboard** > **Authentication** > **Providers** > **Google**.
    2. Ở phần **Authorized Client IDs**, hãy thêm chuỗi Client ID bị báo lỗi vào (các Client ID cách nhau bằng dấu phẩy).
    3. Lưu lại và thử đăng nhập lại. Không cần build lại app.

---

## 3. Đăng nhập bằng Số điện thoại / Username / Email (Mobile)

Ứng dụng web có thể tự động xử lý và chuẩn hoá các định dạng đăng nhập (ví dụ số điện thoại thành dạng email chuẩn `zalo_8498...@oni.vn`). Trên mobile, hàm `signInWithPassword` của Supabase đòi hỏi chúng ta phải xử lý logic này ở máy khách (client-side) trước khi gửi yêu cầu.

### Logic xử lý
Hệ thống sử dụng hàm tiện ích `phone.ts` để kiểm tra chuỗi định danh đầu vào (identifier). Nếu người dùng nhập số điện thoại, hệ thống sẽ tự động sinh ra một danh sách các "ứng viên" email để thử đăng nhập tuần tự:
1. `+8498...` (định dạng quốc tế)
2. `8498...` (định dạng số)
3. `zalo_8498...@oni.vn` (định dạng Zalo giả lập)
4. `phone@user.oni.vn` (định dạng chuẩn hoá của hệ thống)

Vòng lặp `for...of` sẽ duyệt qua các phương án này, ngay khi có phương án thành công, vòng lặp dừng lại.

```typescript
const attempts: Array<{ email: string } | { phone: string }> = [];
// ... (tạo danh sách attempts dựa trên việc định dạng đầu vào là SĐT, Email, hay Username thuần)

let signInError = null;
let signInData = null;

for (const attempt of attempts) {
  const { data: resData, error } = await supabase.auth.signInWithPassword({
    ...attempt,
    password: password,
  } as any);

  if (!error) {
    signInError = null;
    signInData = resData;
    break;
  }
  signInError = error;
}
```

*Lưu ý: Mọi chỉnh sửa lớn ở cấu hình Native (như `withZaloKit`) đều yêu cầu phải chạy lệnh `expo prebuild --clean` hoặc build lại ứng dụng hoàn toàn thông qua EAS thì những cấu hình mới mới có tác dụng.*
