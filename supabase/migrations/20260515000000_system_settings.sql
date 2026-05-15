-- migration: 20260515000000_system_settings
-- Global settings for Super Admin

create table if not exists public.system_settings (
  id          text        primary key, -- e.g. 'global'
  config      jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Initialize global settings with Sentry debug turned off by default
insert into public.system_settings (id, config) 
values ('global', '{"enable_sentry_debug": false}'::jsonb) 
on conflict (id) do nothing;
