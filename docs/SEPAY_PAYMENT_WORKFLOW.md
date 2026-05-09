# Hướng Dẫn Tích Hợp SEPAY & Thanh Toán Tự Động (VietQR)

Tài liệu này mô tả chi tiết luồng tích hợp cổng thanh toán qua SEPAY (Webhook & VietQR) vào dự án **ONI SAAS**.

## 1. Tổng quan luồng thanh toán (Payment Flow)

Quy trình thanh toán hoạt động tự động 24/7 theo mô hình **Polling & Webhook**:

1. **User request (Frontend)**: Chủ cửa hàng (Tenant) bấm Nâng cấp gói cước trên UI (component `PlanBadge.tsx`).
2. **Tạo Order (Edge Function `create-sepay-order`)**: Hệ thống sinh ra 1 bản ghi vào bảng `subscription_orders` với `status = 'pending'`, gán một mã `reference_code` độc nhất theo format `ONI` + 8 ký tự ngẫu nhiên (VD: `ONIAB12CD34`), kèm số tiền (`amount_vnd`).
3. **Hiển thị giao diện QR (Frontend)**:
   - Render mã VietQR từ API mở (`img.vietqr.io`).
   - Mã VietQR nhúng sẵn số tiền, nội dung chuyển khoản là `reference_code` (VD: `ONIAB12CD34`).
   - UI hiển thị đồng hồ đếm ngược 15 phút. Frontend liên tục gọi `check-sepay-order` (polling 3s/lần).
4. **Khách hàng chuyển khoản**: Sử dụng App ngân hàng quét QR và thanh toán thành công.
5. **Webhook bắn Server (SEPAY → Supabase Edge Function)**:
   - Ngân hàng báo số dư về SEPAY.
   - SEPAY push 1 tín hiệu JSON Webhook về hàm `/sepay-webhook`.
6. **Edge Function xử lý & kích hoạt (Fulfillment)**:
   - Regex `/ONI[A-Z0-9]{6,12}/i` dò `reference_code` trong nội dung CK.
   - Map trúng `subscription_orders` với `status = 'pending'`.
   - Đối chiếu `transferAmount` ≥ `amount_vnd`.
   - Cập nhật `subscriptions`: `plan_id`, `current_period_end` (cộng dồn từ ngày hết hạn hiện tại).
   - Cập nhật Order → `status = 'completed'`.
7. **Frontend nhận tín hiệu thành công**: Polling tiếp theo trả về `status = 'completed'` → Chuyển UI sang màn chúc mừng.

---

## 2. Cấu trúc Database & Schema

### Table: `subscription_orders`
| Field | Type | Ý nghĩa |
|-------|------|---------|
| `id` | uuid | Khóa chính |
| `tenant_id` | uuid | Mã Doanh nghiệp đang mua gói |
| `user_id` | uuid | User thực hiện thanh toán |
| `plan_code` | text | Gói cước (`plan_pro`, `plan_enterprise`) |
| `billing_interval` | text | Chu kỳ (`monthly` / `yearly`) |
| `amount_vnd` | bigint | Số tiền VNĐ tại thời điểm tạo đơn |
| `reference_code` | text | Mã duy nhất, format: `ONI` + 8 ký tự (VD: `ONIAB12CD34`) |
| `status` | text | `pending` / `processing` / `completed` / `expired` |
| `expires_at` | timestamptz | Hết hạn sau 15 phút |
| `sepay_transaction_id` | bigint | ID giao dịch từ SEPAY (UNIQUE, chống duplicate) |

### Table: `subscriptions`
Mỗi `tenant` có 1 row, quản lý `plan_id` hiện tại và thời hạn truy cập (`current_period_start`, `current_period_end`). Khi webhook Fulfillment chạy thành công, thời hạn sẽ được **cộng dồn** từ ngày cuối kỳ hiện tại (không bị cắt giữa chừng).

---

