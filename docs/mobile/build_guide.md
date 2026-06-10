# Hướng dẫn Build và Cấu hình Ký số (Signing) cho ứng dụng ONI POS

Tài liệu này hướng dẫn chi tiết từng bước (step-by-step) cách thiết lập môi trường, chạy thử nghiệm local, đóng gói thành phẩm và cấu hình ký chữ ký số (signing) cho hai nền tảng iOS và Android trên hệ điều hành macOS.

---

## 1. Thiết lập Môi trường (Prerequisites)

Để thực hiện build ứng dụng trực tiếp tại máy local của bạn, máy Mac cần cấu hình đầy đủ các công cụ sau:

### Cho cả hai nền tảng (Chung)
- **Node.js**: Phiên bản LTS khuyến nghị (Node 22.x).
- **pnpm**: Trình quản lý package của dự án (`npm install -g pnpm`).
- **EAS CLI**: Công cụ giao tiếp với hệ thống của Expo (`npm install -g eas-cli`).

### Cho nền tảng Android
1. **Java Development Kit (JDK)**: Cài đặt JDK phiên bản 17 (bắt buộc cho Expo SDK 54).
   - Cài đặt qua Homebrew: `brew install openjdk@17`
   - Cấu hình biến môi trường trong file `.zshrc` hoặc `.bash_profile`:
     ```bash
     export JAVA_HOME=$(/usr/libexec/java_home -v 17)
     export PATH=$JAVA_HOME/bin:$PATH
     ```
2. **Android Studio**: Tải về và cài đặt Android Studio.
   - Cài đặt **Android SDK** (API Level 35) thông qua SDK Manager của Android Studio.
   - Tạo một thiết bị ảo (Android Emulator) chạy hệ điều hành Android 10+.
   - Cấu hình đường dẫn SDK trong shell config của bạn (file `.zshrc`):
     ```bash
     export ANDROID_HOME=$HOME/Library/Android/sdk
     export PATH=$PATH:$ANDROID_HOME/emulator
     export PATH=$PATH:$ANDROID_HOME/platform-tools
     ```

### Cho nền tảng iOS
1. **Xcode**: Tải xuống phiên bản mới nhất từ Mac App Store.
2. **Xcode Command Line Tools**: Mở terminal chạy lệnh:
   ```bash
   xcode-select --install
   ```
3. **CocoaPods**: Công cụ quản lý thư viện native cho iOS.
   ```bash
   sudo gem install cocoapods
   ```

---

## 2. Chạy thử nghiệm ở chế độ Development (Local Run)

### Chạy trên iOS Simulator
Nếu bạn gặp lỗi:
> `CommandError: No iOS devices available in Simulator.app`

