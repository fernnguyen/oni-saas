-- migration: 20260524000000_new_operational_permissions
-- ONI.vn — Adds operational permissions for QR Table Ordering, CRM, and Debt Management

insert into public.permissions (code, name, group_code, group_name, sort_order) values
  ('qr_order.manage',       'Thiết lập đặt món tại bàn', 'qr_order',    'Đặt món QR',         1),
  ('crm.manage',            'Thiết lập CRM & Loyalty',  'crm',         'CRM & Khách hàng',   1),
  ('crm.wallet_adjust',     'Điều chỉnh ví thành viên', 'crm',         'CRM & Khách hàng',   2),
  ('debt.manage',           'Điều chỉnh & Quản lý công nợ', 'debt',    'Công nợ',            2)
on conflict (code) do nothing;

-- Grant to owner (gets all permissions explicitly just in case)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'owner' and p.code in ('qr_order.manage', 'crm.manage', 'crm.wallet_adjust', 'debt.manage')
on conflict do nothing;

-- Grant to admin (gets system management permissions, excluding direct wallet balance adjustments to prevent fraud)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'admin' and p.code in ('qr_order.manage', 'crm.manage', 'debt.manage')
on conflict do nothing;
