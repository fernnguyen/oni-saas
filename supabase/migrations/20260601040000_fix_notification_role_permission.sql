-- migration: 20260601040000_fix_notification_role_permission
-- Description: Fix user_has_notification_role to also support permission check as fallback
create or replace function public.user_has_notification_role(
  p_user_id    uuid,
  p_tenant_id  uuid,
  p_branch_id  uuid,
  p_role_code  text
) returns boolean
language plpgsql security definer stable
as $$
begin
  if p_role_code is null then
    return true;
  end if;

  return (
    -- Check tenant level role
    exists (
      select 1 from public.user_tenants ut
      join public.roles r on r.id = ut.role_id
      where ut.user_id = p_user_id 
        and ut.tenant_id = p_tenant_id 
        and r.code = p_role_code
    )
    -- Check shop level role
    or (
      p_branch_id is not null and exists (
        select 1 from public.user_shops us
        join public.roles r on r.id = us.role_id
        where us.user_id = p_user_id 
          and us.shop_id = p_branch_id 
          and r.code = p_role_code
      )
    )
    -- Fallback: Check if the role_code is actually a permission code and the user has that permission
    or public.user_has_permission(p_user_id, p_tenant_id, p_branch_id, p_role_code)
  );
end;
$$;
