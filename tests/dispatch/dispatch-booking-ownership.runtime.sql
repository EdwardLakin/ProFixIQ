\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('8a200000-0000-4000-8000-000000000001', 'dispatch-lock-owner@example.com', '{"full_name":"Dispatch Lock Owner"}'::jsonb),
  ('8a200000-0000-4000-8000-000000000002', 'dispatch-lock-tech@example.com', '{"full_name":"Dispatch Lock Tech"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  ('8a200000-0000-4000-8000-000000000001', '8a200000-0000-4000-8000-000000000001', 'owner', 'Dispatch Lock Owner', 'dispatch-lock-owner@example.com', null),
  ('8a200000-0000-4000-8000-000000000002', '8a200000-0000-4000-8000-000000000002', 'mechanic', 'Dispatch Lock Tech', 'dispatch-lock-tech@example.com', null)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type
)
values (
  '8b200000-0000-4000-8000-000000000001',
  '8a200000-0000-4000-8000-000000000001',
  'Dispatch Ownership Shop', 'Dispatch Ownership Shop', 10,
  true, 0, 365, 'repair_facility'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = '8b200000-0000-4000-8000-000000000001'
where id in (
  '8a200000-0000-4000-8000-000000000001',
  '8a200000-0000-4000-8000-000000000002'
);

insert into public.customers (id, shop_id, first_name, last_name, email)
values (
  '8c200000-0000-4000-8000-000000000001',
  '8b200000-0000-4000-8000-000000000001',
  'Dispatch', 'Lock', 'dispatch-lock-customer@example.com'
)
on conflict (id) do nothing;

insert into public.service_vehicles (id, shop_id, name, unit_number, active)
values (
  '8d200000-0000-4000-8000-000000000001',
  '8b200000-0000-4000-8000-000000000001',
  'Ownership Truck', 'OWN-1', true
)
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_booking jsonb;
  v_booking_id uuid;
  v_visit_id uuid;
  v_blocked boolean := false;
  v_late_blocked boolean := false;
  v_booking_start timestamptz;
  v_visit_start timestamptz;
  v_booking_status text;
begin
  v_booking := public.scheduler_apply_booking_command_atomic(
    'create', null,
    '8b200000-0000-4000-8000-000000000001',
    '8c200000-0000-4000-8000-000000000001',
    null,
    '2099-04-01 09:00:00+00', '2099-04-01 10:00:00+00',
    'Dispatch ownership test',
    '8a200000-0000-4000-8000-000000000001', 'staff',
    'dispatch-lock:booking', null,
    '2099-01-01 00:00:00+00', 'mobile', null
  );
  v_booking_id := (v_booking -> 'booking' ->> 'id')::uuid;
  select id into v_visit_id
  from public.service_visits
  where booking_id = v_booking_id;

  if v_visit_id is null then
    raise exception 'Dispatch ownership assertion failed: mobile booking did not project a visit';
  end if;

  perform public.dispatch_assign_service_visit_atomic(
    '8b200000-0000-4000-8000-000000000001',
    v_visit_id,
    '8a200000-0000-4000-8000-000000000002',
    '8d200000-0000-4000-8000-000000000001',
    null,
    '8a200000-0000-4000-8000-000000000001',
    'dispatch-lock:assign'
  );
  perform public.dispatch_transition_service_visit_atomic(
    '8b200000-0000-4000-8000-000000000001',
    v_visit_id, 'dispatched', null, null, null,
    '8a200000-0000-4000-8000-000000000001',
    'dispatch-lock:dispatched'
  );

  begin
    update public.bookings
    set starts_at = '2099-04-01 12:00:00+00',
        ends_at = '2099-04-01 13:00:00+00'
    where id = v_booking_id;
  exception when raise_exception then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Dispatch ownership assertion failed: legacy booking reschedule moved a dispatched visit';
  end if;

  perform public.dispatch_reschedule_service_visit_atomic(
    '8b200000-0000-4000-8000-000000000001',
    v_visit_id,
    '2099-04-01 10:00:00+00', '2099-04-01 11:00:00+00',
    null,
    '8a200000-0000-4000-8000-000000000001',
    'dispatch-lock:canonical-reschedule'
  );

  select starts_at into v_booking_start from public.bookings where id = v_booking_id;
  select scheduled_start into v_visit_start from public.service_visits where id = v_visit_id;
  if v_booking_start <> '2099-04-01 10:00:00+00'::timestamptz
     or v_visit_start <> '2099-04-01 10:00:00+00'::timestamptz then
    raise exception 'Dispatch ownership assertion failed: canonical dispatch reschedule did not move booking and visit together';
  end if;

  perform public.dispatch_transition_service_visit_atomic(
    '8b200000-0000-4000-8000-000000000001',
    v_visit_id, 'en_route', null, null, null,
    '8a200000-0000-4000-8000-000000000002',
    'dispatch-lock:en-route'
  );

  begin
    perform public.dispatch_reschedule_service_visit_atomic(
      '8b200000-0000-4000-8000-000000000001',
      v_visit_id,
      '2099-04-01 14:00:00+00', '2099-04-01 15:00:00+00',
      null,
      '8a200000-0000-4000-8000-000000000001',
      'dispatch-lock:late-reschedule'
    );
  exception when raise_exception then
    v_late_blocked := true;
  end;
  if not v_late_blocked then
    raise exception 'Dispatch ownership assertion failed: visit rescheduled after travel started';
  end if;

  perform public.dispatch_transition_service_visit_atomic(
    '8b200000-0000-4000-8000-000000000001',
    v_visit_id, 'arrived', null, null, null,
    '8a200000-0000-4000-8000-000000000002',
    'dispatch-lock:arrived'
  );
  perform public.dispatch_transition_service_visit_atomic(
    '8b200000-0000-4000-8000-000000000001',
    v_visit_id, 'working', null, null, null,
    '8a200000-0000-4000-8000-000000000002',
    'dispatch-lock:working'
  );
  perform public.dispatch_transition_service_visit_atomic(
    '8b200000-0000-4000-8000-000000000001',
    v_visit_id, 'completed', null, null, null,
    '8a200000-0000-4000-8000-000000000002',
    'dispatch-lock:completed'
  );

  select status into v_booking_status from public.bookings where id = v_booking_id;
  if lower(coalesce(v_booking_status, '')) <> 'completed' then
    raise exception 'Dispatch ownership assertion failed: terminal visit did not mirror completed state to booking';
  end if;
end
$$;

reset role;
rollback;
