-- migration: 20260601000000_shop_level_notifications

-- 1. Clean up old data since we are starting fresh at shop level
truncate table public.bot_pairing_codes cascade;
truncate table public.tenant_notification_events cascade;
truncate table public.tenant_notification_channels cascade;

-- 2. Alter tenant_notification_channels to add shop_id as NOT NULL
alter table public.tenant_notification_channels 
  add column shop_id uuid not null references public.shops(id) on delete cascade;

-- Create index for shop_id
create index if not exists idx_tenant_notification_channels_shop 
  on public.tenant_notification_channels(shop_id);

-- 3. Alter tenant_notification_events to add shop_id as NOT NULL
alter table public.tenant_notification_events 
  add column shop_id uuid not null references public.shops(id) on delete cascade;

-- Create index for shop_id
create index if not exists idx_tenant_notification_events_shop 
  on public.tenant_notification_events(shop_id);

-- Drop old unique constraint on tenant_notification_events
alter table public.tenant_notification_events
  drop constraint if exists tenant_notification_events_tenant_id_event_name_key;

-- Add new unique constraint on shop_id and event_name
alter table public.tenant_notification_events
  add constraint tenant_notification_events_shop_id_event_name_key unique (shop_id, event_name);

-- 4. Alter bot_pairing_codes to add shop_id as NOT NULL
alter table public.bot_pairing_codes 
  add column shop_id uuid not null references public.shops(id) on delete cascade;

-- Create index for shop_id
create index if not exists idx_bot_pairing_codes_shop 
  on public.bot_pairing_codes(shop_id);
