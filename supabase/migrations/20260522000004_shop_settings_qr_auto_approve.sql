-- migration: 20260522000004_shop_settings_qr_auto_approve
-- Add qr_auto_approve_session to shop_settings

alter table public.shop_settings 
add column if not exists qr_auto_approve_session boolean not null default false;
