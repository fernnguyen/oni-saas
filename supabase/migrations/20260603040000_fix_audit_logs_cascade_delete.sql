-- migration: 20260603040000_fix_audit_logs_cascade_delete
-- ONI.vn — Alter public.audit_logs foreign keys to cascade delete when tenant or shop is deleted

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_logs_shop_id_fkey;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id)
    ON DELETE CASCADE,
  ADD CONSTRAINT audit_logs_shop_id_fkey
    FOREIGN KEY (shop_id)
    REFERENCES public.shops(id)
    ON DELETE CASCADE;
