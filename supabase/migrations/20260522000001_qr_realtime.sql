-- migration: 20260522000001_qr_realtime
-- Description: Enable Supabase Realtime for QR Table Ordering tables

begin;

-- Check if publication exists before adding tables to it
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Check if table already added to avoid errors, or just execute add safely
    -- In postgres, we can alter publication to add tables
    alter publication supabase_realtime add table public.qr_ordering_sessions;
    alter publication supabase_realtime add table public.qr_order_requests;
    alter publication supabase_realtime add table public.qr_session_carts;
  end if;
exception
  when duplicate_object then
    -- Ignore if already added
    null;
end $$;

commit;
