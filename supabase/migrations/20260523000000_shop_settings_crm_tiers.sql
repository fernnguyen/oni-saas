-- Migration: Add membership_tiers jsonb to shop_settings
ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS membership_tiers jsonb DEFAULT '[
  {"name": "Đồng", "threshold": 5000000, "discount": 2},
  {"name": "Bạc", "threshold": 15000000, "discount": 5},
  {"name": "Vàng", "threshold": 35000000, "discount": 10}
]'::jsonb;
