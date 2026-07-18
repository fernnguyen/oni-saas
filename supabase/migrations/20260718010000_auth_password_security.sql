-- Check whether a Supabase auth user already has a password set.
CREATE OR REPLACE FUNCTION public.get_auth_user_has_password(p_user_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = p_user_id
      AND encrypted_password IS NOT NULL
      AND encrypted_password <> ''
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_auth_user_has_password(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_has_password(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_has_password(UUID) TO service_role;
