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

# Cấu hình rclone (Có thể ghi đè bằng cách khai báo trong file env)
RCLONE_REMOTE=$(get_env_val "RCLONE_REMOTE")
if [ -z "$RCLONE_REMOTE" ]; then
  RCLONE_REMOTE="gdrive" # Tên remote cấu hình trong rclone config
fi

RCLONE_PATH=$(get_env_val "RCLONE_BACKUP_PATH")
if [ -z "$RCLONE_PATH" ]; then
  RCLONE_PATH="backup_oni" # Thư mục gốc trên Google Drive
fi

# 2. THIẾT LẬP THÔNG TIN NGÀY GIỜ VÀ ĐƯỜNG DẪN TẠM
MONTH=$(date +"%m")
DAY=$(date +"%d")
HOUR=$(date +"%H")
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

TEMP_DIR="/tmp/db_backups"
mkdir -p "$TEMP_DIR"

# Tên file dump PostgreSQL (sử dụng định dạng tối ưu .dump)
DUMP_FILE="${TEMP_DIR}/db_dump_${TIMESTAMP}.dump"
# Tên file zip kết quả theo định dạng yêu cầu: backup_giờ.zip (ví dụ: backup_14.zip)
ZIP_FILE_NAME="backup_${HOUR}.zip"
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
  rm -f "$DUMP_FILE" "$ZIP_FILE_PATH"
  exit 1
fi

# ==============================================================================
# UPLOAD LÊN GOOGLE DRIVE QUA RCLONE
# ==============================================================================
TARGET_DRIVE_DIR="${RCLONE_REMOTE}:${RCLONE_PATH}/${MONTH}/${DAY}"
echo "[$(date)] Đang upload lên Google Drive: ${TARGET_DRIVE_DIR}/${ZIP_FILE_NAME} ..."

if rclone copy "$ZIP_FILE_PATH" "$TARGET_DRIVE_DIR/"; then
  echo "[$(date)] Upload hoàn tất thành công!"
else
  echo "[$(date)] ERROR: Upload lên Google Drive thất bại!" >&2
  rm -f "$DUMP_FILE" "$ZIP_FILE_PATH"
  exit 1
fi

# ==============================================================================
# DỌN DẸP BACKUP CŨ TRÊN GOOGLE DRIVE (XÓA FILE QUÁ 30 NGÀY)
# ==============================================================================
echo "[$(date)] Đang kiểm tra và xóa các file backup cũ hơn 30 ngày trên Google Drive..."
# Xóa các file cũ hơn 30 ngày trong thư mục backup_oni
rclone delete "${RCLONE_REMOTE}:${RCLONE_PATH}" --min-age 30d

# Dọn dẹp các thư mục rỗng (như các thư mục tháng/ngày cũ đã bị xóa hết file)
rclone rmdirs "${RCLONE_REMOTE}:${RCLONE_PATH}" --leave-root

# ==============================================================================
# DỌN DẸP FILE TẠM TRÊN SERVER LOCAL
# ==============================================================================
echo "[$(date)] Đang dọn dẹp file tạm trên server..."
rm -f "$DUMP_FILE"
rm -f "$ZIP_FILE_PATH"

echo "[$(date)] Hoàn thành toàn bộ quá trình backup!"
