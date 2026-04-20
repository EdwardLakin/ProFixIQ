-- Phase 5: booking/request transaction safety
-- Adds DB-backed guarantees for portal request start flow under concurrent/replay submits.

create extension if not exists btree_gist;

-- 1) Keep exactly one booking row per work order when linked.
create unique index if not exists bookings_work_order_id_unique
  on public.bookings (work_order_id)
  where work_order_id is not null;

-- 2) Idempotency key uniqueness for portal request start path (stored in work_orders.source_row_id).
create unique index if not exists work_orders_portal_start_source_row_id_unique
  on public.work_orders (source_row_id)
  where source_row_id is not null
    and source_row_id like 'portal_start:%';

-- 3) Active booking slot overlap prevention at DB level.
alter table public.bookings
  drop constraint if exists bookings_no_active_overlap;

alter table public.bookings
  add constraint bookings_no_active_overlap
  exclude using gist (
    shop_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (
    shop_id is not null
    and status in ('pending', 'confirmed')
  );

-- 4) Atomic portal request start helper: creates work order + linked booking in one transaction.
create or replace function public.portal_request_start_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_visit_type text,
  p_notes text,
  p_source_row_id text default null
)
returns table (
  work_order_id uuid,
  booking_id uuid,
  deduped boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_work_order_id uuid;
  v_booking_id uuid;
  v_existing_work_order_id uuid;
  v_existing_booking_id uuid;
  v_normalized_visit_type text;
begin
  v_normalized_visit_type := case
    when p_visit_type = 'waiter' then 'waiter'
    when p_visit_type = 'drop_off' then 'drop_off'
    else null
  end;

  if p_shop_id is null or p_customer_id is null then
    raise exception 'Missing shop/customer for portal request start';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Invalid booking window';
  end if;

  if v_normalized_visit_type is null then
    raise exception 'visitType must be waiter or drop_off';
  end if;

  if p_source_row_id is not null and length(trim(p_source_row_id)) > 0 then
    select w.id
      into v_existing_work_order_id
    from public.work_orders w
    where w.shop_id = p_shop_id
      and w.customer_id = p_customer_id
      and w.source_row_id = p_source_row_id
    order by w.created_at desc nulls last
    limit 1;

    if v_existing_work_order_id is not null then
      select b.id
        into v_existing_booking_id
      from public.bookings b
      where b.work_order_id = v_existing_work_order_id
      order by b.created_at desc
      limit 1;

      if v_existing_booking_id is not null then
        return query
        select v_existing_work_order_id, v_existing_booking_id, true;
        return;
      end if;
    end if;
  end if;

  -- Work order shell is created first, booking second, inside one DB transaction boundary.
  insert into public.work_orders (
    shop_id,
    customer_id,
    vehicle_id,
    status,
    approval_state,
    is_waiter,
    scheduled_at,
    notes,
    source_row_id
  )
  values (
    p_shop_id,
    p_customer_id,
    p_vehicle_id,
    'awaiting_approval',
    'pending',
    (v_normalized_visit_type = 'waiter'),
    p_starts_at,
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_source_row_id, '')), '')
  )
  returning id into v_work_order_id;

  insert into public.bookings (
    shop_id,
    customer_id,
    vehicle_id,
    work_order_id,
    starts_at,
    ends_at,
    status,
    notes
  )
  values (
    p_shop_id,
    p_customer_id,
    p_vehicle_id,
    v_work_order_id,
    p_starts_at,
    p_ends_at,
    'pending',
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_booking_id;

  return query
  select v_work_order_id, v_booking_id, false;
exception
  when unique_violation then
    if p_source_row_id is not null and length(trim(p_source_row_id)) > 0 then
      select w.id
        into v_existing_work_order_id
      from public.work_orders w
      where w.shop_id = p_shop_id
        and w.customer_id = p_customer_id
        and w.source_row_id = p_source_row_id
      order by w.created_at desc nulls last
      limit 1;

      if v_existing_work_order_id is not null then
        select b.id
          into v_existing_booking_id
        from public.bookings b
        where b.work_order_id = v_existing_work_order_id
        order by b.created_at desc
        limit 1;

        if v_existing_booking_id is not null then
          return query
          select v_existing_work_order_id, v_existing_booking_id, true;
          return;
        end if;
      end if;
    end if;

    raise;
  when exclusion_violation then
    raise exception 'This time overlaps an existing booking'
      using errcode = 'P0001';
end;
$$;

grant execute on function public.portal_request_start_atomic(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text,
  text,
  text
) to authenticated;
