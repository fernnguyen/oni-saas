# Checklist dựng VPS mới cho ONI (Ubuntu 24.04 LTS)

Checklist này dành cho VPS mới của ONI trên Ubuntu 24.04 LTS, với wildcard `*.oni.vn` đã trỏ về `103.200.23.91`, theo hướng self-host Next.js + PostgreSQL + Nginx + R2 cho media.[cite:342][cite:357][cite:308]

## Mục tiêu kiến trúc

- Hệ điều hành: Ubuntu 24.04 LTS.[cite:346][cite:359]
- Reverse proxy: Nginx.[cite:352][cite:358]
- App server: Next.js self-host bằng Node + PM2 hoặc Docker, nhưng PM2 là hướng triển khai nhanh và đơn giản hơn cho giai đoạn đầu.[cite:342][cite:352]
- Database: PostgreSQL cài local trên VPS.[cite:357][cite:331]
- Media/file upload: Cloudflare R2 để giảm tải disk và bandwidth cho VPS.[cite:308][cite:110]
- App dùng DB connector riêng nên client không phụ thuộc loại database backend.[cite:307]

## 1. Chuẩn bị truy cập và kiểm tra DNS

- Đăng nhập VPS bằng SSH với tài khoản được nhà cung cấp cấp ban đầu.[cite:337]
- Xác nhận IP public của máy là `103.200.23.91`.[cite:337]
- Kiểm tra DNS đã trỏ đúng (Type A record -> `103.200.23.91`):
  - `oni.vn`
  - `*.oni.vn` (Wildcard subdomain bắt buộc để hỗ trợ multi-tenant, ví dụ: `shop1.oni.vn`, `shop2.oni.vn`).[cite:337]
- Trên máy local, kiểm tra bằng:

```bash
nslookup oni.vn
nslookup app.oni.vn
ping oni.vn
```

- Ghi lại hostname dự định dùng, ví dụ:
  - `oni.vn` cho landing hoặc app chính
  - `app.oni.vn` cho webapp
  - `api.oni.vn` nếu sau này tách backend riêng
  - `cdn.oni.vn` nếu sau này map R2/custom domain.[cite:308]

## 2. Cập nhật hệ thống ngay sau khi nhận máy

Chạy ngay các lệnh cơ bản:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip zip ca-certificates gnupg lsb-release software-properties-common ufw fail2ban htop jq build-essential
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
```

Việc update, cài công cụ nền, bật timezone chuẩn và chuẩn bị gói hardening là bước cơ bản khi dựng Ubuntu server production.[cite:346][cite:349][cite:356]

## 3. Tạo user vận hành riêng, không dùng root trực tiếp

Tạo user riêng, ví dụ `oni`:

```bash
sudo adduser oni
sudo usermod -aG sudo oni
```

Copy SSH key sang user mới rồi kiểm tra đăng nhập bằng user đó trước khi khóa root.[cite:346][cite:349]

Nếu đã có SSH key local:

```bash
ssh-copy-id oni@103.200.23.91
```

## 4. Hardening SSH

Mở file cấu hình SSH:

```bash
sudo nano /etc/ssh/sshd_config
```

Đặt tối thiểu các giá trị sau:

```conf
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
PermitEmptyPasswords no
```

Sau đó reload SSH:

```bash
sudo systemctl restart ssh
```

Khóa root login và tắt password login là bước hardening cơ bản và rất quan trọng trên Ubuntu server public.[cite:346][cite:349][cite:356]

## 5. Bật firewall

Mở các cổng tối thiểu cần thiết:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Không mở 5432 public nếu PostgreSQL chỉ dùng nội bộ trên cùng máy.[cite:351][cite:356]

## 6. Bật Fail2Ban và auto security updates

Bật Fail2Ban:

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo systemctl status fail2ban
```

Bật unattended upgrades:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Đây là hai bước hardening rất phổ biến cho Ubuntu production để giảm brute force và tự động nhận bản vá bảo mật.[cite:349][cite:356]

