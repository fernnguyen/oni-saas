-- Hàm lấy mobile_version public, bỏ qua RLS của system_settings
CREATE OR REPLACE FUNCTION public.get_mobile_version()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(config->'mobile_version', '{}'::jsonb) 
  FROM public.system_settings 
  WHERE id = 'global';
$$;

-- Cấp quyền execute cho cả khách vô danh và người dùng đã đăng nhập
GRANT EXECUTE ON FUNCTION public.get_mobile_version() TO anon, authenticated;
