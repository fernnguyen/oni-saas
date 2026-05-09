# Plan Limits — Kiến trúc & Flow

## Tổng quan

Hệ thống limit được thiết kế theo mô hình **action-based dynamic**: mỗi hành động tạo tài nguyên có một _action key_, giới hạn được khai báo trong `plans.metadata` trên DB. Khi một key xuất hiện trong metadata của gói, hệ thống tự động enforce limit đó — không cần thêm code mới vào infrastructure.

---

## Kiến trúc

```
plans.metadata (DB)
  └─ { "create_shop": 1, "create_shop_user": 3, "create_connector": 1, ... }
           │
           ▼
  getTenantPlanMeta(tenantId)          ← lib/server/subscriptions.ts
           │  trả Record<string, number>
           ▼
  enforceLimit(action, context, tenantId)   ← lib/server/planLimits.ts
           │  tra cứu meta[action], gọi ACTION_REGISTRY[action].count()
           │
     ┌─────┴──────┐
     │ at limit   │ not limited
     ▼            ▼
PlanLimitError   return (no-op)
     │
     ▼
planLimitResponse()  →  HTTP 402  { error: "plan_limit_exceeded", action, current, limit, message }
```

---

## Các thành phần

### `plans.metadata` (PostgreSQL JSONB)

Free-form map: **action key → max count**

| Giá trị | Ý nghĩa |
|---------|---------|
| `N > 0` | Tối đa N tài nguyên |
| `-1`    | Không giới hạn |
| `0`     | Chặn hoàn toàn |

Ví dụ metadata của gói **Khởi đầu**:
```json
{
  "create_shop":      1,
  "create_shop_user": 3,
  "create_connector": 1,
  "create_domain":    0
}
```

Nếu một key **không có trong metadata**, action đó **không bị giới hạn** (mặc định unlimited).

---

### `ACTION_REGISTRY` — `lib/server/planLimits.ts`

Registry ánh xạ action key → cách đếm usage hiện tại:

```ts
export const ACTION_REGISTRY: Record<string, ActionDef> = {
  create_shop:      { label: 'chi nhánh',        count: ({ tenantId }) => ... },
  create_shop_user: { label: 'người dùng',        count: ({ tenantId }) => ... },
  create_connector: { label: 'kết nối dữ liệu',  count: ({ shopId })   => ... },
  create_domain:    { label: 'domain tùy chỉnh', count: ({ shopId })   => ... },
};
```

`LimitContext` chứa `tenantId` và/hoặc `shopId` tuỳ theo scope của action.

---

### `enforceLimit(action, context, tenantId)` — core function

```ts
await enforceLimit('create_shop', { tenantId }, tenantId);
```

Flow nội bộ:
1. Đọc `plans.metadata` từ DB qua `getTenantPlanMeta(tenantId)`
2. Tra `meta[action]` — nếu `undefined` hoặc `-1`: return (no-op)
3. Gọi `ACTION_REGISTRY[action].count(context)` để lấy count hiện tại
4. Nếu `current >= limit`: throw `PlanLimitError(action, current, limit)`

---

### `getLimitStatus(action, context, tenantId)` — cho UI

Trả `{ current, limit, atLimit }` hoặc `null` (nếu action không được limit).

Dùng trong API endpoint để trả thêm thông tin cho client render trạng thái usage.

---

## HTTP Response khi đạt limit

**Status: 402 Payment Required**

```json
{
  "error": "plan_limit_exceeded",
  "action": "create_shop",
  "current": 1,
  "limit": 1,
  "message": "Đã đạt giới hạn chi nhánh của gói hiện tại (1/1). Vui lòng nâng cấp gói để tiếp tục."
}
```

---

## Action keys hiện có

| Action key         | Scope    | Bảng đếm               | Route áp dụng |
|--------------------|----------|------------------------|---------------|
| `create_shop`      | tenant   | `shops`                | `POST /api/shops` |
| `create_shop_user` | tenant   | `tenant_user_profiles` | `POST /api/tenants/[id]/users` |
| `create_connector` | shop     | `connectors`           | `POST /api/connectors/google-sheets/connect` |
| `create_domain`    | shop     | `domains`              | `POST /api/domains` _(chưa implement)_ |

---

## Cách thêm limit mới

### Ví dụ: giới hạn số lượng sản phẩm (`create_product: 500`)

**Bước 1 — Đăng ký action** trong `lib/server/planLimits.ts`:

```ts
export const ACTION_REGISTRY = {
  // ... existing ...
  create_product: {
    label: 'sản phẩm',
    count: ({ shopId }) => countRows('products', 'shop_id', shopId!),
  },
};
```

**Bước 2 — Migration** cập nhật metadata của các gói cần giới hạn:

```sql
-- supabase/migrations/YYYYMMDDXXXXXX_add_product_limit.sql
update public.plans
set metadata = metadata || '{"create_product": 500}'::jsonb
where code = 'plan_mini';

update public.plans
set metadata = metadata || '{"create_product": -1}'::jsonb
where code in ('plan_pro', 'plan_enterprise');
```

Gói không cần giới hạn: **không cần update** — key vắng mặt = unlimited.

**Bước 3 — Gọi `enforceLimit`** trong API route:

```ts
// app/api/shops/[shopId]/products/route.ts
import { enforceLimit, isPlanLimitError, planLimitResponse } from '@/lib/server/planLimits';

export async function POST(req, { params }) {
  // ... auth, validation ...

  try {
    await enforceLimit('create_product', { shopId }, tenantId);
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  // ... tạo product ...
}
```

**Không cần thay đổi gì khác** — `PlanLimitError`, `planLimitResponse`, error format đều được tái sử dụng.

---

## UI — Hiển thị trạng thái limit

### Trong API endpoint (Server)

```ts
// GET /api/branches trả kèm limit status
const limit = await getLimitStatus('create_shop', { tenantId }, tenantId);
// → { current: 1, limit: 1, atLimit: true } hoặc null
return NextResponse.json({ branches, limit });
```

### Trong component (Client)

`BranchSelector` đọc `limit` từ response và render:
- `atLimit: false` → nút "Thêm chi nhánh mới (X/Y)"
- `atLimit: true` → cảnh báo amber "Đã đạt giới hạn (X/Y) — Nâng cấp gói"
- `limit: null` → nút tạo bình thường, không hiển thị usage

---

## Lớp bảo vệ

Có **hai lớp** kiểm tra để đảm bảo tính toàn vẹn:

| Lớp | Nơi | Mục đích |
|-----|-----|----------|
| **App-level** | `enforceLimit()` trong API route | Response chuẩn 402, message tiếng Việt, dừng trước khi gọi DB |
| **DB-level** | PL/pgSQL function `create_shop()` | Backstop — bắt race condition, rollback transaction nếu bypass app |

DB-level raise exception với format `plan_limit_exceeded:action:current:max` để dễ parse nếu cần.

---

## Ghi chú quan trọng

- **Không cần restart server** khi thay đổi metadata trên DB — `getTenantPlanMeta` query mỗi request.
- **Race condition**: App-level check + DB-level check cùng tồn tại nên concurrent requests không thể bypass limit.
- **Superadmin** không bị ảnh hưởng — các route `/super/*` không gọi `enforceLimit`.
- **`limit: -1`** luôn bỏ qua, ngay cả khi key có trong metadata.
