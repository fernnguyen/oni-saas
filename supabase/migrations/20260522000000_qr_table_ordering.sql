-- migration: 20260522000000_qr_table_ordering
-- Description: Core tables and RLS for QR Table Ordering (Plug-and-Play Realtime Module)

-- ─────────────────────────────────────────────────────────────
-- 1. Tables Creation
-- ─────────────────────────────────────────────────────────────

-- 1. qr_ordering_sessions
create table if not exists public.qr_ordering_sessions (
  id             text        primary key,
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  branch_id      uuid        not null references public.shops(id) on delete cascade,
  resource_id    text        not null,
  session_token  text        not null,
  status         text        not null default 'active', -- active | completed
  active         varchar(10) default 'TRUE',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_qr_ordering_sessions_tenant on public.qr_ordering_sessions(tenant_id);
create index if not exists idx_qr_ordering_sessions_branch on public.qr_ordering_sessions(branch_id);
create index if not exists idx_qr_ordering_sessions_lookup on public.qr_ordering_sessions(branch_id, resource_id, status);

-- 2. qr_session_carts
create table if not exists public.qr_session_carts (
  id                 text        primary key,
  tenant_id          uuid        not null references public.tenants(id) on delete cascade,
  session_id         text        not null references public.qr_ordering_sessions(id) on delete cascade,
  user_display_name  text,
  product_id         text        not null,
  sku                text,
  variant_id         text,
  product_name       text,
  qty                text        not null,
  unit_price         text        not null,
  modifiers          text,
  active             varchar(10) default 'TRUE',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_qr_session_carts_session on public.qr_session_carts(session_id);

-- 3. qr_order_requests
create table if not exists public.qr_order_requests (
  id             text        primary key,
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  branch_id      uuid        not null references public.shops(id) on delete cascade,
  session_id     text        not null references public.qr_ordering_sessions(id) on delete cascade,
  resource_id    text        not null,
  items          jsonb       not null,
  status         text        not null default 'pending', -- pending | accepted | rejected
  reject_reason  text,
  active         varchar(10) default 'TRUE',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_qr_order_requests_tenant on public.qr_order_requests(tenant_id);
create index if not exists idx_qr_order_requests_session on public.qr_order_requests(session_id);
create index if not exists idx_qr_order_requests_status on public.qr_order_requests(tenant_id, status);

-- ─────────────────────────────────────────────────────────────
-- 2. Enable RLS
-- ─────────────────────────────────────────────────────────────
alter table public.qr_ordering_sessions enable row level security;
alter table public.qr_session_carts enable row level security;
alter table public.qr_order_requests enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3. RLS Policies
-- ─────────────────────────────────────────────────────────────

-- 3.1 Policies for public.qr_ordering_sessions

create policy "receptionists_manage_sessions"
  on public.qr_ordering_sessions for all
  to authenticated
  using (
    public.user_has_permission(auth.uid(), tenant_id, branch_id, 'pos.use')
  )
  with check (
    public.user_has_permission(auth.uid(), tenant_id, branch_id, 'pos.use')
  );

create policy "anon_select_sessions"
  on public.qr_ordering_sessions for select
  to anon, authenticated
  using (
    status = 'active' and active = 'TRUE'
  );

-- 3.2 Policies for public.qr_session_carts

create policy "receptionists_manage_carts"
  on public.qr_session_carts for all
  to authenticated
  using (
    public.user_has_permission(auth.uid(), tenant_id, null, 'pos.use')
  )
  with check (
    public.user_has_permission(auth.uid(), tenant_id, null, 'pos.use')
  );

create policy "anon_manage_carts"
  on public.qr_session_carts for all
  to anon, authenticated
  using (
    exists (
      select 1 from public.qr_ordering_sessions s
      where s.id = session_id and s.status = 'active' and s.active = 'TRUE'
    )
  )
  with check (
    exists (
      select 1 from public.qr_ordering_sessions s
      where s.id = session_id and s.status = 'active' and s.active = 'TRUE'
    )
  );

-- 3.3 Policies for public.qr_order_requests

create policy "receptionists_manage_order_requests"
  on public.qr_order_requests for all
  to authenticated
  using (
    public.user_has_permission(auth.uid(), tenant_id, branch_id, 'pos.use')
  )
  with check (
    public.user_has_permission(auth.uid(), tenant_id, branch_id, 'pos.use')
  );

create policy "anon_select_order_requests"
  on public.qr_order_requests for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.qr_ordering_sessions s
      where s.id = session_id and s.status = 'active' and s.active = 'TRUE'
    )
  );

create policy "anon_insert_order_requests"
  on public.qr_order_requests for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.qr_ordering_sessions s
      where s.id = session_id and s.status = 'active' and s.active = 'TRUE'
    )
  );
