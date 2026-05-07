# Tenant Users — Thiết kế & Implementation

## Tổng quan

Mỗi tenant (workspace) có user riêng biệt. Tenant user được tạo bởi owner/admin của workspace,
không cần email thật — chỉ cần username + password.

Về kỹ thuật, hệ thống dùng chung `auth.users` của Supabase nhưng với **fake email** theo format:

```
username@[tenant-slug].oni.vn
```

Ví dụ: `john@laking.oni.vn`, `cashier01@laking.oni.vn`

---

## Quy tắc cứng

| Rule | Detail |
|---|---|
| Fake email domain | `*@[tenant-slug].oni.vn` — không nhận email thật |
| `email_confirm: true` | Bypass email verification khi tạo user |
| Tenant slug immutable | Đổi slug sẽ làm hỏng toàn bộ fake email của tenant đó |
| Username unique per tenant | `UNIQUE(tenant_id, username)` ở `tenant_user_profiles` |
| Block public registration | Cấm tạo email `*@*.oni.vn` qua `/api/register` |
| Password reset | Owner/admin reset thay cho user — không có self-service email flow |

---

## Database

### `tenant_user_profiles`

```sql
tenant_user_profiles (
  id           uuid  PRIMARY KEY
  user_id      uuid  REFERENCES auth.users(id) ON DELETE CASCADE
  tenant_id    uuid  REFERENCES tenants(id) ON DELETE CASCADE
  username     text  CHECK (username ~ '^[a-z0-9_]{3,30}$')
  display_name text
  created_at   timestamptz

  UNIQUE(tenant_id, username)
  UNIQUE(user_id, tenant_id)
)
```

Username format: chữ thường, số, dấu gạch dưới, 3–30 ký tự.

### Membership

- Tenant-scoped (admin/staff): record trong `user_tenants`
- Shop-scoped (staff tại 1 chi nhánh): record trong `user_shops`, **không** có `user_tenants`

---

## API

### Tạo user

```
POST /api/tenants/[tenantId]/users
Authorization: session cookie (caller phải là owner/admin)

Body:
{
  "username": "john",
  "password": "password123",
  "display_name": "Nguyễn Văn A",   // optional
  "role": "staff",                   // admin | staff | viewer
  "shop_id": "uuid",                 // optional — nếu có thì shop-scoped
  "tenant_slug": "laking"            // dùng để build fake email
}

Response 201:
{
  "ok": true,
  "user": { "userId": "...", "email": "john@laking.oni.vn", "username": "john" }
}
```

### Danh sách user

```
GET /api/tenants/[tenantId]/users
Authorization: session cookie (phải có users.view permission)

Response 200:
{
  "users": [
    {
      "id": "...",
      "user_id": "...",
      "username": "john",
      "display_name": "Nguyễn Văn A",
      "created_at": "...",
      "role": { "code": "staff", "name": "Staff" }
    }
  ]
}
```

### Xóa user

```
DELETE /api/tenants/[tenantId]/users/[userId]
Authorization: session cookie (phải có users.remove permission)
```

Xóa `auth.users` record → cascade xóa `tenant_user_profiles` + `user_tenants`/`user_shops`.

### Reset mật khẩu

```
PATCH /api/tenants/[tenantId]/users/[userId]
Authorization: session cookie (phải có users.invite permission)

Body: { "password": "newpassword123" }
```

---

## Server helpers

File: `apps/web/lib/server/tenantUsers.ts`

| Function | Mô tả |
|---|---|
| `buildFakeEmail(username, tenantSlug)` | Build fake email |
| `parseFakeEmail(email)` | Extract username + tenantSlug từ fake email |
| `createTenantUser(params)` | Tạo auth user + profile + membership, rollback nếu lỗi |
| `listTenantUsers(tenantId)` | List users + role |
| `deleteTenantUser(userId, tenantId)` | Xóa auth user (verify ownership trước) |
| `resetTenantUserPassword(userId, tenantId, password)` | Admin reset password |

---

## Login Flow

### Từ tenant subdomain (`laking.oni.vn/login`)

```
User nhập "john"              → username → construct john@laking.oni.vn
User nhập "john@gmail.com"    → email đầy đủ → dùng thẳng
User nhập "john@laking.oni.vn" → fake email → dùng thẳng
```

Form gửi `{ identifier, password, tenant_slug: "laking" }`.
API tự resolve nếu `identifier` không chứa `@`.

### Từ main domain (`oni.vn/auth/signin`)

```
User nhập "john"              → ERROR: hướng dẫn dùng workspace URL
User nhập "john@gmail.com"    → authenticate bình thường (owner)
User nhập "john@laking.oni.vn" → authenticate bình thường
```

Main domain chỉ dành cho owner/superadmin. Tenant staff được hướng dẫn dùng subdomain.

### API: `POST /api/auth/signin`

```typescript
// identifier = username hoặc email
// tenant_slug = từ subdomain context (chỉ cần khi identifier là username)

const isEmail = identifier.includes('@');
const email = isEmail
  ? identifier
  : buildFakeEmail(identifier, tenant_slug); // yêu cầu tenant_slug

await supabase.auth.signInWithPassword({ email, password });
```

---

## Plan Limits

`plans.metadata.max_users` kiểm soát số lượng user trong tenant:
- `plan_mini`: max 3 users
- `plan_pro`: max 20 users
- `plan_enterprise`: unlimited (-1)

Limit check: đếm `user_tenants` rows trước khi tạo user mới.

---

## Lưu ý bảo mật

- Fake email `*@[tenant].oni.vn` không gửi được email thật → password reset chỉ qua admin
- Public `/api/register` phải block tất cả email có pattern `*@*.oni.vn`
- `email_confirm: true` khi tạo → bypass Supabase email verification
- Tạo user luôn qua `service_role` (admin client) — không qua RLS
- Nếu insert profile/membership thất bại → rollback xóa auth user để tránh orphan accounts
