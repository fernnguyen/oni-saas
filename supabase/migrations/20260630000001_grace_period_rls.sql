-- migration: 20260630000001_grace_period_rls
-- Restrict write permissions during grace period (past_due)

create or replace function public.user_has_permission(
  p_user_id    uuid,
  p_tenant_id  uuid,
  p_shop_id    uuid,    -- null for tenant-only actions (billing, etc.)
  p_permission text
) returns boolean
language plpgsql stable security definer
as $$
declare
  v_role_code text;
  v_role_id   int;
  v_sub_status text;
begin
  -- 0. Check subscription status (Grace period / Locked)
  -- Allow read-only (.view, .view_shop, etc.) and billing management
  if p_permission not like '%view%' and p_permission not like 'billing.%' then
    select status into v_sub_status from public.subscriptions where tenant_id = p_tenant_id limit 1;
    if v_sub_status in ('past_due', 'locked', 'deleted') then
      return false;
    end if;
  end if;

  -- 1. tenant-level membership
  select r.code, r.id into v_role_code, v_role_id
  from public.user_tenants ut
  join public.roles r on r.id = ut.role_id
  where ut.user_id = p_user_id and ut.tenant_id = p_tenant_id;

  if v_role_code = 'owner' then
    return true;
  end if;

  if v_role_id is not null then
    return exists (
      select 1
      from public.role_permissions rp
      join public.permissions perm on perm.id = rp.permission_id
      where rp.role_id = v_role_id and perm.code = p_permission
    );
  end if;

  -- 2. shop-level membership (staff assigned to specific shop)
  if p_shop_id is not null then
    return exists (
      select 1
      from public.user_shops us
      join public.role_permissions rp on rp.role_id = us.role_id
      join public.permissions perm on perm.id = rp.permission_id
      where us.user_id = p_user_id
        and us.shop_id = p_shop_id
        and perm.code = p_permission
    );
  end if;

  return false;
end;
$$;
