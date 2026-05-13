-- migration: 20260513000000_tenant_connectors

-- 1. Add tenant_id to connectors
ALTER TABLE public.connectors ADD COLUMN tenant_id uuid;

-- 2. Populate tenant_id from shops
UPDATE public.connectors c
SET tenant_id = s.tenant_id
FROM public.shops s
WHERE c.shop_id = s.id;

-- 3. Make tenant_id NOT NULL and add foreign key
ALTER TABLE public.connectors ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.connectors ADD CONSTRAINT fk_connectors_tenant_id FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 4. Drop shop_id column
ALTER TABLE public.connectors DROP COLUMN shop_id CASCADE;

-- 5. Recreate views that depended on shop_id
-- We dropped shop_id CASCADE, which might have dropped shops_view. Let's recreate it.
DROP VIEW IF EXISTS public.shops_view;
CREATE OR REPLACE VIEW public.shops_view AS
SELECT
  sh.id,
  sh.tenant_id,
  sh.name,
  sh.slug,
  sh.address,
  sh.created_at,
  c.id     AS connector_id,
  c.type   AS connector_type,
  c.status AS connector_status
FROM public.shops sh
LEFT JOIN public.connectors c
  ON c.tenant_id = sh.tenant_id
  AND c.id = (
    SELECT id FROM public.connectors
    WHERE tenant_id = sh.tenant_id
    ORDER BY created_at DESC
    LIMIT 1
  );

-- 6. Add indexes
CREATE INDEX idx_connectors_tenant ON public.connectors(tenant_id);
