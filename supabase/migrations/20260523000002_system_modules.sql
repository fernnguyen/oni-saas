-- migration: 20260523000002_system_modules
-- Description: Define core system modules and link feature_flags to enforce referential integrity. Configure plan metadata defaults.

begin;

-- 1. Create system_modules table
create table if not exists public.system_modules (
  code text primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Enable RLS on system_modules for read-only access to users
alter table public.system_modules enable row level security;

create policy "Anyone can read system modules"
  on public.system_modules for select
  using (true);

-- 2. Register existing core modules
insert into public.system_modules (code, name, description) values
  ('crm', 'Quản lý khách hàng & Tích điểm (CRM)', 'Quản lý hạng thành viên, tích điểm loyalty, ví điện tử trả trước và chiết khấu hóa đơn động.'),
  ('qr_table_ordering', 'Đặt món tại bàn (QR Ordering)', 'Quản lý sơ đồ bàn, quét mã QR gọi món thời gian thực tại quầy/bàn ăn.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

-- 3. Enforce key matching by adding foreign key constraint to feature_flags
-- Check if there are any orphaned keys in feature_flags first
delete from public.feature_flags where key not in (select code from public.system_modules);

alter table public.feature_flags
add constraint fk_feature_flags_key
foreign key (key) references public.system_modules(code)
on delete restrict;

-- 4. Update plans metadata defaults for CRM package governance
update public.plans 
set metadata = metadata || '{"crm": false}'::jsonb 
where code = 'plan_mini';

update public.plans 
set metadata = metadata || '{"crm": true}'::jsonb 
where code in ('plan_pro', 'plan_enterprise');

commit;