## 7. Cài Node.js cho Next.js

Khuyến nghị dùng Node LTS mới, quản lý bằng `nvm` hoặc NodeSource. Với giai đoạn đầu, `nvm` dễ dùng cho dev-friendly deployment hơn.[cite:352]

Ví dụ với `nvm`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts
node -v
npm -v
```

Sau đó cài PM2:

```bash
npm install -g pm2
pm2 -v
```

PM2 là cách đơn giản để chạy Next.js production trên VPS và tự khởi động lại sau reboot.[cite:352]

## 8. Cài PostgreSQL

Ubuntu có sẵn PostgreSQL trong apt, hoặc có thể dùng repository chính thức để lấy bản mới hơn.[cite:357]

Cách nhanh nhất:

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

Nếu muốn bản PostgreSQL mới hơn từ PGDG, dùng hướng dẫn repository chính thức của PostgreSQL cho Ubuntu.[cite:357]

## 9. Tạo role và database cho ONI

Đăng nhập vào PostgreSQL:

```bash
sudo -u postgres psql
```

Tạo admin và app user riêng. App không nên dùng superuser.[cite:249][cite:260]

Ví dụ:

```sql
CREATE ROLE oni_admin WITH LOGIN PASSWORD 'doi-mat-khau-rat-manh';
ALTER ROLE oni_admin WITH SUPERUSER CREATEDB CREATEROLE;

CREATE ROLE oni_app WITH LOGIN PASSWORD 'doi-mat-khau-app-rat-manh';
CREATE DATABASE oni_prod OWNER oni_app;
\c oni_prod
GRANT ALL ON SCHEMA public TO oni_app;
```

Kiểm tra:

```sql
\du
\l
```

## 10. Cấu hình PostgreSQL an toàn cho local-only

Giữ PostgreSQL chỉ listen local nếu app và DB chạy cùng máy. Không mở public port 5432.[cite:331][cite:334]

Kiểm tra file cấu hình thường nằm ở:

```bash
/etc/postgresql/16/main/postgresql.conf
/etc/postgresql/17/main/postgresql.conf
/etc/postgresql/18/main/postgresql.conf
```

Khuyến nghị:

```conf
listen_addresses = 'localhost'
```

Và chỉ cho local auth phù hợp trong `pg_hba.conf`.[cite:331][cite:334]

## 11. Cài Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
sudo systemctl status nginx
```

Nginx là reverse proxy chuẩn để đặt trước Next.js self-host trên Ubuntu.[cite:352][cite:358]

## 12. Deploy source code ONI

Khuyến nghị tạo thư mục riêng:

```bash
sudo mkdir -p /var/www/oni
sudo chown -R oni:oni /var/www/oni
```

Clone source:

```bash
cd /var/www/oni
git clone <repo-url> app
cd app
npm install
npm run build
```

Với monorepo, thay `npm install` và `npm run build` bằng đúng package manager/workspace command của dự án đang dùng.[cite:320][cite:342]

## 13. Khởi tạo Database Schema (Drizzle)

Sau khi tạo database ở bước 9 và clone source, bạn cần push schema để tạo các table cho phần business logic.

Trong thư mục `app`:
```bash
# Push schema nếu dùng PostgreSQL:
cd packages/adapters && pnpm run db:push:pg
```
*(Lưu ý: Bạn phải đảm bảo file `.env.local` ở server đã khai báo đúng biến `LOCAL_PG_URI=postgresql://oni_app:doi-mat-khau-app-rat-manh@localhost:5432/oni_prod`)*

## 14. Chạy app bằng PM2

Ví dụ cho Next.js production:

```bash
cd /var/www/oni/app
pm2 start npm --name oni-web -- start
pm2 save
pm2 startup systemd
```

Nếu app chạy cổng 3000, xác nhận bằng:

```bash
pm2 status
curl http://127.0.0.1:3000
```

