# Hướng Dẫn Cấu Hình Backup Database PostgreSQL Lên Google Drive

Tài liệu này hướng dẫn chi tiết cách thiết lập, vận hành, kiểm tra và khôi phục database PostgreSQL cho hệ thống **ONI SaaS Starter** lên bộ nhớ đám mây Google Drive (5TB).

---

## 1. Cơ Chế Hoạt Động

Hệ thống sử dụng script tự động hóa đặt tại [scripts/backup.sh](file:///Users/fern/Coding/ERP/oni-saas-starter/scripts/backup.sh). Quy trình hoạt động như sau:
1. **Đọc cấu hình:** Script tự động quét và đọc thông tin kết nối database (`LOCAL_PG_URI` hoặc `DATABASE_URL`) từ file cấu hình môi trường (quét lần lượt `.env.local` ở local hoặc `.env` ở production).
2. **Dump Database tối ưu:** Sử dụng `pg_dump` với định dạng tùy chỉnh nhị phân (`-F c` - Custom Format). Đây là định dạng tối ưu nhất của PostgreSQL giúp nén tốt, tốc độ dump nhanh và hỗ trợ restore linh hoạt (cho phép chọn khôi phục từng phần hoặc khôi phục song song).
3. **Nén ZIP:** File dump nhị phân sẽ được nén thành tệp `.zip` và được đặt tên theo định dạng `backup_giờ.zip` (Ví dụ: `backup_14.zip` vào lúc 14 giờ).
4. **Đồng bộ hóa đám mây:** Sử dụng công cụ `rclone` (tương đương `rsync` cho cloud) để đồng bộ lên Google Drive theo cấu trúc thư mục dạng: `backup_oni/<tháng>/<ngày>/backup_<giờ>.zip`.
5. **Xóa bản sao lưu cũ (Retention policy):** Script tự động quét và xóa các file backup trên Google Drive cũ hơn **30 ngày** (sử dụng tính năng `--min-age 30d` của `rclone`) và tự dọn dẹp các thư mục rỗng.
6. **Dọn dẹp cục bộ:** Xóa toàn bộ file `.dump` và `.zip` tạm thời trên ổ cứng server ngay khi quá trình đồng bộ hoàn tất nhằm bảo vệ dung lượng đĩa của server.

---

## 2. Các Bước Triển Khai Trên Cloud Server (VPS Production)

### Bước 1: Cài đặt các công cụ bổ trợ
Chạy lệnh sau trên Cloud Server để cài đặt các package cần thiết:
```bash
# Đối với Ubuntu / Debian:
sudo apt update
sudo apt install -y zip postgresql-client rclone
```

### Bước 2: Cấu hình kết nối Google Drive (Sử dụng Service Account)
Để tránh lỗi phân quyền từ Google OAuth Consent (`Access Blocked`) và ngăn ngừa lỗi hết hạn Token sau một thời gian chạy trên server, sử dụng **Service Account** là giải pháp tốt nhất.

1. **Tạo Service Account trên Google Cloud Console:**
   - Vào [Google Cloud Console](https://console.cloud.google.com/) -> **IAM & Admin** -> **Service Accounts**.
   - Nhấn **Create Service Account**, đặt tên (ví dụ: `oni-backup-bot`).
   - Sau khi tạo, hãy copy địa chỉ email của Service Account vừa tạo, dạng: `oni-backup-bot@<project-id>.iam.gserviceaccount.com`.

2. **Tải Key File dạng JSON:**
   - Click vào Service Account vừa tạo -> chọn tab **Keys** -> **Add Key** -> **Create new key**.
   - Chọn loại **JSON** rồi tải về máy.
   - Upload file này lên Cloud Server của bạn và lưu tại đường dẫn bảo mật, ví dụ: `/opt/gdrive-key.json`.
   - Phân quyền bảo mật cho file key:
     ```bash
     sudo chmod 600 /opt/gdrive-key.json
     sudo chown root:root /opt/gdrive-key.json
     ```

3. **Chia sẻ thư mục Google Drive cho Service Account:**
   - Trên Google Drive cá nhân (hoặc Drive 5TB doanh nghiệp), tạo một thư mục tên là `backup_oni`.
   - Click chuột phải vào thư mục `backup_oni` -> Chọn **Share** (Chia sẻ).
   - Dán địa chỉ email của Service Account (`oni-backup-bot@...`) vào, cấp quyền **Editor** (Người chỉnh sửa) và lưu lại.

4. **Cấu hình `rclone` trên server:**
   Chạy lệnh cấu hình:
   ```bash
   rclone config
   ```
   Thực hiện các bước chọn sau:
   - Chọn `n` để tạo remote mới.
   - Nhập tên remote: `gdrive` (nếu đặt tên khác, bạn phải khai báo `RCLONE_REMOTE` trong file `.env`).
   - Chọn số ứng với dịch vụ **Google Drive** (nhập `drive` hoặc chọn số tương ứng từ danh sách).
   - Các phần `client_id` và `client_secret` -> **Để trống** và nhấn Enter.
   - Ở mục **Service Account Credentials (JSON file path)**, điền đường dẫn tuyệt đối đến file JSON key đã tải ở trên:
     ```text
     service_account_file> /opt/gdrive-key.json
     ```
   - Nhấn Enter qua các mục tiếp theo và chọn `y` để xác nhận hoàn tất.

*Kiểm tra cấu hình rclone:*
```bash
rclone lsd gdrive:
```
Nếu lệnh hiển thị đúng thư mục `backup_oni` hoặc các thư mục hiện có trên Drive của bạn tức là kết nối thành công.

---

### Bước 3: Cấu hình biến môi trường trong `.env`
Đảm bảo file `.env` trên VPS Production đã cấu hình đúng thông tin kết nối cơ sở dữ liệu và công cụ:
```env
# URI kết nối PostgreSQL
LOCAL_PG_URI="postgresql://oni_admin:mat_khau_db@localhost:5432/oni_production"

# Tên Remote Google Drive đã cấu hình trong rclone (Mặc định: gdrive)
RCLONE_REMOTE="gdrive"

# Thư mục gốc chứa backup trên Google Drive (Mặc định: backup_oni)
RCLONE_BACKUP_PATH="backup_oni"

# Đường dẫn tùy chỉnh đến pg_dump (Nếu gặp lỗi lệch phiên bản client và server pg_dump)
# Ví dụ trên macOS (Homebrew): PG_DUMP_PATH="/opt/homebrew/opt/postgresql@18/bin/pg_dump"
# PG_DUMP_PATH="pg_dump"
```

---

### Bước 4: Thiết lập và Chạy thử Script
1. Chuyển quyền thực thi cho file script:
   ```bash
   chmod +x scripts/backup.sh
   ```
2. Chạy thử nghiệm trực tiếp:
   ```bash
   ./scripts/backup.sh
   ```
   Kiểm tra log hiển thị trên màn hình. Nếu không có lỗi và trên Google Drive xuất hiện tệp tin mới tại `backup_oni/<Tháng>/<Ngày>/backup_<Giờ>.zip` thì script hoạt động hoàn hảo.

---

### Bước 5: Lập lịch chạy tự động bằng Cron Job (2 tiếng/lần)
Để thiết lập tự động hóa hoàn toàn, chạy lệnh chỉnh sửa cron tab dưới quyền user phù hợp (hoặc root):
```bash
crontab -e
```

Thêm dòng khai báo lịch chạy sau (chạy vào phút thứ 0 của mỗi 2 tiếng):
```cron
0 */2 * * * /Users/fern/Coding/ERP/oni-saas-starter/scripts/backup.sh >> /var/log/db_backup.log 2>&1
```
*(Hãy thay thế `/Users/fern/Coding/ERP/oni-saas-starter/scripts/backup.sh` bằng đường dẫn tuyệt đối chính xác tới dự án trên server của bạn).*

Bạn cũng nên bảo mật file script trên server để tránh rò rỉ thông tin đăng nhập DB:
```bash
sudo chmod 700 /Users/fern/Coding/ERP/oni-saas-starter/scripts/backup.sh
```

---

## 3. Hướng Dẫn Khôi Phục (Restore) Dữ Liệu từ Bản Sao Lưu

Khi cần khôi phục lại cơ sở dữ liệu từ file zip tải xuống từ Google Drive:

1. **Giải nén file `.zip` tải về để lấy file dump nhị phân gốc:**
   ```bash
   unzip backup_14.zip
   # Lệnh này sẽ giải nén ra file db_dump_*.dump
   ```

2. **Thực hiện Restore bằng lệnh `pg_restore`:**
   Định dạng Custom `-F c` không thể import bằng lệnh `psql < file.sql` thông thường mà bắt buộc phải dùng công cụ chuyên dụng `pg_restore`.

   *Khôi phục đè (overwrite) lên database cũ:*
   ```bash
   # -c: Xóa các object cũ trước khi tạo lại
   # -d: Tên database muốn khôi phục vào
   pg_restore -h localhost -p 5432 -U oni_admin -d oni_production -c db_dump_xxxx.dump
   ```

   *Khôi phục sang một database mới (Khuyên dùng để test trước):*
   ```bash
   # 1. Tạo DB mới
   createdb -h localhost -p 5432 -U oni_admin db_test_restore
   
   # 2. Khôi phục dữ liệu vào DB mới
   pg_restore -h localhost -p 5432 -U oni_admin -d db_test_restore db_dump_xxxx.dump
   ```

   *Khôi phục đa luồng (Nhanh hơn rất nhiều cho database lớn):*
   ```bash
   # Sử dụng cờ -j để xác định số luồng xử lý song song (ví dụ: 4 luồng)
   pg_restore -h localhost -p 5432 -U oni_admin -d oni_production -j 4 db_dump_xxxx.dump
   ```

---

## 4. Giải Quyết Sự Cố Thường Gặp (Troubleshooting)

### Lỗi 1: `pg_dump: error: aborting because of server version mismatch`
* **Nguyên nhân:** Phiên bản của tool `pg_dump` trên máy của bạn cũ hơn phiên bản của PostgreSQL Database Server đang chạy (ví dụ: database là 18.4 nhưng `pg_dump` đang gọi là 17.5). Nguyên tắc của PostgreSQL là `pg_dump` phải có phiên bản lớn hơn hoặc bằng phiên bản cơ sở dữ liệu.
* **Cách khắc phục:**
  1. **Trên macOS (Homebrew):** Bạn cần cập nhật gói postgresql hoặc link đúng phiên bản:
     ```bash
     brew upgrade postgresql
     # Hoặc nếu bạn cài đặt postgresql@18 riêng lẻ:
     brew link --overwrite --force postgresql@18
     ```
  2. **Chỉ định đường dẫn trực tiếp trong `.env`:** Nếu bạn cài nhiều phiên bản PostgreSQL và không muốn cấu hình lại hệ thống, hãy chỉ định cụ thể đường dẫn tới binary `pg_dump` đúng phiên bản trong `.env`:
     ```env
     PG_DUMP_PATH="/opt/homebrew/opt/postgresql@18/bin/pg_dump"
     ```

### Lỗi 2: `Access blocked: ONI DEVOPS has not completed the Google verification process`
* **Nguyên nhân:** Khi tạo OAuth Client ID cá nhân dưới dạng External, Google yêu cầu xác minh app nếu muốn truy cập quyền ghi/đọc đầy đủ (`/auth/drive`).
* **Cách khắc phục:**
  1. Thêm địa chỉ Gmail của bạn vào mục **Test Users** trong OAuth Consent Screen trên Google Cloud Console. Khi liên kết, nhấn chọn **Advanced (Nâng cao)** -> **Go to ONI DEVOPS (unsafe)**.
  2. Cách tốt nhất: Chuyển sang dùng **Service Account** như hướng dẫn ở **Bước 2** của tài liệu này (không bao giờ gặp lỗi hết hạn token hay verify).