Điều này nghĩa là ứng dụng Simulator của macOS chưa được bật lên hoặc chưa có thiết bị giả lập nào được khởi động sẵn.
* **Cách khắc phục:**
  1. Mở ứng dụng **Simulator** bằng cách tìm kiếm trong Spotlight (Cmd + Space gõ `Simulator`) hoặc chạy lệnh từ terminal:
     ```bash
     open -a Simulator
     ```
  2. Tại cửa sổ Simulator, bạn chọn menu **File** -> **Open Simulator** -> Chọn một thiết bị (ví dụ: iPhone 15).
  3. Sau khi màn hình Simulator đã hiển thị hệ điều hành iOS, hãy chạy lại lệnh:
     ```bash
     pnpm --filter @oni/mobile ios
     ```
  * *Mẹo:* Bạn cũng có thể mở trực tiếp dự án Xcode bằng cách nhấp đúp vào file [apps/mobile/ios/ONIPOS.xcworkspace](file:///Users/fern/Coding/ERP/oni-saas-starter/apps/mobile/ios/ONIPOS.xcworkspace), chọn thiết bị Simulator trên thanh công cụ Xcode và bấm nút **Play (Run)**.

### Chạy trên Android Emulator
1. Mở Device Manager trong Android Studio và khởi chạy một máy ảo Android Emulator.
2. Chạy lệnh:
   ```bash
   pnpm --filter @oni/mobile android
   ```

---

## 3. Quy trình Ký số (Signing Setup) khi có Tài khoản Developer

Chữ ký số là bắt buộc để ứng dụng của bạn có thể cài đặt được lên thiết bị thật hoặc đẩy lên chợ ứng dụng (Google Play, App Store).

### 🤖 3.1. Ký số cho Android (Keystore)

EAS Build của Expo có thể tự động quản lý chữ ký cho bạn, hoặc bạn cấu hình tự ký dưới local.

#### Cách A: Để EAS tự quản lý (Khuyên dùng)
Expo EAS cung cấp một hệ thống quản lý thông tin bảo mật và Keystore rất an toàn.
1. Chạy lệnh sau tại thư mục `apps/mobile`:
   ```bash
   eas credentials
   ```
2. Chọn nền tảng `Android` và thực hiện theo hướng dẫn. EAS sẽ hỏi bạn muốn để hệ thống tự tạo ra một file Keystore mới hay bạn muốn upload file của riêng mình lên.
3. Khi bạn build qua Cloud hoặc chạy `eas build --local`, EAS sẽ tự động lấy Keystore này và ký số vào file sản phẩm đầu ra `.apk` hoặc `.aab`.

#### Cách B: Ký số thủ công tại Local (Dùng cho Gradle build trực tiếp)
1. Tạo một file chứng chỉ khóa (`keystore`) mới bằng lệnh:
   ```bash
   keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Đặt file `my-release-key.keystore` vào thư mục `apps/mobile/android/app/`.
3. Cập nhật thông tin cấu hình ký vào file `apps/mobile/android/app/build.gradle` trong block `signingConfigs`:
   ```gradle
   signingConfigs {
       release {
           storeFile file('my-release-key.keystore')
           storePassword 'Mật_khẩu_keystore'
           keyAlias 'my-key-alias'
           keyPassword 'Mật_khẩu_key'
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
       }
   }
   ```
   > [!WARNING]
   > Không nên commit file keystore và thông tin mật khẩu lên git public. Nên lưu thông tin mật khẩu trong file `gradle.properties` ở local của bạn (không commit lên git).

---

### 🍎 3.2. Ký số cho iOS (Apple Certificates & Provisioning Profiles)

Quy trình ký số cho iOS phức tạp hơn và yêu cầu bạn phải có tài khoản **Apple Developer Account** (đóng phí 99$/năm).

#### Cách A: Sử dụng EAS CLI tự động cấu hình (Khuyên dùng)
EAS CLI có thể giao tiếp trực tiếp với cổng thông tin Apple Developer của bạn để tạo khóa và cấu hình tự động.
1. Đảm bảo máy tính của bạn đã đăng nhập tài khoản Apple Developer trong Xcode (Xcode Preferences -> Accounts).
2. Chạy lệnh tại thư mục `apps/mobile`:
   ```bash
   eas credentials
   ```
3. Chọn nền tảng `iOS`. Hệ thống sẽ yêu cầu bạn đăng nhập bằng Apple ID Developer.
4. EAS sẽ tự động thực hiện:
   - Tạo **Apple Distribution Certificate** (Chứng chỉ phân phối).
   - Đăng ký **App ID** (vn.oni.pos).
   - Tạo **Provisioning Profile** tương thích.
5. Từ đây, bất cứ khi nào bạn chạy lệnh build, EAS sẽ tự động lấy các thông tin này từ máy chủ an toàn của Expo để ký số cho ứng dụng.

#### Cách B: Tự cấu hình bằng Xcode (Dành cho Xcode Build trực tiếp tại local)
1. Mở file [ONIPOS.xcworkspace](file:///Users/fern/Coding/ERP/oni-saas-starter/apps/mobile/ios/ONIPOS.xcworkspace) trong Xcode.
2. Chọn dự án **ONIPOS** trên thanh điều hướng bên trái -> Chọn tab **Signing & Capabilities**.
3. Tích chọn **Automatically manage signing**.
4. Tại mục **Team**, chọn Tài khoản Developer của bạn.
5. Xcode sẽ tự động liên hệ với máy chủ Apple để tạo ra Provisioning Profile và ký trực tiếp khi bạn thực hiện build.

---

## 4. Cách đóng gói thành phẩm (Build Release)

Khi đã sẵn sàng đóng gói để cài thử nghiệm hoặc phát hành, bạn sử dụng các lệnh sau:

### 4.1. Đóng gói cho Android (File APK để cài trực tiếp)

* **Build qua EAS Cloud (Biên dịch trên máy chủ Expo):**
  ```bash
  pnpm --filter @oni/mobile exec eas build --platform android --profile preview
  ```
  *(Sau khi hoàn tất, EAS sẽ cung cấp một mã QR và đường dẫn tải xuống file `.apk` cài trực tiếp).*

* **Build tại Local của bạn (Tự chạy biên dịch trên máy Mac của bạn):**
  ```bash
  pnpm --filter @oni/mobile exec eas build --platform android --local --profile preview
  ```
  *(Sản phẩm đầu ra là file `.apk` lưu tại máy local của bạn).*

* **Build file định dạng AAB để đẩy lên CH Play:**
  Chuyển sang profile `production`:
  ```bash
  pnpm --filter @oni/mobile exec eas build --platform android --local --profile production
  ```

### 4.2. Đóng gói cho iOS (File IPA để tải lên TestFlight/App Store)

* **Build qua EAS Cloud:**
  ```bash
  pnpm --filter @oni/mobile exec eas build --platform ios --profile production
  ```
* **Build tại Local:**
  ```bash
  pnpm --filter @oni/mobile exec eas build --platform ios --local --profile production
  ```
  *(Khi build iOS thành công, bạn sẽ nhận được file `.ipa`. Bạn có thể dùng ứng dụng **Transporter** trên máy Mac hoặc công cụ `eas submit` để đẩy file này lên TestFlight cho người dùng thử nghiệm).*
