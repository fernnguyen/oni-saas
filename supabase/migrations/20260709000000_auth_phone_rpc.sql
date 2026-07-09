-- Function to get a user's email by phone number (used for sign-in bypass)
CREATE OR REPLACE FUNCTION get_user_by_phone(p_phone TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user json;
BEGIN
  -- We query the private auth.users table using security definer
  SELECT row_to_json(u) INTO v_user
  FROM auth.users u
  WHERE u.phone = p_phone
  LIMIT 1;
  
  RETURN v_user;
END;
$$;

-- Function to check if a phone number exists for any OTHER user (used during registration)
CREATE OR REPLACE FUNCTION check_phone_exists(p_phone TEXT, p_exclude_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 
    FROM auth.users 
    WHERE phone = p_phone 
    AND id != p_exclude_user_id
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

-- Grant execute permissions to service_role only to prevent public abuse
REVOKE EXECUTE ON FUNCTION get_user_by_phone(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_user_by_phone(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_by_phone(TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION check_phone_exists(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_phone_exists(TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION check_phone_exists(TEXT, UUID) TO service_role;
