-- Migration: 20260712010000_add_customer_info_and_note_to_qr_orders
-- Description: Add customer_name, customer_phone, and note columns to qr_order_requests table

ALTER TABLE public.qr_order_requests 
ADD COLUMN IF NOT EXISTS customer_name text,
ADD COLUMN IF NOT EXISTS customer_phone text,
ADD COLUMN IF NOT EXISTS note text;
