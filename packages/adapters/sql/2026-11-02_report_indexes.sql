-- Report indexes (docs: "Tối ưu truy vấn báo cáo trên Postgres", giai đoạn 1).
--
-- Applied automatically on every deploy by sql/apply.mjs, right before
-- `drizzle-kit push`: CONCURRENTLY builds without blocking POS writes, and
-- drizzle then sees indexes with the same names and skips them.
-- Run by hand (local or production) with: pnpm db:sql:pg
-- Keep every statement idempotent (IF NOT EXISTS): it runs on each deploy.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_branch_created_at
  ON orders (tenant_id, branch_id, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_returns_tenant_branch_created_at
  ON returns (tenant_id, branch_id, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_tenant_branch_order
  ON order_items (tenant_id, branch_id, order_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_tenant_branch_order
  ON payments (tenant_id, branch_id, order_id);

ANALYZE orders;
ANALYZE returns;
ANALYZE order_items;
ANALYZE payments;
