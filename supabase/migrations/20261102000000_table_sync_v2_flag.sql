-- migration: 20261102000000_table_sync_v2_flag
-- Per-shop feature flag for table/room/court sync v2 (docs/TABLE-SESSION-SYNC-PLAN.md Phase 1).
-- Default off: shops keep the existing (Phase 0) table flow until explicitly enabled.

alter table public.shop_settings
  add column if not exists table_sync_v2 boolean not null default false;
