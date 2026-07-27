#!/bin/bash
# =============================================================================
# ONI Deploy Script v2 — Production-hardened
# Chạy bởi GitHub Actions SSH sau khi artifact đã được SCP lên server.
# Dùng dưới user `oni` — không cần sudo.
#
# Cách dùng: ./deploy.sh <version>
# Ví dụ:     ./deploy.sh v1.3.0
#
# Fixes từ production audit:
#   [C1] Lock file chống concurrent deploy
#   [C2] HTTP health check thực (retry loop) thay vì pm2 status
#   [C4] Safe .env loading — chỉ load TELEGRAM vars, không allexport toàn bộ
#   [H3] Migration có timeout 120s chống hang vô hạn
#   [H4] Kiểm tra drizzle-kit binary trước khi chạy
#   [M1] MIGRATION_MSG được khởi tạo mặc định
#   [M2] Health check retry loop thay vì sleep cứng
#   [L1] Kiểm tra packages/adapters tồn tại
#   [L2] Disk space check trước khi extract
# =============================================================================
set -euo pipefail

# ── Load PATH đầy đủ cho non-interactive SSH session ─────────────────────────
# GitHub Actions SSH không load ~/.bashrc, phải set thủ công
export PATH="$HOME/.npm-global/bin:$HOME/.local/share/pnpm:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  \. "$HOME/.nvm/nvm.sh"
fi
# ── Cấu hình ─────────────────────────────────────────────────────────────────
VERSION="${1:?Thiếu version. Dùng: ./deploy.sh v1.0.0}"
DEPLOY_ROOT="/var/www/oni"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
SHARED_DIR="${DEPLOY_ROOT}/shared"
CURRENT_LINK="${DEPLOY_ROOT}/current"
RELEASE_DIR="${RELEASES_DIR}/${VERSION}"
ARTIFACT="${RELEASES_DIR}/tmp/oni-release-${VERSION}.tar.gz"
KEEP_RELEASES=10
APP_PORT=3000

# ── Load NODE_PATH chứa cả standalone node_modules và global modules ────────
STANDALONE_NODE_MODULES="${RELEASE_DIR}/apps/web/.next/standalone/node_modules"
GLOBAL_NODE_MODULES=$(npm root -g 2>/dev/null || echo "")
export NODE_PATH="${STANDALONE_NODE_MODULES}:${GLOBAL_NODE_MODULES}:${NODE_PATH:-}"
HEALTH_CHECK_RETRIES=12    # 12 × 5s = 60 giây tối đa
HEALTH_CHECK_INTERVAL=5    # giây giữa mỗi retry
MIGRATION_TIMEOUT=120      # giây tối đa cho drizzle-kit push

# [M1] Khởi tạo MIGRATION_MSG với giá trị mặc định — tránh unbound variable
MIGRATION_MSG="ℹ️ No migration info"

# ── [C1] Lock file — chặn concurrent deploys ─────────────────────────────────
LOCK_DIR="/tmp/oni-deploy.lock"
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  LOCK_PID=$(cat "${LOCK_DIR}/pid" 2>/dev/null || echo "unknown")
  echo "❌ Deploy đang chạy (PID: ${LOCK_PID}). Không thể chạy song song!"
  echo "   Nếu lock bị stale: rm -rf ${LOCK_DIR}"
  exit 1
fi
echo $$ > "${LOCK_DIR}/pid"
# Tự động xóa lock khi script kết thúc (kể cả khi lỗi)
trap "rm -rf ${LOCK_DIR}; echo '🔓 Lock released'" EXIT

