# Post to Room (Charge to Room) — Workflow & Architecture

> **Author**: AI-assisted design  
> **Date**: 2026-06-03  
> **Status**: Draft — Pending implementation  
> **Related**: [HOSPITALITY_MODULE.md](./HOSPITALITY_MODULE.md), [GROUP_BOOKING_BILL_SPLITTING.md](./GROUP_BOOKING_BILL_SPLITTING.md)

---

## 1. Tổng quan

**Post to Room** (hay Charge to Room) là nghiệp vụ cho phép khách lưu trú ghi nợ chi phí từ các outlet khác (nhà hàng, spa, sân thể thao, giặt ủi...) vào **folio phòng**, thanh toán tổng khi checkout.

Trong ONI, các outlet này có thể là **shop riêng biệt** trong cùng tenant (cross-shop posting), vì một chuỗi hospitality có nhiều loại dịch vụ với industry type khác nhau (`lodging`, `fnb`, `service_hourly`, `sports_court`...) — không thể gộp tất cả vào 1 shop.

### Hai phương thức thanh toán tại outlet

| Phương thức | Mô tả | Khi nào dùng |
|---|---|---|
| **Direct Payment** | Thanh toán trực tiếp tại outlet (tiền mặt, thẻ, QR) | Walk-in guest, khách muốn tách hóa đơn |
| **Post to Room** | Ghi nợ vào folio phòng, thanh toán tổng khi checkout | In-house guest muốn gộp chi phí |

---

## 2. Folio vs Order

### Order (Đơn hàng) — Cái ONI đang có

**Order** là một giao dịch bán hàng tại **1 thời điểm**, tại **1 outlet/shop**:

```
Order #R-042 (Nhà hàng, 12:30 PM)
├── 1x Phở bò          85,000đ
├── 2x Bia Tiger       60,000đ
├── 1x Cà phê sữa     35,000đ
└── Total:            180,000đ
    Status: completed
    Payment: cash
```

### Folio (Bảng kê lưu trú) — Entity mới

**Folio** là bảng tổng hợp **toàn bộ chi phí** của một lượt lưu trú, xuyên suốt từ check-in đến check-out, xuyên qua nhiều shop/outlet:

```
Folio #F-2026-0203 (Room 203, Nguyễn Văn A)
Check-in: 01/06 14:00 → Check-out: 03/06 12:00 (2 đêm)

┌─────────────────────────────────────────────────────────────┐
│ Ngày       │ Mô tả                       │ Charge    │Credit│
├─────────────────────────────────────────────────────────────┤
│ 01/06      │ Room Charge (Deluxe)        │ 1,200,000 │      │
│ 01/06      │ Deposit received            │           │500,000│
│ 01/06 19:00│ F&B - Nhà hàng (R-042)     │   180,000 │      │
│ 01/06 21:00│ Minibar (2x Coca, 1x Beer) │    95,000 │      │
│ 02/06      │ Room Charge (Deluxe)        │ 1,200,000 │      │
│ 02/06 07:00│ Breakfast (2 pax)           │     FREE  │      │ ← Complimentary
│ 02/06 10:00│ Spa - 60min massage         │     FREE  │      │ ← Complimentary
│ 02/06 12:00│ Laundry (3 items)           │   150,000 │      │
│ 02/06 19:30│ F&B - Nhà hàng (R-058)     │   320,000 │      │
├─────────────────────────────────────────────────────────────┤
│            │ Total Charges               │ 3,145,000 │      │
│            │ Complimentary               │  (385,000)│      │
│            │ Deposit                     │           │500,000│
│            │ BALANCE DUE                 │ 2,260,000 │      │
└─────────────────────────────────────────────────────────────┘
```

### So sánh

