-- migration: 20260525000002_in_app_notifications
-- Description: Core tables, helper functions, indexes, and RLS policies for Multi-Tenant In-App Notifications
-- Immunized against PostgreSQL RLS infinite recursion using security definer helpers.

-- ─────────────────────────────────────────────────────────────
-- 1. Security Definer Helpers (RLS bypass for recursion safety)
-- ─────────────────────────────────────────────────────────────

-- 1.1 Check tenant access
create or replace function public.user_has_tenant_access(
  p_user_id   uuid,
  p_tenant_id uuid
) returns boolean
language plpgsql security definer stable
as $$
begin
  return (
    -- User belongs to tenant at tenant level (Owner/Admin)
    exists (
      select 1 from public.user_tenants
      where user_id = p_user_id and tenant_id = p_tenant_id
    )
    -- Or user belongs to a shop in this tenant (Staff)
    or exists (
      select 1 from public.user_shops us
      join public.shops s on s.id = us.shop_id
      where us.user_id = p_user_id and s.tenant_id = p_tenant_id
    )
  );
end;
$$;

-- 1.2 Check shop access
create or replace function public.user_has_shop_access(
  p_user_id uuid,
  p_shop_id uuid
) returns boolean
language plpgsql security definer stable
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.shops where id = p_shop_id;
  if v_tenant_id is null then
    return false;
  end if;

  return (
    -- User is Owner/Admin at the tenant level
    exists (
      select 1 from public.user_tenants
      where user_id = p_user_id and tenant_id = v_tenant_id
    )
    -- Or user is explicitly assigned to this shop
    or exists (
      select 1 from public.user_shops
      where user_id = p_user_id and shop_id = p_shop_id
    )
  );
end;
$$;

-- 1.3 Check notification recipient role
create or replace function public.user_has_notification_role(
  p_user_id    uuid,
  p_tenant_id  uuid,
  p_branch_id  uuid,
  p_role_code  text
) returns boolean
language plpgsql security definer stable
as $$
begin
  if p_role_code is null then
    return true;
  end if;

  return (
    -- Check tenant level role
    exists (
      select 1 from public.user_tenants ut
      join public.roles r on r.id = ut.role_id
      where ut.user_id = p_user_id 
        and ut.tenant_id = p_tenant_id 
        and r.code = p_role_code
    )
    -- Check shop level role
    or (
      p_branch_id is not null and exists (
        select 1 from public.user_shops us
        join public.roles r on r.id = us.role_id
        where us.user_id = p_user_id 
          and us.shop_id = p_branch_id 
          and r.code = p_role_code
      )
    )
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Tables Creation
-- ─────────────────────────────────────────────────────────────

-- 2.1 in_app_notifications
create table if not exists public.in_app_notifications (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  branch_id      uuid        references public.shops(id) on delete cascade, -- null = all branches
  recipient_id   uuid        references auth.users(id) on delete cascade,   -- null = all users in scope
  recipient_role text,                                                      -- owner | admin | staff | null = all roles
  type           text        not null,                                      -- system | order_expiring | debt_alert | return_approval | purchase_approval | low_stock
  title          text        not null,
  content        text        not null,
  metadata       jsonb       not null default '{}'::jsonb,                  -- dynamic fields e.g., {"order_id": "...", "path": "..."}
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '30 days')   -- Auto 30 days expiration
);

-- Indexes for lightning fast lookups
create index if not exists idx_in_app_notifications_tenant on public.in_app_notifications(tenant_id);
create index if not exists idx_in_app_notifications_branch on public.in_app_notifications(branch_id);
create index if not exists idx_in_app_notifications_recipient on public.in_app_notifications(recipient_id);
create index if not exists idx_in_app_notifications_lookup 
  on public.in_app_notifications(tenant_id, branch_id, recipient_id, expires_at);

-- 2.2 notification_reads (tracks user read status)
create table if not exists public.notification_reads (
  notification_id uuid        references public.in_app_notifications(id) on delete cascade,
  user_id         uuid        references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists idx_notification_reads_user on public.notification_reads(user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Enable RLS
-- ─────────────────────────────────────────────────────────────
alter table public.in_app_notifications enable row level security;
alter table public.notification_reads enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS Policies
-- ─────────────────────────────────────────────────────────────

-- 4.1 Policies for public.in_app_notifications (Using helpers to guarantee zero infinite recursion)
create policy "users_view_notifications"
  on public.in_app_notifications for select
  to authenticated
  using (
    -- 1. User has access to the tenant
    public.user_has_tenant_access(auth.uid(), tenant_id)
    -- 2. If branch_id is specified, user must have access to that branch
    and (
      branch_id is null 
      or public.user_has_shop_access(auth.uid(), branch_id)
    )
    -- 3. If recipient_id is specified, it must be the current user
    and (
      recipient_id is null 
      or recipient_id = auth.uid()
    )
    -- 4. If recipient_role is specified, user must match role
    and (
      recipient_role is null
      or public.user_has_notification_role(auth.uid(), tenant_id, branch_id, recipient_role)
    )
    -- 5. Only show active (unexpired) notifications
    and expires_at > now()
  );

-- 4.2 Policies for public.notification_reads (Users can see and manage their own read status)
create policy "users_manage_own_reads"
  on public.notification_reads for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 5. Automatic Lazy-Cleanup Trigger (Ensures 30-day storage limit)
-- ─────────────────────────────────────────────────────────────
create or replace function public.cleanup_expired_notifications_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.in_app_notifications
  where expires_at <= now();
  return new;
end;
$$;

create trigger tr_cleanup_expired_notifications
  after insert on public.in_app_notifications
  for each statement
  execute function public.cleanup_expired_notifications_trigger();
