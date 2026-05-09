-- Allow anonymous/public read access to plans (pricing page, plan selection)
alter table public.plans enable row level security;

create policy "plans are public readable"
  on public.plans for select
  using (true);