| Khía cạnh | Order | Folio |
|---|---|---|
| **Phạm vi** | 1 giao dịch, 1 thời điểm | Toàn bộ lượt lưu trú (nhiều ngày) |
| **Shop** | Thuộc 1 shop | Xuyên nhiều shop/outlet |
| **Nội dung** | Items + payment | Charges + credits từ nhiều nguồn |
| **Vòng đời** | Tạo → hoàn thành trong phiên | Tạo khi check-in → đóng khi check-out |
| **Thanh toán** | Thanh toán ngay hoặc nợ | Tích lũy → thanh toán tổng khi checkout |

> **Kết luận**: Order phù hợp cho giao dịch bán hàng thông thường. Folio là lớp aggregation phía trên, tổng hợp nhiều orders/charges từ nhiều nguồn. Không thay thế order — thêm folio như entity mới.

---

## 3. Xác minh danh tính khách

### Bài toán

Khách tại nhà hàng nói "Charge to Room 203". Làm sao biết đó là sự thật? Có thể nhầm phòng, phòng khác, hoặc cố tình gian lận.

### Giải pháp ONI: Xác minh bằng SĐT khách

Vì ONI phục vụ SMB (không có key card reader), xác minh dựa vào:

1. **Số điện thoại khách** — customer đã shared trong tenant (`share_customers = true`), nhân viên nhập SĐT → hệ thống check khớp với guest đăng ký phòng
2. **Tên khách** — hệ thống hiển thị tên guest, nhân viên confirm miệng
3. **Staff override** — manager có thể bypass khi khách quen mặt

### Flow xác minh

```
Khách tại Nhà hàng: "Charge to Room 203"
        ↓
NV nhà hàng: Nhấn "Post to Room" trên POS
        ↓
POS hiển thị danh sách phòng đang occupied
        ↓
NV chọn Room 203 → Hệ thống hiện: "Guest: Nguyễn Văn A"
        ↓
NV hỏi khách xác nhận tên
        ↓
NV nhập SĐT khách nói (hoặc 4 số cuối)
        ↓
Hệ thống check SĐT khớp với customer trên folio
        ↓
  ✅ Khớp → Kiểm tra entitlements & posting rules
  ❌ Không khớp → Reject, đề nghị thanh toán trực tiếp
        ↓
POST charge vào folio Room 203
        ↓
🔔 Front Desk nhận notification
```

---

## 4. Complimentary Services (Dịch vụ miễn phí theo phòng)

### Bài toán

Khách ở phòng Deluxe được miễn phí ăn sáng, spa, gym. Khách walk-in phải trả tiền. Hệ thống phân biệt thế nào?

### Giải pháp: Rate Plan + Entitlements

**Rate Plan** = gói giá phòng, định nghĩa quyền lợi kèm theo:

```
Rate Plan: "Deluxe Package"
├── Room: Deluxe Room — 1,500,000đ/đêm
└── Entitlements (quyền lợi):
    ├── Breakfast: 2 pax/ngày (tại shop F&B)
    ├── Spa: 1 session 60min/stay (tại shop Spa)
    ├── Gym: Unlimited (tại shop Sports)
    └── Pickleball: 1 session/ngày (tại shop Sports)

Rate Plan: "Standard Room"
├── Room: Standard Room — 800,000đ/đêm
└── Entitlements: Không có
```

Khi check-in → hệ thống tạo `room_entitlements` records từ rate plan template.

### Các loại Entitlement

| Loại | Quota | Ví dụ | Reset |
|---|---|---|---|
| **Per-day, per-pax** | N pax/ngày | Breakfast 2 pax/day | Mỗi ngày |
| **Per-stay** | N lần/lượt ở | Spa 1 session/stay | Không |
| **Unlimited** | Không giới hạn | Gym, Pool | Chỉ verify guest |
| **Per-day, counted** | N lượt/ngày | Pickleball 1/day | Mỗi ngày |
| **Value-based** | Số tiền | F&B credit 200,000đ/day | Mỗi ngày |

### Flow tại outlet

