-- migration: 20260622170000_fix_shops_rls_recursion
-- Description: Fix infinite recursion in RLS policies for shops and user_shops tables

-- 1. Create a security definer helper function for safely querying a shop's tenant_id bypassing RLS
create or replace function public.get_shop_tenant_id(p_shop_id uuid)
returns uuid
language sql security definer stable
as $$
  select tenant_id from public.shops where id = p_shop_id;
$$;

-- 2. Drop the recursive SELECT policies on public.shops
drop policy if exists "users can view shops in their tenants" on public.shops;
drop policy if exists "users can view shops assigned to them directly" on public.shops;

-- 3. Re-create the SELECT policy on public.shops using the security definer access helper
create policy "users can view shops"
  on public.shops for select
  to authenticated
  using (
    public.user_has_shop_access(auth.uid(), id)
  );

-- 4. Drop and re-create the policies on public.user_shops to use the helper functions
drop policy if exists "users can view shop memberships in their tenants" on public.user_shops;
drop policy if exists "owner can manage shop memberships" on public.user_shops;
drop policy if exists "owner can remove shop memberships" on public.user_shops;

-- SELECT policy using the security definer access helper (prevents recursion)
create policy "users can view shop memberships"
  on public.user_shops for select
  to authenticated
  using (
    public.user_has_shop_access(auth.uid(), shop_id)
  );

-- INSERT policy using get_shop_tenant_id
create policy "owner can manage shop memberships"
  on public.user_shops for insert
  to authenticated
  with check (
    public.user_has_permission(
      auth.uid(),
      public.get_shop_tenant_id(shop_id),
      shop_id,
      'users.invite'
    )
  );

-- DELETE policy using get_shop_tenant_id
create policy "owner can remove shop memberships"
  on public.user_shops for delete
  to authenticated
  using (
    public.user_has_permission(
      auth.uid(),
      public.get_shop_tenant_id(shop_id),
      shop_id,
      'users.remove'
    )
  );
