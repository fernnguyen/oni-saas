-- migration: 20260507000002_tenant_user_profiles_v2
-- Add account_type and login_email columns to tenant_user_profiles.
-- Also relax username NOT NULL (to support personal-email accounts).

alter table public.tenant_user_profiles
  alter column username drop not null;

alter table public.tenant_user_profiles
  add column if not exists account_type text not null default 'workspace'
    check (account_type in ('workspace', 'personal'));

alter table public.tenant_user_profiles
  add column if not exists login_email text;

-- Back-fill login_email for existing rows (workspace accounts only)
-- username@[tenant-slug].oni.vn — we reconstruct from username + tenant slug
update public.tenant_user_profiles tup
set login_email = tup.username || '@' || t.slug || '.oni.vn'
from public.tenants t
where tup.tenant_id = t.id
  and tup.login_email is null
  and tup.username is not null;

-- After back-fill, enforce NOT NULL
alter table public.tenant_user_profiles
  alter column login_email set not null;
