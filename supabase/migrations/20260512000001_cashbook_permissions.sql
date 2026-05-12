-- migration: 20260512000001_cashbook_permissions
-- ONI.vn — Adds cashbook and debt management permissions

insert into public.permissions (code, name, group_code, group_name, sort_order) values
  ('cashbook.view',         'Xem sổ quỹ',               'cashbook',    'Sổ quỹ',             1),
  ('cashbook.manage',       'Quản lý thu/chi',          'cashbook',    'Sổ quỹ',             2),
  ('debt.view',             'Xem công nợ',              'debt',        'Công nợ',            1)
on conflict (code) do nothing;

-- Grant to owner (handled automatically by owner's all-permissions check, but we can be explicit or rely on the function)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'owner' and p.code in ('cashbook.view', 'cashbook.manage', 'debt.view')
on conflict do nothing;

-- Grant to admin
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'admin' and p.code in ('cashbook.view', 'cashbook.manage', 'debt.view')
on conflict do nothing;

-- Grant view access to staff
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'staff' and p.code in ('cashbook.view', 'debt.view')
on conflict do nothing;
