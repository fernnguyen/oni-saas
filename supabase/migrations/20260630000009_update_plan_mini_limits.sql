-- Add max_products to plan_mini
update public.plans
set metadata = metadata || '{"max_products": 200}'::jsonb
where code = 'plan_mini';
