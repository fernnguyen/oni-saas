-- migration: 20260513000002_reserved_subdomains_and_subscription_notes

create table if not exists public.reserved_subdomains (
  subdomain text primary key,
  created_at timestamptz not null default now()
);

-- Seed reserved subdomains
insert into public.reserved_subdomains (subdomain) values
  ('oni'), ('admin'), ('backend'), ('frontend'), ('cdn'), ('mail'),
  ('api'), ('app'), ('www'), ('blog'), ('support'), ('help'), ('docs'),
  ('status'), ('dev'), ('test'), ('staging'), ('localhost'), ('auth'),
  ('super'), ('superadmin'), ('dashboard')
on conflict do nothing;

-- Add notes to subscriptions
alter table public.subscriptions
  add column if not exists notes text;
