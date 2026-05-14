-- migration: 20260514000001_shop_settings_autoprint
-- Add auto_print_receipt to shop_settings

alter table public.shop_settings 
add column if not exists auto_print_receipt boolean not null default true;
