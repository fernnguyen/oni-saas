#!/usr/bin/env bash

# ==============================================================================
# ONI SAAS - SUPABASE LOGICAL BACKUP (STANDALONE VPS)
# ==============================================================================
# - Đọc apps/web/.env của standalone (hoặc BACKUP_ENV_FILE)
# - Xác minh đúng Supabase project trước khi dump
# - pg_dump custom format, no-owner/no-ACL để dễ phục hồi
# - Kiểm tra TOC, tạo manifest + SHA-256
# - Lưu local và upload Google Drive + Cloudflare R2 qua rclone
# - Retention mặc định: local 7 ngày, remote 30 ngày
# ==============================================================================

set -Eeuo pipefail
umask 077

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-20}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="${ONI_DEPLOY_ROOT:-$(dirname "$SCRIPT_DIR")}"

LOCK_DIR="/tmp/oni-supabase-backup.lock"
LOCK_ACQUIRED=false
WORK_DIR=""
ERROR_NOTIFIED=false
CURRENT_STEP="initialization"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

cleanup() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
  if [ "$LOCK_ACQUIRED" = true ]; then
    rm -rf "$LOCK_DIR"
  fi
}

send_telegram() {
  local message="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -sS --max-time 15 -X POST \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "parse_mode=HTML" \
      --data-urlencode "text=${message}" \
      > /dev/null 2>&1 || true
  fi
}

on_error() {
  local exit_code=$?
  local line_no="${1:-unknown}"
  if [ "$ERROR_NOTIFIED" = false ]; then
    ERROR_NOTIFIED=true
    send_telegram "❌ <b>[ONI] Supabase backup thất bại</b>"$'\n'"Bước: <code>${CURRENT_STEP}</code>"$'\n'"Dòng: ${line_no} · Exit: ${exit_code}"
  fi
  exit "$exit_code"
}

trap 'on_error "$LINENO"' ERR
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: backup-supabase.sh [--check]

  --check  Kiểm tra cấu hình, kết nối, phiên bản pg_dump và rclone; không dump.

Biến bắt buộc trong apps/web/.env:
  SUPABASE_DB_URL       Connection string Direct hoặc Session pooler port 5432.

Biến dùng để xác minh project (cần ít nhất một, thường đã có URL public):
  SUPABASE_PROJECT_REF
  NEXT_PUBLIC_SUPABASE_URL
EOF
}

CHECK_ONLY=false
case "${1:-}" in
  "") ;;
  --check) CHECK_ONLY=true ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "unknown")
  echo "[$(date)] Supabase backup đang chạy (PID: ${LOCK_PID})." >&2
  exit 75
fi
LOCK_ACQUIRED=true
echo $$ > "$LOCK_DIR/pid"

ENV_PATHS=()
if [ -n "${BACKUP_ENV_FILE:-}" ]; then
  ENV_PATHS+=("$BACKUP_ENV_FILE")
fi
ENV_PATHS+=(
  "$DEPLOY_ROOT/current/apps/web/.env"
  "$DEPLOY_ROOT/apps/web/.env.local"
  "$DEPLOY_ROOT/apps/web/.env"
  "$DEPLOY_ROOT/shared/.env"
)

ENV_FILE=""
for candidate in "${ENV_PATHS[@]}"; do
  if [ -f "$candidate" ]; then
    ENV_FILE="$candidate"
    break
  fi
done

if [ -z "$ENV_FILE" ]; then
  echo "ERROR: Không tìm thấy apps/web env file. Đặt BACKUP_ENV_FILE hoặc kiểm tra current/apps/web/.env" >&2
  exit 1
fi

get_env_val() {
  local key="$1"
  awk -v wanted="$key" '
    index($0, wanted "=") == 1 {
      value = substr($0, length(wanted) + 2)
      sub(/\r$/, "", value)
      if ((substr(value, 1, 1) == "\"" && substr(value, length(value), 1) == "\"") ||
          (substr(value, 1, 1) == "\047" && substr(value, length(value), 1) == "\047")) {
        value = substr(value, 2, length(value) - 2)
      }
      print value
      exit
    }
  ' "$ENV_FILE"
}

config_value() {
  local key="$1"
  local default_value="${2:-}"
  local value="${!key:-}"
  if [ -z "$value" ]; then
    value=$(get_env_val "$key")
  fi
  printf '%s' "${value:-$default_value}"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" > /dev/null 2>&1; then
    echo "ERROR: Thiếu command bắt buộc: $command_name" >&2
    return 1
  fi
}

sha256_file() {
  local file_path="$1"
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
  else
    shasum -a 256 "$file_path" | awk '{print $1}'
  fi
}

