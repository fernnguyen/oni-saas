-- migration: 20260619000000_system_tax_groups
-- Create and seed global flat tax groups for HKD

create table if not exists public.system_tax_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  vat_rate numeric(5,2) not null default 0.0,
  pit_rate numeric(5,2) not null default 0.0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default Circular 40/2021/TT-BTC flat tax groups
insert into public.system_tax_groups (code, name, vat_rate, pit_rate) values
('phan_phoi', 'Phân phối, cung cấp hàng hóa', 1.0, 0.5),
('dich_vu', 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu', 5.0, 2.0),
('san_xuat', 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu', 3.0, 1.5),
('khac', 'Hoạt động kinh doanh khác', 2.0, 1.0)
on conflict (code) do nothing;
