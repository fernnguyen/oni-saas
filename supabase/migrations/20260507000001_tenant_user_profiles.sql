-- migration: 20260507000001_tenant_user_profiles
-- Tenant-scoped user profiles.
--
-- Two account types:
--   'workspace' — username + fake email (username@[tenant].oni.vn), no real email needed
--   'personal'  — user's own email address, signs in like a normal account
--
-- In both cases a profile row is created so the team list query is a simple JOIN.

create table if not exists public.tenant_user_profiles (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  -- NULL for personal-email accounts
  username     text        check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text,
  account_type text        not null default 'workspace'
                           check (account_type in ('workspace', 'personal')),
  -- email used to log in — fake for workspace, real for personal — stored here to avoid
  -- hitting auth.admin.listUsers on every team list render
  login_email  text        not null,
  created_at   timestamptz not null default now(),

  -- username unique per tenant (Postgres excludes NULLs from uniqueness automatically)
  unique(tenant_id, username),
  unique(user_id, tenant_id)
);

create index if not exists idx_tup_user   on public.tenant_user_profiles(user_id);
create index if not exists idx_tup_tenant on public.tenant_user_profiles(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.tenant_user_profiles enable row level security;

-- Any member of the tenant (tenant-level or shop-level) can read all profiles
create policy "tenant members can view profiles"
  on public.tenant_user_profiles for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants where user_id = auth.uid()
    )
    or
    tenant_id in (
      select s.tenant_id from public.shops s
      join public.user_shops us on us.shop_id = s.id
      where us.user_id = auth.uid()
    )
  );

-- Insert/delete always via service_role — no client-facing insert policy needed
