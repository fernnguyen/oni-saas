-- migration: 20260506000002_permissions
-- ONI.vn — Dynamic RBAC: permissions catalog + role-permission matrix
-- Depends on: 20260506000001_schema

-- ─────────────────────────────────────────────────────────────
-- Extend roles table for dynamic/custom roles
-- ─────────────────────────────────────────────────────────────
alter table public.roles
  add column if not exists is_system  boolean not null default true,
  add column if not exists scope      text    not null default 'any',
  add column if not exists tenant_id  uuid    references public.tenants(id) on delete cascade;

-- Mark seeded system roles
update public.roles set is_system = true, scope = 'tenant' where code in ('owner', 'admin');
update public.roles set is_system = true, scope = 'shop'   where code in ('staff', 'viewer');

-- ─────────────────────────────────────────────────────────────
-- Permissions catalog
-- code format: '<group>.<action>'  e.g. 'orders.create'
-- ─────────────────────────────────────────────────────────────
create table if not exists public.permissions (
  id          serial primary key,
  code        text   not null unique,
  name        text   not null,
  group_code  text   not null,
  group_name  text   not null,
  sort_order  int    not null default 0
);

insert into public.permissions (code, name, group_code, group_name, sort_order) values
  -- dashboard
  ('dashboard.view',        'Xem tổng quan',            'dashboard',   'Tổng quan',          1),

  -- orders
  ('orders.view',           'Xem đơn hàng',             'orders',      'Đơn hàng',           1),
  ('orders.create',         'Tạo đơn hàng',             'orders',      'Đơn hàng',           2),
  ('orders.edit',           'Sửa đơn hàng',             'orders',      'Đơn hàng',           3),
  ('orders.cancel',         'Hủy đơn hàng',             'orders',      'Đơn hàng',           4),
  ('orders.delete',         'Xóa đơn hàng',             'orders',      'Đơn hàng',           5),

  -- returns
  ('returns.view',          'Xem đổi trả',              'returns',     'Đổi trả hàng',       1),
  ('returns.create',        'Tạo phiếu đổi trả',        'returns',     'Đổi trả hàng',       2),
  ('returns.approve',       'Duyệt đổi trả',            'returns',     'Đổi trả hàng',       3),

  -- products
  ('products.view',         'Xem sản phẩm',             'products',    'Sản phẩm',           1),
  ('products.create',       'Thêm sản phẩm',            'products',    'Sản phẩm',           2),
  ('products.edit',         'Sửa sản phẩm',             'products',    'Sản phẩm',           3),
  ('products.delete',       'Xóa sản phẩm',             'products',    'Sản phẩm',           4),

  -- inventory
  ('inventory.view',        'Xem kho',                  'inventory',   'Kho',                1),
  ('inventory.create',      'Nhập kho',                 'inventory',   'Kho',                2),
  ('inventory.edit',        'Sửa phiếu kho',            'inventory',   'Kho',                3),

  -- customers
  ('customers.view',        'Xem khách hàng',           'customers',   'Khách hàng',         1),
  ('customers.create',      'Thêm khách hàng',          'customers',   'Khách hàng',         2),
  ('customers.edit',        'Sửa khách hàng',           'customers',   'Khách hàng',         3),

  -- pos
  ('pos.use',               'Sử dụng POS',              'pos',         'Bán tại quầy',       1),

  -- shipping
  ('shipping.view',         'Xem vận chuyển',           'shipping',    'Vận chuyển',         1),
  ('shipping.manage',       'Quản lý vận chuyển',       'shipping',    'Vận chuyển',         2),

  -- partners
  ('partners.view',         'Xem đối tác',              'partners',    'Đối tác',            1),
  ('partners.manage',       'Quản lý đối tác',          'partners',    'Đối tác',            2),

  -- channels
  ('channels.view',         'Xem kênh bán hàng',        'channels',    'Kênh bán hàng',      1),

  -- reports
  ('reports.view_shop',     'Báo cáo chi nhánh',        'reports',     'Báo cáo',            1),
  ('reports.view_all',      'Báo cáo toàn hệ thống',   'reports',     'Báo cáo',            2),

  -- accounting
  ('accounting.view',       'Xem kế toán',              'accounting',  'Kế toán',            1),
  ('accounting.create',     'Tạo bút toán',             'accounting',  'Kế toán',            2),
  ('cod.view',              'Xem đối soát COD',         'accounting',  'Kế toán',            3),
  ('cod.manage',            'Quản lý đối soát COD',     'accounting',  'Kế toán',            4),

  -- users
  ('users.view',            'Xem thành viên',           'users',       'Thành viên',         1),
  ('users.invite',          'Mời thành viên',           'users',       'Thành viên',         2),
  ('users.remove',          'Xóa thành viên',           'users',       'Thành viên',         3),

  -- roles
  ('roles.view',            'Xem phân quyền',           'roles',       'Phân quyền',         1),
  ('roles.manage',          'Quản lý phân quyền',       'roles',       'Phân quyền',         2),

  -- shops
  ('shops.view',            'Xem chi nhánh',            'shops',       'Chi nhánh',          1),
  ('shops.create',          'Tạo chi nhánh',            'shops',       'Chi nhánh',          2),
  ('shops.manage',          'Quản lý chi nhánh',        'shops',       'Chi nhánh',          3),

  -- connectors
  ('connectors.view',       'Xem kết nối dữ liệu',     'connectors',  'Kết nối dữ liệu',    1),
  ('connectors.manage',     'Quản lý kết nối dữ liệu', 'connectors',  'Kết nối dữ liệu',    2),

  -- domains
  ('domains.view',          'Xem tên miền',             'domains',     'Tên miền',           1),
  ('domains.manage',        'Quản lý tên miền',         'domains',     'Tên miền',           2),

  -- settings
  ('settings.view',         'Xem cài đặt',              'settings',    'Cài đặt',            1),
  ('settings.manage',       'Quản lý cài đặt',          'settings',    'Cài đặt',            2),

  -- billing
  ('billing.view',          'Xem gói dịch vụ',          'billing',     'Gói dịch vụ',        1),
  ('billing.manage',        'Quản lý gói dịch vụ',      'billing',     'Gói dịch vụ',        2),

  -- tenants
  ('tenants.view',          'Xem tổ chức',              'tenants',     'Tổ chức',            1),
  ('tenants.manage',        'Quản lý tổ chức',          'tenants',     'Tổ chức',            2)

