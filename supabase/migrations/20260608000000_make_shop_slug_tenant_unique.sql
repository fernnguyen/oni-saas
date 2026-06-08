-- migration: 20260608000000_make_shop_slug_tenant_unique
-- Drop global unique constraint on shops(slug)
ALTER TABLE public.shops DROP CONSTRAINT IF EXISTS shops_slug_key;

-- Add new tenant-scoped unique constraint on shops(tenant_id, slug)
ALTER TABLE public.shops ADD CONSTRAINT shops_tenant_slug_key UNIQUE (tenant_id, slug);
