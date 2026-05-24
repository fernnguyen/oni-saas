-- migration: 20260524000005_default_payment_fund_on_shop_create
-- ONI.vn — Automatically seed default counter cash fund on shop creation

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
  v_fund_id text;
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

  -- Seeding default cash fund
  v_fund_id := 'PF-' || upper(substring(p_tenant_id::text, 1, 8)) || '-' || floor(random() * (99999 - 10000 + 1) + 10000)::text;

  insert into public.payment_funds(id, tenant_id, branch_id, name, type, initial_balance, current_balance, is_default, active)
  values (v_fund_id, p_tenant_id::text, v_shop.id::text, 'Quỹ tiền mặt tại quầy', 'cash', '0', '0', 'TRUE', 'TRUE');

  return v_shop;
end;
$$;
