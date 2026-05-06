-- migration: 20260506000003_rls_policies
-- ONI.vn — Row Level Security policies
-- Depends on: 20260506000001_schema, 20260506000002_permissions

-- ─────────────────────────────────────────────────────────────
-- Drop old manually-applied policies before recreating
-- (handles case where policies were run in Dashboard before CLI)
-- ─────────────────────────────────────────────────────────────
drop policy if exists "users can view connectors for accessible shops" on public.connectors;
drop policy if exists "users can view their tenant subscriptions"      on public.subscriptions;

-- permissions
drop policy if exists "authenticated users can read permissions"      on public.permissions;
drop policy if exists "authenticated users can read role_permissions"  on public.role_permissions;
drop policy if exists "authenticated users can read roles"             on public.roles;

-- user_tenants
drop policy if exists "users can view own tenant memberships"  on public.user_tenants;
drop policy if exists "owner can insert tenant memberships"    on public.user_tenants;
drop policy if exists "owner can delete tenant memberships"    on public.user_tenants;

-- user_shops
drop policy if exists "users can view shop memberships in their tenants" on public.user_shops;
drop policy if exists "owner can manage shop memberships"                on public.user_shops;
drop policy if exists "owner can remove shop memberships"                on public.user_shops;

-- tenants
drop policy if exists "users can view tenants they belong to" on public.tenants;
drop policy if exists "owner can update tenant"               on public.tenants;

-- shops
drop policy if exists "users can view shops in their tenants"        on public.shops;
drop policy if exists "users can view shops assigned to them directly" on public.shops;
drop policy if exists "shops.manage can update shops"                on public.shops;

-- connectors
drop policy if exists "connectors.view"          on public.connectors;
drop policy if exists "connectors.manage insert"  on public.connectors;
drop policy if exists "connectors.manage update"  on public.connectors;
drop policy if exists "connectors.manage delete"  on public.connectors;

-- domains
drop policy if exists "domains.view"          on public.domains;
drop policy if exists "domains.manage insert"  on public.domains;
drop policy if exists "domains.manage delete"  on public.domains;

-- subscriptions
drop policy if exists "billing.view" on public.subscriptions;

-- audit_logs
drop policy if exists "audit_logs insert"                   on public.audit_logs;
drop policy if exists "audit_logs select for tenant admins" on public.audit_logs;

-- ─────────────────────────────────────────────────────────────
-- permissions & role_permissions: readable by all authenticated users
-- ─────────────────────────────────────────────────────────────
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;

create policy "authenticated users can read permissions"
  on public.permissions for select
  using (auth.uid() is not null);

create policy "authenticated users can read role_permissions"
  on public.role_permissions for select
  using (auth.uid() is not null);

-- ─────────────────────────────────────────────────────────────
-- roles: readable by authenticated users
-- write only via service_role (managed through API)
-- ─────────────────────────────────────────────────────────────
alter table public.roles enable row level security;

create policy "authenticated users can read roles"
  on public.roles for select
  using (auth.uid() is not null);

-- ─────────────────────────────────────────────────────────────
-- user_tenants
-- ─────────────────────────────────────────────────────────────
alter table public.user_tenants enable row level security;

create policy "users can view own tenant memberships"
  on public.user_tenants for select
  using (user_id = auth.uid());

create policy "owner can insert tenant memberships"
  on public.user_tenants for insert
  with check (
    public.user_has_permission(auth.uid(), tenant_id, null, 'users.invite')
  );

create policy "owner can delete tenant memberships"
  on public.user_tenants for delete
  using (
    public.user_has_permission(auth.uid(), tenant_id, null, 'users.remove')
  );

-- ─────────────────────────────────────────────────────────────
-- user_shops
-- ─────────────────────────────────────────────────────────────
alter table public.user_shops enable row level security;

create policy "users can view shop memberships in their tenants"
  on public.user_shops for select
  using (
    shop_id in (
      select s.id from public.shops s
      where s.tenant_id in (
        select tenant_id from public.user_tenants where user_id = auth.uid()
      )
    )
  );

create policy "owner can manage shop memberships"
  on public.user_shops for insert
  with check (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'users.invite'
    )
  );

create policy "owner can remove shop memberships"
  on public.user_shops for delete
  using (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'users.remove'
    )
  );

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

create policy "owner can update tenant"
  on public.tenants for update
  using (
    public.user_has_permission(auth.uid(), id, null, 'tenants.manage')
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

-- shops.create is enforced server-side via hasPermission() before calling create_shop()
create policy "shops.manage can update shops"
  on public.shops for update
  using (
    public.user_has_permission(auth.uid(), tenant_id, id, 'shops.manage')
  );

-- ─────────────────────────────────────────────────────────────
-- connectors
-- ─────────────────────────────────────────────────────────────
alter table public.connectors enable row level security;

create policy "connectors.view"
  on public.connectors for select
  using (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'connectors.view'
    )
  );

create policy "connectors.manage insert"
  on public.connectors for insert
  with check (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'connectors.manage'
    )
  );

create policy "connectors.manage update"
  on public.connectors for update
  using (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'connectors.manage'
    )
  );

create policy "connectors.manage delete"
  on public.connectors for delete
  using (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'connectors.manage'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- domains
-- ─────────────────────────────────────────────────────────────
alter table public.domains enable row level security;

create policy "domains.view"
  on public.domains for select
  using (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'domains.view'
    )
  );

create policy "domains.manage insert"
  on public.domains for insert
  with check (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'domains.manage'
    )
  );

create policy "domains.manage delete"
  on public.domains for delete
  using (
    public.user_has_permission(
      auth.uid(),
      (select tenant_id from public.shops where id = shop_id),
      shop_id,
      'domains.manage'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- subscriptions
-- ─────────────────────────────────────────────────────────────
alter table public.subscriptions enable row level security;

create policy "billing.view"
  on public.subscriptions for select
  using (
    public.user_has_permission(auth.uid(), tenant_id, null, 'billing.view')
  );

-- billing.manage handled server-side via service_role + payment webhook

-- ─────────────────────────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────────────────────────
alter table public.audit_logs enable row level security;

create policy "audit_logs insert"
  on public.audit_logs for insert
  with check (auth.uid() is not null);

create policy "audit_logs select for tenant admins"
  on public.audit_logs for select
  using (
    tenant_id is not null and
    public.user_has_permission(auth.uid(), tenant_id, null, 'tenants.view')
  );
