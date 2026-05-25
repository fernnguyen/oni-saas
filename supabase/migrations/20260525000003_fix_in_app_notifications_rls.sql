-- migration: 20260525000003_fix_in_app_notifications_rls
-- Description: Patch to drop the recursive RLS policy and apply the security definer functions fix.

-- 1. Drop the old recursive policy
drop policy if exists "users_view_notifications" on public.in_app_notifications;

-- 2. Create the security definer helper functions (if not already exists, or replace)
-- 2.1 Check tenant access
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

-- 2.2 Check shop access
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

-- 2.3 Check notification recipient role
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

-- 3. Re-create the view notifications policy using the new security definer helper functions
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
