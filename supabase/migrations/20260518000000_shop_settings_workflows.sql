-- migration: 20260518000000_shop_settings_workflows
-- Add skip_cleaning_process and skip_return_confirmation to shop_settings

alter table public.shop_settings
  add column if not exists skip_cleaning_process boolean not null default false,
  add column if not exists skip_return_confirmation boolean not null default false;
