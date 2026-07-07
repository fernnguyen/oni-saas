-- migration: 20260707000001_normalize_plan_metadata
-- Normalize all plan metadata to match the freemium model:
--   plan_mini   = Tiên phong (free forever, limited)
--   plan_pro    = Chuyên nghiệp (paid, generous limits)
--   plan_enterprise = Doanh nghiệp (unlimited, contact sales)
--
-- Metadata keys convention:
--   create_shop          int   = max branches (-1 = unlimited)
--   create_shop_user     int   = max staff per shop (-1 = unlimited)
--   max_products         int   = max products per shop (-1 = unlimited)
--   max_orders_per_month int   = max orders per month across tenant (-1 = unlimited)
--   create_connector     int   = max DB connectors per shop (-1 = unlimited)
--   create_domain        int   = max custom domains (-1 = unlimited)
--   qr_table_ordering    bool  = QR table ordering feature gate
--   crm                  bool  = CRM & loyalty feature gate
--   can_use_push_notify  bool  = push notifications
--   show_public          bool  = show in public pricing page (omit = true)

-- ── plan_mini (Tiên phong) ─────────────────────────────────────────────────
update public.plans
set metadata = '{
  "create_shop": 1,
  "create_shop_user": 1,
  "max_products": 100,
  "max_orders_per_month": 300,
  "create_connector": 1,
  "create_domain": 0,
  "qr_table_ordering": false,
  "crm": false,
  "can_use_push_notify": false,
  "tax_report": true,
  "show_public": true
}'::jsonb
where code = 'plan_mini';

-- ── plan_pro (Chuyên nghiệp) ───────────────────────────────────────────────
update public.plans
set metadata = '{
  "create_shop": 10,
  "create_shop_user": 20,
  "max_products": -1,
  "max_orders_per_month": -1,
  "create_connector": 2,
  "create_domain": 3,
  "qr_table_ordering": true,
  "crm": true,
  "can_use_push_notify": true,
  "can_use_custom_notify": false,
  "tax_report": true,
  "show_public": true
}'::jsonb
where code = 'plan_pro';

-- ── plan_enterprise (Doanh nghiệp) ────────────────────────────────────────
update public.plans
set metadata = '{
  "create_shop": -1,
  "create_shop_user": -1,
  "max_products": -1,
  "max_orders_per_month": -1,
  "create_connector": -1,
  "create_domain": -1,
  "qr_table_ordering": true,
  "crm": true,
  "can_use_push_notify": true,
  "can_use_custom_notify": true,
  "tax_report": true,
  "show_public": true
}'::jsonb
where code = 'plan_enterprise';
