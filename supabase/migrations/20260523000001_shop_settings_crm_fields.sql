-- Migration: Add dynamic loyalty configuration columns to shop_settings (excluding legacy bronze/silver/gold columns)
ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS loyalty_points_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS loyalty_money_to_point numeric NOT NULL DEFAULT 100000,
ADD COLUMN IF NOT EXISTS loyalty_point_to_money numeric NOT NULL DEFAULT 1000,
ADD COLUMN IF NOT EXISTS tier_evaluation_years int NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS tier_reward_type text NOT NULL DEFAULT 'discount_bill';