```
Khách đến outlet (Nhà hàng / Spa / Sân)
        ↓
Khách có phòng trong hệ thống?
  ├── KHÔNG (Walk-in) → Thanh toán bình thường
  └── CÓ (In-house Guest) → Kiểm tra entitlement
        ↓
Dịch vụ này có entitlement?
  ├── KHÔNG → Chọn: Direct Payment hoặc Post to Room
  └── CÓ → Kiểm tra quota
        ↓
Còn quota hôm nay?
  ├── HẾT → "Đã dùng hết suất miễn phí. Tính tiền hoặc charge to room?"
  └── CÒN → ✅ FREE — Ghi nhận usage, không charge tiền
```

### Rate Plan configuration

Phase 1: cấu hình trong `products.metadata` của room type:

```json
{
  "rate_plan": {
    "name": "Deluxe Package",
    "entitlements": [
      {
        "service_type": "breakfast",
        "quota_type": "per_day_per_pax",
        "pax_included": 2,
        "retail_price": 150000,
        "applicable_shop_industries": ["fnb"]
      },
      {
        "service_type": "spa",
        "quota_type": "per_stay",
        "quota_per_stay": 1,
        "retail_price": 500000,
        "applicable_shop_industries": ["service_hourly"]
      },
      {
        "service_type": "gym",
        "quota_type": "unlimited",
        "retail_price": 0,
        "applicable_shop_industries": ["sports_court"]
      }
    ]
  }
}
```

Phase 2 (tương lai): table `rate_plans` riêng để hỗ trợ nhiều rate plan cho cùng room type (ví dụ "Deluxe Room Only" vs "Deluxe All-inclusive").

---

## 5. Cross-shop Architecture

### Tenant multi-shop structure

```
Tenant: Sunrise Hospitality (share_customers = true)
├── Shop A — Khách sạn (lodging)     → quản lý phòng, folio
├── Shop B — Nhà hàng (fnb)          → POS ăn uống
├── Shop C — Spa (service_hourly)    → dịch vụ spa
└── Shop D — Sân thể thao (sports_court) → pickleball, gym
```

Mỗi shop có staff, menu, ca làm, kho hàng riêng. `share_customers = true` cho phép lookup guest cross-shop.

### Cross-shop posting flow

```
Shop B (Nhà hàng)                    Shop A (Khách sạn)
┌──────────────────┐                ┌──────────────────┐
│ Order #R-042     │                │ Room 203         │
│ Phở + Bia        │   POST CHARGE  │ Folio #F-203     │
│ 350,000đ         │ ─────────────→ │ + F&B: 350,000đ  │
│                  │                │                  │
│ verify: SĐT OK  │                │ 🔔 FD notified   │
└──────────────────┘                └──────────────────┘
        ↑                                    ↑
        └──── Shared Customer (same tenant) ──┘
```

### API Endpoints

```
# Lookup active rooms across tenant (từ bất kỳ shop nào)
GET /api/tenant/{tenantId}/active-folios
→ Returns: rooms + guest name + SĐT (masked) + entitlements summary

# Verify guest bằng SĐT
POST /api/tenant/{tenantId}/folios/{folioId}/verify
Body: { "phone": "0912345789" }
→ Returns: { "verified": true, "guest_name": "...", "entitlements": [...] }

# Post charge to folio
POST /api/tenant/{tenantId}/folios/{folioId}/charges
Body: {
  "source_shop_id": "shop-B-id",
  "source_order_id": "order-R-042",
  "charge_category": "fnb",
  "amount": 350000,
  "is_complimentary": false,
  "items": [{ "name": "Phở bò", "qty": 1, "price": 85000 }, ...]
}

# Use entitlement (complimentary service)
POST /api/tenant/{tenantId}/folios/{folioId}/entitlements/{id}/use
Body: {
  "source_shop_id": "shop-C-id",
  "quantity": 1,
  "usage_date": "2026-06-02"
}

# Folio detail (for checkout / review)
GET /api/tenant/{tenantId}/folios/{folioId}
→ Returns: full folio with charges grouped by category
```

---

## 6. Database Schema

### 6.1 `folios` — Bảng kê lưu trú

