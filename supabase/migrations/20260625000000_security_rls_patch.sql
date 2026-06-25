-- migration: 20260625000000_security_rls_patch
-- Description: Security audit fixes — Enable RLS on 7 unprotected tables,
--   fix SECURITY DEFINER functions, tighten shop_settings + audit_logs policies.
-- 
-- ⚠️ PRODUCTION-SAFE: Tất cả code hiện tại truy cập các bảng này qua
--   getSupabaseAdminClient() (service_role) nên bypass RLS hoàn toàn.
--   Migration này chỉ chặn direct Supabase client calls (anon key).
--
-- ROLLBACK: Nếu có vấn đề, chạy phần ROLLBACK ở cuối file.

-- ═══════════════════════════════════════════════════════════════
-- PHASE 1.1: Enable RLS cho 7 bảng thiếu
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. feature_flags ────────────────────────────────────────
-- Hiện trạng: KHÔNG CÓ RLS. Bất kỳ user nào có thể read/write feature flags
-- của TẤT CẢ tenants qua anon key.
-- Code references: features.ts, super/tenants — đều qua admin client (safe).
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_select_tenant_member"
  ON public.feature_flags FOR SELECT
  TO authenticated
  USING (
    public.user_has_tenant_access(auth.uid(), tenant_id)
  );
-- INSERT/UPDATE/DELETE: chỉ qua service_role (super admin panel)

-- ─── 2. tenant_notification_channels ─────────────────────────
-- Hiện trạng: KHÔNG CÓ RLS. Chứa bot_token và chat_id — CRITICAL.
-- Code references: notificationsActions.ts, webhook — đều qua admin client.
ALTER TABLE public.tenant_notification_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_channels_select_tenant_member"
  ON public.tenant_notification_channels FOR SELECT
  TO authenticated
  USING (
    public.user_has_tenant_access(auth.uid(), tenant_id)
  );

CREATE POLICY "notification_channels_manage_tenant_admin"
  ON public.tenant_notification_channels FOR ALL
  TO authenticated
  USING (
    public.user_has_permission(auth.uid(), tenant_id, null, 'tenants.manage')
  )
  WITH CHECK (
    public.user_has_permission(auth.uid(), tenant_id, null, 'tenants.manage')
  );

-- ─── 3. tenant_notification_events ───────────────────────────
-- Hiện trạng: KHÔNG CÓ RLS. Notification toggles accessible cross-tenant.
ALTER TABLE public.tenant_notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_events_select_tenant_member"
  ON public.tenant_notification_events FOR SELECT
  TO authenticated
  USING (
    public.user_has_tenant_access(auth.uid(), tenant_id)
  );

CREATE POLICY "notification_events_manage_tenant_admin"
  ON public.tenant_notification_events FOR ALL
  TO authenticated
  USING (
    public.user_has_permission(auth.uid(), tenant_id, null, 'tenants.manage')
  )
  WITH CHECK (
    public.user_has_permission(auth.uid(), tenant_id, null, 'tenants.manage')
  );

-- ─── 4. bot_pairing_codes ────────────────────────────────────
-- Hiện trạng: KHÔNG CÓ RLS. Pairing codes readable by any user.
-- Code references: Telegram webhook route — qua admin client.
ALTER TABLE public.bot_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_pairing_select_tenant_member"
  ON public.bot_pairing_codes FOR SELECT
  TO authenticated
  USING (
    public.user_has_tenant_access(auth.uid(), tenant_id)
  );
-- INSERT/DELETE: chỉ qua service_role (webhook + admin panel)

-- ─── 5. system_settings ─────────────────────────────────────
-- Hiện trạng: KHÔNG CÓ RLS. Controls registration_mode, trial_days.
-- Code references: register route, settings.ts, _helpers.ts — đều qua admin client.
-- NOTE: register/page.tsx đọc qua server component (admin) nhưng cần
--   SELECT policy cho authenticated users để đọc config an toàn.
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Cho phép authenticated users ĐỌC (cần cho register page, shop settings)
CREATE POLICY "system_settings_public_read"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);
-- Write: chỉ qua service_role (super admin)

-- ─── 6. reserved_subdomains ──────────────────────────────────
-- Hiện trạng: KHÔNG CÓ RLS. Reserved slugs modifiable by anyone.
-- Code references: register/check-slug — qua admin client.
-- Cần anon read vì check-slug có thể chạy trước khi user đăng nhập.
ALTER TABLE public.reserved_subdomains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reserved_subdomains_public_read"
  ON public.reserved_subdomains FOR SELECT
  TO anon, authenticated
  USING (true);
-- Write: chỉ qua service_role

-- ─── 7. system_tax_groups ────────────────────────────────────
-- Hiện trạng: KHÔNG CÓ RLS. Tax rates modifiable by anyone.
ALTER TABLE public.system_tax_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_tax_groups_public_read"
  ON public.system_tax_groups FOR SELECT
  TO authenticated
  USING (true);
-- Write: chỉ qua service_role


