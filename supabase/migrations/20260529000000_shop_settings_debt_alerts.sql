-- migration: 20260529000000_shop_settings_debt_alerts
-- ONI.vn — Adds debt aging and debt limit alerts configuration to shop_settings

ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS default_max_debt_days INT NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS default_max_debt_amount NUMERIC(15,2) NOT NULL DEFAULT 10000000,
ADD COLUMN IF NOT EXISTS allow_sell_over_debt_limit BOOLEAN NOT NULL DEFAULT true;
