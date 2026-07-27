-- ============================================================
-- Migration: Security Hotfixes
-- 1. rate_limit_events   — lightweight table for API rate limiting
-- 2. get_user_by_phone   — restrict returned fields (M-5)
-- ============================================================

-- ── 1. rate_limit_events ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key         text        NOT NULL,   -- e.g. "password_reset:user_id"
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Composite index for fast window queries
CREATE INDEX IF NOT EXISTS rate_limit_events_key_time_idx
  ON public.rate_limit_events (key, created_at DESC);

-- RLS: only service_role may read/write
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- No policies → only service_role (which bypasses RLS) can access
-- anon/authenticated cannot touch this table at all

-- Auto-prune: pg_cron job removes events older than 24h (if pg_cron enabled)
-- If pg_cron is not enabled, events accumulate but queries stay fast via the index.
-- Run manually if needed: DELETE FROM public.rate_limit_events WHERE created_at < now() - interval '24 hours';

-- ── 2. Fix get_user_by_phone — return only safe fields ──────
-- Old version returned row_to_json(u) which included encrypted_password.
-- New version returns only the fields needed by server code.
CREATE OR REPLACE FUNCTION get_user_by_phone(p_phone TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user json;
BEGIN
  SELECT json_build_object(
    'id',             u.id,
    'email',          u.email,
    'phone',          u.phone,
    'user_metadata',  u.raw_user_meta_data,
    'created_at',     u.created_at
  ) INTO v_user
  FROM auth.users u
  WHERE u.phone = p_phone
  LIMIT 1;

  RETURN v_user;
END;
$$;

-- Permissions unchanged: service_role only
REVOKE EXECUTE ON FUNCTION get_user_by_phone(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_user_by_phone(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_by_phone(TEXT) TO service_role;
