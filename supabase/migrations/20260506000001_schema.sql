-- migration: 20260506000001_schema
-- ONI.vn — Core multi-tenant schema
-- Hierarchy: User → Tenant (Company) → Shop (Branch/POS)
-- Subscription lives on Tenant; Connector & Domain live on Shop

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- Roles
-- ─────────────────────────────────────────────────────────────
create table if not exists public.roles (
  id   serial primary key,
  code text   not null unique,
  name text   not null
);

insert into public.roles (code, name) values
  ('owner',  'Owner'),
  ('admin',  'Admin'),
  ('staff',  'Staff'),
  ('viewer', 'Viewer')
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Plans
-- metadata governs ALL per-tenant limits:
--   max_shops              : int  (-1 = unlimited)
--   max_users              : int
--   max_connectors_per_shop: int
--   max_custom_domains     : int
-- ─────────────────────────────────────────────────────────────
create table if not exists public.plans (
  id         serial  primary key,
  code       text    not null unique,
  name       text    not null,
  is_default boolean not null default false,
  metadata   jsonb   not null default '{}'::jsonb
);

insert into public.plans (code, name, is_default, metadata) values
  ('plan_mini',
   'Mini (Miễn phí)',
   true,
   '{"max_shops":1,"max_users":3,"max_connectors_per_shop":1,"max_custom_domains":0}'::jsonb),
  ('plan_pro',
   'Pro',
   false,
   '{"max_shops":10,"max_users":20,"max_connectors_per_shop":2,"max_custom_domains":3}'::jsonb),
  ('plan_enterprise',
   'Enterprise',
   false,
   '{"max_shops":-1,"max_users":-1,"max_connectors_per_shop":-1,"max_custom_domains":-1}'::jsonb)
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Tenants  (Company / Doanh nghiệp)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        not null unique,   -- used for tenant-level routing if needed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Subscription: per-Tenant, governs all plan limits for that company
create table if not exists public.subscriptions (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  plan_id              int         not null references public.plans(id),
  status               text        not null default 'active', -- active | past_due | canceled
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  trial_end            timestamptz,
  created_at           timestamptz not null default now(),
  unique (tenant_id)   -- one active subscription per tenant
);

create index if not exists idx_subscriptions_tenant on public.subscriptions(tenant_id);

-- User ↔ Tenant membership (owner/admin = access ALL shops in this tenant)
create table if not exists public.user_tenants (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  role_id    int         not null references public.roles(id),
  is_default boolean     not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);

