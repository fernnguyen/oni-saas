-- Shop-level circuit breaker for orders entered outside the POS flow.
-- Defaulting to TRUE preserves the requested out-of-the-box availability while
-- allowing each shop manager to disable the feature immediately.
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS enable_manual_orders boolean NOT NULL DEFAULT true;
