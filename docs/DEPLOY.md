# ONI SaaS — Tài liệu Deploy Pipeline

> Phiên bản: 2.0 — Capistrano-style, Zero-downtime, Standalone Next.js

---

## 1. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer                                                      │
│  git tag v1.x.x && git push --tags                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │ trigger
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions — Job 1: Build                                 │
│  • pnpm install + pnpm run build (standalone mode)             │
│  • Copy .next/static + public vào standalone/                  │
│  • tar.gz artifact (~35MB)                                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ SCP artifact
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions — Job 2: Deploy                                │
│  • SCP artifact → /var/www/oni/releases/tmp/                   │
│  • SSH → /var/www/oni/scripts/deploy.sh v1.x.x                │
└──────────────────────┬──────────────────────────────────────────┘
                       │ SSH exec
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  VPS — deploy.sh                                               │
│  1. Extract artifact → /var/www/oni/releases/v1.x.x/          │
│  2. Auto-sync scripts/ sang /var/www/oni/scripts/             │
│  3. Symlink shared/.env vào release                            │
│  3. Generate ecosystem.config.js (absolute paths)             │
│  4. DB Migration (smart — xem mục 6)                          │
│  5. Atomic switch: current → v1.x.x                           │
│  6. PM2 graceful reload (zero-downtime)                        │
│  7. Health check → auto rollback nếu fail                     │
│  8. Telegram notification                                       │
│  9. Cleanup → giữ 10 releases gần nhất                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Cấu trúc thư mục trên VPS

```
/var/www/oni/
├── releases/
│   ├── tmp/                            ← SCP artifact vào đây tạm thời
│   ├── v1.2.0/                         ← Release cũ (tối đa 10)
│   ├── v1.2.1/
│   └── v1.3.0/                         ← Release mới nhất
│       ├── apps/web/
│       │   ├── .next/standalone/       ← Next.js app (không cần node_modules)
│       │   └── .env → shared/.env      ← Symlink
│       ├── packages/adapters/
│       │   ├── src/                    ← Schema files cho drizzle migration
│       │   └── drizzle.pg.config.ts
│       ├── ecosystem.config.js         ← Auto-generated với absolute paths
│       └── .env → shared/.env          ← Symlink
├── shared/
│   └── .env                            ← FILE CỐ ĐỊNH. Tạo 1 lần, không bao giờ xóa.
├── scripts/
│   ├── deploy.sh                       ← Main deploy script
│   ├── switch.sh                       ← Dùng sau migration thủ công
│   ├── rollback.sh                     ← Rollback về version cũ
│   ├── backup.sh                       ← Backup PostgreSQL local mỗi 2 giờ
│   ├── backup-supabase.sh              ← Backup Supabase daily
│   └── install-backup-cron.sh          ← Cài/cập nhật cron idempotent
├── backups/                            ← Dữ liệu backup, không nằm trong release
├── logs/                               ← Log cron backup
└── current → releases/v1.3.0/          ← Symlink, PM2 luôn trỏ vào đây
```

---

## 3. GitHub Secrets — Danh sách đầy đủ (đã audit từ source code)

### 3A. SSH Access (bắt buộc)

| Secret | Giá trị |
|--------|---------|
| `VPS_HOST` | IP hoặc domain server |
| `VPS_USERNAME` | `oni` |
| `VPS_SSH_KEY` | Private key ED25519/RSA của user `oni` |
| `VPS_PORT` | `22` |

### 3B. NEXT_PUBLIC_* — Baked vào JS bundle khi build (bắt buộc)

| Secret | Mô tả | Có default không? |
|--------|-------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase project | ❌ Bắt buộc |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key | ❌ Bắt buộc |
| `NEXT_PUBLIC_ROOT_DOMAIN` | vd: `oni.vn` | ❌ Bắt buộc |
| `NEXT_PUBLIC_SITE_URL` | vd: `https://oni.vn` | ❌ Bắt buộc |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry public DSN | ❌ Bắt buộc |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare site key | ❌ Bắt buộc |
| `NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_EMAIL` | SA email cho client | ❌ Bắt buộc |
| `NEXT_PUBLIC_REALTIME_PROVIDER` | `supabase` | ✅ Default: `supabase` |
| `NEXT_PUBLIC_ZALO_MINI_APP_ID` | Zalo mini app ID | ✅ Default hardcoded |

