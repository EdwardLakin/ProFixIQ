begin;

alter table public.bookings
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists lifecycle_metadata jsonb not null default '{}'::jsonb;

create or replace function public.apply_portal_booking_command_atomic(
  p_action text,
  p_booking_id uuid,
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text,
  p_actor_user_id uuid,
  p_actor_mode text,
  p_operation_key text,
  p_reason text default null,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_mode text := lower(trim(coalesce(p_actor_mode, '')));
  v_now timestamptz := coalesce(p_at, now());
  v_booking public.bookings%rowtype;
  v_customer public.customers%rowtype;
  v_shop public.shops%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_id uuid;
  v_min_notice integer;
  v_max_lead integer;
begin
  if v_action not in ('create','reschedule','cancel') then
    raise exception using errcode = 'P0001', message = 'Unsupported booking action.';
  end if;
  if v_mode not in ('customer','staff') then
    raise exception using errcode = 'P0001', message = 'Unsupported booking actor mode.';
  end if;
  if p_actor_user_id is null or nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'Authenticated actor and stable operation key are required.';
  end if;

  select result into v_existing
  from public.portal_lifecycle_operation_keys
  where operation_name = 'portal_booking_' || v_action
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  if v_action = 'create' then
    if p_shop_id is null or p_customer_id is null then
      raise exception using errcode = 'P0001', message = 'Shop and customer are required.';
    end if;

    select * into v_shop from public.shops where id = p_shop_id for update;
    if not found or v_shop.accepts_online_booking is false then
      raise exception using errcode = 'P0001', message = 'Shop is not accepting online bookings.';
    end if;

    select * into v_customer from public.customers where id = p_customer_id for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Customer not found.';
    end if;
    if v_mode = 'customer' and v_customer.user_id is distinct from p_actor_user_id then
      raise exception using errcode = 'P0001', message = 'Customer booking actor mismatch.';
    end if;
    if v_mode = 'staff' and not exists (
      select 1 from public.profiles p
      where p.id = p_actor_user_id and p.shop_id = p_shop_id
        and lower(coalesce(p.role::text, '')) in ('owner','admin','manager','advisor')
    ) then
      raise exception using errcode = 'P0001', message = 'Staff booking actor is not authorized.';
    end if;
    if v_customer.shop_id is not null and v_customer.shop_id <> p_shop_id then
      raise exception using errcode = 'P0001', message = 'Customer belongs to another shop.';
    end if;

    if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
      raise exception using errcode = 'P0001', message = 'Valid booking times are required.';
    end if;
    v_min_notice := coalesce(v_shop.min_notice_minutes, 120);
    v_max_lead := coalesce(v_shop.max_lead_days, 30);
    if p_starts_at < v_now + make_interval(mins => v_min_notice) then
      raise exception using errcode = 'P0001', message = 'Booking does not satisfy minimum notice.';
    end if;
    if p_starts_at > v_now + make_interval(days => v_max_lead) then
      raise exception using errcode = 'P0001', message = 'Booking exceeds maximum lead time.';
    end if;

    if p_vehicle_id is not null and not exists (
      select 1 from public.vehicles v
      where v.id = p_vehicle_id and v.customer_id = p_customer_id and v.shop_id = p_shop_id
    ) then
      raise exception using errcode = 'P0001', message = 'Vehicle does not belong to this customer and shop.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text, 0));
    if exists (
      select 1 from public.bookings b
      where b.shop_id = p_shop_id
        and lower(coalesce(b.status, '')) not in ('cancelled','completed')
        and b.starts_at < p_ends_at and b.ends_at > p_starts_at
    ) then
      raise exception using errcode = '23P01', message = 'This time overlaps an existing booking.';
    end if;

    update public.customers
    set shop_id = p_shop_id
    where id = p_customer_id and shop_id is null;

    insert into public.bookings(
      shop_id, customer_id, vehicle_id, starts_at, ends_at, status, notes,
      created_by, updated_at, lifecycle_metadata
    ) values (
      p_shop_id, p_customer_id, p_vehicle_id, p_starts_at, p_ends_at,
      'pending', nullif(trim(coalesce(p_notes, '')), ''), p_actor_user_id, v_now,
      jsonb_build_object('created_actor_mode', v_mode, 'created_operation_key', p_operation_key)
    ) returning id into v_id;
  else
    select * into v_booking
    from public.bookings
    where id = p_booking_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Booking not found.';
    end if;

    if v_mode = 'customer' then
      select * into v_customer from public.customers where id = v_booking.customer_id;
      if v_customer.user_id is distinct from p_actor_user_id then
        raise exception using errcode = 'P0001', message = 'Booking is not owned by this customer.';
      end if;
    elsif not exists (
      select 1 from public.profiles p
      where p.id = p_actor_user_id and p.shop_id = v_booking.shop_id
        and lower(coalesce(p.role::text, '')) in ('owner','admin','manager','advisor')
    ) then
      raise exception using errcode = 'P0001', message = 'Staff booking actor is not authorized.';
    end if;

    if lower(coalesce(v_booking.status, '')) in ('cancelled','completed') then
      raise exception using errcode = 'P0001', message = 'Booking is already in a terminal state.';
    end if;
    if v_booking.work_order_id is not null then
      raise exception using errcode = 'P0001', message = 'Work-order-linked booking requires staff work-order workflow.';
    end if;
    if v_mode = 'customer' and v_booking.starts_at <= v_now then
      raise exception using errcode = 'P0001', message = 'Past bookings cannot be changed by the customer.';
    end if;

    if v_action = 'cancel' then
      update public.bookings
      set status = 'cancelled',
          cancelled_at = v_now,
          cancelled_by = p_actor_user_id,
          cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
          updated_at = v_now,
          lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb) ||
            jsonb_build_object('cancelled_actor_mode', v_mode, 'cancelled_operation_key', p_operation_key)
      where id = v_booking.id;
      v_id := v_booking.id;
    else
      select * into v_shop from public.shops where id = v_booking.shop_id;
      if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
        raise exception using errcode = 'P0001', message = 'Valid booking times are required.';
      end if;
      v_min_notice := coalesce(v_shop.min_notice_minutes, 120);
      v_max_lead := coalesce(v_shop.max_lead_days, 30);
      if p_starts_at < v_now + make_interval(mins => v_min_notice) then
        raise exception using errcode = 'P0001', message = 'Booking does not satisfy minimum notice.';
      end if;
      if p_starts_at > v_now + make_interval(days => v_max_lead) then
        raise exception using errcode = 'P0001', message = 'Booking exceeds maximum lead time.';
      end if;

      perform pg_advisory_xact_lock(hashtextextended(v_booking.shop_id::text, 0));
      if exists (
        select 1 from public.bookings b
        where b.shop_id = v_booking.shop_id and b.id <> v_booking.id
          and lower(coalesce(b.status, '')) not in ('cancelled','completed')
          and b.starts_at < p_ends_at and b.ends_at > p_starts_at
      ) then
        raise exception using errcode = '23P01', message = 'This time overlaps an existing booking.';
      end if;

      update public.bookings
      set starts_at = p_starts_at,
          ends_at = p_ends_at,
          notes = case when p_notes is null then notes else nullif(trim(p_notes), '') end,
          updated_at = v_now,
          lifecycle_metadata = coalesce(lifecycle_metadata, '{}'::jsonb) ||
            jsonb_build_object('rescheduled_actor_mode', v_mode, 'rescheduled_operation_key', p_operation_key)
      where id = v_booking.id;
      v_id := v_booking.id;
    end if;
  end if;

  select jsonb_build_object(
    'ok', true,
    'booking', to_jsonb(b),
    'action', v_action,
    'idempotent', false
  ) into v_result
  from public.bookings b where b.id = v_id;

  insert into public.portal_lifecycle_operation_keys(
    operation_name, operation_key, actor_user_id, customer_id, shop_id, result
  )
  select 'portal_booking_' || v_action, p_operation_key, p_actor_user_id,
         b.customer_id, b.shop_id, v_result
  from public.bookings b where b.id = v_id
  on conflict (operation_name, operation_key) do nothing;

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id, 'portal_booking_' || v_action, 'bookings', v_id,
    jsonb_build_object('actor_mode', v_mode, 'operation_key', p_operation_key)
  );

  return v_result;
end;
$$;

revoke all on function public.apply_portal_booking_command_atomic(text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid, text, text, text, timestamptz) from public;
grant execute on function public.apply_portal_booking_command_atomic(text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid, text, text, text, timestamptz) to authenticated, service_role;

commit;
