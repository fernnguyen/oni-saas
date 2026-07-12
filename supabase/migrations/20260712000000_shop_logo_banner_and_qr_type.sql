-- Migration: Add logo/banner to shops and qr_ordering_type to shop_settings
-- Created at: 2026-07-12

ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS banner_url TEXT;

ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS qr_ordering_type TEXT NOT NULL DEFAULT 'web';
