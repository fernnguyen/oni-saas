-- migration: 20260524000001_localize_system_roles
-- ONI.vn — Localize existing system roles to Vietnamese for all existing tenants

update public.roles
set name = 'Chủ sở hữu / Lãnh đạo'
where code = 'owner';

update public.roles
set name = 'Giám đốc / Quản lý chuỗi'
where code = 'admin';

update public.roles
set name = 'Nhân viên Thu ngân'
where code = 'staff';

update public.roles
set name = 'Cổ đông / Giám sát chi nhánh'
where code = 'viewer';
