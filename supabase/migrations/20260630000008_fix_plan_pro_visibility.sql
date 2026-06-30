-- migration: 20260630000008_fix_plan_pro_visibility.sql
-- Ensure plan_pro is visible to the public

update public.plans
set metadata = metadata - 'show_public' || '{"show_public": true}'::jsonb
where code = 'plan_pro';
