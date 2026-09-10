-- Historical-import work orders are archival records, not new service visits.
-- Keep the carry-forward trigger attached to operational work-order creation
-- while explicitly excluding imported history at the trigger boundary.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15min';

drop trigger if exists trg_work_orders_carry_forward_deferred_work
  on public.work_orders;

create trigger trg_work_orders_carry_forward_deferred_work
after insert on public.work_orders
for each row
when (
  new.vehicle_id is not null
  and new.archived_at is null
  and coalesce(new.record_type::text, 'work_order') = 'work_order'
  and coalesce(new.type::text, '') <> 'historical_import'
)
execute function public.carry_forward_deferred_work_for_work_order();

commit;
