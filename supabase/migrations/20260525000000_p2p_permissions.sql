-- migration: 20260525000000_p2p_permissions
-- ONI.vn — Adds roles and permissions for P2P Enterprise Purchase Add-on

-- 1. Insert new P2P operational permissions
insert into public.permissions (code, name, group_code, group_name, sort_order) values
  ('purchasing.manage',    'Quản lý đề xuất & đơn mua sắm', 'p2p', 'Mua sắm & Phê duyệt', 1),
  ('suppliers.create',     'Tạo Nhà cung cấp mới',          'p2p', 'Mua sắm & Phê duyệt', 2),
  ('suppliers.edit',       'Chỉnh sửa tài khoản Nhà cung cấp','p2p','Mua sắm & Phê duyệt', 3),
  ('suppliers.delete',     'Xóa Nhà cung cấp',              'p2p', 'Mua sắm & Phê duyệt', 4),
  
  -- Dummy permissions mapping to roles to ensure they are loaded in RPC array
  ('owner',                'Chủ sở hữu hệ thống',           'system', 'Hệ thống',          1),
  ('admin',                'Giám đốc / Quản lý chuỗi',      'system', 'Hệ thống',          2),
  ('purchaser',            'Nhân viên mua hàng',            'system', 'Hệ thống',          3),
  ('chief_accountant',     'Kế toán trưởng',                'system', 'Hệ thống',          4),
  ('warehouse.manage',     'Thủ kho / Quản lý kho',         'system', 'Hệ thống',          5)
on conflict (code) do nothing;

-- 2. Register new default system roles for P2P
insert into public.roles (code, name, is_system, scope, description) values
  ('purchaser',        'Nhân viên Mua hàng', true, 'tenant', 'Lập yêu cầu mua sắm PR, sourcing báo giá nhà cung cấp và lập đơn hàng PO.'),
  ('chief_accountant', 'Kế toán trưởng',     true, 'tenant', 'Duyệt hạn mức mua sắm cấp 1, chỉnh sửa thông tin nhà cung cấp và đối chiếu nhập kho.')
on conflict (code) do nothing;

-- 3. Helper to seed role permissions
create or replace function public._seed_p2p_role_perm(p_role_code text, p_perm_code text)
returns void language plpgsql as $$
begin
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r, public.permissions p
  where r.code = p_role_code and p.code = p_perm_code
  on conflict do nothing;
end;
$$;

-- 4. Associate permissions with Admin role
do $$ declare p text; begin
  foreach p in array array[
    'purchasing.manage',
    'suppliers.create',
    'suppliers.edit',
    'suppliers.delete',
    'admin',
    'purchaser',
    'chief_accountant',
    'warehouse.manage'
  ] loop
    perform public._seed_p2p_role_perm('admin', p);
  end loop;
end $$;

-- 5. Associate permissions with Kế toán trưởng role
do $$ declare p text; begin
  foreach p in array array[
    'purchasing.manage',
    'suppliers.create',
    'suppliers.edit',
    'chief_accountant',
    'warehouse.manage'
  ] loop
    perform public._seed_p2p_role_perm('chief_accountant', p);
  end loop;
end $$;

-- 6. Associate permissions with Nhân viên Mua hàng role
do $$ declare p text; begin
  foreach p in array array[
    'purchasing.manage',
    'suppliers.create',
    'purchaser'
  ] loop
    perform public._seed_p2p_role_perm('purchaser', p);
  end loop;
end $$;

-- 7. Associate default permissions to owner (all permissions implicitly seeded to owner via SQL trigger, but do it manually just in case)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'owner'
on conflict do nothing;

-- 8. Clean up helper
drop function if exists public._seed_p2p_role_perm(text, text);
