-- migration: 20260601030000_shop_settings_show_brand_attribution
-- ONI.vn — Adds show_brand_attribution column to shop_settings

ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS show_brand_attribution BOOLEAN NOT NULL DEFAULT true;