```sql
CREATE TABLE folios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_no      VARCHAR NOT NULL,           -- F-2026-0203
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  shop_id       UUID NOT NULL REFERENCES shops(id),  -- Shop khách sạn (lodging)
  order_id      UUID REFERENCES orders(id),           -- Room occupation order
  customer_id   UUID REFERENCES customers(id),
  resource_id   UUID REFERENCES location_resources(id), -- Room
  reservation_id UUID REFERENCES reservations(id),

  guest_name    VARCHAR NOT NULL,
  guest_phone   VARCHAR,                    -- Dùng để xác minh cross-shop

  checked_in_at  TIMESTAMPTZ NOT NULL,
  checked_out_at TIMESTAMPTZ,

  rate_plan      VARCHAR,                   -- "Deluxe Package", "Standard"

  total_charges       DECIMAL DEFAULT 0,
  total_credits       DECIMAL DEFAULT 0,    -- deposits + partial payments
  total_complimentary DECIMAL DEFAULT 0,    -- tổng giá trị miễn phí
  balance_due         DECIMAL DEFAULT 0,    -- charges - credits

  status        VARCHAR DEFAULT 'open',     -- open | settled | void
  posting_rules JSONB,                      -- credit_limit, allowed_types, etc.

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2 `folio_charges` — Chi phí ghi vào folio

```sql
CREATE TABLE folio_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id        UUID NOT NULL REFERENCES folios(id),
  source_order_id UUID REFERENCES orders(id),   -- Order gốc tại outlet
  source_shop_id  UUID REFERENCES shops(id),     -- Shop nguồn (nhà hàng, spa...)

  charge_category VARCHAR NOT NULL,              -- room | fnb | minibar | spa | laundry | gym | other
  description     TEXT,
  amount          DECIMAL NOT NULL DEFAULT 0,    -- 0 nếu complimentary
  is_complimentary BOOLEAN DEFAULT FALSE,

  entitlement_id  UUID REFERENCES room_entitlements(id), -- nếu dùng entitlement

  status          VARCHAR DEFAULT 'confirmed',   -- pending | confirmed | rejected | settled | void
  verified_method VARCHAR,                       -- phone | name | staff_override
  posted_by       UUID,                          -- Staff thực hiện post
  confirmed_by    UUID,                          -- FD staff xác nhận (nullable)
  posted_at       TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,

  source_items    JSONB,                         -- Snapshot items gốc

  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.3 `room_entitlements` — Quyền lợi theo phòng

```sql
CREATE TABLE room_entitlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id        UUID NOT NULL REFERENCES folios(id),

  service_type    VARCHAR NOT NULL,             -- breakfast | spa | gym | pickleball | fnb_credit
  quota_type      VARCHAR NOT NULL,             -- per_day_per_pax | per_stay | unlimited | value_based
  quota_per_day   INTEGER,                      -- số lượt/ngày (nullable)
  quota_per_stay  INTEGER,                      -- số lượt/lượt ở (nullable)
  pax_included    INTEGER,                      -- số người (nullable)
  value_amount    DECIMAL,                      -- giá trị tiền cho value_based (nullable)
  value_used      DECIMAL DEFAULT 0,            -- đã dùng bao nhiêu
  retail_price    DECIMAL DEFAULT 0,            -- giá walk-in (để tính complimentary value)

  is_active       BOOLEAN DEFAULT TRUE,
  applicable_shops JSONB,                       -- shop IDs hoặc null = all shops in tenant

  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.4 `entitlement_usage` — Tracking sử dụng

```sql
CREATE TABLE entitlement_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id    UUID NOT NULL REFERENCES room_entitlements(id),
  folio_charge_id   UUID REFERENCES folio_charges(id),

  usage_date        DATE NOT NULL,
  quantity_used     INTEGER DEFAULT 1,
  value_used        DECIMAL DEFAULT 0,          -- cho value_based

  consumed_at_shop_id UUID REFERENCES shops(id),
  recorded_by       UUID,                       -- Staff ghi nhận
  used_at           TIMESTAMPTZ DEFAULT NOW()
);
```

### Entity Relationship

```
orders ──┐
         ├──→ folios ──→ folio_charges ←── orders (source, cross-shop)
         │       │
