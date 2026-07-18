-- migration: 20260718000000_add_product_price_permission

insert into public.permissions (code, name, group_code, group_name, sort_order) values
  ('products.manage_prices', 'Quản lý giá bán và giá vốn', 'products', 'Sản phẩm', 5)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code in ('owner', 'admin') and p.code = 'products.manage_prices'
on conflict do nothing;
