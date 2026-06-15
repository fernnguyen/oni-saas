-- migration: 20260615000000_centralized_notification_settings
-- Description: Add channels_config JSONB column to tenant_notification_events for centralized Telegram and Push notification controls

ALTER TABLE public.tenant_notification_events
  ADD COLUMN IF NOT EXISTS channels_config JSONB 
  NOT NULL DEFAULT '{"telegram": {"enabled": true}, "push": {"enabled": true, "roles": []}}'::jsonb;

-- Comment for clarity
COMMENT ON COLUMN public.tenant_notification_events.channels_config IS 
'Config for multiple channels: {"telegram": {"enabled": boolean}, "push": {"enabled": boolean, "roles": string[]}}';