## 3. Cấu hình SEPAY.io — Regex nhận dạng giao dịch

Trên trang admin [SEPAY.io](https://sepay.io), cấu hình **Pattern** để nhận dạng giao dịch ONI:

| Trường | Giá trị |
|--------|---------|
| **Tiền tố** | `ONI` (2–5 ký tự) |
| **Hậu tố — Từ** | 6 ký tự |
| **Hậu tố — Đến** | 12 ký tự |
| **Hậu tố — Là** | Số và chữ |

**Ví dụ nhận dạng:** `ONIA1A1A1A1A1`

Regex tương ứng trong Edge Function: `/ONI[A-Z0-9]{6,12}/i`

---

## 4. Các Edge Functions

| Function | Mô tả |
|----------|-------|
| `create-sepay-order` | Tạo đơn hàng, sinh `reference_code`, trả về QR URL + thông tin ngân hàng |
| `sepay-webhook` | Nhận webhook từ SEPAY, fulfillment, kích hoạt plan |
| `check-sepay-order` | Frontend poll mỗi 3s để kiểm tra trạng thái đơn |

---

## 5. Triển khai (Deploy)

### Bước 1 — Cài Supabase CLI & link project
```bash
npm install -g supabase
supabase login
supabase link --project-ref ddkjsthxnskdncefnuhi
```

### Bước 2 — Set Secrets
```bash
# Bắt buộc
supabase secrets set SEPAY_WEBHOOK_API_KEY=<lấy từ trang admin SEPAY.io>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<lấy từ Supabase Dashboard → Settings → API>

# Thông tin tài khoản ngân hàng nhận tiền
supabase secrets set SEPAY_BANK_CODE=MB          # Mã ngân hàng VietQR (MB, VCB, TCB, ACB...)
supabase secrets set SEPAY_ACCOUNT_NUMBER=<số tài khoản>
supabase secrets set SEPAY_ACCOUNT_NAME=<tên chủ tài khoản>
supabase secrets set SEPAY_BANK_NAME=MBBank      # Tên hiển thị cho frontend

# Tuỳ chọn — Email xác nhận sau thanh toán
supabase secrets set RESEND_API_KEY=<lấy từ resend.com>
supabase secrets set ONI_FROM_EMAIL=noreply@oni.vn
supabase secrets set ONI_APP_URL=https://oni.vn
```

> **Lưu ý:** `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` được Supabase tự inject vào môi trường Edge Functions — không cần set thủ công nếu dùng `supabase secrets set`.

### Bước 3 — Deploy Functions
```bash
# JWT disable trong config.toml (verify_jwt = false) — không cần --no-verify-jwt nữa
supabase functions deploy create-sepay-order
supabase functions deploy check-sepay-order
supabase functions deploy sepay-webhook
```

### Bước 4 — Chạy Migration
```bash
supabase db push
```

### Bước 5 — Cấu hình SEPAY Webhook URL
Trên [SEPAY.io](https://sepay.io) → Settings → Webhook, nhập URL:
```
https://ddkjsthxnskdncefnuhi.supabase.co/functions/v1/sepay-webhook
```
Và cấu hình **API Key** khớp với `SEPAY_WEBHOOK_API_KEY` đã set.

---

## 6. Biến môi trường Frontend (Next.js)

```env
NEXT_PUBLIC_SUPABASE_URL=https://ddkjsthxnskdncefnuhi.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key từ Supabase Dashboard>
```

---

## 7. URL QR động (VietQR)

```
https://img.vietqr.io/image/[BANK_CODE]-[ACCOUNT_NUMBER]-compact2.png
  ?amount=[SỐ_TIỀN]
  &addInfo=[REFERENCE_CODE]
  &accountName=[TÊN_CHỦ_TK]
```

**Ví dụ:**
```
https://img.vietqr.io/image/MB-0123456789-compact2.png?amount=990000&addInfo=ONIAB12CD34&accountName=ONI%20SAAS%20TECH
```
