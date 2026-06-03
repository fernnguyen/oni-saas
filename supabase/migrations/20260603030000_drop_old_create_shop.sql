-- migration: 20260603030000_drop_old_create_shop
-- ONI.vn — Drop the old overloaded create_shop function to resolve candidate ambiguity

DROP FUNCTION IF EXISTS public.create_shop(uuid, text, text, text);
