-- migration: 20260507000003_shop_settings
-- Shop-level settings cache — synced from Google Sheet's Settings tab,
-- also editable directly from the ONI dashboard.
-- These values are the authoritative source for runtime reads (fast DB lookup).

create table if not exists public.shop_settings (
  shop_id                uuid        primary key references public.shops(id) on delete cascade,
  -- Core info
  shop_name              text,
  currency               text        not null default 'VND',
  timezone               text        not null default 'Asia/Ho_Chi_Minh',
  -- Sales behaviour
  tax_rate               numeric(5,2) not null default 0,
  invoice_prefix         text        not null default 'ORD',
  low_stock_threshold    int         not null default 5,
  allow_negative_stock   boolean     not null default false,
  default_price_type     text        not null default 'retail',
  -- Sync metadata
  synced_from_sheet_at   timestamptz,
  updated_at             timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.shop_settings enable row level security;

-- Any tenant member can read settings for shops they own
create policy "shop_settings_select"
  on public.shop_settings for select
  using (
    exists (
      select 1
      from public.shops s
      join public.user_tenants ut on ut.tenant_id = s.tenant_id
      where s.id = shop_settings.shop_id
        and ut.user_id = auth.uid()
    )
    or
    exists (
      select 1
      from public.user_shops us
      where us.shop_id = shop_settings.shop_id
        and us.user_id = auth.uid()
    )
  );

-- Only tenant-level members (owner/admin) can insert/update/delete
create policy "shop_settings_write"
  on public.shop_settings for all
  using (
    exists (
      select 1
      from public.shops s
      join public.user_tenants ut on ut.tenant_id = s.tenant_id
      where s.id = shop_settings.shop_id
        and ut.user_id = auth.uid()
    )
  );
