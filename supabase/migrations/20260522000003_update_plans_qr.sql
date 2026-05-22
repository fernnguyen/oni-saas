-- migration: 20260522000003_update_plans_qr
-- Description: Update subscription plans metadata to include qr_table_ordering feature gate (Phase 2)

begin;

-- Add qr_table_ordering feature key to default plans metadata
update public.plans 
set metadata = metadata || '{"qr_table_ordering": false}'::jsonb 
where code = 'plan_mini';

update public.plans 
set metadata = metadata || '{"qr_table_ordering": true}'::jsonb 
where code = 'plan_pro';

update public.plans 
set metadata = metadata || '{"qr_table_ordering": true}'::jsonb 
where code = 'plan_enterprise';

commit;
