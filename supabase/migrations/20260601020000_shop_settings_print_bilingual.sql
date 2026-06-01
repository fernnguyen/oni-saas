-- migration: 20260601020000_shop_settings_print_bilingual
-- ONI.vn — Adds bilingual printing toggle to shop_settings

ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS print_bilingual BOOLEAN NOT NULL DEFAULT false;
