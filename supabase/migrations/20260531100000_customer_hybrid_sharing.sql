-- migration: 20260531100000_customer_hybrid_sharing
-- ONI.vn — Adds share_customers configuration flag to tenants table

-- 1. Bổ sung cấu hình share_customers vào bảng tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS share_customers BOOLEAN NOT NULL DEFAULT FALSE;
