-- migration: 20260630000005_subscription_lifecycle_v2.sql
-- Implement Grace Period and Downgrade using system_settings

create or replace function public.process_subscription_lifecycle()
returns void
language plpgsql security definer
as $$
declare
  v_mini_plan_id int;
  v_settings jsonb;
  v_grace_days int;
begin
  -- Get system settings for grace period
  select config into v_settings from public.system_settings where id = 'global';
  v_grace_days := coalesce((v_settings->>'plan_lock_grace_days')::int, 3);

  -- Get the ID for plan_mini
  select id into v_mini_plan_id from public.plans where code = 'plan_mini' limit 1;

  -- 1. Expire active subscriptions that have passed their period_end -> 'past_due' (Grace period starts)
  update public.subscriptions
  set status = 'past_due'
  where status = 'active'
    and plan_id != v_mini_plan_id
    and current_period_end < now();

  -- 2. Downgrade past_due subscriptions that have exceeded the grace period to plan_mini
  if v_mini_plan_id is not null then
    update public.subscriptions
    set plan_id = v_mini_plan_id,
        status = 'active',
        current_period_end = '2099-12-31 23:59:59+00'::timestamptz
    where status = 'past_due'
      and plan_id != v_mini_plan_id
      and current_period_end < (now() - (v_grace_days || ' days')::interval);
  end if;
end;
$$;
