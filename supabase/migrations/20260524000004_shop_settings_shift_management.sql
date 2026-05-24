-- migration: 20260524000004_shop_settings_shift_management
-- ONI.vn — Adds shift management settings to shop_settings

ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS enable_shift_management BOOLEAN NOT NULL DEFAULT false;
