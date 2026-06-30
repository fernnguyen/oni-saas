-- migration: 20260630000007_immediate_downgrade.sql
-- Immediately downgrade expired subscriptions to plan_mini
-- Keep current_period_end to track when it expired

create or replace function public.process_subscription_lifecycle()
returns void
language plpgsql security definer
as $$
declare
  v_mini_plan_id int;
begin
  -- Get the ID for plan_mini
  select id into v_mini_plan_id from public.plans where code = 'plan_mini' limit 1;

  if v_mini_plan_id is not null then
    -- Downgrade any active subscriptions that have passed their period_end immediately to plan_mini
    update public.subscriptions
    set plan_id = v_mini_plan_id,
        status = 'active'
        -- Do not update current_period_end so we know when they expired
    where plan_id != v_mini_plan_id
      and current_period_end < now()
      and status = 'active';

    -- Also catch any stuck past_due or locked subscriptions and downgrade them
    update public.subscriptions
    set plan_id = v_mini_plan_id,
        status = 'active'
    where plan_id != v_mini_plan_id
      and status in ('past_due', 'locked');
  end if;
end;
$$;

-- Revert user_has_permission to no longer block 'past_due' (since we no longer use past_due for locking)
create or replace function public.user_has_permission(
  p_user_id    uuid,
  p_tenant_id  uuid,
  p_shop_id    uuid,
  p_permission text
) returns boolean
language plpgsql stable security definer
as $$
declare
  v_role_code text;
  v_role_id   int;
  v_sub_status text;
begin
  -- 0. Check subscription status
  if p_permission not like '%view%' and p_permission not like 'billing.%' then
    select status into v_sub_status from public.subscriptions where tenant_id = p_tenant_id limit 1;
    if v_sub_status in ('deleted', 'locked') then
      return false;
    end if;
  end if;

  -- 1. tenant-level membership
  select r.code, r.id into v_role_code, v_role_id
  from public.user_tenants ut
  join public.roles r on r.id = ut.role_id
  where ut.user_id = p_user_id and ut.tenant_id = p_tenant_id;

  if v_role_code = 'owner' then
    return true;
  end if;

  if v_role_id is not null then
    return exists (
      select 1
      from public.role_permissions rp
      join public.permissions perm on perm.id = rp.permission_id
      where rp.role_id = v_role_id and perm.code = p_permission
    );
  end if;

  -- 2. shop-level membership
  if p_shop_id is not null then
    return exists (
      select 1
      from public.user_shops us
      join public.role_permissions rp on rp.role_id = us.role_id
      join public.permissions perm on perm.id = rp.permission_id
      where us.user_id = p_user_id
        and us.shop_id = p_shop_id
        and perm.code = p_permission
    );
  end if;

  return false;
end;
$$;
