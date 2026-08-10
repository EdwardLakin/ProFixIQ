\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '9a000000-0000-4000-8000-000000000001',
  'scheduler-owner@example.com',
  '{"full_name":"Scheduler Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, shop_id)
values (
  '9a000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  'owner',
  'Scheduler Owner',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type
)
values (
  '9b000000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001',
  'Universal Scheduler Test Shop',
  'Universal Scheduler Test Shop',
  10,
  true,
  0,
  365,
  'repair_facility'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = '9b000000-0000-4000-8000-000000000001'
where id = '9a000000-0000-4000-8000-000000000001';

insert into public.customers (
  id, shop_id, first_name, last_name, email
)
values (
  '9c000000-0000-4000-8000-000000000001',
  '9b000000-0000-4000-8000-000000000001',
  'Scheduler',
  'Customer',
  'scheduler-customer@example.com'
)
on conflict (id) do nothing;

do $$
declare
  v_fallback_count integer;
begin
  select count(*) into v_fallback_count
  from public.scheduling_resources r
  where r.shop_id = '9b000000-0000-4000-8000-000000000001'
    and r.is_fallback = true
    and r.active = true;

  if v_fallback_count <> 1 then
    raise exception 'Universal scheduler assertion failed: new shop did not receive one fallback capacity resource';
  end if;
end
$$;

-- Add two real bays. The fallback remains stored for compatibility but must no
-- longer count as capacity while real shop resources exist.
insert into public.scheduling_resources (
  id, shop_id, code, name, resource_type, mode,
  public_bookable, is_fallback, active, sort_order
)
values
  (
    '9d000000-0000-4000-8000-000000000001',
    '9b000000-0000-4000-8000-000000000001',
    'bay-1', 'Bay 1', 'bay', 'shop', true, false, true, 10
  ),
  (
    '9d000000-0000-4000-8000-000000000002',
    '9b000000-0000-4000-8000-000000000001',
    'bay-2', 'Bay 2', 'bay', 'shop', true, false, true, 20
  )
on conflict (id) do nothing;

set local role service_role;

do $$
declare
  v_a jsonb;
  v_b jsonb;
  v_c jsonb;
  v_a_id uuid;
  v_b_id uuid;
  v_a_event uuid;
  v_a_resource uuid;
  v_b_resource uuid;
  v_rescheduled_resource uuid;
  v_conflict_rejected boolean := false;
  v_public_resources integer;
begin
  v_a := public.scheduler_apply_booking_command_atomic(
    'create', null,
    '9b000000-0000-4000-8000-000000000001',
    '9c000000-0000-4000-8000-000000000001',
    null,
    '2099-02-01 09:00:00+00',
    '2099-02-01 10:00:00+00',
    'First bay job',
    '9a000000-0000-4000-8000-000000000001',
    'staff',
    'scheduler-runtime:create:a',
    null,
    '2099-01-01 00:00:00+00',
    'shop',
    null
  );
  v_a_id := (v_a -> 'booking' ->> 'id')::uuid;

  v_b := public.scheduler_apply_booking_command_atomic(
    'create', null,
    '9b000000-0000-4000-8000-000000000001',
    '9c000000-0000-4000-8000-000000000001',
    null,
    '2099-02-01 09:00:00+00',
    '2099-02-01 10:00:00+00',
    'Second simultaneous bay job',
    '9a000000-0000-4000-8000-000000000001',
    'staff',
    'scheduler-runtime:create:b',
    null,
    '2099-01-01 00:00:00+00',
    'shop',
    null
  );
  v_b_id := (v_b -> 'booking' ->> 'id')::uuid;

  select e.id, r.resource_id
  into v_a_event, v_a_resource
  from public.scheduling_events e
  join public.scheduling_reservations r
    on r.event_id = e.id and r.reservation_role = 'primary'
  where e.booking_id = v_a_id;

  select r.resource_id
  into v_b_resource
  from public.scheduling_events e
  join public.scheduling_reservations r
    on r.event_id = e.id and r.reservation_role = 'primary'
  where e.booking_id = v_b_id;

  if v_a_resource is null or v_b_resource is null or v_a_resource = v_b_resource then
    raise exception 'Universal scheduler assertion failed: simultaneous appointments did not occupy distinct bays';
  end if;

  if v_a_resource not in (
    '9d000000-0000-4000-8000-000000000001'::uuid,
    '9d000000-0000-4000-8000-000000000002'::uuid
  ) or v_b_resource not in (
    '9d000000-0000-4000-8000-000000000001'::uuid,
    '9d000000-0000-4000-8000-000000000002'::uuid
  ) then
    raise exception 'Universal scheduler assertion failed: fallback capacity was used after real bays existed';
  end if;

  begin
    v_c := public.scheduler_apply_booking_command_atomic(
      'create', null,
      '9b000000-0000-4000-8000-000000000001',
      '9c000000-0000-4000-8000-000000000001',
      null,
      '2099-02-01 09:00:00+00',
      '2099-02-01 10:00:00+00',
      'Third job should be rejected',
      '9a000000-0000-4000-8000-000000000001',
      'staff',
      'scheduler-runtime:create:c',
      null,
      '2099-01-01 00:00:00+00',
      'shop',
      null
    );
  exception
    when exclusion_violation then
      v_conflict_rejected := true;
  end;

  if not v_conflict_rejected then
    raise exception 'Universal scheduler assertion failed: over-capacity booking was accepted';
  end if;

  -- Pin another appointment to A's original bay in a later window, then move A
  -- into that window. A must hop to the other free bay rather than fail.
  v_c := public.scheduler_apply_booking_command_atomic(
    'create', null,
    '9b000000-0000-4000-8000-000000000001',
    '9c000000-0000-4000-8000-000000000001',
    null,
    '2099-02-01 11:00:00+00',
    '2099-02-01 12:00:00+00',
    'Pinned later bay job',
    '9a000000-0000-4000-8000-000000000001',
    'staff',
    'scheduler-runtime:create:pinned',
    null,
    '2099-01-01 00:00:00+00',
    'shop',
    v_a_resource
  );

  perform public.scheduler_apply_booking_command_atomic(
    'reschedule', v_a_id,
    null, null, null,
    '2099-02-01 11:00:00+00',
    '2099-02-01 12:00:00+00',
    'Moved job',
    '9a000000-0000-4000-8000-000000000001',
    'staff',
    'scheduler-runtime:move:a',
    null,
    '2099-01-01 00:00:00+00',
    'shop',
    null
  );

  select r.resource_id
  into v_rescheduled_resource
  from public.scheduling_events e
  join public.scheduling_reservations r
    on r.event_id = e.id and r.reservation_role = 'primary'
  where e.booking_id = v_a_id;

  if v_rescheduled_resource = v_a_resource then
    raise exception 'Universal scheduler assertion failed: automatic reschedule did not hop to the free bay';
  end if;

  -- Both real bays are public here; the compatibility fallback must not appear
  -- in public availability once real capacity exists.
  select jsonb_array_length(
    public.scheduler_availability_snapshot(
      '9b000000-0000-4000-8000-000000000001',
      '2099-02-02 00:00:00+00',
      '2099-02-03 00:00:00+00',
      'shop', true, null
    ) -> 'resources'
  ) into v_public_resources;

  if v_public_resources <> 2 then
    raise exception 'Universal scheduler assertion failed: public availability did not resolve exactly two real bays';
  end if;
end
$$;

-- Legacy/direct booking inserts still have to synchronize into the scheduler.
insert into public.bookings (
  id, shop_id, customer_id, starts_at, ends_at, status, notes, created_by
)
values (
  '9e000000-0000-4000-8000-000000000001',
  '9b000000-0000-4000-8000-000000000001',
  '9c000000-0000-4000-8000-000000000001',
  '2099-02-02 09:00:00+00',
  '2099-02-02 10:00:00+00',
  'pending',
  'Legacy projection check',
  '9a000000-0000-4000-8000-000000000001'
);

do $$
begin
  if not exists (
    select 1
    from public.scheduling_events e
    join public.scheduling_reservations r on r.event_id = e.id
    where e.booking_id = '9e000000-0000-4000-8000-000000000001'
      and r.status = 'active'
  ) then
    raise exception 'Universal scheduler assertion failed: legacy booking insert did not create a scheduler reservation';
  end if;
end
$$;

reset role;
rollback;
