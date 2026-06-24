-- migration: 20260624000000_invitation_code_custom_trial
-- Add plan selection and custom trial days for invitation codes

-- 1. Alter invitation_codes table
alter table public.invitation_codes
add column if not exists plan_id integer references public.plans(id) on delete set null,
add column if not exists trial_days integer;

-- 2. Initialize default starter trial days in global settings if not present
update public.system_settings
set config = jsonb_set(
  config,
  '{starter_trial_days}',
  coalesce(config->'starter_trial_days', '90'::jsonb)
)
where id = 'global';