PM2 giúp app tự restart khi lỗi và tự chạy lại sau reboot.[cite:352]

## 14. Cấu hình Nginx reverse proxy cho ONI (Hỗ trợ Wildcard)

Tạo file cấu hình, ví dụ `/etc/nginx/sites-available/oni.conf`:

```nginx
server {
    listen 80;
    server_name oni.vn *.oni.vn; # Hỗ trợ domain chính và tất cả subdomain

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host; # Rất quan trọng để Next.js middleware nhận diện đúng tenant (host)
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/oni.conf /etc/nginx/sites-enabled/oni.conf
sudo nginx -t
sudo systemctl reload nginx
```

Đây là mẫu reverse proxy cơ bản cho Next.js self-host, pass đúng header `Host` để xử lý multi-tenant.[cite:352][cite:342]

## 15. Cài SSL Wildcard với Let’s Encrypt

Vì sử dụng wildcard subdomain `*.oni.vn`, Let's Encrypt yêu cầu xác thực qua **DNS-01 challenge** (thay vì HTTP-01 mặc định).

Cài đặt Certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
```

**Cách 1: Xác thực DNS thủ công (Manual DNS Challenge)**
Chạy lệnh sau và làm theo hướng dẫn (thêm TXT record `_acme-challenge.oni.vn` trên trang quản lý DNS của bạn):
```bash
sudo certbot certonly --manual --preferred-challenges dns -d "oni.vn" -d "*.oni.vn"
```
*Lưu ý: Cách này không tự động renew được, bạn phải chạy lại lệnh và cập nhật TXT record mỗi 3 tháng.*

**Cách 2: Xác thực tự động (Khuyên dùng - Ví dụ với Cloudflare)**
Nếu quản lý DNS qua Cloudflare, hãy cài plugin DNS để Certbot tự động renew:
```bash
sudo apt install -y python3-certbot-dns-cloudflare
```
Tạo file credentials (VD: `~/.secrets/certbot/cloudflare.ini` chứa `dns_cloudflare_api_token=...`) và chạy:
```bash
sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/certbot/cloudflare.ini -d "oni.vn" -d "*.oni.vn"
```

**Cài đặt chứng chỉ vào Nginx:**
Sau khi có chứng chỉ (bằng Cách 1 hoặc 2), yêu cầu Certbot cấu hình vào Nginx:
```bash
sudo certbot install --cert-name oni.vn --nginx
```

Kiểm tra auto-renew (nếu dùng plugin DNS):

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

SSL Wildcard giúp các tenant tự động có HTTPS mà không cần xin lại chứng chỉ mỗi khi có shop mới.[cite:352]

## 16. Cấu hình biến môi trường

Tạo file env production, không commit vào Git. Ví dụ `.env.production` hoặc cấu hình secret trong PM2 ecosystem file.[cite:337][cite:342]

Các biến tối thiểu:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://oni_app:mat_khau@127.0.0.1:5432/oni_prod
NEXTAUTH_URL=https://app.oni.vn
NEXTAUTH_SECRET=mot-secret-rat-dai
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_BASE_URL=...
```

## 17. Bật backup tối thiểu cho PostgreSQL

Dù VPS có backup tuần, vẫn nên có backup logic riêng bằng `pg_dump`.[cite:337]

Tạo thư mục backup:

```bash
sudo mkdir -p /var/backups/oni-postgres
sudo chown -R oni:oni /var/backups/oni-postgres
```

Ví dụ script backup:

```bash
PGPASSWORD='mat_khau_app' pg_dump -U oni_app -h 127.0.0.1 -d oni_prod -Fc -f /var/backups/oni-postgres/oni_prod_$(date +%F_%H-%M).dump
```

Thiết lập cron để chạy hàng ngày và giữ vòng đời file backup.[cite:333][cite:341]

## 18. Log, monitor và quan sát ban đầu

Cài tối thiểu:

