-- Migrate plan metadata from static keys to action-based dynamic keys.
-- Old: { max_shops, max_users, max_connectors_per_shop, max_custom_domains }
-- New: { create_shop, create_shop_user, create_connector, create_domain }
--
-- Convention: key = action name (e.g. create_shop), value = max count (-1 = unlimited)
-- Adding a new limit = add a key to metadata + register the counter in planLimits.ts

update public.plans set metadata = jsonb_build_object(
  'create_shop',      coalesce((metadata->>'max_shops')::int,               -1),
  'create_shop_user', coalesce((metadata->>'max_users')::int,               -1),
  'create_connector', coalesce((metadata->>'max_connectors_per_shop')::int, -1),
  'create_domain',    coalesce((metadata->>'max_custom_domains')::int,      -1)
);

-- Update create_shop() to read from new key
create or replace function public.create_shop(
  p_tenant_id uuid,
  p_name      text,
  p_slug      text,
  p_address   text default null
) returns public.shops
language plpgsql security definer
as $$
declare
  v_shop    public.shops;
  v_meta    jsonb;
  v_max     int;
  v_cur     int;
begin
  v_meta := public.get_tenant_plan_meta(p_tenant_id);

  if v_meta is null then
    raise exception 'Tenant has no active subscription';
  end if;

  v_max := coalesce((v_meta->>'create_shop')::int, -1);

  select count(*) into v_cur
  from public.shops where tenant_id = p_tenant_id;

  if v_max <> -1 and v_cur >= v_max then
    raise exception 'plan_limit_exceeded:create_shop:%:%', v_cur, v_max;
  end if;

  insert into public.shops(tenant_id, name, slug, address)
  values (p_tenant_id, p_name, p_slug, p_address)
  returning * into v_shop;

  return v_shop;
end;
$$;
