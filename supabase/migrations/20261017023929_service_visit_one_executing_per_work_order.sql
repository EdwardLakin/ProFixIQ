begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- ===========================================================================
-- CONTRACT CHANGE (explicitly requested): at most ONE service visit per work
-- order may be in physical execution at a time.
--
-- Scope is deliberately narrower than "one active visit": multiple `scheduled`
-- visits for a work order remain valid (multi-day jobs, return trips booked
-- ahead, separate bookings), as documented by the booking projection. Only the
-- executing statuses are exclusive, because two simultaneous travelling or
-- working visits drive contradictory dispatch state.
--
-- Consumers affected: dispatch_transition_service_visit_atomic (moving a
-- second visit into an executing status now fails with unique_violation),
-- mobile replay transitions, and any path that links a booking/work order to a
-- visit that is already executing. dispatch_create_service_visit_atomic and
-- the booking projection create `scheduled` visits and are unaffected.
-- Rollback: drop index public.service_visits_one_executing_per_work_order_uniq;
-- ===========================================================================

-- Never repair ambiguous history automatically: stop if duplicates exist.
do $audit$
declare
  v_conflicts integer;
begin
  select count(*) into v_conflicts
  from (
    select sv.work_order_id
    from public.service_visits sv
    where sv.work_order_id is not null
      and sv.status in ('dispatched', 'en_route', 'arrived', 'working', 'paused')
    group by sv.work_order_id
    having count(*) > 1
  ) conflicting;

  if v_conflicts > 0 then
    raise exception using
      errcode = '23505',
      message = format(
        'Cannot enforce one executing visit per work order: %s work order(s) already have several. Resolve them first.',
        v_conflicts
      );
  end if;
end
$audit$;

create unique index if not exists service_visits_one_executing_per_work_order_uniq
  on public.service_visits (work_order_id)
  where work_order_id is not null
    and status in ('dispatched', 'en_route', 'arrived', 'working', 'paused');

comment on index public.service_visits_one_executing_per_work_order_uniq is
  'A work order may have at most one service visit in physical execution (dispatched through paused). Scheduled visits are not limited.';

commit;