```bash
sudo apt install -y logrotate
pm2 logs oni-web
journalctl -u nginx -f
sudo journalctl -u postgresql -f
```

Theo dõi CPU/RAM:

```bash
htop
free -h
df -h
```

Các bước này giúp phát hiện sớm memory pressure, disk đầy, hoặc lỗi query/app.[cite:337][cite:341]

## 19. Kiểm tra sau khi dựng xong

Checklist test bắt buộc:

- SSH bằng user thường hoạt động.[cite:346]
- Root login bị khóa.[cite:349]
- UFW chỉ mở 22/80/443.[cite:356]
- `https://oni.vn` truy cập được.[cite:352]
- `https://app.oni.vn` truy cập được nếu app chạy riêng domain.[cite:352]
- `pm2 status` có app online.[cite:352]
- PostgreSQL chỉ listen local.[cite:331][cite:334]
- App kết nối DB thành công bằng `oni_app`.[cite:249][cite:260]
- Upload media lên R2 thành công.[cite:110]
- Backup DB chạy thành công và restore test được ít nhất 1 lần.[cite:333]

## 20. Việc nên làm ngay sau khi online

- Cài version cố định cho Node và PostgreSQL trong tài liệu nội bộ để tránh lệch môi trường.[cite:357][cite:352]
- Thiết lập CI/CD tối thiểu hoặc script deploy có thể lặp lại.[cite:338][cite:342]
- Vá đầy đủ Next.js bản bảo mật mới nhất trước khi public production.[cite:320]
- Tạo môi trường staging nếu có thể, dù chỉ là subdomain + DB riêng nhẹ.[cite:342][cite:338]
- Chuẩn bị `oni_app` cho runtime và chỉ dùng `oni_admin` cho migration/quản trị DB.[cite:260][cite:277]

## 21. Checklist ngắn dạng chạy việc

### Hạ tầng
- [ ] SSH vào server mới.
- [ ] Update/upgrade Ubuntu.
- [ ] Set timezone `Asia/Ho_Chi_Minh`.
- [ ] Tạo user `oni` và thêm sudo.
- [ ] Cài SSH key, tắt root login, tắt password login.
- [ ] Bật UFW và Fail2Ban.
- [ ] Bật unattended upgrades.

### Ứng dụng
- [ ] Cài Node LTS.
- [ ] Cài PM2.
- [ ] Clone source ONI.
- [ ] Install dependencies.
- [ ] Build production.
- [ ] Start bằng PM2.

### Database
- [ ] Cài PostgreSQL.
- [ ] Tạo `oni_admin`.
- [ ] Tạo `oni_app`.
- [ ] Tạo `oni_prod`.
- [ ] Giữ PostgreSQL local-only.
- [ ] Test kết nối app -> DB.

### Web server
- [ ] Cài Nginx.
- [ ] Tạo config cho `oni.vn` và `*.oni.vn`.
- [ ] Reload Nginx.
- [ ] Cài Certbot và DNS plugin (nếu dùng).
- [ ] Xin cấp SSL Wildcard qua DNS Challenge.
- [ ] Cài SSL vào Nginx (`certbot install`).

### Vận hành
- [ ] Tạo env production.
- [ ] Cấu hình R2.
- [ ] Tạo backup DB hằng ngày.
- [ ] Kiểm tra restore backup.
- [ ] Kiểm tra log, RAM, disk, app health.

## Gợi ý chốt cho ONI

Với VPS AMD 10 GB RAM NVMe mới mua, ONI nên giữ PostgreSQL và app cùng máy ở giai đoạn đầu, nhưng PostgreSQL chỉ mở local, còn ảnh/file để ở R2 để giảm áp lực disk và bandwidth.[cite:308][cite:307][cite:110] Khi số tenant tăng, mốc nâng cấp hợp lý nhất thường là tách DB riêng hoặc tăng RAM trước, thay vì đổi toàn bộ kiến trúc quá sớm.[cite:308][cite:309]
