-- ═══════════════════════════════════════════════════════════════
-- RLS Policies for ONI.vn
-- Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- user_tenants
-- ─────────────────────────────────────────────────────────────
alter table public.user_tenants enable row level security;

create policy "users can view own tenant memberships"
  on public.user_tenants for select
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- tenants
-- ─────────────────────────────────────────────────────────────
alter table public.tenants enable row level security;

create policy "users can view tenants they belong to"
  on public.tenants for select
  using (
    id in (
      select tenant_id from public.user_tenants
      where user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- shops
-- ─────────────────────────────────────────────────────────────
alter table public.shops enable row level security;

create policy "users can view shops in their tenants"
  on public.shops for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants
      where user_id = auth.uid()
    )
  );

create policy "users can view shops assigned to them directly"
  on public.shops for select
  using (
    id in (
      select shop_id from public.user_shops
      where user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- connectors
-- ─────────────────────────────────────────────────────────────
alter table public.connectors enable row level security;

create policy "users can view connectors for accessible shops"
  on public.connectors for select
  using (
    shop_id in (
      select s.id from public.shops s
      where s.tenant_id in (
        select tenant_id from public.user_tenants where user_id = auth.uid()
      )
      union
      select shop_id from public.user_shops where user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- subscriptions
-- ─────────────────────────────────────────────────────────────
alter table public.subscriptions enable row level security;

create policy "users can view their tenant subscriptions"
  on public.subscriptions for select
  using (
    tenant_id in (
      select tenant_id from public.user_tenants
      where user_id = auth.uid()
    )
  );