> **Không cần đặt vào Secrets** (có default an toàn trong code):
> - `NEXT_PUBLIC_APP_URL` → fallback `'https://oni.vn'`
> - `NEXT_PUBLIC_POS_SYNC_INTERVAL_MS` → default `3000`ms
> - `NEXT_PUBLIC_POS_SYNC_MAX_RETRY` → default `5`
> - `NEXT_PUBLIC_POS_CUSTOMER_CACHE_SIZE` → default `500`
> - `NEXT_PUBLIC_POS_HYDRATE_INTERVAL_MS` → default `300000`ms
> - `NEXT_PUBLIC_QUERY_STALE_MS` → default `60000`ms
> - `NEXT_PUBLIC_QUERY_GC_MS` → default `300000`ms
> - `NEXT_PUBLIC_APP_VERSION` → set tự động từ `github.ref_name`
> - `NEXT_PUBLIC_VERCEL_ENV` → không dùng trên VPS

### 3C. Sentry — Upload sourcemaps khi build

| Secret | Mô tả |
|--------|-------|
| `SENTRY_AUTH_TOKEN` | Auth token để upload sourcemaps |
| `SENTRY_DSN` | Server-side DSN |
| `SENTRY_ORG` | Org slug trong Sentry |
| `SENTRY_PROJECT` | Project slug trong Sentry |

### 3D. KHÔNG đưa vào GitHub Secrets (server-only, trong `shared/.env`)

| Biến | Lý do |
|------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access — tuyệt đối không public |
| `SUPABASE_DB_URL` | Database password/connection string cho backup Supabase |
| `SUPABASE_PROJECT_REF` | Guard chống dump nhầm Supabase project |
| `LOCAL_PG_URI` | DB connection string localhost |
| `LOCAL_MYSQL_URI` | Legacy DB connection |
| `CONNECTOR_ENCRYPTION_KEY` | Encryption key — secret tuyệt đối |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Private key — không bao giờ public |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Server-side SA (khác với NEXT_PUBLIC_) |
| `TURNSTILE_SECRET_KEY` | Server verification key |
| `TELEGRAM_BOT_TOKEN` | Bot token |
| `TELEGRAM_CHAT_ID` | Chat nhận deploy alerts |

---

## 4. Setup Server — Chạy 1 lần (user `oni`, không cần sudo)

### Bước 4.1 — Kiểm tra ownership

```bash
ls -la /var/www/ | grep oni
# Nếu sai owner: sudo chown -R oni:oni /var/www/oni/
```

### Bước 4.2 — Tạo cấu trúc thư mục

```bash
mkdir -p /var/www/oni/{releases/tmp,shared,scripts}
chmod 750 /var/www/oni/shared
```

### Bước 4.3 — Tạo `shared/.env` (file cố định, không bao giờ xóa)

```bash
cp /var/www/oni/app/.env /var/www/oni/shared/.env
nano /var/www/oni/shared/.env
# Bổ sung nếu thiếu: TELEGRAM_CHAT_ID="your_chat_id"
chmod 600 /var/www/oni/shared/.env
```

### Bước 4.4 — Fix PATH cho SSH non-interactive session

> Server đang dùng NVM với Node v24.15.0.
> GitHub Actions SSH không load `~/.bashrc` → phải init NVM trong `~/.profile`.

File `~/.profile` hiện có dạng:
```bash
# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/.local/bin" ] ; then
    PATH="$HOME/.local/bin:$PATH"
fi
```

Thêm vào cuối file, giữ nguyên format `if [ ... ]` cho nhất quán:
```bash
nano ~/.profile
```

```bash
# NVM — cần thiết cho SSH non-interactive session (GitHub Actions deploy)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ] ; then
    \. "$NVM_DIR/nvm.sh"
fi
```

```bash
# Verify: simulate SSH non-interactive
ssh oni@server "node --version && pm2 --version && drizzle-kit --version"
```

### Bước 4.5 — Cài các gói migration global

```bash
# Cài drizzle-kit (CLI), drizzle-orm và pg driver vào NVM node hiện tại
npm install -g drizzle-kit@0.31.10 drizzle-orm@0.45.2 pg
drizzle-kit --version
# → /home/oni/.nvm/versions/node/v24.15.0/bin/drizzle-kit
```

> **Lưu ý về `dotenv`**: Không cần cài `dotenv` global. File `drizzle.pg.config.ts` và `drizzle.config.ts` đã được tối ưu để tự đọc và parse file `.env` bằng module `fs` thuần có sẵn của Node.js, giúp giảm phụ thuộc vào package bên ngoài.

### Bước 4.6 — Upload scripts lên server

```bash
# Từ local machine:
scp scripts/*.sh oni@server:/var/www/oni/scripts/
ssh oni@server "chmod +x /var/www/oni/scripts/*.sh"
```

Sau khi bổ sung các biến backup vào `shared/.env`, cài cron một lần:

