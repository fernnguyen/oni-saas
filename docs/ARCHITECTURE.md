# ONI.vn — Kiến trúc hệ thống

> **Version**: 2.0 — Workspace-first model  
> **Cập nhật lần cuối**: 2026-05-07  
> **Trạng thái**: Phase 1 đang triển khai

---

## Mục lục

1. [Tổng quan mô hình](#1-tổng-quan-mô-hình)
2. [Data Model](#2-data-model)
3. [URL Routing](#3-url-routing)
4. [Authentication & Session](#4-authentication--session)
5. [Permission System (RBAC)](#5-permission-system-rbac)
6. [Registration Flow](#6-registration-flow)
7. [Superadmin /super](#7-superadmin-super)
8. [Development Checklist](#8-development-checklist)
9. [Debug Reference](#9-debug-reference)

---

## 1. Tổng quan mô hình

```
ONI Platform (oni.vn)
├── /register         ← Tạo workspace mới (Phase 1)
├── /super            ← Superadmin panel (Phase 3)
└── [slug].oni.vn     ← Workspace của từng doanh nghiệp (Phase 2)
    ├── /             ← Branch selector (nếu nhiều) hoặc redirect
    ├── /[branch]/    ← Dashboard nghiệp vụ chi nhánh
    └── /settings     ← Cài đặt workspace
```

### Phân tầng dữ liệu

```
User (auth.users)
  └── Tenant / Workspace  [1 user có thể thuộc nhiều tenant]
        ├── Subscription   [1 gói dịch vụ per tenant]
        ├── Feature Flags  [unlocked by plan]
        └── Shop / Branch  [1 tenant có thể có nhiều chi nhánh]
              ├── Connector  [nguồn dữ liệu: Google Sheet, DB...]
              └── Domain     [custom domain per branch - future]
```

### Nguyên tắc cốt lõi

| Nguyên tắc | Mô tả |
|-----------|-------|
| **Workspace = Tenant** | Mỗi doanh nghiệp đăng ký là 1 workspace độc lập với subdomain riêng |
| **Subdomain = Tenant slug** | `linhka.oni.vn` → tenant slug `linhka`, không phải branch slug |
| **Branch là bắt buộc** | Mọi nghiệp vụ gắn với branch. Single-location = 1 branch mặc định tự tạo khi register |
| **Isolation** | Tenant không thấy dữ liệu của nhau. RLS enforce ở DB layer |
| **Plan governs limits** | `max_shops`, `max_users`, `max_connectors_per_shop` nằm trong `plans.metadata` |

---

## 2. Data Model

### Sơ đồ quan hệ

```
auth.users (Supabase Auth)
    │
    ├──[user_tenants]──► tenants ──► subscriptions ──► plans
    │      role_id                        │
    │                                     └──► feature_flags
    │
    ├──[user_shops]──► shops ──── connector
    │     role_id         │
    │                     └────── domains
    │
    └── audit_logs
```

### Tables

#### `tenants` — Doanh nghiệp / Workspace
```sql
id         uuid  PK
name       text  -- "Cà Phê Minh"
slug       text  UNIQUE -- "ca-phe-minh" → ca-phe-minh.oni.vn
created_at timestamptz
updated_at timestamptz
```

#### `shops` — Chi nhánh / Branch
```sql
id         uuid  PK
tenant_id  uuid  FK → tenants
name       text  -- "Chi nhánh Quận 1"
slug       text  UNIQUE -- "ca-phe-minh-q1" (globally unique)
address    text
created_at timestamptz
updated_at timestamptz
```
> **Lưu ý**: `shops.slug` là globally unique (không phải unique trong tenant). Khi auto-create branch khi register, dùng cùng slug với tenant.

#### `user_tenants` — Phân quyền cấp Tenant
```sql
user_id    uuid FK → auth.users
tenant_id  uuid FK → tenants
role_id    int  FK → roles  (owner | admin)
is_default bool -- tenant mặc định khi login
```
> User có entry ở đây = truy cập được TẤT CẢ branch trong tenant đó.

#### `user_shops` — Phân quyền cấp Branch
```sql
user_id    uuid FK → auth.users
shop_id    uuid FK → shops
role_id    int  FK → roles  (staff | viewer)
```
> Dành cho nhân viên chỉ được vào 1 chi nhánh cụ thể. KHÔNG có entry trong `user_tenants`.

#### `subscriptions`
```sql
tenant_id            uuid  FK (unique)
plan_id              int   FK → plans
status               text  -- active | past_due | canceled
current_period_start timestamptz
current_period_end   timestamptz
trial_end            timestamptz
```

#### `plans`
```sql
code       text  -- plan_mini | plan_pro | plan_enterprise
name       text
is_default bool
metadata   jsonb -- { max_shops, max_users, max_connectors_per_shop, max_custom_domains }
```

**Giá trị mặc định:**
| Plan | max_shops | max_users | max_connectors | max_custom_domains |
|------|-----------|-----------|----------------|-------------------|
| Mini (Free) | 1 | 3 | 1 | 0 |
| Pro | 10 | 20 | 2 | 3 |
| Enterprise | ∞ | ∞ | ∞ | ∞ |

#### `roles`
| code | scope | Mô tả |
|------|-------|-------|
| `owner` | tenant | Toàn quyền, không giới hạn |
| `admin` | tenant | Hầu hết quyền, không xóa org |
| `staff` | shop | Nghiệp vụ cơ bản tại chi nhánh |
| `viewer` | shop | Chỉ xem |

---

## 3. URL Routing

### 3.1 Routing hiện tại (Phase 3 — đang dùng)

```
oni.vn/                    → Landing page (public)
oni.vn/register            → Tạo workspace mới (public)
oni.vn/auth/signin         → SUPERADMIN ONLY — đăng nhập superadmin
oni.vn/super               → Superadmin panel (Phase 3, đã triển khai)
oni.vn/super/dashboard     → Tổng quan hệ thống
oni.vn/super/tenants       → Danh sách tất cả tenant
oni.vn/super/tenants/[id]  → Chi tiết tenant (domain, plan, members, actions)
oni.vn/super/plans         → Quản lý gói dịch vụ
oni.vn/super/users         → Tìm kiếm user
oni.vn/super/audit-logs    → Nhật ký hệ thống

[slug].oni.vn/             → Middleware rewrite → /t/[slug]
[slug].oni.vn/auth/signin  → Workspace login (WorkspaceSignInForm)
[slug].oni.vn/[branch]/    → Dashboard chi nhánh
[slug].oni.vn/settings     → Cài đặt tenant
```

> **Quan trọng**: Main domain (`oni.vn`) chỉ dành cho superadmin. Tenant users phải truy cập qua subdomain riêng.

### 3.2 Access Control — Main Domain vs Subdomain

| Domain | Route | Ai được truy cập |
|--------|-------|-----------------|
| `oni.vn` | `/auth/signin` | Public (nhưng API reject non-superadmin) |
| `oni.vn` | `/register/*` | Public |
| `oni.vn` | `/super/*` | Superadmin (`app_metadata.role === 'super_admin'`) |
| `oni.vn` | Mọi route khác | Superadmin |
| `[slug].oni.vn` | `/auth/signin` | Public — phục vụ WorkspaceSignInForm |
| `[slug].oni.vn` | Mọi route khác | Tenant members |

### 3.3 Middleware logic (Phase 3)

```
middleware.ts — thứ tự xử lý:

1. Subdomain detected?
   YES → /api/* hoặc /_next/* → pass through (không rewrite — API routes dùng chung)
         /dashboard, /register, /super → redirect về main domain
         Mọi path khác → rewrite sang /t/[slug]/[path]
         (vd: /auth/signin → /t/[slug]/auth/signin)
   NO  → tiếp tục (main domain)

2. Main domain — /t/* direct access? → redirect /auth/signin

3. Main domain — isPublic path? (/auth, /api, /register, /)
   YES → pass through

4. Main domain — protected route → check superadmin role
   - Not logged in → redirect /auth/signin
   - Logged in, NOT superadmin → redirect /auth/signin?error=not_superadmin
   - Superadmin → allow
```

**Dev**: `NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000` → `linhka.localhost:3000` hoạt động như `linhka.oni.vn`

### 3.4 Signin flow

**Main domain** (`oni.vn/auth/signin`):
```
POST /api/auth/signin
  → signInWithPassword(email, password)
  → Check host header: is main domain?
      YES → check app_metadata.role === 'super_admin'
              superadmin → return { ok: true } → redirect /super/dashboard
              non-superadmin → signOut() + return 403 + { workspace_slug }
      NO (subdomain) → return { ok: true } → redirect /
```

**Subdomain** (`[slug].oni.vn/auth/signin`):
```
Middleware rewrites → /t/[slug]/auth/signin
→ WorkspaceSignInForm (tenant-branded UI)
→ POST /api/auth/signin (host = slug.oni.vn → NOT main domain → no superadmin check)
→ On success: redirect /
```

---

## 4. Authentication & Session

### Flow đăng nhập

```
1. User POST /api/auth/signin (email + password)
2. Supabase Auth → JWT stored in cookie (httpOnly, sameSite)
3. middleware.ts gọi supabase.auth.getUser() mỗi request để refresh cookie
4. Server pages dùng getSupabaseServerClient() → .auth.getUser()
5. Admin operations dùng getSupabaseAdminClient() (service_role key)
```

### Session helpers

| Function | Dùng khi | File |
|----------|----------|------|
| `getSupabaseServerClient()` | Server components, Route handlers | `lib/server/supabaseServer.ts` |
| `getSupabaseAdminClient()` | Admin ops, bypass RLS | `lib/server/supabaseAdmin.ts` |
| `getSupabaseBrowserClient()` | Client components | `lib/supabaseBrowser.ts` |
| `getSessionUserWithTenant()` | Layout/page cần user + tenant | `lib/server/auth.ts` |

### Sau khi đăng ký (Phase 1)

```
Register → API tạo user + tenant + branch → Email xác nhận (Supabase)
→ User click link xác nhận → redirect về /register/success?workspace=[slug]
→ Hiển thị màn hình "Workspace ready" với credentials
→ Nút "Open Workspace" → [slug].oni.vn/auth/signin
```

---

## 5. Permission System (RBAC)

### Cách hoạt động

```
getUserPermissions(userId, tenantId, shopId?)
  → gọi Supabase RPC get_user_permissions()
  → Trả về mảng permission codes: ['orders.view', 'products.create', ...]

Resolution order:
  1. user_tenants: role = owner → return ALL permissions
  2. user_tenants: role = admin/other → return role_permissions
  3. user_shops: role = staff/viewer → return shop-scoped permissions
```

### Sử dụng trong pages

```typescript
// Server page/layout
const permissions = await getUserPermissions(userId, tenantId, shopId);
// Truyền vào DashboardShell → Sidebar lọc nav items

// Check đơn lẻ
const allowed = await hasPermission(userId, tenantId, 'orders.create', shopId);
```

### Nav context

| `sidebarContext` | Dùng ở | Nav hiển thị |
|-----------------|--------|-------------|
| `'control'` | `/dashboard/*` | Tổng quan · Tổ chức · Kết nối · Billing · Phân quyền · Cài đặt |
| `'shop'` | `/s/[slug]/*` | Full nav nghiệp vụ (Đơn hàng, Sản phẩm, Kho...) |

---

## 6. Registration Flow

### Phase 1 (hiện tại đang build)

**Trước (3 bước rời):**
```
/auth/signup → email + password
/onboarding/step-1 → tên tổ chức + slug
/onboarding/step-2 → tên chi nhánh + slug
/onboarding/step-3 → kết nối Google Sheet
```

**Sau (1 form "Create workspace"):**
```
/register
  Form fields:
    - workspace (slug): [linhka] .oni.vn
    - Tên doanh nghiệp: "Linhka Store"
    - Email: admin@linhka.com
    - Password: *** (min 8 ký tự)
    - Gói: [Mini - Miễn phí ▼]
  
  Submit → POST /api/register
    1. supabase.auth.signUp(email, password)
    2. create_tenant_with_owner(name, slug, user_id)
    3. create_shop(tenant_id, name=tenantName, slug=tenantSlug)  ← branch mặc định
    4. create_subscription(tenant_id, plan_id)
    → Return: { workspace_url, email, slug }

  → Màn hình provisioning (polling /api/register/status?slug=linhka)
    ✓ Tạo tài khoản
    ✓ Khởi tạo workspace
    ✓ Tạo chi nhánh mặc định
    ✓ Kích hoạt gói dịch vụ
  
  → Màn hình "Workspace ready"
    Workspace: linhka.oni.vn
    Email: admin@linhka.com
    Password: ******** [👁 Hiện]
    [Open Workspace →]  [Go to Login]
```

### API endpoint mới: `POST /api/register`

```typescript
Body: {
  slug: string        // workspace slug (= tenant slug = default branch slug)
  name: string        // tên doanh nghiệp
  email: string
  password: string    // min 8 ký tự
  plan_code?: string  // default: 'plan_mini'
}

Response 201: {
  tenant_id: string
  workspace_url: string  // "https://linhka.oni.vn" hoặc "http://linhka.localhost:3000"
  email: string
}

Errors:
  400 - slug đã tồn tại
  400 - email đã đăng ký
  422 - validation error
```

---

## 7. Superadmin /super

> **Phase 3** — Chưa triển khai

### Scope

- Chỉ accessible với Supabase role `super_admin` (set trong `auth.users.raw_app_meta_data`)
- Route: `oni.vn/super/*`
- **Không** dùng subdomain

### Tính năng dự kiến

```
/super/dashboard      → Overview: tổng tenant, MRR, signups hôm nay
/super/tenants        → Danh sách tất cả tenant (search, filter by plan/status)
/super/tenants/[id]   → Chi tiết: plan limits, usage, domains, suspend/delete
/super/plans          → Quản lý gói dịch vụ + metadata
/super/invoices       → Lịch sử thanh toán
/super/users          → Tìm user theo email
/super/audit-logs     → Audit log toàn hệ thống
```

### Guard middleware

```typescript
// Middleware check for /super:
if (pathname.startsWith('/super')) {
  const user = await supabase.auth.getUser();
  const isSuperAdmin = user.data.user?.app_metadata?.role === 'super_admin';
  if (!isSuperAdmin) return redirect('/auth/signin');
}
```

---

## 8. Development Checklist

### Phase 1 — Registration Flow

- [ ] **`POST /api/register`**: Atomic signup + create_tenant + create_shop + subscription
- [ ] **`/register` page**: Form "Create workspace" (slug preview, plan selector)
- [ ] **`/register/provisioning` page**: Polling status, animated checklist
- [ ] **`/register/success` page**: Workspace ready, show credentials (password reveal)
- [ ] **Xóa `/onboarding/step-1,2,3`** sau khi `/register` hoàn chỉnh
- [ ] **Email confirmation flow**: Sau verify, redirect về `/register/success`
- [ ] **Slug validation**: Real-time check availability via `GET /api/register/check-slug?slug=xxx`
- [ ] **Error handling**: Slug trùng, email trùng, plan không tồn tại

### Phase 2 — Tenant Workspace Routing

- [ ] **Middleware**: Thêm case `[slug].oni.vn → /t/[slug]/*`
- [ ] **`/app/t/[slug]/page.tsx`**: Branch selector (list branches của tenant)
- [ ] **`/app/t/[slug]/[branch]/page.tsx`**: Branch dashboard (move từ `/s/[slug]`)
- [ ] **`/app/t/[slug]/settings/page.tsx`**: Tenant settings
- [ ] **`/app/t/[slug]/billing/page.tsx`**: Billing
- [ ] **`/app/t/[slug]/team/page.tsx`**: Quản lý thành viên
- [ ] **Auto-redirect**: 1 branch → bỏ qua selector, redirect thẳng
- [ ] **Update `DashboardShell`**: context='tenant-workspace' cho `/t/[slug]`

### Phase 3 — Superadmin

- [ ] **Middleware guard**: Check `super_admin` role cho `/super`
- [ ] **`/super/dashboard`**: Stats overview
- [ ] **`/super/tenants`**: List + search + filter
- [ ] **`/super/tenants/[id]`**: Detail view + actions (suspend, cancel, edit plan)
- [ ] **`/super/plans`**: CRUD plans + metadata editor
- [ ] **`/super/invoices`**: Read-only invoice list
- [ ] **Superadmin seed**: Script tạo user với `super_admin` role

### Backlog / Future

- [ ] **Google Sheet connector**: Hoàn thiện OAuth flow cho branch
- [ ] **Custom domain**: Per-branch custom domain (domains table đã có)
- [ ] **Invite member**: `POST /api/invites` → email invite → claim link
- [ ] **POS interface**: `/[branch]/pos` — bán hàng tại quầy
- [ ] **Billing integration**: Stripe/payment gateway
- [ ] **Plan enforcement**: Check `max_shops` trước khi tạo branch mới
- [ ] **Audit log UI**: Hiển thị lịch sử thao tác trong tenant

---

## 9. Debug Reference

### Vấn đề thường gặp

#### "Redirect về /dashboard sau khi vào /s/[slug]/products"

**Nguyên nhân**: `assertUserShopAccess()` trả về false.  
**Check**:
1. User có trong `user_tenants` với đúng `tenant_id` không? → `SELECT * FROM user_tenants WHERE user_id = '...'`
2. Shop có `tenant_id` đúng không? → `SELECT tenant_id FROM shops WHERE slug = '...'`
3. Hàm cũ dùng `maybeSingle()` không có filter → đã fix, đảm bảo dùng version mới

#### "Sidebar trống khi vào /s/[slug]"

**Nguyên nhân**: `permissions=[]` (không truyền vào DashboardShell).  
**Check**: `/s/[slug]/page.tsx` và `/s/[slug]/[...segments]/page.tsx` phải gọi `getUserPermissions()` và truyền kết quả.

#### "Không thấy menu Đơn hàng/Sản phẩm dù đã login"

**Nguyên nhân**: Đang dùng `sidebarContext='control'` (control plane).  
**Check**: Shop pages phải dùng default `sidebarContext='shop'`.

#### "slug đã tồn tại" khi tạo branch

**Nguyên nhân**: `shops.slug` là globally unique, không phải unique per tenant.  
**Convention**: Dùng `[tenant-slug]-[branch-name]` cho branches bổ sung. VD: `linhka`, `linhka-q1`, `linhka-q3`.

#### Permission check sai ở tenant admin

**Nguyên nhân**: Hàm `get_user_permissions` resolves theo thứ tự: tenant role → shop role. Nếu user là `owner` ở tenant, trả về ALL permissions mà không cần check shop.

### Supabase RPC Functions

| Function | Dùng để |
|----------|---------|
| `create_tenant_with_owner(name, slug, owner_id)` | Tạo tenant + gán role owner |
| `create_shop(tenant_id, name, slug, address)` | Tạo branch mới |
| `get_user_permissions(user_id, tenant_id, shop_id?)` | Lấy danh sách permissions |
| `user_has_permission(user_id, tenant_id, shop_id?, permission)` | Check 1 permission |

### Env vars

| Var | Dùng để | Dev value |
|-----|---------|-----------|
| `NEXT_PUBLIC_ROOT_DOMAIN` | Subdomain parsing | `localhost:3000` |
| `NEXT_PUBLIC_SITE_URL` | Absolute URLs trong email, redirect | `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (browser-safe) | từ `supabase start` |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (server only, KHÔNG expose) | từ `supabase start` |

### Test subdomain ở localhost

```bash
# Thêm vào /etc/hosts (macOS/Linux):
127.0.0.1  linhka.localhost

# Hoặc dùng browser với:
# http://linhka.localhost:3000/
# (Chrome hỗ trợ *.localhost natively, không cần sửa hosts)
```

---

## 10. Cấu trúc thư mục (key files)

```
apps/web/
├── app/
│   ├── api/
│   │   ├── auth/signup/route.ts       ← Email signup (sẽ replace bằng /register)
│   │   ├── register/route.ts          ← [NEW Phase 1] Atomic workspace creation
│   │   ├── tenants/route.ts           ← Create tenant
│   │   ├── shops/route.ts             ← Create/list branches
│   │   └── connectors/...             ← Google Sheet, Supabase connectors
│   ├── register/                      ← [NEW Phase 1] Workspace creation pages
│   │   ├── page.tsx                   ← Create workspace form
│   │   ├── provisioning/page.tsx      ← Animated setup screen
│   │   └── success/page.tsx           ← Workspace ready + credentials
│   ├── onboarding/                    ← [DEPRECATED after Phase 1]
│   ├── dashboard/                     ← Control plane (quản lý)
│   │   ├── layout.tsx                 ← sidebarContext='control'
│   │   ├── tenants/                   ← List tenants
│   │   └── shops/                     ← List branches per tenant
│   ├── s/[slug]/                      ← Branch workspace (Phase 1)
│   │   ├── page.tsx                   ← Branch dashboard
│   │   └── [...segments]/page.tsx     ← Branch sub-pages
│   ├── super/                         ← [NEW Phase 3] Superadmin
│   └── components/layout/
│       ├── DashboardShell.tsx         ← Wrapper layout
│       ├── Sidebar.tsx                ← Nav sidebar (context-aware)
│       ├── Topbar.tsx                 ← Top bar
│       └── nav.tsx                   ← Nav groups builder
├── lib/server/
│   ├── auth.ts                        ← getSessionUserWithTenant()
│   ├── permissions.ts                 ← getUserPermissions(), hasPermission()
│   ├── shops.ts                       ← getShopBySlug(), assertUserShopAccess()
│   ├── tenants.ts                     ← listTenantsForCurrentUser()
│   └── supabaseAdmin.ts               ← Admin client (service_role)
├── middleware.ts                      ← Subdomain → path rewrite
└── supabase/migrations/
    ├── 20260506000001_schema.sql      ← Core tables + views
    ├── 20260506000002_permissions.sql ← RBAC + role_permissions
    └── 20260506000003_rls_policies.sql← Row Level Security
```
