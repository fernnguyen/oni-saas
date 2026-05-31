-- migration: 20260531090000_backpopulate_asset_branch
-- Backpopulates branch_id for public.assets and public.asset_depreciations from the tenant's first/default shop

-- 1. Backpopulate branch_id in public.assets if null or empty
UPDATE public.assets a
SET branch_id = (
  SELECT s.id 
  FROM public.shops s 
  WHERE s.tenant_id = a.tenant_id 
  ORDER BY s.created_at ASC 
  LIMIT 1
)
WHERE a.branch_id IS NULL OR a.branch_id = '';

-- 2. Backpopulate branch_id in public.asset_depreciations if null or empty
UPDATE public.asset_depreciations ad
SET branch_id = (
  SELECT s.id 
  FROM public.shops s 
  WHERE s.tenant_id = ad.tenant_id 
  ORDER BY s.created_at ASC 
  LIMIT 1
)
WHERE ad.branch_id IS NULL OR ad.branch_id = '';
