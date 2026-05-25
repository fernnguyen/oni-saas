-- migration: 20260525000004_in_app_notifications_realtime
-- Description: Enable Supabase Realtime for in_app_notifications table via publication

begin;

-- Check if publication exists before adding tables to it
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.in_app_notifications;
  end if;
exception
  when duplicate_object then
    -- Ignore if already added
    null;
end $$;

commit;
