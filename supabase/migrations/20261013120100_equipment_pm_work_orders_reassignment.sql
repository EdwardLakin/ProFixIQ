-- Keep active Equipment PM/work-order links consistent when an existing work
-- order is reassigned or rematerialized. The original link stays in history;
-- if the work order no longer belongs to the linked asset/shop (or becomes an
-- estimate), the active link is automatically unlinked.

create or replace function public.equipment_pm_work_orders_reconcile_work_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shop_id is distinct from old.shop_id
     or new.vehicle_id is distinct from old.vehicle_id
     or new.record_type is distinct from old.record_type then
    update public.equipment_pm_work_orders l
    set
      unlinked_at = now(),
      unlinked_by = null
    where l.work_order_id = new.id
      and l.unlinked_at is null
      and (
        l.shop_id is distinct from new.shop_id
        or l.vehicle_id is distinct from new.vehicle_id
        or lower(regexp_replace(btrim(coalesce(new.record_type, '')), '[\s-]+', '_', 'g')) = 'estimate'
      );
  end if;

  return new;
end;
$$;

revoke all on function public.equipment_pm_work_orders_reconcile_work_order()
  from public, anon, authenticated;

drop trigger if exists trg_equipment_pm_work_orders_reconcile_work_order on public.work_orders;
create trigger trg_equipment_pm_work_orders_reconcile_work_order
after update of shop_id, vehicle_id, record_type on public.work_orders
for each row execute function public.equipment_pm_work_orders_reconcile_work_order();
