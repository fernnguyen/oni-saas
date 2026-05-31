-- migration: 20260531080000_shop_level_industry
-- Transitions industry_type to shops table and shops_view, updating create_shop RPC

-- 1. Add industry_type to public.shops
ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS industry_type TEXT;

-- 2. Backpopulate from public.tenants
UPDATE public.shops s
SET industry_type = t.industry_type
FROM public.tenants t
WHERE s.tenant_id = t.id;

-- 3. Set default and not null
ALTER TABLE public.shops
ALTER COLUMN industry_type SET DEFAULT 'retail',
ALTER COLUMN industry_type SET NOT NULL;

-- 4. Recreate shops_view to include industry_type
DROP VIEW IF EXISTS public.shops_view;
CREATE VIEW public.shops_view AS
SELECT
  sh.id,
  sh.tenant_id,
  sh.name,
  sh.slug,
  sh.address,
  sh.created_at,
  sh.industry_type,
  c.id     as connector_id,
  c.type   as connector_type,
  c.status as connector_status
FROM public.shops sh
LEFT JOIN public.connectors c
  ON c.tenant_id = sh.tenant_id
  AND c.id = (
    SELECT id FROM public.connectors
    WHERE tenant_id = sh.tenant_id
    ORDER BY created_at DESC
    LIMIT 1
  );

-- 5. Redefine create_shop RPC to accept p_industry_type
CREATE OR REPLACE FUNCTION public.create_shop(
  p_tenant_id     UUID,
  p_name          TEXT,
  p_slug          TEXT,
  p_address       TEXT DEFAULT NULL,
  p_industry_type TEXT DEFAULT 'retail'
) RETURNS public.shops
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_shop    public.shops;
  v_meta    jsonb;
  v_max     int;
  v_cur     int;
  v_resolved_industry TEXT;
BEGIN
  v_meta := public.get_tenant_plan_meta(p_tenant_id);

  IF v_meta IS NULL THEN
    RAISE EXCEPTION 'Tenant has no active subscription';
  END IF;

  v_max := coalesce((v_meta->>'create_shop')::int, -1);

  SELECT count(*) INTO v_cur
  FROM public.shops WHERE tenant_id = p_tenant_id;

  IF v_max <> -1 AND v_cur >= v_max THEN
    RAISE EXCEPTION 'plan_limit_exceeded:create_shop:%:%', v_cur, v_max;
  END IF;

  -- Resolve industry type: fallback to tenant's industry if not supplied
  v_resolved_industry := coalesce(p_industry_type, (SELECT industry_type FROM public.tenants WHERE id = p_tenant_id), 'retail');

  INSERT INTO public.shops(tenant_id, name, slug, address, industry_type)
  VALUES (p_tenant_id, p_name, p_slug, p_address, v_resolved_industry)
  RETURNING * INTO v_shop;

  RETURN v_shop;
END;
$$;
