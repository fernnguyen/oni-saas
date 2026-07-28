-- Keep one default tenant per user and enforce the global owner-tenant quota.

INSERT INTO public.system_settings (id, config)
VALUES ('global', '{"max_tenants_per_account": 1}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET config = CASE
  WHEN public.system_settings.config ? 'max_tenants_per_account'
    THEN public.system_settings.config
  ELSE jsonb_set(
    public.system_settings.config,
    '{max_tenants_per_account}',
    '1'::jsonb,
    true
  )
END;

-- Repair legacy memberships where every tenant was marked as default.
WITH ranked_memberships AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY is_default DESC, created_at ASC, id ASC
    ) AS row_position
  FROM public.user_tenants
)
UPDATE public.user_tenants AS membership
SET is_default = ranked.row_position = 1
FROM ranked_memberships AS ranked
WHERE membership.id = ranked.id
  AND membership.is_default IS DISTINCT FROM (ranked.row_position = 1);

CREATE UNIQUE INDEX IF NOT EXISTS user_tenants_one_default_per_user_idx
  ON public.user_tenants (user_id)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  p_name          TEXT,
  p_slug          TEXT,
  p_owner_id      UUID,
  p_industry_type TEXT DEFAULT 'retail'
) RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant        public.tenants;
  v_owner_role_id INT;
  v_default_plan  INT;
  v_settings      JSONB;
  v_max_tenants   INT;
  v_owned_tenants INT;
  v_is_default    BOOLEAN;
BEGIN
  -- This RPC is an internal primitive called only after the server API has
  -- validated registration mode, invitation code and authenticated identity.
  IF COALESCE(auth.role(), '') != 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Service role required';
  END IF;

  -- Serialize tenant creation per owner so concurrent requests cannot bypass quota.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::TEXT, 0));

  SELECT config INTO v_settings
  FROM public.system_settings
  WHERE id = 'global';

  v_max_tenants := CASE
    WHEN COALESCE(v_settings->>'max_tenants_per_account', '') ~ '^[0-9]+$'
      THEN LEAST(100, GREATEST(1, (v_settings->>'max_tenants_per_account')::INT))
    ELSE 1
  END;

  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE code = 'owner'
  LIMIT 1;

  SELECT id INTO v_default_plan
  FROM public.plans
  WHERE is_default = true
  LIMIT 1;

  SELECT count(*) INTO v_owned_tenants
  FROM public.user_tenants
  WHERE user_id = p_owner_id
    AND role_id = v_owner_role_id;

  IF v_owned_tenants >= v_max_tenants THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MAX_TENANTS_PER_ACCOUNT_REACHED',
      DETAIL = format(
        'Account %s already owns %s of %s allowed tenants',
        p_owner_id,
        v_owned_tenants,
        v_max_tenants
      );
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_tenants
    WHERE user_id = p_owner_id
      AND is_default = true
  ) INTO v_is_default;

  INSERT INTO public.tenants(name, slug, industry_type)
  VALUES (p_name, p_slug, p_industry_type)
  RETURNING * INTO v_tenant;

  INSERT INTO public.user_tenants(user_id, tenant_id, role_id, is_default)
  VALUES (p_owner_id, v_tenant.id, v_owner_role_id, v_is_default);

  INSERT INTO public.subscriptions(tenant_id, plan_id, status)
  VALUES (v_tenant.id, v_default_plan, 'active')
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_owner(TEXT, TEXT, UUID, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_with_owner(TEXT, TEXT, UUID, TEXT)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(TEXT, TEXT, UUID, TEXT)
  TO service_role;