optional_count() {
  local relation="$1"
  local result
  if result=$(psql "$SUPABASE_DB_URL" --no-psqlrc -X -A -t -v ON_ERROR_STOP=1 \
      -c "select count(*) from ${relation}" 2>/dev/null); then
    printf '%s' "$result"
  else
    printf '%s' "-1"
  fi
}

CURRENT_STEP="loading configuration"
SUPABASE_DB_URL=$(config_value "SUPABASE_DB_URL")
PUBLIC_SUPABASE_URL=$(config_value "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_PROJECT_REF=$(config_value "SUPABASE_PROJECT_REF")
TELEGRAM_BOT_TOKEN=$(config_value "TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID=$(config_value "TELEGRAM_CHAT_ID")

if [ -z "$SUPABASE_PROJECT_REF" ] && [ -n "$PUBLIC_SUPABASE_URL" ]; then
  SUPABASE_PROJECT_REF="${PUBLIC_SUPABASE_URL#*://}"
  SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF%%.supabase.co*}"
fi

if [ -z "$SUPABASE_DB_URL" ]; then
  echo "ERROR: Thiếu SUPABASE_DB_URL trong $ENV_FILE" >&2
  exit 1
fi
if [ -z "$SUPABASE_PROJECT_REF" ]; then
  echo "ERROR: Thiếu SUPABASE_PROJECT_REF và không suy ra được từ NEXT_PUBLIC_SUPABASE_URL" >&2
  exit 1
fi

DB_AUTHORITY="${SUPABASE_DB_URL#*://}"
DB_AUTHORITY="${DB_AUTHORITY%%/*}"
DB_HOST_PORT="${DB_AUTHORITY##*@}"
DB_HOST="${DB_HOST_PORT%%:*}"

case "$DB_HOST" in
  *.supabase.co|*.pooler.supabase.com) ;;
  *)
    echo "ERROR: SUPABASE_DB_URL không trỏ tới Supabase host: $DB_HOST" >&2
    exit 1
    ;;
esac

if [[ "$SUPABASE_DB_URL" != *"$SUPABASE_PROJECT_REF"* ]]; then
  echo "ERROR: Connection string không khớp SUPABASE_PROJECT_REF=$SUPABASE_PROJECT_REF" >&2
  exit 1
fi

case "$DB_HOST_PORT" in
  *:6543)
    echo "ERROR: Không dùng transaction pooler port 6543 cho pg_dump. Dùng Direct/Session port 5432." >&2
    exit 1
    ;;
esac

PG_DUMP_BIN=$(config_value "SUPABASE_PG_DUMP_PATH" "pg_dump")
LOCAL_BACKUP_DIR=$(config_value "SUPABASE_BACKUP_LOCAL_DIR" "$DEPLOY_ROOT/backups/supabase")
LOCAL_RETENTION_DAYS=$(config_value "SUPABASE_BACKUP_LOCAL_RETENTION_DAYS" "7")
REMOTE_RETENTION_DAYS=$(config_value "SUPABASE_BACKUP_REMOTE_RETENTION_DAYS" "30")
RUNS_PER_DAY=$(config_value "SUPABASE_BACKUP_RUNS_PER_DAY" "1")
EGRESS_WARN_GB=$(config_value "SUPABASE_BACKUP_EGRESS_WARN_GB" "4")

RCLONE_REMOTE=$(config_value "RCLONE_REMOTE" "gdrive")
RCLONE_R2_REMOTE=$(config_value "RCLONE_R2_REMOTE" "r2")
BASE_DRIVE_PATH=$(config_value "RCLONE_BACKUP_PATH" "backup_oni")
BASE_R2_PATH=$(config_value "RCLONE_R2_PATH" "backup-oni")
DRIVE_PATH=$(config_value "SUPABASE_RCLONE_PATH" "${BASE_DRIVE_PATH}/supabase")
R2_PATH=$(config_value "SUPABASE_RCLONE_R2_PATH" "${BASE_R2_PATH}/supabase")
DRIVE_ENABLED=$(config_value "SUPABASE_BACKUP_DRIVE_ENABLED" "true")
R2_ENABLED=$(config_value "SUPABASE_BACKUP_R2_ENABLED" "true")

CURRENT_STEP="checking dependencies"
require_command psql
require_command "$PG_DUMP_BIN"
require_command pg_restore
require_command rclone
require_command tar
require_command awk
if ! command -v sha256sum > /dev/null 2>&1 && ! command -v shasum > /dev/null 2>&1; then
  echo "ERROR: Thiếu sha256sum hoặc shasum" >&2
  exit 1
