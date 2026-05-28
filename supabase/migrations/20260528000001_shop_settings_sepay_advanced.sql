-- Migration: Add advanced SePay configuration fields to shop_settings
ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS sepay_webhook_token text,
ADD COLUMN IF NOT EXISTS sepay_auth_method text DEFAULT 'token_query',
ADD COLUMN IF NOT EXISTS sepay_hmac_key text,
ADD COLUMN IF NOT EXISTS sepay_api_key text,
ADD COLUMN IF NOT EXISTS sepay_bank_filter text,
ADD COLUMN IF NOT EXISTS sepay_transaction_type text DEFAULT 'all';

