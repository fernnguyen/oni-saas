-- migration: 20260516000000_industry_type
-- Adds industry_type to tenants for multi-vertical support
-- Valid values: retail | fnb | billiards | sports_court | lodging | fashion | service_hourly

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS industry_type TEXT NOT NULL DEFAULT 'retail';

-- Update create_tenant_with_owner to accept industry_type
CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  p_name          TEXT,
  p_slug          TEXT,
  p_owner_id      UUID,
  p_industry_type TEXT DEFAULT 'retail'
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tenant        public.tenants;
  v_owner_role_id INT;
  v_default_plan  INT;
BEGIN
  SELECT id INTO v_owner_role_id FROM public.roles  WHERE code = 'owner'   LIMIT 1;
  SELECT id INTO v_default_plan  FROM public.plans  WHERE is_default = true LIMIT 1;

  INSERT INTO public.tenants(name, slug, industry_type)
  VALUES (p_name, p_slug, p_industry_type)
  RETURNING * INTO v_tenant;

  INSERT INTO public.user_tenants(user_id, tenant_id, role_id, is_default)
  VALUES (p_owner_id, v_tenant.id, v_owner_role_id, true);

  -- Auto-provision plan_mini subscription
  INSERT INTO public.subscriptions(tenant_id, plan_id, status)
  VALUES (v_tenant.id, v_default_plan, 'active')
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_tenant;
END;
$$;

-- Update tenants_view to include industry_type
-- Must DROP + CREATE because adding a column changes ordinal positions
DROP VIEW IF EXISTS public.tenants_view;
CREATE VIEW public.tenants_view AS
SELECT
  ut.user_id,
  t.id,
  t.name,
  t.slug,
  t.industry_type,
  ut.is_default,
  r.code        AS role_code,
  p.code        AS plan_code,
  p.name        AS plan_name,
  s.status      AS subscription_status,
  t.created_at,
  (SELECT count(*) FROM public.shops sh WHERE sh.tenant_id = t.id) AS shop_count
FROM public.user_tenants ut
JOIN public.tenants      t  ON t.id   = ut.tenant_id
JOIN public.roles        r  ON r.id   = ut.role_id
LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
LEFT JOIN public.plans         p ON p.id = s.plan_id;
