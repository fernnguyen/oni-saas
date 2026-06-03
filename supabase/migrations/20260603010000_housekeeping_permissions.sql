-- migration: 20260603010000_housekeeping_permissions
-- ONI.vn — Adds roles and permissions for Housekeeping & Minibar Module

-- 1. Insert new Housekeeping operational permissions
insert into public.permissions (code, name, group_code, group_name, sort_order) values
  ('housekeeping.view',    'Xem sơ đồ và nhật ký Buồng phòng',       'housekeeping', 'Buồng phòng & Dọn dẹp', 1),
  ('housekeeping.edit',    'Thao tác dọn phòng và kiểm minibar',     'housekeeping', 'Buồng phòng & Dọn dẹp', 2),
  ('housekeeping.manage',  'Quản trị nghiệp vụ Buồng phòng & SLA',   'housekeeping', 'Buồng phòng & Dọn dẹp', 3)
on conflict (code) do nothing;

-- 2. Helper to seed role permissions
create or replace function public._seed_hskp_role_perm(p_role_code text, p_perm_code text)
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
    'housekeeping.view',
    'housekeeping.edit',
    'housekeeping.manage'
  ] loop
    perform public._seed_hskp_role_perm('admin', p);
  end loop;
end $$;

-- 4. Associate permissions with Staff role (housekeeping staff)
do $$ declare p text; begin
  foreach p in array array[
    'housekeeping.view',
    'housekeeping.edit'
  ] loop
    perform public._seed_hskp_role_perm('staff', p);
  end loop;
end $$;

-- 5. Associate default permissions to owner (all permissions)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'owner'
on conflict do nothing;

-- 6. Clean up helper
drop function if exists public._seed_hskp_role_perm(text, text);
