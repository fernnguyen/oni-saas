-- migration: 20260703000000_add_edit_price_permission

insert into public.permissions (code, name, group_code, group_name, sort_order) values
  ('orders.edit_price', 'Sửa giá bán trực tiếp', 'orders', 'Đơn hàng', 6)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code in ('owner', 'admin') and p.code = 'orders.edit_price'
on conflict do nothing;
