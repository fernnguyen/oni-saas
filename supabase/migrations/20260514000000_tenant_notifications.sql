-- migration: 20260514000000_tenant_notifications

-- ─────────────────────────────────────────────────────────────
-- Tenant Notification Channels (Bot connections)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tenant_notification_channels (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  provider   text        not null,                         -- 'telegram' | 'zalo'
  is_active  boolean     not null default true,
  config     jsonb       not null default '{}'::jsonb,     -- e.g. {"bot_token": "...", "chat_id": "..."}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_notification_channels_tenant on public.tenant_notification_channels(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- Tenant Notification Events (Toggles for events)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tenant_notification_events (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  event_name text        not null,                         -- e.g. 'ORDER_CREATED'
  is_enabled boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, event_name)
);

create index if not exists idx_tenant_notification_events_tenant on public.tenant_notification_events(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- Bot Pairing Codes (For Telegram webhook setup)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.bot_pairing_codes (
  code       text        primary key,
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_bot_pairing_codes_tenant on public.bot_pairing_codes(tenant_id);
