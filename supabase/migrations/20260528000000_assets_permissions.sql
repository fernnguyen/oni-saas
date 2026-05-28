-- migration: 20260528000000_assets_permissions
-- ONI.vn — Adds roles and permissions for Assets & Departments Horizontal Module

-- 1. Insert new Assets & Departments operational permissions
insert into public.permissions (code, name, group_code, group_name, sort_order) values
  ('departments.view',    'Xem danh sách Phòng ban',                 'global_assets', 'Tài sản & Phòng ban', 1),
  ('departments.manage',  'Quản lý Phòng ban & Nhân sự',             'global_assets', 'Tài sản & Phòng ban', 2),
  ('assets.view',         'Xem danh sách Tài sản & Khấu hao',        'global_assets', 'Tài sản & Phòng ban', 3),
  ('assets.manage',       'Quản lý Tài sản, Bàn giao & Khấu hao',    'global_assets', 'Tài sản & Phòng ban', 4)
on conflict (code) do nothing;

-- 2. Helper to seed role permissions
create or replace function public._seed_assets_role_perm(p_role_code text, p_perm_code text)
returns void language plpgsql as $$
begin
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r, public.permissions p
  where r.code = p_role_code and p.code = p_perm_code
  on conflict do nothing;
end;
$$;

-- 3. Associate permissions with Admin role
do $$ declare p text; begin
  foreach p in array array[
    'departments.view',
    'departments.manage',
    'assets.view',
    'assets.manage'
  ] loop
    perform public._seed_assets_role_perm('admin', p);
  end loop;
end $$;

-- 4. Associate permissions with Kế toán trưởng role
do $$ declare p text; begin
  foreach p in array array[
    'departments.view',
    'assets.view',
    'assets.manage'
  ] loop
    perform public._seed_assets_role_perm('chief_accountant', p);
  end loop;
end $$;

-- 5. Associate default permissions to owner
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'owner'
on conflict do nothing;

-- 6. Clean up helper
drop function if exists public._seed_assets_role_perm(text, text);
