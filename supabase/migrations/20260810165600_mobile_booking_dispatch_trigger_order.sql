begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- PostgreSQL executes triggers with the same timing/event alphabetically. The
-- Universal Scheduler must project a booking first; Dispatch then attaches the
-- Service Visit to that canonical event instead of creating a competing event.
drop trigger if exists bookings_sync_mobile_dispatch_visit on public.bookings;
drop trigger if exists bookings_zz_sync_mobile_dispatch_visit on public.bookings;

create trigger bookings_zz_sync_mobile_dispatch_visit
after insert or update of starts_at, ends_at, work_order_id, status, lifecycle_metadata
on public.bookings
for each row execute function public.sync_mobile_booking_to_dispatch_visit();

notify pgrst, 'reload schema';

commit;
