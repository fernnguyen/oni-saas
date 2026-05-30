-- migration: 20260530000000_invitation_codes_and_settings
-- Add invitation codes, tracking, and system configuration updates

-- 1. Create invitation_codes table
create table if not exists public.invitation_codes (
  code        text        primary key,
  max_uses    integer,    -- NULL means unlimited uses
  used_count  integer     not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);

-- 2. Create invitation_code_uses table to track who and when used the code
create table if not exists public.invitation_code_uses (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null references public.invitation_codes(code) on delete cascade,
  tenant_id   uuid        references public.tenants(id) on delete set null,
  email       text        not null,
  used_at     timestamptz not null default now()
);

-- 3. Enable Row-Level Security (RLS)
alter table public.invitation_codes enable row level security;
alter table public.invitation_code_uses enable row level security;

-- Only service_role/admin bypasses RLS and handles these tables, no public policies needed.

-- 4. Atomic function to increment invitation code uses safely
create or replace function public.increment_invitation_code_uses(p_code text)
returns void
language plpgsql security definer
as $$
begin
  update public.invitation_codes
  set used_count = used_count + 1
  where code = p_code;
end;
$$;

-- 5. Safely initialize/merge registration settings into system_settings config
update public.system_settings
set config = config || '{"registration_mode": "free", "require_email_verification": false}'::jsonb
where id = 'global';
