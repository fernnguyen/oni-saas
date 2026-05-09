-- migration: 20260509000002_subscription_billing

-- 1. Add pricing columns to plans
alter table public.plans
add column price_monthly bigint not null default 0,
add column price_yearly bigint not null default 0;

-- Update existing plans with sample pricing
update public.plans set price_monthly = 0, price_yearly = 0 where code = 'plan_mini';
update public.plans set price_monthly = 990000, price_yearly = 9900000 where code = 'plan_pro';
update public.plans set price_monthly = 0, price_yearly = 0 where code = 'plan_enterprise';

-- 2. Create subscription_orders table (adapted from Sepay orders)
create table public.subscription_orders (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code),
  billing_interval text not null default 'monthly'::text,
  amount_vnd bigint not null,
  reference_code text not null unique,
  status text not null default 'pending'::text,
  expires_at timestamp with time zone not null default (now() + '00:15:00'::interval),
  fulfilled_at timestamp with time zone null,
  sepay_transaction_id bigint null unique,
  created_at timestamp with time zone null default now(),
  constraint subscription_orders_pkey primary key (id)
) TABLESPACE pg_default;

create index if not exists subscription_orders_tenant_id_idx on public.subscription_orders using btree (tenant_id, created_at desc) TABLESPACE pg_default;
create index if not exists subscription_orders_user_id_idx on public.subscription_orders using btree (user_id, created_at desc) TABLESPACE pg_default;
create index if not exists subscription_orders_reference_code_idx on public.subscription_orders using btree (reference_code) TABLESPACE pg_default;
create index if not exists subscription_orders_status_expires_idx on public.subscription_orders using btree (status, expires_at) TABLESPACE pg_default;

-- RLS: user chỉ thấy đơn hàng của chính mình
alter table public.subscription_orders enable row level security;

create policy "users can view own orders"
  on public.subscription_orders for select
  using (user_id = auth.uid());

-- Insert/update/delete chỉ qua service_role (edge functions)
