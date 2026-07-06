# Hướng Dẫn Cấu Hình Backup Database PostgreSQL

Tài liệu này hướng dẫn chi tiết cách thiết lập, vận hành, kiểm tra và khôi phục database PostgreSQL cho hệ thống **ONI SaaS Starter**. 
Hệ thống hỗ trợ backup đa kênh đồng thời: **Google Drive (5TB)**, **Cloudflare R2 (S3-compatible)** và lưu trữ **Local** kết hợp với thông báo qua **Telegram**.

---

## 1. Cơ Chế Hoạt Động

Hệ thống sử dụng script tự động hóa đặt tại [scripts/backup.sh](../scripts/backup.sh). Quy trình hoạt động như sau:
1. **Đọc cấu hình:** Script quét và đọc cấu hình từ `.env.local` hoặc `.env` bao gồm thông tin kết nối database, cấu hình rclone (GDrive, R2), và bot Telegram.
2. **Dump Database tối ưu:** Sử dụng `pg_dump` với định dạng tùy chỉnh nhị phân (`-F c` - Custom Format) giúp nén tốt, tốc độ dump nhanh và hỗ trợ restore song song.
3. **Nén ZIP:** File dump nhị phân sẽ được nén thành `.zip` với tên định dạng `giờ-phút-ngày-tháng-năm.sql.zip` (Ví dụ: `14-30-05-07-2026.sql.zip`).
4. **Đồng bộ hóa đám mây song song:**
   - **Google Drive:** Đồng bộ lên qua rclone.
   - **Cloudflare R2:** Đồng bộ lên bucket R2 qua rclone.
   *Nếu một kênh lỗi (ví dụ GDrive mất token), quá trình vẫn tiếp tục cho kênh còn lại.*
5. **Lưu trữ cục bộ (Local Retention):**
   - File zip sẽ được lưu vào thư mục `backups/` trên máy chủ để dự phòng khẩn cấp.
   - Các file local cũ hơn **3 ngày** sẽ tự động bị xóa để tiết kiệm dung lượng ổ cứng.
6. **Xóa bản sao lưu đám mây cũ:** Các file backup trên Google Drive và Cloudflare R2 cũ hơn **30 ngày** sẽ tự động bị xóa (`--min-age 30d`).
7. **Cảnh báo Telegram:** Khi quá trình dump, nén zip, hoặc upload lên từng dịch vụ đám mây thất bại, hệ thống sẽ tự động nhắn tin cảnh báo tới Telegram của bạn.

---

## 2. Các Bước Cấu Hình Rclone (Cloud Storage)

### 2.1 Cấu hình Google Drive (Khuyên dùng Service Account)

1. Tạo **Service Account** trên Google Cloud Console. Tải file JSON Key về máy chủ (ví dụ: `/opt/gdrive-key.json`).
2. Trên Google Drive cá nhân, tạo thư mục `backup_oni` và Share quyền **Editor** cho email Service Account vừa tạo.
3. Chạy lệnh `rclone config`:
   - Chọn `n` -> Tên remote: `gdrive`
   - Storage: Google Drive (`drive`)
   - Bỏ trống client_id và client_secret.
   - Tại mục **Service Account Credentials**, điền đường dẫn: `/opt/gdrive-key.json`
4. Kiểm tra cấu hình: `rclone lsd gdrive:`

### 2.2 Cấu hình Cloudflare R2 (S3 Compatible)

1. Tạo bucket tên là `backup-oni` trên Cloudflare Dashboard.
2. Tạo API Token trên Cloudflare R2 với quyền **Object Read & Write** cho bucket `backup-oni`. Note lại **Access Key ID**, **Secret Access Key**, và **Endpoint** (`https://<account_id>.r2.cloudflarestorage.com`).
3. Chạy lệnh `rclone config`:
   - Chọn `n` -> Tên remote: `r2`
   - Storage: `s3`
   - Provider: `Cloudflare`
   - Env_auth: `false`
   - Nhập **Access Key ID** và **Secret Access Key**.
   - Endpoint: Nhập Endpoint bắt đầu bằng `https://`
4. Kiểm tra cấu hình: `rclone lsd r2:`

---

## 3. Cấu hình Môi Trường (`.env`)

Cập nhật file `.env` hoặc `.env.local` với các biến sau:

