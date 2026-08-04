#!/usr/bin/env bash

# Cài cron idempotent cho backup local PostgreSQL và Supabase trên standalone VPS.
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="${ONI_DEPLOY_ROOT:-$(dirname "$SCRIPT_DIR")}"
if [ -n "${BACKUP_ENV_FILE:-}" ]; then
  ENV_FILE="$BACKUP_ENV_FILE"
elif [ -f "$DEPLOY_ROOT/current/apps/web/.env" ]; then
  ENV_FILE="$DEPLOY_ROOT/current/apps/web/.env"
elif [ -f "$DEPLOY_ROOT/apps/web/.env.local" ]; then
  ENV_FILE="$DEPLOY_ROOT/apps/web/.env.local"
elif [ -f "$DEPLOY_ROOT/apps/web/.env" ]; then
  ENV_FILE="$DEPLOY_ROOT/apps/web/.env"
elif [ -f "$DEPLOY_ROOT/shared/.env" ]; then
  ENV_FILE="$DEPLOY_ROOT/shared/.env"
else
  ENV_FILE="$DEPLOY_ROOT/current/apps/web/.env"
fi
LOG_DIR="$DEPLOY_ROOT/logs"
LOCAL_SCHEDULE="${LOCAL_BACKUP_CRON_SCHEDULE:-0 */2 * * *}"
SUPABASE_SCHEDULE="${SUPABASE_BACKUP_CRON_SCHEDULE:-17 2 * * *}"
BEGIN_MARKER="# BEGIN ONI DATABASE BACKUPS"
END_MARKER="# END ONI DATABASE BACKUPS"

usage() {
  cat <<EOF
Usage: install-backup-cron.sh [--print]

Mặc định:
  Local PostgreSQL : ${LOCAL_SCHEDULE}
  Supabase         : ${SUPABASE_SCHEDULE}
  Env              : ${ENV_FILE}

--print chỉ in block cron, không cài đặt.
EOF
}

PRINT_ONLY=false
case "${1:-}" in
  "") ;;
  --print) PRINT_ONLY=true ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

LOCAL_SCRIPT="$DEPLOY_ROOT/scripts/backup.sh"
SUPABASE_SCRIPT="$DEPLOY_ROOT/scripts/backup-supabase.sh"

CRON_BLOCK=$(cat <<EOF
${BEGIN_MARKER}
${LOCAL_SCHEDULE} BACKUP_ENV_FILE=${ENV_FILE} flock -n /tmp/oni-local-backup.cron.lock ${LOCAL_SCRIPT} >> ${LOG_DIR}/backup-local.log 2>&1
${SUPABASE_SCHEDULE} BACKUP_ENV_FILE=${ENV_FILE} flock -n /tmp/oni-supabase-backup.cron.lock ${SUPABASE_SCRIPT} >> ${LOG_DIR}/backup-supabase.log 2>&1
${END_MARKER}
EOF
)

if [ "$PRINT_ONLY" = true ]; then
  printf '%s\n' "$CRON_BLOCK"
  exit 0
fi

for required in "$LOCAL_SCRIPT" "$SUPABASE_SCRIPT"; do
  if [ ! -x "$required" ]; then
    echo "ERROR: Script không tồn tại hoặc chưa executable: $required" >&2
    exit 1
  fi
done

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Không tìm thấy env file: $ENV_FILE" >&2
  exit 1
fi
if ! command -v flock > /dev/null 2>&1; then
  echo "ERROR: Thiếu flock (Debian/Ubuntu: sudo apt install util-linux)" >&2
  exit 1
fi

if ! command -v crontab > /dev/null 2>&1; then
  echo "ERROR: Thiếu crontab" >&2
  exit 1
fi

mkdir -p "$LOG_DIR" "$DEPLOY_ROOT/backups/supabase"

CURRENT_CRON=$(mktemp "/tmp/oni-crontab-current.XXXXXX")
NEW_CRON=$(mktemp "/tmp/oni-crontab-new.XXXXXX")
trap 'rm -f "$CURRENT_CRON" "$NEW_CRON"' EXIT

if ! crontab -l > "$CURRENT_CRON" 2>/dev/null; then
  : > "$CURRENT_CRON"
fi

awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '
  $0 == begin { skipping = 1; next }
  $0 == end   { skipping = 0; next }
  !skipping   { print }
' "$CURRENT_CRON" > "$NEW_CRON"

printf '\n%s\n' "$CRON_BLOCK" >> "$NEW_CRON"
crontab "$NEW_CRON"

echo "✅ Đã cài cron backup standalone cho user $(id -un)"
echo "   Local PostgreSQL: $LOCAL_SCHEDULE"
echo "   Supabase: $SUPABASE_SCHEDULE"
echo "   Kiểm tra: crontab -l"
