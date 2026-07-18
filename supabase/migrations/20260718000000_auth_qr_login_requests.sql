-- migration: 20260718000000_auth_qr_login_requests
-- Description: Supabase-backed request store for QR login confirmation flow

create table if not exists public.auth_qr_login_requests (
  token             varchar(255) primary key,
  requested_origin  text not null,
  requested_host    varchar(255) not null,
  tenant_slug       varchar(255),
  status            varchar(32) not null default 'pending',
  session_payload   jsonb,
  confirmed_user_id uuid references auth.users(id) on delete set null,
  confirmed_name    varchar(255),
  confirmed_avatar  text,
  confirmed_at      timestamptz,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_auth_qr_login_requests_status_expires_at
  on public.auth_qr_login_requests(status, expires_at);

create index if not exists idx_auth_qr_login_requests_requested_host
  on public.auth_qr_login_requests(requested_host);

alter table public.auth_qr_login_requests enable row level security;

create policy "deny_client_access_to_qr_login_requests"
  on public.auth_qr_login_requests
  for all
  to anon, authenticated
  using (false)
  with check (false);