```env
# URI kết nối PostgreSQL
LOCAL_PG_URI="postgresql://oni_admin:mat_khau_db@localhost:5432/oni_production"

# Cấu hình Rclone (Để trống nếu dùng tên remote mặc định)
RCLONE_REMOTE="gdrive"
RCLONE_BACKUP_PATH="backup_oni"

RCLONE_R2_REMOTE="r2"
RCLONE_R2_PATH="backup-oni" # Chú ý Cloudflare R2 không cho phép ký tự gạch dưới '_' trong tên bucket

# Thư mục lưu backup ở server (mặc định sẽ lưu vào $PROJECT_ROOT/backups)
LOCAL_BACKUP_DIR="/path/to/project/backups"

# Cảnh báo Telegram (Tuỳ chọn)
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
TELEGRAM_CHAT_ID="12345678"
```

---

## 4. Thiết lập tự động chạy (Cron Job)

Thêm cron job chạy vào phút thứ 0 của mỗi 2 tiếng (Sử dụng lệnh `crontab -e`):

```cron
0 */2 * * * /Users/fern/Coding/ERP/oni-saas-starter/scripts/backup.sh >> /home/oni/db_backup.log 2>&1
```

*(Lưu ý sửa đường dẫn tuyệt đối tới script cho chính xác)*

---

## 5. Giải Quyết Sự Cố Thường Gặp (Troubleshooting)

### Lỗi 1: Cloudflare R2 báo `401 Unauthorized` và `CreateBucket`

```text
failed to prepare upload: operation error S3: CreateBucket, https response error StatusCode: 401, ... api error Unauthorized
```
* **Nguyên nhân:** rclone đang kiểm tra và cố gắng tạo bucket mới nhưng bị thất bại do xác thực sai hoặc token không có quyền tạo bucket.
* **Cách khắc phục:**
  1. Đảm bảo **Access Key** và **Secret Access Key** cấu hình đúng trong `rclone config`. Khách hàng thường nhầm lẫn dùng *Client ID* thay vì *Access Key ID*.
  2. Đảm bảo **Endpoint** bắt đầu bằng `https://` và chứa đúng Account ID.
  3. Đảm bảo bucket (ví dụ `backup-oni`) đã được tạo thủ công trước trên giao diện Cloudflare R2.
  4. Truyền cờ `--s3-no-check-bucket` vào lệnh rclone copy trong script nếu token S3 của bạn bị giới hạn nghiêm ngặt chỉ cấp quyền thao tác file (Object) mà không có quyền list/create bucket.

### Lỗi 2: `pg_dump: error: aborting because of server version mismatch`
* **Nguyên nhân:** Phiên bản của tool `pg_dump` trên máy cũ hơn PostgreSQL Database Server đang chạy.
* **Cách khắc phục:** Nâng cấp gói postgresql client, hoặc khai báo biến môi trường `PG_DUMP_PATH` dẫn trực tiếp tới phiên bản đúng trong thư mục cài đặt hệ thống.

### Lỗi 3: Google Drive Token hết hạn / Lỗi xác minh
Nếu tạo token cá nhân, token có thể hết hạn hoặc yêu cầu Google duyệt app. 
* **Cách khắc phục:** Chuyển sang sử dụng **Service Account** thay vì User Account cá nhân khi setup rclone gdrive (Xem bước 2.1).

---

## 6. Hướng Dẫn Khôi Khục (Restore)

Khi cần khôi phục lại cơ sở dữ liệu:

1. **Giải nén file `.zip` tải về để lấy file dump nhị phân gốc:**
   ```bash
   unzip 14-30-05-07-2026.sql.zip
   # Lệnh này sẽ giải nén ra file db_dump_xxxx.dump
   ```

2. **Thực hiện Restore bằng lệnh `pg_restore`:**
   Định dạng Custom `-F c` không thể import bằng `psql` thông thường mà bắt buộc phải dùng `pg_restore`.

   *Khôi phục sang database mới (Khuyên dùng để test trước):*
   ```bash
   createdb -h localhost -p 5432 -U oni_admin db_test_restore
   pg_restore -h localhost -p 5432 -U oni_admin -d db_test_restore db_dump_xxxx.dump
   ```

   *Khôi phục đa luồng đè lên database cũ (Nhanh hơn rất nhiều):*
   ```bash
   # -c: Xóa DB objects cũ trước khi tạo lại
   # -j: Số luồng xử lý song song (ví dụ: 4)
   pg_restore -h localhost -p 5432 -U oni_admin -d oni_production -c -j 4 db_dump_xxxx.dump
   ```
