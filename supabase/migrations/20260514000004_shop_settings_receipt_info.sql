-- Migration: Add receipt info fields to shop_settings
-- Created at: 2026-05-14

ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS tax_id TEXT,
ADD COLUMN IF NOT EXISTS wifi_info TEXT,
ADD COLUMN IF NOT EXISTS bank_info TEXT,
ADD COLUMN IF NOT EXISTS receipt_footer TEXT;