on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Role ↔ Permission junction
-- ─────────────────────────────────────────────────────────────
create table if not exists public.role_permissions (
  role_id       int not null references public.roles(id)       on delete cascade,
  permission_id int not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Helper to seed role_permissions by code (idempotent)
create or replace function public._seed_role_perm(p_role_code text, p_perm_code text)
returns void language plpgsql as $$
begin
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r, public.permissions p
  where r.code = p_role_code and p.code = p_perm_code
  on conflict do nothing;
end;
$$;

-- ── owner: all permissions ────────────────────────────────────
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'owner'
on conflict do nothing;

-- ── admin ─────────────────────────────────────────────────────
do $$ declare p text; begin
  foreach p in array array[
    'dashboard.view',
    'orders.view','orders.create','orders.edit','orders.cancel','orders.delete',
    'returns.view','returns.create','returns.approve',
    'products.view','products.create','products.edit','products.delete',
    'inventory.view','inventory.create','inventory.edit',
    'customers.view','customers.create','customers.edit',
    'pos.use',
    'shipping.view','shipping.manage',
    'partners.view','partners.manage',
    'channels.view',
    'reports.view_shop','reports.view_all',
    'accounting.view','accounting.create',
    'cod.view','cod.manage',
    'users.view',
    'roles.view',
    'shops.view',
    'connectors.view','connectors.manage',
    'domains.view',
    'settings.view',
    'tenants.view'
  ] loop
    perform public._seed_role_perm('admin', p);
  end loop;
end $$;

-- ── staff ─────────────────────────────────────────────────────
do $$ declare p text; begin
  foreach p in array array[
    'dashboard.view',
    'orders.view','orders.create','orders.edit','orders.cancel',
    'returns.view','returns.create',
    'products.view','products.create','products.edit',
    'inventory.view','inventory.create',
    'customers.view','customers.create','customers.edit',
    'pos.use',
    'shipping.view','shipping.manage',
    'reports.view_shop',
    'accounting.view','accounting.create',
    'cod.view'
  ] loop
    perform public._seed_role_perm('staff', p);
  end loop;
end $$;

-- ── viewer ────────────────────────────────────────────────────
do $$ declare p text; begin
  foreach p in array array[
    'dashboard.view',
    'orders.view',
    'returns.view',
    'products.view',
    'inventory.view',
    'customers.view',
    'shipping.view',
    'reports.view_shop'
  ] loop
    perform public._seed_role_perm('viewer', p);
  end loop;
end $$;

-- Cleanup helper (not needed at runtime)
drop function if exists public._seed_role_perm(text, text);

-- ─────────────────────────────────────────────────────────────
-- user_has_permission(user_id, tenant_id, shop_id, permission)
--
-- Resolution order:
--   1. tenant-level role → owner always true, others check role_permissions
--   2. shop-level role   → check role_permissions (for staff/viewer/custom)
-- ─────────────────────────────────────────────────────────────
create or replace function public.user_has_permission(
  p_user_id    uuid,
  p_tenant_id  uuid,
  p_shop_id    uuid,    -- null for tenant-only actions (billing, etc.)
  p_permission text
) returns boolean
language plpgsql stable security definer
as $$
declare
  v_role_code text;
  v_role_id   int;
begin
  -- 1. tenant-level membership
  select r.code, r.id into v_role_code, v_role_id
  from public.user_tenants ut
  join public.roles r on r.id = ut.role_id
  where ut.user_id = p_user_id and ut.tenant_id = p_tenant_id;

  if v_role_code = 'owner' then
    return true;
  end if;

  if v_role_id is not null then
    return exists (
      select 1
      from public.role_permissions rp
      join public.permissions perm on perm.id = rp.permission_id
      where rp.role_id = v_role_id and perm.code = p_permission
    );
  end if;

  -- 2. shop-level membership (staff assigned to specific shop)
  if p_shop_id is not null then
    return exists (
      select 1
      from public.user_shops us
      join public.role_permissions rp on rp.role_id = us.role_id
      join public.permissions perm on perm.id = rp.permission_id
      where us.user_id = p_user_id
        and us.shop_id = p_shop_id
        and perm.code = p_permission
    );
  end if;

  return false;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- get_user_permissions(user_id, tenant_id, shop_id)
-- Returns the full set of permission codes for a user in context.
-- Used server-side to build the permission list once per request.
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_user_permissions(
  p_user_id   uuid,
  p_tenant_id uuid,
  p_shop_id   uuid default null
) returns table(code text)
language plpgsql stable security definer
as $$
declare
  v_role_code text;
  v_role_id   int;
begin
  -- tenant-level role
  select r.code, r.id into v_role_code, v_role_id
  from public.user_tenants ut
  join public.roles r on r.id = ut.role_id
  where ut.user_id = p_user_id and ut.tenant_id = p_tenant_id;

  if v_role_code = 'owner' then
    return query select p.code from public.permissions p;
    return;
  end if;

  if v_role_id is not null then
    return query
      select perm.code
      from public.role_permissions rp
      join public.permissions perm on perm.id = rp.permission_id
      where rp.role_id = v_role_id;
    return;
  end if;

  -- shop-level role fallback
  if p_shop_id is not null then
    return query
      select perm.code
      from public.user_shops us
      join public.role_permissions rp on rp.role_id = us.role_id
      join public.permissions perm on perm.id = rp.permission_id
      where us.user_id = p_user_id and us.shop_id = p_shop_id;
  end if;
end;
$$;
