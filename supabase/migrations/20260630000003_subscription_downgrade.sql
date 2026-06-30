-- migration: 20260630000003_subscription_downgrade
-- Transition from strict lockdown to reverse-trial auto downgrade

-- 1. Update the metadata of plan_mini to include max_orders_per_month
update public.plans
set metadata = metadata || '{"max_orders_per_month": 300}'::jsonb
where code = 'plan_mini';

-- 2. Update the Cron process to downgrade to plan_mini instead of locking
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
    -- A. Downgrade any expired active subscriptions to plan_mini
    update public.subscriptions
    set plan_id = v_mini_plan_id,
        status = 'active',
        current_period_end = '2099-12-31 23:59:59+00'::timestamptz
    where plan_id != v_mini_plan_id
      and current_period_end < now()
      and status = 'active';

    -- B. Also downgrade any subscriptions that are already in past_due or locked state from the old logic
    update public.subscriptions
    set plan_id = v_mini_plan_id,
        status = 'active',
        current_period_end = '2099-12-31 23:59:59+00'::timestamptz
    where plan_id != v_mini_plan_id
      and status in ('past_due', 'locked');
  end if;
end;
$$;

-- 3. Revert the strict RLS check so that we do not block writes at the second of expiration
-- Instead, we will rely on plan limits in the application layer or let the cron downgrade them smoothly
create or replace function public.user_has_permission(
  p_user_id    uuid,
  p_tenant_id  uuid,
  p_shop_id    uuid,    -- null for tenant-only actions (billing, etc.)
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
  -- Allow read-only (.view, .view_shop, etc.) and billing management
  if p_permission not like '%view%' and p_permission not like 'billing.%' then
    select status into v_sub_status from public.subscriptions where tenant_id = p_tenant_id limit 1;
    -- Only block if explicitly deleted or locked (though locked is now phased out)
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

  -- 2. shop-level membership (staff assigned to specific shop)
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