# ── [C4] Safe .env loading — chỉ lấy TELEGRAM vars ──────────────────────────
# Không dùng allexport vì có thể break với GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY multiline
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
if [ -f "${SHARED_DIR}/.env" ]; then
  TELEGRAM_BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "${SHARED_DIR}/.env" \
    | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  TELEGRAM_CHAT_ID=$(grep -E '^TELEGRAM_CHAT_ID=' "${SHARED_DIR}/.env" \
    | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
fi

# ── Helper: Gửi Telegram notification ────────────────────────────────────────
send_telegram() {
  local msg="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "parse_mode=HTML" \
      --data-urlencode "text=${msg}" \
      > /dev/null 2>&1 || true   # Không để Telegram fail block deploy
  fi
}

# ── Helper: HTTP health check với retry ──────────────────────────────────────
# [C2][M2] Check HTTP thực tế thay vì chỉ dựa vào pm2 status
wait_for_http() {
  local port="$1"
  local retries="$2"
  local interval="$3"
  local attempt=1

  echo "🩺 HTTP health check: http://localhost:${port} (tối đa $((retries * interval))s)..."

  while [ "${attempt}" -le "${retries}" ]; do
    if curl -sf --max-time 3 "http://localhost:${port}" > /dev/null 2>&1; then
      echo "   ✅ HTTP 200 — App ready (attempt ${attempt}/${retries})"
      return 0
    fi
    echo "   ⏳ Attempt ${attempt}/${retries} — Đợi ${interval}s..."
    sleep "${interval}"
    attempt=$((attempt + 1))
  done

  echo "   ❌ HTTP health check thất bại sau $((retries * interval))s"
  return 1
}

echo ""
echo "════════════════════════════════════════════════"
echo "  ONI Deploy — ${VERSION}"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "════════════════════════════════════════════════"

# ── Step 1: Prerequisite checks ──────────────────────────────────────────────
echo ""
echo "🔍 [0/8] Prerequisite checks..."

# Kiểm tra shared/.env
if [ ! -f "${SHARED_DIR}/.env" ]; then
  echo "❌ ${SHARED_DIR}/.env không tồn tại!"
  echo "   Chạy setup server trước: xem docs/DEPLOY.md Phần 4"
  exit 1
fi

# [L2] Kiểm tra disk space (cần ít nhất 500MB)
AVAILABLE_MB=$(df "${DEPLOY_ROOT}" --output=avail -BM 2>/dev/null | tail -1 | tr -d 'M' || echo "0")
if [ "${AVAILABLE_MB}" -lt 500 ]; then
  echo "❌ Không đủ dung lượng: ${AVAILABLE_MB}MB còn lại, cần ít nhất 500MB"
  send_telegram "❌ <b>ONI ${VERSION} — Deploy thất bại: Disk đầy!</b>"$'\n'"Chỉ còn ${AVAILABLE_MB}MB. Cần ít nhất 500MB."
  exit 1
fi
echo "   ✅ Disk: ${AVAILABLE_MB}MB available"

# [H4] Kiểm tra drizzle-kit binary
if ! command -v drizzle-kit > /dev/null 2>&1; then
  echo "❌ drizzle-kit không tìm thấy trong PATH!"
  echo "   Cài đặt: npm install -g drizzle-kit@0.31.10"
  echo "   PATH hiện tại: ${PATH}"
  send_telegram "❌ <b>ONI ${VERSION} — Deploy thất bại: drizzle-kit không tìm thấy!</b>"$'\n'"Cài đặt: <code>npm install -g drizzle-kit@0.31.10</code>"
  exit 1
fi
echo "   ✅ drizzle-kit: $(drizzle-kit --version 2>/dev/null | head -1)"

# Kiểm tra pm2
if ! command -v pm2 > /dev/null 2>&1; then
  echo "❌ pm2 không tìm thấy!"
  send_telegram "❌ <b>ONI ${VERSION} — Deploy thất bại: pm2 không tìm thấy!</b>"
  exit 1
fi
echo "   ✅ pm2: $(pm2 --version 2>/dev/null | head -1)"

# ── Step 1 & 2: Chuẩn bị Release & Extract Artifact ─────────────────────────
echo ""
echo "📁 [1/8] Preparing release directory..."

if [ -f "${ARTIFACT}" ]; then
  echo "   ✅ Found artifact: $(du -sh "${ARTIFACT}" | cut -f1)"
  
  # Verify archive trước khi extract (phát hiện corruption từ SCP)
  if ! tar -tzf "${ARTIFACT}" > /dev/null 2>&1; then
    echo "❌ Artifact bị corrupt (tar integrity check thất bại)!"
    rm -f "${ARTIFACT}"
    send_telegram "❌ <b>ONI ${VERSION} — Artifact bị corrupt!</b>"$'\n'"Re-trigger GitHub Actions để SCP lại."
    exit 1
  fi

  mkdir -p "${RELEASE_DIR}"
  tar -xzf "${ARTIFACT}" -C "${RELEASE_DIR}"
  rm -f "${ARTIFACT}"   # Xóa file tạm sau khi giải nén thành công
  echo "📦 [2/8] Extracted artifact to ${RELEASE_DIR}"
else
  if [ -d "${RELEASE_DIR}" ]; then
    echo "   ✅ Release directory ready: ${RELEASE_DIR}"
  else
    echo "❌ Artifact không tìm thấy và release directory không tồn tại!"
    send_telegram "❌ <b>ONI ${VERSION} — Artifact không tìm thấy trên server!</b>"
    exit 1
  fi
fi

# Tự động đồng bộ các script mới nhất sang master /var/www/oni/scripts/
if [ -d "${RELEASE_DIR}/scripts" ]; then
  cp -rf "${RELEASE_DIR}/scripts/"* "${DEPLOY_ROOT}/scripts/"
  chmod +x "${DEPLOY_ROOT}/scripts/"*.sh
  echo "   ✅ Synced updated scripts to ${DEPLOY_ROOT}/scripts/"
fi

# [L1] Kiểm tra packages/adapters tồn tại
if [ ! -d "${RELEASE_DIR}/packages/adapters" ]; then
  echo "❌ packages/adapters không có trong artifact!"
  echo "   Kiểm tra bước tar trong GitHub Actions — packages/adapters/src/ cần được include"
  send_telegram "❌ <b>ONI ${VERSION} — Artifact thiếu packages/adapters!</b>"$'\n'"Kiểm tra bước 'Package artifact' trong GitHub Actions."
  exit 1
fi

# ── Step 4: Symlink shared/.env & node_modules ────────────────────────────────
echo ""
echo "🔗 [3/8] Linking shared .env & node_modules..."
ln -sfn "${SHARED_DIR}/.env" "${RELEASE_DIR}/.env"
mkdir -p "${RELEASE_DIR}/apps/web"
ln -sfn "${SHARED_DIR}/.env" "${RELEASE_DIR}/apps/web/.env"
echo "   ✅ .env → ${SHARED_DIR}/.env"

# Symlink standalone node_modules vào packages/adapters để drizzle-kit tìm thấy drizzle-orm, pg...
if [ -d "${RELEASE_DIR}/apps/web/.next/standalone/node_modules" ]; then
  ln -sfn "${RELEASE_DIR}/apps/web/.next/standalone/node_modules" "${RELEASE_DIR}/node_modules"
  ln -sfn "${RELEASE_DIR}/apps/web/.next/standalone/node_modules" "${RELEASE_DIR}/packages/adapters/node_modules"
  echo "   ✅ Linked standalone node_modules for drizzle-kit"
fi

# ── Step 5: Ghi ecosystem.config.js với path tuyệt đối của release này ────────
echo ""
echo "⚙️  [4/8] Configuring ecosystem.config.js..."
STANDALONE="${RELEASE_DIR}/apps/web/.next/standalone/apps/web"

if [ ! -d "${STANDALONE}" ]; then
  echo "❌ Standalone directory không tìm thấy: ${STANDALONE}"
  echo "   Build có thể đã fail hoặc artifact thiếu .next/standalone/"
  send_telegram "❌ <b>ONI ${VERSION} — Standalone build không tìm thấy!</b>"$'\n'"<code>${STANDALONE}</code>"
  exit 1
fi

cat > "${RELEASE_DIR}/ecosystem.config.js" << ECOEOF
const path = require('path');
// Auto-generated by deploy.sh for release ${VERSION}
// Do not edit manually — will be overwritten on next deploy.
const STANDALONE = '${STANDALONE}';
module.exports = {
  apps: [
    {
      name: "oni-web",
      script: path.join(STANDALONE, 'server.js'),
      cwd: STANDALONE,
      instances: "3",
      exec_mode: "cluster",
      listen_timeout: 8000,
      kill_timeout: 5000,
      env_file: '${SHARED_DIR}/.env',
      env: {
        PORT: ${APP_PORT},
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};
ECOEOF
echo "   ✅ ecosystem.config.js generated"

# ── Step 6: Migration DB ──────────────────────────────────────────────────────
echo ""
echo "🗄️  [5/8] Checking database schema..."

MIGRATION_LOG="/tmp/oni-migration-${VERSION}.log"

cd "${RELEASE_DIR}/packages/adapters"

# [H3] timeout 120s: chặn hang vô hạn nếu DB đang bị lock
# echo "y": tự xác nhận thay đổi safe
# --strict: fail thay vì prompt cho thay đổi nguy hiểm
if echo "y" | timeout "${MIGRATION_TIMEOUT}" drizzle-kit push \
    --config=drizzle.pg.config.ts \
    --strict \
    > "${MIGRATION_LOG}" 2>&1; then

  MIGRATION_RESULT=$(cat "${MIGRATION_LOG}")
  echo "${MIGRATION_RESULT}"

  if echo "${MIGRATION_RESULT}" | grep -q "No changes detected"; then
    echo "   ✅ No schema changes — skipped"
    MIGRATION_MSG="ℹ️ DB: No schema changes"
  else
    echo "   ✅ Schema updated successfully"
    # Truncate log để tránh Telegram message quá dài
    MIGRATION_SUMMARY=$(cat "${MIGRATION_LOG}" | tail -15)
    MIGRATION_MSG="✅ DB schema updated"$'\n'"<code>${MIGRATION_SUMMARY}</code>"
  fi

elif [ $? -eq 124 ]; then
  # exit code 124 = timeout
  echo "❌ Migration TIMEOUT sau ${MIGRATION_TIMEOUT}s!"
  echo "   DB có thể đang bị lock bởi một transaction dài."
  echo "   Kiểm tra: SELECT * FROM pg_locks WHERE NOT granted;"
  send_telegram "⏰ <b>ONI ${VERSION} — Migration TIMEOUT (${MIGRATION_TIMEOUT}s)!</b>"$'\n'"DB có thể bị lock. Kiểm tra pg_locks trên server."
  exit 1

else
  # --strict bị thất bại → có thay đổi cần xác nhận thủ công
  MIGRATION_ERROR=$(cat "${MIGRATION_LOG}")
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  ⚠️  MIGRATION CẦN XÁC NHẬN THỦ CÔNG"
  echo "════════════════════════════════════════════════"
  echo ""
  echo "${MIGRATION_ERROR}"
  echo ""
  echo "  Deploy đã DỪNG lại tại bước migration."
  echo "  Artifact đã được giải nén tại: ${RELEASE_DIR}"
  echo ""
  echo "  Để xử lý thủ công, SSH vào server và chạy:"
  echo "  ┌─────────────────────────────────────────────────────"
  echo "  │  cd ${RELEASE_DIR}/packages/adapters"
  echo "  │  drizzle-kit push --config=drizzle.pg.config.ts"
  echo "  │"
  echo "  │  # Sau khi migration xong:"
  echo "  │  /var/www/oni/scripts/switch.sh ${VERSION}"
  echo "  └─────────────────────────────────────────────────────"
  echo ""

  send_telegram "⚠️ <b>ONI ${VERSION} — Migration cần xác nhận thủ công!</b>"$'\n\n'"Deploy đã DỪNG lại. SSH vào server:"$'\n'"<code>cd /var/www/oni/releases/${VERSION}/packages/adapters</code>"$'\n'"<code>drizzle-kit push --config=drizzle.pg.config.ts</code>"$'\n\n'"Sau khi xong: <code>/var/www/oni/scripts/switch.sh ${VERSION}</code>"

  exit 1   # Dừng — KHÔNG switch symlink, KHÔNG reload PM2
fi

cd "${DEPLOY_ROOT}"

# ── Step 7: Switch symlink (atomic) ──────────────────────────────────────────
echo ""
echo "🔀 [6/8] Switching current → ${VERSION}..."
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
echo "   Symlink: ${CURRENT_LINK} → $(readlink -f "${CURRENT_LINK}")"

# ── Step 8: PM2 graceful reload (zero-downtime) ──────────────────────────────
echo ""
echo "♻️  [7/8] PM2 graceful reload..."
pm2 startOrReload "${CURRENT_LINK}/ecosystem.config.js" --update-env

# ── Step 9: HTTP Health check với retry ──────────────────────────────────────
echo ""
echo "🩺 [8/8] Health check..."
if wait_for_http "${APP_PORT}" "${HEALTH_CHECK_RETRIES}" "${HEALTH_CHECK_INTERVAL}"; then
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  ✅ ONI ${VERSION} is LIVE!"
  echo "════════════════════════════════════════════════"

  # Lưu PM2 process list để persist qua server reboot
  # Nếu không save, server reboot sẽ restore config CŨ từ /app/
  pm2 save --force
  echo "   ✅ PM2 process list saved (persist across reboot)"

  send_telegram "🚀 <b>ONI ${VERSION} đang LIVE!</b>"$'\n'"${MIGRATION_MSG}"

else
  # Health check thất bại → auto rollback về version liền trước
  echo ""
  echo "❌ App không phản hồi HTTP sau $((HEALTH_CHECK_RETRIES * HEALTH_CHECK_INTERVAL))s — đang auto rollback..."

  # Kiểm tra PM2 log để có error message hữu ích hơn
  PM2_ERROR=$(pm2 logs oni-web --nostream --lines 20 2>/dev/null | tail -10 || true)

  # sort -Vr = version sort descending → đảm bảo v10.x > v9.x, không phụ thuộc mtime
  PREV_DIR=$(ls -1d "${RELEASES_DIR}"/v* 2>/dev/null | sort -Vr | grep -v "^${RELEASE_DIR}$" | head -1 || true)

  if [ -n "${PREV_DIR:-}" ]; then
    PREV_VERSION=$(basename "${PREV_DIR}")
    echo "   Rolling back to: ${PREV_VERSION}"
    ln -sfn "${PREV_DIR}" "${CURRENT_LINK}"
    pm2 startOrReload "${CURRENT_LINK}/ecosystem.config.js" --update-env

    # Đợi rollback version healthy
    sleep 5
    if wait_for_http "${APP_PORT}" 6 5; then
      echo "⏪ Đã rollback thành công về ${PREV_VERSION}"
      send_telegram "❌ <b>ONI ${VERSION} deploy thất bại!</b>"$'\n'"⏪ Đã rollback về <b>${PREV_VERSION}</b>"$'\n\n'"<b>PM2 log:</b>"$'\n'"<code>${PM2_ERROR}</code>"
    else
      echo "🔴 ROLLBACK CŨNG THẤT BẠI! Cần can thiệp ngay!"
      send_telegram "🔴 <b>CRITICAL: Cả ${VERSION} và rollback đều thất bại!</b>"$'\n'"Cần kiểm tra ngay: <code>pm2 logs oni-web</code>"
    fi
  else
    echo "⚠️  Không tìm thấy version trước để rollback!"
    echo "   Đây có thể là deploy đầu tiên."
    send_telegram "🔴 <b>ONI ${VERSION} deploy thất bại và không có version rollback!</b>"$'\n'"Kiểm tra: <code>pm2 logs oni-web</code>"
  fi

  exit 1
fi

# ── Step 10: Cleanup — giữ KEEP_RELEASES phiên bản gần nhất ──────────────────
echo ""
echo "🧹 Cleaning old releases (keep last ${KEEP_RELEASES})..."
# sort -Vr: sắp xếp semver descending (v3.0.1 > v2.0.1 > v1.0.3)
# tail -n +11: bỏ qua 10 dòng đầu → lấy tất cả từ vị trí 11 trở đi
OLD_RELEASES=$(ls -1d "${RELEASES_DIR}"/v* 2>/dev/null | sort -Vr | tail -n +$((KEEP_RELEASES + 1)) || true)
if [ -n "${OLD_RELEASES:-}" ]; then
  # [M3] Không dùng pipe subshell để giữ error propagation
  while IFS= read -r dir; do
    [ -z "${dir}" ] && continue
    echo "   Removing $(basename "${dir}")"
    rm -rf "${dir}" || echo "   ⚠️ Không xóa được ${dir}" >&2
  done <<< "${OLD_RELEASES}"
else
  echo "   Nothing to clean"
fi

echo ""
pm2 list
echo ""
echo "════════════════════════════════════════════════"
echo "  ✅ Deploy ${VERSION} hoàn tất"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "════════════════════════════════════════════════"