fi

CURRENT_STEP="verifying Supabase identity"
IDENTITY=$(psql "$SUPABASE_DB_URL" --no-psqlrc -X -A -t -F '|' -v ON_ERROR_STOP=1 \
  -c "select current_database(), current_user, current_setting('server_version_num'), pg_database_size(current_database())")
IFS='|' read -r DB_NAME DB_USER SERVER_VERSION_NUM DB_SIZE_BYTES <<< "$IDENTITY"

if [ "$DB_NAME" != "postgres" ]; then
  echo "ERROR: Expected Supabase database 'postgres', got '$DB_NAME'" >&2
  exit 1
fi

SERVER_MAJOR=$((SERVER_VERSION_NUM / 10000))
PG_DUMP_VERSION=$($PG_DUMP_BIN --version | awk '{print $NF}')
PG_DUMP_MAJOR="${PG_DUMP_VERSION%%.*}"
if [ "$PG_DUMP_MAJOR" -lt "$SERVER_MAJOR" ]; then
  echo "ERROR: pg_dump $PG_DUMP_VERSION cũ hơn PostgreSQL server major $SERVER_MAJOR" >&2
  exit 1
fi

if [ "$CHECK_ONLY" = true ]; then
  echo "✅ Supabase backup preflight passed"
  echo "   Project: $SUPABASE_PROJECT_REF"
  echo "   Host: $DB_HOST"
  echo "   Database: $DB_NAME"
  echo "   Server major: $SERVER_MAJOR · pg_dump: $PG_DUMP_VERSION"
  echo "   Local: $LOCAL_BACKUP_DIR"
  echo "   Drive: ${RCLONE_REMOTE}:${DRIVE_PATH}"
  echo "   R2: ${RCLONE_R2_REMOTE}:${R2_PATH}"
  exit 0
fi

CURRENT_STEP="preparing backup workspace"
WORK_DIR=$(mktemp -d "/tmp/oni-supabase-backup.XXXXXX")
PUBLISH_DIR="$WORK_DIR/publish"
mkdir -p "$PUBLISH_DIR" "$LOCAL_BACKUP_DIR"

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DATE_PATH=$(date -u +"%Y/%m/%d")
BACKUP_BASENAME="supabase_${SUPABASE_PROJECT_REF}_${TIMESTAMP}"
DUMP_FILE="$WORK_DIR/${BACKUP_BASENAME}.dump"
TOC_FILE="$WORK_DIR/${BACKUP_BASENAME}.toc.txt"
MANIFEST_FILE="$WORK_DIR/${BACKUP_BASENAME}.manifest.json"
ARCHIVE_FILE="$PUBLISH_DIR/${BACKUP_BASENAME}.tar.gz"
ARCHIVE_CHECKSUM_FILE="$PUBLISH_DIR/${BACKUP_BASENAME}.tar.gz.sha256"

CURRENT_STEP="dumping Supabase database"
echo "[$(date)] Dump Supabase project $SUPABASE_PROJECT_REF từ $DB_HOST..."
"$PG_DUMP_BIN" \
  --dbname="$SUPABASE_DB_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="$DUMP_FILE"

if [ ! -s "$DUMP_FILE" ]; then
  echo "ERROR: pg_dump tạo file rỗng" >&2
  exit 1
fi

CURRENT_STEP="validating dump TOC"
pg_restore --list "$DUMP_FILE" > "$TOC_FILE"
if [ ! -s "$TOC_FILE" ]; then
  echo "ERROR: pg_restore không đọc được TOC" >&2
  exit 1
fi

DUMP_SHA256=$(sha256_file "$DUMP_FILE")
TENANT_COUNT=$(optional_count "public.tenants")
AUTH_USER_COUNT=$(optional_count "auth.users")
MIGRATION_COUNT=$(optional_count "supabase_migrations.schema_migrations")

cat > "$MANIFEST_FILE" <<EOF
{
  "format_version": 1,
  "created_at_utc": "${TIMESTAMP}",
  "project_ref": "${SUPABASE_PROJECT_REF}",
  "source_host": "${DB_HOST}",
  "database": "${DB_NAME}",
  "database_user": "${DB_USER}",
  "server_version_num": ${SERVER_VERSION_NUM},
  "pg_dump_version": "${PG_DUMP_VERSION}",
  "database_size_bytes": ${DB_SIZE_BYTES},
  "dump_size_bytes": $(wc -c < "$DUMP_FILE" | tr -d ' '),
  "dump_sha256": "${DUMP_SHA256}",
  "counts": {
    "public.tenants": ${TENANT_COUNT},
    "auth.users": ${AUTH_USER_COUNT},
    "supabase_migrations.schema_migrations": ${MIGRATION_COUNT}
  }
}
EOF

