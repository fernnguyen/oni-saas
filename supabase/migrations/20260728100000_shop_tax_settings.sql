-- migration: 20260728100000_shop_tax_settings
-- Bổ sung các thông tin thuế chi tiết (Tax Profile) theo yêu cầu 01/TKN-CNKD và 01/CNKD

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS tax_owner_name       TEXT,           -- [01] Tên chủ hộ kinh doanh / người đại diện
  ADD COLUMN IF NOT EXISTS tax_email            TEXT,           -- [05] Email liên hệ thuế
  ADD COLUMN IF NOT EXISTS tax_industry_group   TEXT,           -- Mã nhóm thuế: phan_phoi | dich_vu | cho_thue | san_xuat | noi_dung_so | khac
  ADD COLUMN IF NOT EXISTS tax_period_type      TEXT            -- Kỳ khai: monthly | quarterly | annual
    DEFAULT 'annual',
  ADD COLUMN IF NOT EXISTS tax_method_tncn      TEXT            -- Phương pháp TNCN: rate_on_revenue (tỷ lệ %) | rate_on_income (thu nhập)
    DEFAULT 'rate_on_revenue';
