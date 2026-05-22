-- migration: 20260522000002_qr_cron_cleanup
-- Description: Create auto-cleanup function for expired QR Table Ordering sessions (older than 4 hours)

begin;

-- Create function to clean up sessions older than 4 hours
create or replace function public.cleanup_expired_qr_sessions()
returns void as $$
begin
  update public.qr_ordering_sessions
  set status = 'completed',
      updated_at = now()
  where status = 'active'
    and created_at < now() - interval '4 hours';
end;
$$ language plpgsql security definer;

-- Try to schedule with pg_cron if it exists in Supabase
do $$
begin
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) or exists (
    select 1 from pg_namespace where nspname = 'cron'
  ) then
    -- Schedule cleanup every 10 minutes
    -- Using perform to call the cron function dynamically to avoid syntax issues if not installed
    perform cron.schedule(
      'qr-session-cleanup',
      '*/10 * * * *',
      'select public.cleanup_expired_qr_sessions();'
    );
  end if;
exception
  when others then
    -- Silence any errors if pg_cron exists but permission is denied
    null;
end $$;

commit;
