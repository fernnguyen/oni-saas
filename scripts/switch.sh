#!/bin/bash
# =============================================================================
# ONI Switch Script
# Dùng sau khi migration thủ công hoàn tất (khi deploy.sh bị dừng ở bước migration).
# Chỉ thực hiện: switch symlink + PM2 reload + health check.
#
# Cách dùng: ./switch.sh <version>
# Ví dụ:     ./switch.sh v1.3.0
# =============================================================================
set -euo pipefail

export PATH="$HOME/.npm-global/bin:$HOME/.local/share/pnpm:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  \. "$HOME/.nvm/nvm.sh"
fi
GLOBAL_NODE_MODULES=$(npm root -g 2>/dev/null || echo "")
if [ -n "${GLOBAL_NODE_MODULES}" ]; then
  export NODE_PATH="${GLOBAL_NODE_MODULES}:${NODE_PATH:-}"
fi

VERSION="${1:?Thiếu version. Dùng: ./switch.sh v1.0.0}"
DEPLOY_ROOT="/var/www/oni"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
CURRENT_LINK="${DEPLOY_ROOT}/current"
RELEASE_DIR="${RELEASES_DIR}/${VERSION}"

STANDALONE_NODE_MODULES="${RELEASE_DIR}/apps/web/.next/standalone/node_modules"
GLOBAL_NODE_MODULES=$(npm root -g 2>/dev/null || echo "")
export NODE_PATH="${STANDALONE_NODE_MODULES}:${GLOBAL_NODE_MODULES}:${NODE_PATH:-}"

set -o allexport
# shellcheck source=/dev/null
source "${DEPLOY_ROOT}/shared/.env"
set +o allexport

send_telegram() {
  local msg="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "parse_mode=HTML" \
      --data-urlencode "text=${msg}" \
      > /dev/null 2>&1 || true
  fi
}

if [ ! -d "${RELEASE_DIR}" ]; then
  echo "❌ Release ${VERSION} không tồn tại tại ${RELEASE_DIR}"
  exit 1
fi

if [ -d "${RELEASE_DIR}/apps/web/.next/standalone/node_modules" ]; then
  ln -sfn "${RELEASE_DIR}/apps/web/.next/standalone/node_modules" "${RELEASE_DIR}/node_modules"
  ln -sfn "${RELEASE_DIR}/apps/web/.next/standalone/node_modules" "${RELEASE_DIR}/packages/adapters/node_modules"
fi

echo ""
echo "════════════════════════════════════════════════"
echo "  ONI Switch — ${VERSION} (post-manual-migration)"
echo "════════════════════════════════════════════════"

echo "🔀 Switching current → ${VERSION}..."
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"

echo "♻️  PM2 graceful reload..."
pm2 startOrReload "${CURRENT_LINK}/ecosystem.config.js" --update-env

echo "🩺 Health check (5 giây)..."
sleep 5

if pm2 list | grep -E "oni-web.*online" > /dev/null 2>&1; then
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  ✅ ONI ${VERSION} is LIVE! (manual migration)"
  echo "════════════════════════════════════════════════"
  pm2 save --force
  send_telegram "🚀 <b>ONI ${VERSION} đang LIVE!</b> (migration thủ công đã hoàn tất)"
  pm2 list
else
  echo "❌ App không healthy!"
  send_telegram "❌ <b>ONI ${VERSION} không khởi động được sau switch!</b>"$'\n'"Kiểm tra: <code>pm2 logs oni-web</code>"
  exit 1
fi