reservations ──┘ └──→ room_entitlements ──→ entitlement_usage
                           ↑
                    products.metadata
                    (rate plan template)
```

---

## 7. Folio hiển thị khi checkout

Các hệ thống lớn (Opera, Cloudbeds, Mews) đều **group by category**:

```
┌─────────────────────────────────────────────────────────┐
│  FOLIO #F-2026-0203                                     │
│  Guest: Nguyễn Văn A | Room 203 (Deluxe Package)       │
│  01/06/2026 14:00 → 03/06/2026 12:00 (2 đêm)          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🏨 LƯU TRÚ                                            │
│  ├── 01/06  Room Charge (Deluxe)       1,200,000       │
│  ├── 02/06  Room Charge (Deluxe)       1,200,000       │
│  └── Subtotal                          2,400,000       │
│                                                         │
│  🍽️ ĂN UỐNG (F&B)                                     │
│  ├── 01/06  Breakfast (2 pax)            FREE ✨        │
│  ├── 01/06  Dinner - Nhà hàng           180,000        │
│  ├── 02/06  Breakfast (2 pax)            FREE ✨        │
│  ├── 02/06  Dinner - Nhà hàng           320,000        │
│  └── Subtotal                           500,000        │
│                                                         │
│  🧴 MINIBAR                                            │
│  ├── 01/06  2x Coca, 1x Heineken        95,000         │
│  └── Subtotal                            95,000        │
│                                                         │
│  💆 SPA & WELLNESS                                     │
│  ├── 02/06  60min Massage                FREE ✨        │
│  └── Subtotal                                0         │
│                                                         │
│  👕 GIẶT ỦI                                            │
│  ├── 02/06  Laundry (3 items)           150,000        │
│  └── Subtotal                           150,000        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  TOTAL CHARGES                        3,145,000        │
│  Complimentary Services                (385,000)  ✨   │
│  Deposit Paid                          (500,000)       │
│  ────────────────────────────────────────────           │
│  BALANCE DUE                          2,260,000        │
└─────────────────────────────────────────────────────────┘
```

Lý do group by category:
- Khách dễ review chi phí
- Kế toán dễ hạch toán (tách doanh thu theo bộ phận — đúng yêu cầu FC Huyền)
- Phục vụ routing cho đoàn/công ty (room charge → cty trả, minibar → cá nhân trả)

---

## 8. Phân kỳ triển khai

### Phase 1: Core Folio + Post to Room
- [ ] Schema: `folios`, `folio_charges` tables
- [ ] Folio auto-creation khi check-in
- [ ] Room charges (tiền phòng) tự động post vào folio
- [ ] Post to Room từ POS (cùng shop hoặc cross-shop)
- [ ] Xác minh bằng SĐT khách
- [ ] Folio viewer trong Room detail / Checkout
- [ ] Front Desk notification khi có charge mới
- [ ] Minibar charges → folio (thay vì trực tiếp vào order_items)

### Phase 2: Entitlements
- [ ] Schema: `room_entitlements`, `entitlement_usage` tables
- [ ] Rate Plan config trong product metadata
- [ ] Entitlement creation khi check-in
- [ ] Entitlement verification tại outlet POS
- [ ] Complimentary charge (amount = 0) tracking
- [ ] Quota checking (per-day, per-stay, unlimited, value-based)

### Phase 3: Advanced Controls
- [ ] Credit limit enforcement per folio
- [ ] Posting rules per room / per group booking
- [ ] Charge type restrictions
- [ ] FD approval workflow (require_fd_confirmation)
- [ ] Charge void / dispute flow
- [ ] Rate plans table riêng (nhiều rate plan cho cùng room type)
- [ ] Folio transfer (chuyển charge giữa các phòng)
- [ ] Company routing (split company vs personal charges)
