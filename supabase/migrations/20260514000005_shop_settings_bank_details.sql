-- Migration: Structured bank details
-- Created at: 2026-05-14

ALTER TABLE public.shop_settings
DROP COLUMN IF EXISTS bank_info,
ADD COLUMN IF NOT EXISTS bank_code TEXT,
ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
ADD COLUMN IF NOT EXISTS qr_template TEXT DEFAULT 'compact2';
