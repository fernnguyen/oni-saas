-- Migration: Add mute_pos_sound to shop_settings
-- Created at: 2026-05-14

ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS mute_pos_sound BOOLEAN NOT NULL DEFAULT FALSE;
