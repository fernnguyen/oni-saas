#!/bin/bash
# =============================================================================
# ONI Rollback Script
# Rollback về version trước hoặc một version cụ thể.
#
# Cách dùng:
#   ./rollback.sh             → rollback về version liền trước current
#   ./rollback.sh v1.2.0      → rollback về version cụ thể
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

DEPLOY_ROOT="/var/www/oni"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
CURRENT_LINK="${DEPLOY_ROOT}/current"

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

CURRENT_VERSION=$(basename "$(readlink -f "${CURRENT_LINK}")")
echo ""
echo "════════════════════════════════════════════════"
echo "  ONI Rollback"
echo "════════════════════════════════════════════════"
echo "  Current: ${CURRENT_VERSION}"
echo ""

# Xác định target version
if [ -n "${1:-}" ]; then
  TARGET_DIR="${RELEASES_DIR}/$1"
  TARGET_VERSION="$1"
else
  # Tự động lấy version liền trước
  # sort -Vr: version sort descending → v10.x > v9.x, đúng với semver
  TARGET_DIR=$(ls -1d "${RELEASES_DIR}"/v* 2>/dev/null \
    | sort -Vr \
    | grep -v "^${RELEASES_DIR}/${CURRENT_VERSION}$" \
    | head -1)
  TARGET_VERSION=$(basename "${TARGET_DIR}")
fi

if [ ! -d "${TARGET_DIR}" ]; then
  echo "❌ Release '${TARGET_VERSION}' không tồn tại."
  echo ""
  echo "Các releases hiện có:"
  ls -1dt "${RELEASES_DIR}"/v* 2>/dev/null | while read -r d; do
    v=$(basename "$d")
    if [ "$v" = "${CURRENT_VERSION}" ]; then
      echo "  ▶ ${v} (current)"
    else
      echo "    ${v}"
    fi
  done
  exit 1
fi

echo "  Target:  ${TARGET_VERSION}"
echo ""
read -r -p "⚠️  Xác nhận rollback ${CURRENT_VERSION} → ${TARGET_VERSION}? [y/N] " confirm
if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
  echo "Hủy rollback."
  exit 0
fi

echo ""
echo "🔀 Switching current → ${TARGET_VERSION}..."
ln -sfn "${TARGET_DIR}" "${CURRENT_LINK}"

echo "♻️  PM2 graceful reload..."
pm2 startOrReload "${CURRENT_LINK}/ecosystem.config.js" --update-env

echo "🩺 Health check (5 giây)..."
sleep 5

if pm2 list | grep -E "oni-web.*online" > /dev/null 2>&1; then
  echo ""
  echo "════════════════════════════════════════════════"
  echo "  ✅ Rollback thành công!"
  echo "  ${CURRENT_VERSION} → ${TARGET_VERSION}"
  echo "════════════════════════════════════════════════"
  pm2 save --force
  send_telegram "⏪ <b>ONI rollback thành công!</b>"$'\n'"<b>${CURRENT_VERSION}</b> → <b>${TARGET_VERSION}</b>"
  echo ""
  pm2 list
else
  echo "❌ App không khởi động sau rollback!"
  send_telegram "🔴 <b>ONI rollback thất bại!</b>"$'\n'"Kiểm tra ngay: <code>pm2 logs oni-web</code>"
  exit 1
fi
