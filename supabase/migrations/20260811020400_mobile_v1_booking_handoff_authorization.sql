begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- The legacy booking mutation guard predates the canonical Mobile V1
-- workOrderCreators role group. Keep the customer protections intact while
-- permitting only the internal null -> linked work-order handoff performed by
-- mobile_materialize_service_visit_work_order_atomic().
--
-- Do not broaden is_staff_for_shop(): that helper is shared by older RLS
-- policies. This exception is deliberately scoped to this booking boundary.
create or replace function public.guard_customer_booking_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_customer_user_id uuid;
begin
  -- Trusted server writes retain the lifecycle restrictions established by the
  -- canonical portal hardening migration.
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'INSERT' then
      if coalesce(new.status, 'pending') <> 'pending' then
        raise exception 'Portal bookings must begin as pending';
      end if;
      return new;
    end if;

    if old.status in ('cancelled', 'completed')
       and new.status is distinct from old.status then
      raise exception 'Completed or cancelled bookings cannot be changed';
    end if;

    if old.status = 'confirmed' and new.status = 'pending' then
      raise exception 'Confirmed bookings cannot return to pending';
    end if;

    return new;
  end if;

  -- Preserve the legacy staff path exactly as-is for roles already recognized
  -- by the shared helper.
  if public.is_staff_for_shop(new.shop_id) then
    return new;
  end if;

  -- Mobile V1 uses the canonical workOrderCreators group, which includes
  -- service/lead-hand/foreman roles not represented by the legacy helper. Give
  -- those actors only the internal booking -> work-order linkage mutation. The
  -- consistency trigger still proves the linked WO has the same shop/customer/
  -- vehicle, while all scheduling/customer fields remain immutable here.
  if tg_op = 'UPDATE'
     and public.mobile_can_manage_work_orders(new.shop_id, auth.uid())
     and old.work_order_id is null
     and new.work_order_id is not null
     and nullif(trim(coalesce(
       new.lifecycle_metadata ->> 'mobile_work_order_handoff_operation_key',
       ''
     )), '') is not null
     and new.shop_id is not distinct from old.shop_id
     and new.customer_id is not distinct from old.customer_id
     and new.vehicle_id is not distinct from old.vehicle_id
     and new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at
     and new.status is not distinct from old.status
     and new.notes is not distinct from old.notes then
    return new;
  end if;

  select c.user_id
  into v_customer_user_id
  from public.customers c
  where c.id = new.customer_id;

  if v_customer_user_id is distinct from auth.uid() then
    raise exception 'Booking does not belong to the current customer';
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending') <> 'pending' then
      raise exception 'Customer bookings must begin as pending';
    end if;
    return new;
  end if;

  if old.status in ('cancelled', 'completed')
     and new.status is distinct from old.status then
    raise exception 'Completed or cancelled bookings cannot be changed';
  end if;

  if new.status is distinct from old.status
     and not (
       old.status in ('pending', 'confirmed')
       and new.status = 'cancelled'
     ) then
    raise exception 'Customers may only cancel an active booking';
  end if;

  if new.shop_id is distinct from old.shop_id
     or new.customer_id is distinct from old.customer_id
     or new.vehicle_id is distinct from old.vehicle_id
     or new.work_order_id is distinct from old.work_order_id
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.notes is distinct from old.notes then
    raise exception 'Customers cannot edit protected booking fields';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_customer_booking_mutation()
  from public, anon, authenticated, service_role;
grant execute on function public.guard_customer_booking_mutation()
  to service_role;

notify pgrst, 'reload schema';

commit;
