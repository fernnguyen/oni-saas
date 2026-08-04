# ONI Database Backup — Standalone VPS

ONI có hai nguồn PostgreSQL độc lập và hai lịch backup riêng:

| Nguồn | Script ổn định trên VPS | Lịch mặc định | Mục tiêu |
|---|---|---:|---|
| PostgreSQL local | `/var/www/oni/scripts/backup.sh` | Mỗi 2 giờ | Dữ liệu nghiệp vụ thay đổi thường xuyên |
| Supabase main | `/var/www/oni/scripts/backup-supabase.sh` | 02:17 mỗi ngày | Khung hệ thống, tenant, Auth và metadata |

Các script không chạy bên trong Next.js standalone. Mỗi release chứa thư mục
`scripts/`; `deploy.sh` tự đồng bộ chúng sang `/var/www/oni/scripts/`, vì vậy cron
luôn trỏ vào đường dẫn cố định và không phụ thuộc release/current symlink.

## 1. Phạm vi backup Supabase

`backup-supabase.sh` sử dụng native `pg_dump` custom format với một snapshot logic
nhất quán. Dump chứa mọi schema mà database user đọc được, gồm `public`, dữ liệu
Auth, Storage metadata và `supabase_migrations`. Các cờ `--no-owner --no-acl` giúp
bundle dễ phục hồi sang project khác hơn.

Mỗi bundle có:

- `*.dump`: logical dump custom format;
- `*.toc.txt`: TOC đã được `pg_restore --list` kiểm tra;
- `*.manifest.json`: project ref, host, PostgreSQL/pg_dump version, dung lượng,
  SHA-256 và row count kiểm tra cho tenant/Auth/migration;
- `*.tar.gz.sha256`: checksum của bundle cuối cùng.

Lưu ý: PostgreSQL chỉ chứa metadata của Supabase Storage, không chứa nội dung
object. ONI hiện dùng Cloudflare R2 cho object storage; nếu sau này sử dụng
Supabase Storage, phải có job backup bucket riêng.

## 2. Egress khi dump Supabase

Egress là dữ liệu đi từ hạ tầng Supabase ra VPS/client. `pg_dump` đọc toàn bộ dữ
liệu logic nên **có tính vào egress**. Nếu dùng Session pooler, Dashboard thường
ghi nhận dưới `Shared Pooler Egress`; Direct connection được ghi nhận như database
egress.

Free plan có quota uncached egress dùng chung cho Database/Auth/Storage/... Vì
không có overage tự động trên Free, vượt quota có thể đưa organization vào grace
period/restriction thay vì chỉ phát sinh một hóa đơn nhỏ.

Backup daily phù hợp hơn backup hàng giờ cho Supabase của ONI:

- 1 lần/ngày ≈ 31 lần dump/tháng;
- upper-bound thận trọng = `pg_database_size × 31`;
- script cảnh báo Telegram nếu upper-bound vượt `SUPABASE_BACKUP_EGRESS_WARN_GB`
  (mặc định 4 GB để chừa quota cho app);
- đây là upper-bound vì database size có cả index, còn logical dump không tải file
  index vật lý.

Theo dõi thực tế tại Supabase Dashboard → Organization → Usage → Egress. Nếu RPO
24 giờ không đủ hoặc dung lượng tăng nhanh, nên nâng Pro để có daily backup managed
và vẫn giữ bản logical off-site này.

Tài liệu Supabase:

- <https://supabase.com/docs/guides/platform/manage-your-usage/egress>
- <https://supabase.com/docs/guides/platform/backups>
- <https://supabase.com/docs/guides/database/connecting-to-postgres>

## 3. Cấu hình env của `apps/web`

Local đọc `apps/web/.env.local`. Trên production, deploy tạo
`/var/www/oni/current/apps/web/.env` và symlink file này tới
`/var/www/oni/shared/.env`; script ưu tiên đường dẫn trong `apps/web`, không đọc
root `.env`.

```env
# Local PostgreSQL
LOCAL_PG_URI="postgresql://oni_admin:PASSWORD@localhost:5432/oni_production"
LOCAL_BACKUP_DIR="/var/www/oni/backups/local"

# Supabase: Dashboard > Connect
# Direct 5432 nếu VPS có IPv6; Session pooler 5432 nếu VPS chỉ có IPv4.
# Không dùng Transaction pooler 6543. Password phải URL-encode.
SUPABASE_PROJECT_REF="your-project-ref"
SUPABASE_DB_URL="postgresql://postgres.your-project-ref:URL_ENCODED_PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require"
SUPABASE_BACKUP_LOCAL_DIR="/var/www/oni/backups/supabase"
SUPABASE_BACKUP_LOCAL_RETENTION_DAYS="7"
SUPABASE_BACKUP_REMOTE_RETENTION_DAYS="30"
SUPABASE_BACKUP_RUNS_PER_DAY="1"
SUPABASE_BACKUP_EGRESS_WARN_GB="4"

# Google Drive và Cloudflare R2 qua rclone
RCLONE_REMOTE="gdrive"
RCLONE_BACKUP_PATH="backup_oni"
RCLONE_R2_REMOTE="r2"
RCLONE_R2_PATH="backup-oni"

# Optional: override riêng cho Supabase
# SUPABASE_RCLONE_PATH="backup_oni/supabase"
# SUPABASE_RCLONE_R2_PATH="backup-oni/supabase"
# SUPABASE_PG_DUMP_PATH="/usr/lib/postgresql/17/bin/pg_dump"

TELEGRAM_BOT_TOKEN="..."
TELEGRAM_CHAT_ID="..."
```

