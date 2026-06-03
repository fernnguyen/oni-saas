-- migration: 20260603020000_shop_settings_housekeeping_mode
-- Add housekeeping_workflow_mode to shop_settings

alter table public.shop_settings
  add column if not exists housekeeping_workflow_mode varchar(50) not null default 'SIMPLE';