CURRENT_STEP="packing backup bundle"
tar -czf "$ARCHIVE_FILE" -C "$WORK_DIR" \
  "$(basename "$DUMP_FILE")" \
  "$(basename "$TOC_FILE")" \
  "$(basename "$MANIFEST_FILE")"
ARCHIVE_SHA256=$(sha256_file "$ARCHIVE_FILE")
printf '%s  %s\n' "$ARCHIVE_SHA256" "$(basename "$ARCHIVE_FILE")" > "$ARCHIVE_CHECKSUM_FILE"

CURRENT_STEP="saving local backup"
cp "$ARCHIVE_FILE" "$ARCHIVE_CHECKSUM_FILE" "$LOCAL_BACKUP_DIR/"
find "$LOCAL_BACKUP_DIR" -type f -name 'supabase_*' -mtime "+${LOCAL_RETENTION_DAYS}" -delete

ARCHIVE_SIZE_BYTES=$(wc -c < "$ARCHIVE_FILE" | tr -d ' ')
ARCHIVE_SIZE_HUMAN=$(du -h "$ARCHIVE_FILE" | awk '{print $1}')
ESTIMATED_MONTHLY_EGRESS_BYTES=$((DB_SIZE_BYTES * RUNS_PER_DAY * 31))
EGRESS_WARN_BYTES=$((EGRESS_WARN_GB * 1024 * 1024 * 1024))

REMOTE_ENABLED=0
REMOTE_SUCCESS=0

upload_remote() {
  local label="$1"
  local remote="$2"
  local root_path="$3"
  local target="${remote}:${root_path}/${DATE_PATH}"

  REMOTE_ENABLED=$((REMOTE_ENABLED + 1))
  echo "[$(date)] Upload $label → $target"
  if rclone copy "$PUBLISH_DIR" "$target"; then
    REMOTE_SUCCESS=$((REMOTE_SUCCESS + 1))
    rclone delete "${remote}:${root_path}" --min-age "${REMOTE_RETENTION_DAYS}d" || true
    rclone rmdirs "${remote}:${root_path}" --leave-root || true
  else
    send_telegram "⚠️ <b>[ONI] Supabase backup upload lỗi</b>"$'\n'"Đích: ${label}"$'\n'"Bản local vẫn an toàn: <code>${LOCAL_BACKUP_DIR}</code>"
  fi
}

CURRENT_STEP="uploading off-site backups"
if [ "$DRIVE_ENABLED" = true ]; then
  upload_remote "Google Drive" "$RCLONE_REMOTE" "$DRIVE_PATH"
fi
if [ "$R2_ENABLED" = true ]; then
  upload_remote "Cloudflare R2" "$RCLONE_R2_REMOTE" "$R2_PATH"
fi

if [ "$REMOTE_SUCCESS" -lt "$REMOTE_ENABLED" ]; then
  ERROR_NOTIFIED=true
  send_telegram "❌ <b>[ONI] Supabase backup chưa đủ bản sao off-site</b>"$'\n'"Thành công: ${REMOTE_SUCCESS}/${REMOTE_ENABLED}"$'\n'"Local: <code>${LOCAL_BACKUP_DIR}/$(basename "$ARCHIVE_FILE")</code>"
  exit 1
fi

EGRESS_NOTE=""
if [ "$ESTIMATED_MONTHLY_EGRESS_BYTES" -gt "$EGRESS_WARN_BYTES" ]; then
  ESTIMATED_GB=$(awk -v bytes="$ESTIMATED_MONTHLY_EGRESS_BYTES" 'BEGIN { printf "%.2f", bytes / 1073741824 }')
  EGRESS_NOTE=$'\n'"⚠️ Ước lượng egress upper-bound: ${ESTIMATED_GB} GB/tháng"
fi

CURRENT_STEP="completed"
send_telegram "✅ <b>[ONI] Supabase backup hoàn tất</b>"$'\n'"Project: <code>${SUPABASE_PROJECT_REF}</code>"$'\n'"File: <code>$(basename "$ARCHIVE_FILE")</code> (${ARCHIVE_SIZE_HUMAN})"$'\n'"Local + Drive + R2: ${REMOTE_SUCCESS}/${REMOTE_ENABLED}${EGRESS_NOTE}"

echo "[$(date)] Supabase backup hoàn tất: $(basename "$ARCHIVE_FILE") (${ARCHIVE_SIZE_BYTES} bytes)"
