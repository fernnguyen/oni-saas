-- migration: 20260606000001_push_tokens
-- Description: Push token storage for Expo Push Notifications (multi-tenant)
-- Follows patterns established in 20260525000002_in_app_notifications

-- ─────────────────────────────────────────────────────────────
-- 1. Table Creation
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,                -- Expo Push Token (ExponentPushToken[xxx])
  device_name TEXT,                         -- Tên thiết bị
  platform    TEXT NOT NULL DEFAULT 'ios',  -- ios | android
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

-- ─────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id
  ON public.push_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_tenant_id
  ON public.push_tokens(tenant_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_active
  ON public.push_tokens(tenant_id, is_active)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────
-- 3. Enable RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS Policies
-- ─────────────────────────────────────────────────────────────

-- 4.1 Users can view, insert, update, and delete their own push tokens
CREATE POLICY "users_manage_own_push_tokens"
  ON public.push_tokens FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4.2 Service role can query tokens by tenant for backend push delivery
--     (service_role bypasses RLS by default, but explicit policy for clarity)
CREATE POLICY "service_role_manage_push_tokens"
  ON public.push_tokens FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 5. Auto-update updated_at trigger
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_push_tokens_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_push_tokens_updated_at();