-- ═══════════════════════════════════════════════════════════════
-- PHASE 1.2: Fix SECURITY DEFINER functions
-- Pattern: IF auth.uid() IS NOT NULL → enforce check
--   Service role (auth.uid() = NULL) → bypass check (backward compatible)
-- ═══════════════════════════════════════════════════════════════

-- ─── Fix create_tenant_with_owner ────────────────────────────
-- Dựa trên phiên bản mới nhất từ 20260516000000_industry_type.sql
-- Thêm: chặn gán owner_id khác auth.uid() khi gọi từ client
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
  -- SECURITY: Nếu gọi từ client (có auth context), chỉ cho phép tự gán mình
  -- Service role (admin client) có auth.uid() = NULL → skip check
  IF auth.uid() IS NOT NULL AND p_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot assign a different user as owner';
  END IF;

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

-- ─── Fix create_shop ─────────────────────────────────────────
-- Dựa trên phiên bản mới nhất từ 20260531080000_shop_level_industry.sql
-- Thêm: chặn tạo shop trong tenant mà user không thuộc về
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
  -- SECURITY: Nếu gọi từ client, kiểm tra user thuộc tenant
  -- Service role (admin client) có auth.uid() = NULL → skip check
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'User does not belong to this tenant';
    END IF;
  END IF;

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


-- ═══════════════════════════════════════════════════════════════
-- PHASE 1.3: Fix shop_settings write + audit_logs insert policies
-- ═══════════════════════════════════════════════════════════════

-- ─── Fix shop_settings_write ─────────────────────────────────
-- Hiện trạng: ANY tenant member (kể cả viewer/staff) có thể write.
-- Server-side (settings/route.ts:193) đã check settings.manage — an toàn.
-- Fix chỉ chặn direct client calls không qua API.
DROP POLICY IF EXISTS "shop_settings_write" ON public.shop_settings;

CREATE POLICY "shop_settings_write_with_permission"
  ON public.shop_settings FOR ALL
  TO authenticated
  USING (
    public.user_has_permission(
      auth.uid(),
      (SELECT s.tenant_id FROM public.shops s WHERE s.id = shop_settings.shop_id),
      shop_settings.shop_id,
      'settings.manage'
    )
  )
  WITH CHECK (
    public.user_has_permission(
      auth.uid(),
      (SELECT s.tenant_id FROM public.shops s WHERE s.id = shop_settings.shop_id),
      shop_settings.shop_id,
      'settings.manage'
    )
  );

-- ─── Fix audit_logs INSERT ───────────────────────────────────
-- Hiện trạng: Chỉ check auth.uid() is not null → bất kỳ user nào insert cho
-- BẤT KỲ tenant. Scope to user's own tenant.
DROP POLICY IF EXISTS "audit_logs insert" ON public.audit_logs;

CREATE POLICY "audit_logs_insert_scoped"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      tenant_id IS NULL
      OR public.user_has_tenant_access(auth.uid(), tenant_id)
    )
  );


-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK SQL (chạy nếu có vấn đề)
-- ═══════════════════════════════════════════════════════════════
-- 
-- -- 1.1 Disable RLS cho 7 bảng
-- ALTER TABLE public.feature_flags DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tenant_notification_channels DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tenant_notification_events DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.bot_pairing_codes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.system_settings DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.reserved_subdomains DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.system_tax_groups DISABLE ROW LEVEL SECURITY;
-- 
-- -- Drop new policies
-- DROP POLICY IF EXISTS "feature_flags_select_tenant_member" ON public.feature_flags;
-- DROP POLICY IF EXISTS "notification_channels_select_tenant_member" ON public.tenant_notification_channels;
-- DROP POLICY IF EXISTS "notification_channels_manage_tenant_admin" ON public.tenant_notification_channels;
-- DROP POLICY IF EXISTS "notification_events_select_tenant_member" ON public.tenant_notification_events;
-- DROP POLICY IF EXISTS "notification_events_manage_tenant_admin" ON public.tenant_notification_events;
-- DROP POLICY IF EXISTS "bot_pairing_select_tenant_member" ON public.bot_pairing_codes;
-- DROP POLICY IF EXISTS "system_settings_public_read" ON public.system_settings;
-- DROP POLICY IF EXISTS "reserved_subdomains_public_read" ON public.reserved_subdomains;
-- DROP POLICY IF EXISTS "system_tax_groups_public_read" ON public.system_tax_groups;
-- 
-- -- 1.3 Restore old policies
-- DROP POLICY IF EXISTS "shop_settings_write_with_permission" ON public.shop_settings;
-- CREATE POLICY "shop_settings_write"
--   ON public.shop_settings FOR ALL
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.shops s
--       JOIN public.user_tenants ut ON ut.tenant_id = s.tenant_id
--       WHERE s.id = shop_settings.shop_id AND ut.user_id = auth.uid()
--     )
--   );
-- 
-- DROP POLICY IF EXISTS "audit_logs_insert_scoped" ON public.audit_logs;
-- CREATE POLICY "audit_logs insert"
--   ON public.audit_logs FOR INSERT
--   WITH CHECK (auth.uid() IS NOT NULL);