Trên production, cập nhật file đích của symlink và giữ mode `600`:

```bash
nano /var/www/oni/current/apps/web/.env
chmod 600 /var/www/oni/shared/.env
```

Không đưa `SUPABASE_DB_URL` vào GitHub Actions Secrets dùng cho build và tuyệt đối
không dùng service-role key thay cho database password.

## 4. Prerequisites trên VPS

```bash
sudo apt update
sudo apt install -y postgresql-client rclone zip util-linux

pg_dump --version
pg_restore --version
rclone version
rclone listremotes
```

`pg_dump` phải có major version bằng hoặc mới hơn Supabase PostgreSQL server. Script
sẽ dừng và báo rõ nếu client quá cũ.

Cấu hình remote:

- `gdrive`: Google Drive, ưu tiên Service Account có quyền trên folder backup;
- `r2`: Cloudflare R2 S3 remote có Object Read/Write cho bucket `backup-oni`.

## 5. Cài cron standalone

Sau khi release mới đã đồng bộ scripts:

```bash
chmod +x /var/www/oni/scripts/*.sh

# Kiểm tra Supabase connection/dependency, không dump
BACKUP_ENV_FILE=/var/www/oni/current/apps/web/.env \
  /var/www/oni/scripts/backup-supabase.sh --check

# Xem block cron trước
ONI_DEPLOY_ROOT=/var/www/oni \
  /var/www/oni/scripts/install-backup-cron.sh --print

# Cài/cập nhật idempotent
ONI_DEPLOY_ROOT=/var/www/oni \
  /var/www/oni/scripts/install-backup-cron.sh

crontab -l
```

Cron mặc định:

```cron
0 */2 * * *  # local PostgreSQL
17 2 * * *   # Supabase daily
```

Các job sử dụng `flock`, nên lần chạy mới sẽ không chồng lên lần cũ. Muốn đổi lịch,
chỉ truyền biến khi chạy installer rồi chạy lại:

```bash
LOCAL_BACKUP_CRON_SCHEDULE="0 */2 * * *" \
SUPABASE_BACKUP_CRON_SCHEDULE="17 2 * * *" \
ONI_DEPLOY_ROOT=/var/www/oni \
  /var/www/oni/scripts/install-backup-cron.sh
```

Lịch chạy theo timezone của cron daemon trên VPS. Kiểm tra bằng `timedatectl`.

## 6. Chạy thủ công và kiểm tra

```bash
BACKUP_ENV_FILE=/var/www/oni/current/apps/web/.env \
  /var/www/oni/scripts/backup-supabase.sh

tail -100 /var/www/oni/logs/backup-supabase.log
ls -lh /var/www/oni/backups/supabase
rclone lsf gdrive:backup_oni/supabase --max-depth 4
rclone lsf r2:backup-oni/supabase --max-depth 4
```

Kiểm tra checksum:

```bash
cd /var/www/oni/backups/supabase
sha256sum -c supabase_*.tar.gz.sha256
```

## 7. Restore drill

Không restore đè thẳng production trước khi test. Giải nén và kiểm tra TOC:

```bash
tar -xzf supabase_PROJECT_TIMESTAMP.tar.gz
pg_restore --list supabase_PROJECT_TIMESTAMP.dump
```

Restore vào PostgreSQL/Supabase test trước:

```bash
pg_restore \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --dbname="$TEST_DATABASE_URL" \
  supabase_PROJECT_TIMESTAMP.dump
```

Supabase quản lý sẵn một số roles/extensions/schema. Khi phục hồi sang project
Supabase mới, thực hiện theo runbook chính thức, review TOC và có thể restore chọn
lọc schema/data. Sau restore phải kiểm tra:

- đăng nhập Auth;
- `auth.users` và quan hệ `public.user_tenants`/`tenant_user_profiles`;
- tenant/shop và migration history;
- Realtime publications, Edge Function secrets và object storage riêng.

Thực hiện restore drill ít nhất mỗi tháng. Backup chỉ được coi là hợp lệ khi đã
phục hồi thử thành công.
