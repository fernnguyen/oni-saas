#!/bin/bash

# ==============================================================================
# ONI SAAS - POSTGRESQL GOOGLE DRIVE BACKUP SCRIPT
# ==============================================================================
# Script này tự động:
# 1. Đọc file cấu hình môi trường (.env.local hoặc .env) để lấy URL kết nối PostgreSQL.
# 2. Dump database bằng công cụ tối ưu `pg_dump` (Custom format -F c).
# 3. Nén file backup dưới dạng .zip và lưu trữ theo cấu trúc: backup_oni/tháng/ngày/backup_giờ.zip.
# 4. Upload lên Google Drive qua rclone.
# 5. Tự động xóa các file backup cũ hơn 30 ngày trên Google Drive để tiết kiệm dung lượng.
# 6. Dọn dẹp các file tạm trên server ngay sau khi upload.
# ==============================================================================

# Thiết lập chế độ dừng script nếu có lỗi xảy ra
set -e

# Thiết lập PATH đầy đủ để Cron Job nhận diện được các công cụ (rclone, zip, pg_dump...)
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Xác định thư mục chứa script và gốc dự án (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 1. TÌM VÀ ĐỌC FILE CẤU HÌNH MÔI TRƯỜNG (.env hoặc .env.local)
# Các đường dẫn có thể chứa file env
ENV_PATHS=(
  "$PROJECT_ROOT/apps/web/.env.local"
  "$PROJECT_ROOT/apps/web/.env"
  "$PROJECT_ROOT/.env.local"
  "$PROJECT_ROOT/.env"
  "./apps/web/.env.local"
  "./apps/web/.env"
)

ENV_FILE=""
for path in "${ENV_PATHS[@]}"; do
  if [ -f "$path" ]; then
    ENV_FILE="$path"
    break
  fi
done

if [ -z "$ENV_FILE" ]; then
  echo "[$(date)] ERROR: Không tìm thấy file .env hoặc .env.local." >&2
  exit 1
fi

echo "[$(date)] Đang đọc thông tin cấu hình từ: $ENV_FILE"

# Hàm lấy giá trị cấu hình từ file env (hỗ trợ bỏ dấu nháy kép/đơn và xóa ký tự \r)
get_env_val() {
  local var_name=$1
  local val
  val=$(grep -E "^${var_name}=" "$ENV_FILE" | head -n 1 | cut -d'=' -f2- | tr -d '\r')
  # Xóa các dấu nháy bao quanh nếu có
  val="${val#\"}"
  val="${val%\"}"
  val="${val#\'}"
  val="${val%\'}"
  echo "$val"
}

# Hàm gửi thông báo qua Telegram
send_telegram() {
  local message="$1"
  local tg_token=$(get_env_val "TELEGRAM_BOT_TOKEN")
  local tg_chat_id=$(get_env_val "TELEGRAM_CHAT_ID")
  
  if [ -n "$tg_token" ] && [ -n "$tg_chat_id" ]; then
    curl -s -X POST "https://api.telegram.org/bot${tg_token}/sendMessage" \
      -d chat_id="${tg_chat_id}" \
      -d text="${message}" \
      -d parse_mode="HTML" > /dev/null
  fi
}

# Đọc URI kết nối PostgreSQL (Ưu tiên LOCAL_PG_URI theo cấu hình dự án, sau đó đến DATABASE_URL)
PG_URI=$(get_env_val "LOCAL_PG_URI")
if [ -z "$PG_URI" ]; then
  PG_URI=$(get_env_val "DATABASE_URL")
fi

# Nếu trong file env không có, kiểm tra biến môi trường hệ thống
if [ -z "$PG_URI" ]; then
  PG_URI="$LOCAL_PG_URI"
fi
if [ -z "$PG_URI" ]; then
  PG_URI="$DATABASE_URL"
fi

if [ -z "$PG_URI" ]; then
  echo "[$(date)] ERROR: Không tìm thấy LOCAL_PG_URI hoặc DATABASE_URL trong cấu hình." >&2
  exit 1
fi

# Cấu hình rclone cho Google Drive (Có thể ghi đè bằng cách khai báo trong file env)
RCLONE_REMOTE=$(get_env_val "RCLONE_REMOTE")
if [ -z "$RCLONE_REMOTE" ]; then
  RCLONE_REMOTE="gdrive" # Tên remote cấu hình trong rclone config
fi

RCLONE_PATH=$(get_env_val "RCLONE_BACKUP_PATH")
if [ -z "$RCLONE_PATH" ]; then
  RCLONE_PATH="backup_oni" # Thư mục gốc trên Google Drive
fi

# Cấu hình rclone cho Cloudflare R2
RCLONE_R2_REMOTE=$(get_env_val "RCLONE_R2_REMOTE")
if [ -z "$RCLONE_R2_REMOTE" ]; then
  RCLONE_R2_REMOTE="r2" # Tên remote Cloudflare R2 cấu hình trong rclone config
fi

RCLONE_R2_PATH=$(get_env_val "RCLONE_R2_PATH")
if [ -z "$RCLONE_R2_PATH" ]; then
  RCLONE_R2_PATH="backup_oni" # Thư mục gốc trên Cloudflare R2
fi

# 2. THIẾT LẬP THÔNG TIN NGÀY GIỜ VÀ ĐƯỜNG DẪN TẠM
MONTH=$(date +"%m")
DAY=$(date +"%d")
HOUR=$(date +"%H")
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOCAL_TIME_FORMAT=$(date +"%H-%M-%d-%m-%Y")

TEMP_DIR="/tmp/db_backups"
mkdir -p "$TEMP_DIR"

# Cấu hình thư mục lưu trữ cục bộ (Local Backup)
LOCAL_BACKUP_DIR=$(get_env_val "LOCAL_BACKUP_DIR")
if [ -z "$LOCAL_BACKUP_DIR" ]; then
  LOCAL_BACKUP_DIR="$PROJECT_ROOT/backups"
fi
mkdir -p "$LOCAL_BACKUP_DIR"

# Tên file dump PostgreSQL (sử dụng định dạng tối ưu .dump)
DUMP_FILE="${TEMP_DIR}/db_dump_${TIMESTAMP}.dump"
# Tên file zip kết quả theo định dạng yêu cầu: giờ-phút-ngày-tháng-năm.sql.zip
ZIP_FILE_NAME="${LOCAL_TIME_FORMAT}.sql.zip"
ZIP_FILE_PATH="${TEMP_DIR}/${ZIP_FILE_NAME}"

# ==============================================================================
# TIẾN HÀNH DUMP DATABASE (SỬ DỤNG -F c LÀ ĐỊNH DẠNG TỐI ƯU CỦA POSTGRES)
# ==============================================================================
# Lấy đường dẫn pg_dump tùy chỉnh nếu cấu hình trong env, mặc định dùng "pg_dump" trong PATH
PG_DUMP_BIN=$(get_env_val "PG_DUMP_PATH")
if [ -z "$PG_DUMP_BIN" ]; then
  PG_DUMP_BIN="pg_dump"
fi

echo "[$(date)] Đang dump database PostgreSQL bằng ${PG_DUMP_BIN} (Custom Format -F c)..."

# pg_dump tự động nhận dạng thông tin kết nối từ URI (bao gồm cả password nếu có)
if "$PG_DUMP_BIN" -d "$PG_URI" -F c -f "$DUMP_FILE"; then
  echo "[$(date)] Dump database thành công."
else
  echo "[$(date)] ERROR: Dump database thất bại!" >&2
  send_telegram "❌ <b>[ONI SAAS] BACKUP DATABASE LỖI</b>%0A- <b>Thời gian:</b> $(date +'%Y-%m-%d %H:%M:%S')%0A- <b>Lỗi:</b> Không thể thực hiện lệnh pg_dump."
  # Dọn dẹp file dump lỗi nếu có
  rm -f "$DUMP_FILE"
  exit 1
fi

# ==============================================================================
# NÉN FILE BACKUP THÀNH ZIP
# ==============================================================================
echo "[$(date)] Đang nén file backup thành file zip..."
if zip -j "$ZIP_FILE_PATH" "$DUMP_FILE"; then
  echo "[$(date)] Nén zip thành công: $ZIP_FILE_NAME"
else
  echo "[$(date)] ERROR: Nén zip thất bại!" >&2
  send_telegram "❌ <b>[ONI SAAS] BACKUP LỖI</b>%0A- <b>Thời gian:</b> $(date +'%Y-%m-%d %H:%M:%S')%0A- <b>Lỗi:</b> Không thể nén file zip."
  rm -f "$DUMP_FILE" "$ZIP_FILE_PATH"
  exit 1
fi

# ==============================================================================
# UPLOAD LÊN GOOGLE DRIVE VÀ CLOUDFLARE R2 QUA RCLONE
# ==============================================================================
TARGET_DRIVE_DIR="${RCLONE_REMOTE}:${RCLONE_PATH}/${MONTH}/${DAY}"
TARGET_R2_DIR="${RCLONE_R2_REMOTE}:${RCLONE_R2_PATH}/${MONTH}/${DAY}"

UPLOAD_SUCCESS=false

# 1. Upload Google Drive
echo "[$(date)] Đang upload lên Google Drive: ${TARGET_DRIVE_DIR}/${ZIP_FILE_NAME} ..."
if rclone copy "$ZIP_FILE_PATH" "$TARGET_DRIVE_DIR/"; then
  echo "[$(date)] Upload Google Drive hoàn tất thành công!"
  UPLOAD_SUCCESS=true
  
  # Dọn dẹp backup cũ trên GDrive
  echo "[$(date)] Đang kiểm tra và xóa các file backup cũ hơn 30 ngày trên Google Drive..."
  rclone delete "${RCLONE_REMOTE}:${RCLONE_PATH}" --min-age 30d || true
  rclone rmdirs "${RCLONE_REMOTE}:${RCLONE_PATH}" --leave-root || true
else
  echo "[$(date)] ERROR: Upload lên Google Drive thất bại! (Có thể do mất Token)" >&2
  send_telegram "⚠️ <b>[ONI SAAS] CẢNH BÁO BACKUP</b>%0A- <b>Dịch vụ:</b> Google Drive%0A- <b>Thời gian:</b> $(date +'%Y-%m-%d %H:%M:%S')%0A- <b>Chi tiết:</b> Upload lên Google Drive thất bại. Có thể token bị lỗi hoặc hết hạn."
fi

# 2. Upload Cloudflare R2
echo "[$(date)] Đang upload lên Cloudflare R2: ${TARGET_R2_DIR}/${ZIP_FILE_NAME} ..."
if rclone copy "$ZIP_FILE_PATH" "$TARGET_R2_DIR/"; then
  echo "[$(date)] Upload Cloudflare R2 hoàn tất thành công!"
  UPLOAD_SUCCESS=true
  
  # Dọn dẹp backup cũ trên R2
  echo "[$(date)] Đang kiểm tra và xóa các file backup cũ hơn 30 ngày trên Cloudflare R2..."
  rclone delete "${RCLONE_R2_REMOTE}:${RCLONE_R2_PATH}" --min-age 30d || true
  rclone rmdirs "${RCLONE_R2_REMOTE}:${RCLONE_R2_PATH}" --leave-root || true
else
  echo "[$(date)] ERROR: Upload lên Cloudflare R2 thất bại!" >&2
  send_telegram "⚠️ <b>[ONI SAAS] CẢNH BÁO BACKUP</b>%0A- <b>Dịch vụ:</b> Cloudflare R2%0A- <b>Thời gian:</b> $(date +'%Y-%m-%d %H:%M:%S')%0A- <b>Chi tiết:</b> Upload lên Cloudflare R2 thất bại."
fi

# Nếu cả hai đều thất bại, báo lỗi và exit
if [ "$UPLOAD_SUCCESS" = false ]; then
  echo "[$(date)] CRITICAL ERROR: Cả Google Drive và Cloudflare R2 đều upload thất bại!" >&2
  send_telegram "🚨 <b>[ONI SAAS] BACKUP CRITICAL ERROR</b>%0A- <b>Thời gian:</b> $(date +'%Y-%m-%d %H:%M:%S')%0A- <b>Chi tiết:</b> Cả Google Drive và Cloudflare R2 đều upload thất bại! Vui lòng kiểm tra server gấp."
  rm -f "$DUMP_FILE" "$ZIP_FILE_PATH"
  exit 1
fi

# ==============================================================================
# LƯU TRỮ LOCAL & DỌN DẸP
# ==============================================================================
echo "[$(date)] Đang lưu trữ file backup tại local: $LOCAL_BACKUP_DIR/$ZIP_FILE_NAME"
cp "$ZIP_FILE_PATH" "$LOCAL_BACKUP_DIR/"

echo "[$(date)] Đang kiểm tra và xóa các file backup cục bộ cũ hơn 3 ngày..."
find "$LOCAL_BACKUP_DIR" -type f -name "*.zip" -mtime +3 -exec rm -f {} \;

echo "[$(date)] Đang dọn dẹp file tạm trên server..."
rm -f "$DUMP_FILE"
rm -f "$ZIP_FILE_PATH"

echo "[$(date)] Hoàn thành toàn bộ quá trình backup!"

