-- Migration: Add resource_sub_types to shop_settings
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS resource_sub_types JSONB;