create index if not exists idx_user_tenants_user   on public.user_tenants(user_id);
create index if not exists idx_user_tenants_tenant on public.user_tenants(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- Shops  (Chi nhánh / POS)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.shops (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  name       text        not null,
  slug       text        not null unique,   -- maps to subdomain: slug.oni.vn
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shops_tenant on public.shops(tenant_id);

-- User ↔ Shop membership (staff = access only this specific shop)
-- Users with tenant-level role (user_tenants) inherit access to ALL shops — no entry needed here
create table if not exists public.user_shops (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  shop_id    uuid        not null references public.shops(id) on delete cascade,
  role_id    int         not null references public.roles(id),
  created_at timestamptz not null default now(),
  unique (user_id, shop_id)
);

create index if not exists idx_user_shops_user on public.user_shops(user_id);
create index if not exists idx_user_shops_shop on public.user_shops(shop_id);

-- ─────────────────────────────────────────────────────────────
-- Connectors  (per-Shop — each branch has its own data source)
-- config jsonb holds encrypted_token, sheet_id, etc.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.connectors (
  id         uuid        primary key default gen_random_uuid(),
  shop_id    uuid        not null references public.shops(id) on delete cascade,
  type       text        not null,                         -- 'google_sheets' | 'supabase_db'
  status     text        not null default 'pending',       -- pending | active | error
  config     jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_connectors_shop on public.connectors(shop_id);

-- ─────────────────────────────────────────────────────────────
-- Domains  (per-Shop — each branch can have its own subdomain/custom domain)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.domains (
  id          uuid        primary key default gen_random_uuid(),
  shop_id     uuid        not null references public.shops(id) on delete cascade,
  domain      text        not null unique,
  is_primary  boolean     not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_domains_shop on public.domains(shop_id);

-- ─────────────────────────────────────────────────────────────
-- Feature Flags  (per-Tenant — unlocked by subscription plan)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.feature_flags (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  key        text        not null,
  enabled    boolean     not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);

-- ─────────────────────────────────────────────────────────────
-- Audit Logs
-- ─────────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        references public.tenants(id),
  shop_id    uuid        references public.shops(id),
  user_id    uuid        references auth.users(id),
  action     text        not null,
  metadata   jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Views
-- ─────────────────────────────────────────────────────────────

-- Tenants a user belongs to (with plan info)
create or replace view public.tenants_view as
select
  ut.user_id,
  t.id,
  t.name,
  t.slug,
  ut.is_default,
  r.code        as role_code,
  p.code        as plan_code,
  p.name        as plan_name,
  s.status      as subscription_status,
  t.created_at,
  (select count(*) from public.shops sh where sh.tenant_id = t.id) as shop_count
from public.user_tenants ut
join public.tenants      t  on t.id   = ut.tenant_id
join public.roles        r  on r.id   = ut.role_id
left join public.subscriptions s on s.tenant_id = t.id
left join public.plans         p on p.id = s.plan_id;

-- Shops with connector status — accessible to a user (tenant-level OR shop-level)
create or replace view public.shops_view as
select
  sh.id,
  sh.tenant_id,
  sh.name,
  sh.slug,
  sh.address,
  sh.created_at,
  c.id     as connector_id,
  c.type   as connector_type,
  c.status as connector_status
from public.shops sh
left join public.connectors c
  on c.shop_id = sh.id
  and c.id = (
    select id from public.connectors
    where shop_id = sh.id
    order by created_at desc
    limit 1
  );

-- ─────────────────────────────────────────────────────────────
-- Helper: get plan metadata for a tenant
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_tenant_plan_meta(p_tenant_id uuid)
returns jsonb
language sql stable security definer
as $$
  select p.metadata
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant_id and s.status = 'active'
  limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- Create Tenant + Owner + default Subscription (plan_mini)
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_tenant_with_owner(
  p_name     text,
  p_slug     text,
  p_owner_id uuid
) returns public.tenants
language plpgsql security definer
as $$
declare
  v_tenant        public.tenants;
  v_owner_role_id int;
  v_default_plan  int;
begin
  select id into v_owner_role_id from public.roles  where code = 'owner'   limit 1;
  select id into v_default_plan  from public.plans  where is_default = true limit 1;

  insert into public.tenants(name, slug)
  values (p_name, p_slug)
  returning * into v_tenant;

  insert into public.user_tenants(user_id, tenant_id, role_id, is_default)
  values (p_owner_id, v_tenant.id, v_owner_role_id, true);

  -- Auto-provision plan_mini subscription
  insert into public.subscriptions(tenant_id, plan_id, status)
  values (v_tenant.id, v_default_plan, 'active')
  on conflict (tenant_id) do nothing;

  return v_tenant;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Create Shop — enforces max_shops limit from tenant subscription
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_shop(
  p_tenant_id uuid,
  p_name      text,
  p_slug      text,
  p_address   text default null
) returns public.shops
language plpgsql security definer
as $$
declare
  v_shop       public.shops;
  v_meta       jsonb;
  v_max_shops  int;
  v_cur_shops  int;
begin
  v_meta := public.get_tenant_plan_meta(p_tenant_id);

  if v_meta is null then
    raise exception 'Tenant has no active subscription';
  end if;

  v_max_shops := (v_meta->>'max_shops')::int;

  select count(*) into v_cur_shops
  from public.shops where tenant_id = p_tenant_id;

  if v_max_shops <> -1 and v_cur_shops >= v_max_shops then
    raise exception 'Plan limit reached: maximum % shop(s) allowed on this plan', v_max_shops;
  end if;

  insert into public.shops(tenant_id, name, slug, address)
  values (p_tenant_id, p_name, p_slug, p_address)
  returning * into v_shop;

  return v_shop;
end;
$$;
