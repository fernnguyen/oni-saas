-- Thay đổi tên các gói cước sang ngôn ngữ nội địa (Việt hóa)
UPDATE public.plans 
SET name = 'Khởi đầu' 
WHERE code = 'plan_mini';

UPDATE public.plans 
SET name = 'Chuyên nghiệp' 
WHERE code = 'plan_pro';

UPDATE public.plans 
SET name = 'Doanh nghiệp' 
WHERE code = 'plan_enterprise';
