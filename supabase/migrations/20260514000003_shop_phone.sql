-- Migration: Add phone to shops
-- Created at: 2026-05-14

ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS phone TEXT;
