create extension if not exists btree_gist;

create unique index if not exists bookings_work_order_id_unique
  on public.bookings (work_order_id)
  where work_order_id is not null;

alter table public.bookings
  drop constraint if exists bookings_no_active_overlap;

alter table public.bookings
  add constraint bookings_no_active_overlap
  exclude using gist (
    shop_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (shop_id is not null and status in ('pending', 'confirmed'));

create or replace function public.guard_customer_booking_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_user_id uuid;
begin
  if public.is_staff_for_shop(new.shop_id) then
    return new;
  end if;

  select c.user_id into v_customer_user_id
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

  if old.status in ('cancelled', 'completed') and new.status is distinct from old.status then
    raise exception 'Completed or cancelled bookings cannot be changed';
  end if;

  if new.status is distinct from old.status and not (
    old.status in ('pending', 'confirmed') and new.status = 'cancelled'
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
$$;

drop trigger if exists bookings_guard_customer_mutation on public.bookings;
create trigger bookings_guard_customer_mutation
before insert or update on public.bookings
for each row execute function public.guard_customer_booking_mutation();

create or replace function public.transition_booking_status_by_staff(
  p_booking_id uuid,
  p_status text
)
returns public.bookings
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_next text := lower(trim(coalesce(p_status, '')));
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;
  if not public.is_staff_for_shop(v_booking.shop_id) then raise exception 'Forbidden'; end if;
  if v_next not in ('pending', 'confirmed', 'cancelled', 'completed') then
    raise exception 'Invalid booking status';
  end if;

  if not (
    (coalesce(v_booking.status, 'pending') = 'pending' and v_next in ('pending', 'confirmed', 'cancelled'))
    or (v_booking.status = 'confirmed' and v_next in ('confirmed', 'cancelled', 'completed'))
    or (v_booking.status = 'cancelled' and v_next = 'cancelled')
    or (v_booking.status = 'completed' and v_next = 'completed')
  ) then
    raise exception 'Invalid booking status transition';
  end if;

  update public.bookings set status = v_next where id = p_booking_id returning * into v_booking;

  if v_booking.work_order_id is not null and v_next = 'confirmed' then
    update public.work_orders
    set status = 'approved', approval_state = 'approved'
    where id = v_booking.work_order_id and shop_id = v_booking.shop_id;
  elsif v_booking.work_order_id is not null and v_next = 'cancelled' then
    update public.work_orders
    set status = 'cancelled'
    where id = v_booking.work_order_id
      and shop_id = v_booking.shop_id
      and status = 'awaiting_approval';
  end if;

  return v_booking;
end;
$$;

grant execute on function public.transition_booking_status_by_staff(uuid, text) to authenticated;
