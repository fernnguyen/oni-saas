-- migration: 20260630000000_subscription_lifecycle
-- Setup pg_cron for subscription lifecycle management and update system settings

create extension if not exists "pg_cron";

-- 1. Update system settings default config
update public.system_settings 
set config = config || '{"notify_days_before": 30, "banner_days_before": 7, "grace_period_days": 3, "hard_delete_days": 30}'::jsonb 
where id = 'global';

-- 2. Create the function to manage subscription lifecycle
create or replace function public.process_subscription_lifecycle()
returns void
language plpgsql security definer
as $$
declare
  v_settings jsonb;
  v_notify_days int;
  v_grace_days int;
  v_delete_days int;
begin
  select config into v_settings from public.system_settings where id = 'global';
  v_notify_days := coalesce((v_settings->>'notify_days_before')::int, 30);
  v_grace_days  := coalesce((v_settings->>'grace_period_days')::int, 3);
  v_delete_days := coalesce((v_settings->>'hard_delete_days')::int, 30);

  -- A. Expire subscriptions: Move from 'active' to 'past_due' (grace period)
  update public.subscriptions
  set status = 'past_due'
  where status = 'active'
    and current_period_end < now();

  -- B. Lock subscriptions: Move from 'past_due' to 'locked' after grace period
  update public.subscriptions
  set status = 'locked'
  where status = 'past_due'
    and current_period_end + (v_grace_days || ' days')::interval < now();

  -- C. Delete subscriptions: Move from 'locked' to 'deleted' after hard_delete_days
  update public.subscriptions
  set status = 'deleted'
  where status = 'locked'
    and current_period_end + ((v_grace_days + v_delete_days) || ' days')::interval < now();
    
end;
$$;

-- 3. Schedule the cron job to run every hour
-- Need to drop if exists to be idempotent in migrations (pg_cron uses cron.unschedule)
DO $$
BEGIN
  perform cron.unschedule('subscription-lifecycle-hourly');
EXCEPTION WHEN OTHERS THEN
  -- ignore if not exists
END $$;

select cron.schedule('subscription-lifecycle-hourly', '0 * * * *', 'select public.process_subscription_lifecycle()');
