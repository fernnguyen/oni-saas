-- Migration: Add subscription notification and downgrade settings to system_settings

UPDATE public.system_settings 
SET config = config || jsonb_build_object(
  'plan_expiration_notice_days', 30,
  'plan_expiration_banner_days', 7,
  'plan_lock_grace_days', 3
)
WHERE id = 'global';