```bash
ssh oni@server \
  "ONI_DEPLOY_ROOT=/var/www/oni /var/www/oni/scripts/install-backup-cron.sh"
```

Cron luôn gọi `/var/www/oni/scripts/*`; mỗi deploy tiếp theo tự đồng bộ script mới
mà không phải sửa lại crontab. Xem cấu hình đầy đủ tại [BACKUP-GUIDE.md](BACKUP-GUIDE.md).

---

## 5. Deploy tự động (mỗi release)

```bash
git tag v1.3.0
git push origin v1.3.0
# Xong — GitHub Actions tự chạy, nhận Telegram khi live
```

---

## 6. DB Migration — Logic

```
echo "y" | drizzle-kit push --strict

  ├── "No changes detected" → ✅ Skip, deploy tiếp bình thường
  │
  ├── Safe changes (add table/column/index)
  │   → echo "y" tự xác nhận → ✅ Auto apply, deploy tiếp
  │
  └── Destructive changes (drop/rename/type change)
      → --strict exit non-zero → ⚠️ DỪNG deploy
      → Artifact đã giải nén, chờ xử lý thủ công
      → Telegram alert với lệnh cụ thể
```

### Khi nhận Telegram alert:

```bash
ssh oni@server

cd /var/www/oni/releases/v1.x.x/packages/adapters
drizzle-kit push --config=drizzle.pg.config.ts --verbose
# Review kỹ → Y/N

# Sau khi xong:
/var/www/oni/scripts/switch.sh v1.x.x
```

---

## 7. Rollback

```bash
/var/www/oni/scripts/rollback.sh            # về version liền trước
/var/www/oni/scripts/rollback.sh v1.2.0    # về version cụ thể
ls -1dt /var/www/oni/releases/v*            # xem danh sách
```

> Rollback **không** rollback DB schema.

---

## 8. Ảnh hưởng tới app đang chạy tại `/var/www/oni/app/`

| Giai đoạn | Ảnh hưởng |
|-----------|----------|
| Setup server (Bước 4.1 → 4.6) | **Không có gì** — chỉ tạo thư mục mới |
| Deploy lần đầu (git push tag) | PM2 graceful reload — **~0 downtime** |
| Sau deploy | `/app/` vẫn tồn tại nhưng PM2 dùng release mới. Xóa sau khi stable. |

**Timeline deploy lần đầu:**
```
T+0s    GitHub Actions bắt đầu build
T+120s  Build xong, SCP artifact lên server
T+130s  deploy.sh: extract → symlink → migrate
T+135s  PM2 startOrReload (graceful):
          Start workers MỚI (standalone server.js)
          ↓ đợi workers ready
          Stop workers CŨ (next start từ /app/)
T+138s  ✅ 100% traffic qua code mới
T+143s  Health check pass → Telegram "🚀 LIVE"
```

---

## 9. Troubleshooting

### App 500 sau deploy

```bash
pm2 logs oni-web --lines 100
# Rollback ngay nếu cần:
/var/www/oni/scripts/rollback.sh
```

### drizzle-kit không tìm thấy

```bash
ssh oni@server "source ~/.profile && drizzle-kit --version"
# Nếu vẫn không thấy:
npm install -g drizzle-kit@0.31.10
```

### SCP thất bại

- Kiểm tra `VPS_SSH_KEY` đúng format PEM
- Public key đã có trong `/home/oni/.ssh/authorized_keys`
- Firewall cho phép SSH từ GitHub Actions IPs

### Xem release hiện tại

```bash
readlink -f /var/www/oni/current       # Release đang chạy
pm2 list                               # Status PM2
cat /var/www/oni/current/ecosystem.config.js  # Config đang dùng
```

---

## 10. Checklist GitHub Secrets

```
SSH:
☐ VPS_HOST
☐ VPS_USERNAME       (oni)
☐ VPS_SSH_KEY
☐ VPS_PORT           (22)

Build:
☐ NEXT_PUBLIC_SUPABASE_URL
☐ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
☐ NEXT_PUBLIC_ROOT_DOMAIN
☐ NEXT_PUBLIC_SITE_URL
☐ NEXT_PUBLIC_SENTRY_DSN
☐ NEXT_PUBLIC_TURNSTILE_SITE_KEY
☐ NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_EMAIL
☐ NEXT_PUBLIC_REALTIME_PROVIDER
☐ NEXT_PUBLIC_ZALO_MINI_APP_ID

Sentry:
☐ SENTRY_AUTH_TOKEN
☐ SENTRY_DSN
☐ SENTRY_ORG
☐ SENTRY_PROJECT
```
