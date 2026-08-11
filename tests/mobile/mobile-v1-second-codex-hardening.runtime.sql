\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('9a400000-0000-4000-8000-000000000001', 'mobile-second-owner@example.com', '{"full_name":"Second Review Owner"}'::jsonb),
  ('9a400000-0000-4000-8000-000000000002', 'mobile-second-service@example.com', '{"full_name":"Second Review Service"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  ('9a400000-0000-4000-8000-000000000001', '9a400000-0000-4000-8000-000000000001', 'owner', 'Second Review Owner', 'mobile-second-owner@example.com', null),
  ('9a400000-0000-4000-8000-000000000002', '9a400000-0000-4000-8000-000000000002', 'service', 'Second Review Service', 'mobile-second-service@example.com', null)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type, country, billing_entitlement_override
)
values (
  '9b400000-0000-4000-8000-000000000001',
  '9a400000-0000-4000-8000-000000000001',
  'Second Review Runtime', 'Second Review Runtime', 10,
  true, 0, 365, 'repair_facility', 'US', 'internal_demo'
)
on conflict (id) do update
set country = 'US',
    billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = '9b400000-0000-4000-8000-000000000001'
where id in (
  '9a400000-0000-4000-8000-000000000001',
  '9a400000-0000-4000-8000-000000000002'
);

-- Pre-existing canonical vehicle for the same owner must never be adopted by
-- Mobile setup just because primary_user_id matches.
insert into public.service_vehicles(
  id, shop_id, name, unit_number, primary_user_id,
  active, capabilities, created_by
) values (
  '9d400000-0000-4000-8000-000000000001',
  '9b400000-0000-4000-8000-000000000001',
  'Legacy Service Truck', 'LEGACY-1',
  '9a400000-0000-4000-8000-000000000001',
  true, '{}'::jsonb,
  '9a400000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a400000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_config jsonb;
  v_intake jsonb;
  v_visit_id uuid;
  v_booking_id uuid;
  v_mobile_vehicle_id uuid;
begin
  v_config := public.mobile_configure_service_v1_atomic(
    '9b400000-0000-4000-8000-000000000001',
    'mobile', true, false, true, false, 60, 1, true,
    'Mobile Managed Truck', 'MOBILE-1',
    '9a400000-0000-4000-8000-000000000001'
  );
  v_mobile_vehicle_id := (v_config ->> 'serviceVehicleId')::uuid;

  if v_mobile_vehicle_id is null
     or v_mobile_vehicle_id = '9d400000-0000-4000-8000-000000000001' then
    raise exception 'Second review failed: Mobile setup adopted the legacy truck';
  end if;
  if exists (
    select 1 from public.service_vehicles sv
    where sv.id = '9d400000-0000-4000-8000-000000000001'
      and coalesce(sv.capabilities, '{}'::jsonb) @> '{"mobile_v1":true}'::jsonb
  ) then
    raise exception 'Second review failed: legacy truck was stamped mobile_v1';
  end if;

  -- Reconfigure to shop-only. A caller asking for mobile must still produce a
  -- shop booking/visit and must not require a customer service address.
  perform public.mobile_configure_service_v1_atomic(
    '9b400000-0000-4000-8000-000000000001',
    'shop', false, false, false, false, 60, 1, true,
    null, null,
    '9a400000-0000-4000-8000-000000000001'
  );

  v_intake := public.mobile_create_service_call_atomic(
    '9b400000-0000-4000-8000-000000000001',
    null, 'Shop Intake Customer', '303-555-0401',
    null, 2021, 'Ford', 'Transit', 'SHOP0401',
    null, null, null, null,
    'Oil service at shop',
    '2099-09-01 16:00:00+00', 60, 149.00, 'CAD', 'mobile',
    '9a400000-0000-4000-8000-000000000001',
    'mobile-v1:second-review:shop-intake'
  );

  v_visit_id := (v_intake ->> 'serviceVisitId')::uuid;
  v_booking_id := (v_intake ->> 'bookingId')::uuid;
  if v_intake ->> 'serviceMode' <> 'shop' then
    raise exception 'Second review failed: shop-only configuration emitted mobile mode';
  end if;
  if not exists (
    select 1
    from public.bookings b
    join public.service_visits sv on sv.booking_id = b.id
    where b.id = v_booking_id
      and b.lifecycle_metadata ->> 'service_mode' = 'shop'
      and sv.id = v_visit_id
      and sv.mode = 'shop'
      and sv.service_address_id is null
  ) then
    raise exception 'Second review failed: shop intake did not preserve shop mode';
  end if;

  -- Disabling Mobile vehicle tracking must not deactivate or mutate the legacy
  -- truck that existed before Mobile setup.
  if not exists (
    select 1 from public.service_vehicles sv
    where sv.id = '9d400000-0000-4000-8000-000000000001'
      and sv.active
      and not (coalesce(sv.capabilities, '{}'::jsonb) @> '{"mobile_v1":true}'::jsonb)
  ) then
    raise exception 'Second review failed: legacy truck changed when Mobile tracking was disabled';
  end if;

  perform set_config('mobile_second.visit_id', v_visit_id::text, true);
end;
$$;

reset role;

-- Service staff use the canonical workOrderCreators/billing-adjacent role and
-- must be able to start repair and action the future-work queue.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a400000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $$
declare
  v_visit_id uuid := current_setting('mobile_second.visit_id')::uuid;
  v_handoff jsonb;
  v_work_order_id uuid;
  v_followup jsonb;
  v_followup_id uuid;
begin
  v_handoff := public.mobile_materialize_service_visit_work_order_atomic(
    '9b400000-0000-4000-8000-000000000001',
    v_visit_id,
    '9a400000-0000-4000-8000-000000000002',
    'mobile-v1:second-review:service-handoff'
  );
  v_work_order_id := (v_handoff ->> 'workOrderId')::uuid;
  if v_work_order_id is null then
    raise exception 'Second review failed: service role could not create WO handoff';
  end if;

  v_followup := public.mobile_create_service_followup_atomic(
    '9b400000-0000-4000-8000-000000000001',
    v_work_order_id, v_visit_id,
    'Future recommendation', 'quote_later', 500, null, null,
    '9a400000-0000-4000-8000-000000000002',
    'mobile-v1:second-review:service-followup'
  );
  v_followup_id := (v_followup ->> 'followupId')::uuid;
  perform public.mobile_update_service_followup_status_atomic(
    '9b400000-0000-4000-8000-000000000001',
    v_followup_id, 'quoted', null,
    '9a400000-0000-4000-8000-000000000002',
    'mobile-v1:second-review:service-quoted'
  );
  if not exists (
    select 1 from public.mobile_service_followups
    where id = v_followup_id and status = 'quoted'
  ) then
    raise exception 'Second review failed: service role could not action follow-up';
  end if;

  perform set_config('mobile_second.followup_id', v_followup_id::text, true);
  perform set_config('mobile_second.work_order_id', v_work_order_id::text, true);
end;
$$;

reset role;

-- The Mobile handoff exception must stay narrow. The service role is authorized
-- to link the booking to the canonical work order, but it must not become a
-- general customer-booking editor. Run as postgres to bypass RLS while retaining
-- the authenticated service JWT claims so this assertion exercises the trigger
-- itself rather than an unrelated policy boundary.
do $$
declare
  v_visit_id uuid := current_setting('mobile_second.visit_id')::uuid;
  v_booking_id uuid;
  v_denied boolean := false;
begin
  select sv.booking_id into v_booking_id
  from public.service_visits sv
  where sv.id = v_visit_id;

  begin
    update public.bookings
    set notes = 'forbidden service-role booking edit'
    where id = v_booking_id;
  exception when others then
    if position('Booking does not belong to the current customer' in sqlerrm) > 0 then
      v_denied := true;
    else
      raise;
    end if;
  end;

  if not v_denied then
    raise exception 'Second review failed: Mobile WO creator gained general booking mutation authority';
  end if;
end;
$$;

-- Build a mismatched customer/vehicle/work order under postgres so conversion
-- integrity can be tested independently of user-facing creation flows.
insert into public.customers(
  id, shop_id, name, phone, phone_number, created_at, updated_at
) values (
  '9c400000-0000-4000-8000-000000000099',
  '9b400000-0000-4000-8000-000000000001',
  'Different Customer', '303-555-0499', '303-555-0499', now(), now()
);
insert into public.vehicles(
  id, shop_id, customer_id, year, make, model, license_plate, created_at
) values (
  '9e400000-0000-4000-8000-000000000099',
  '9b400000-0000-4000-8000-000000000001',
  '9c400000-0000-4000-8000-000000000099',
  2024, 'Ford', 'F-250', 'DIFF0499', now()
);
insert into public.work_orders(
  id, shop_id, customer_id, vehicle_id, custom_id, status, created_by
) values (
  '9f400000-0000-4000-8000-000000000099',
  '9b400000-0000-4000-8000-000000000001',
  '9c400000-0000-4000-8000-000000000099',
  '9e400000-0000-4000-8000-000000000099',
  'MISMATCH-1', 'awaiting',
  '9a400000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a400000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $$
declare
  v_followup_id uuid := current_setting('mobile_second.followup_id')::uuid;
  v_denied boolean := false;
begin
  begin
    perform public.mobile_update_service_followup_status_atomic(
      '9b400000-0000-4000-8000-000000000001',
      v_followup_id, 'converted',
      '9f400000-0000-4000-8000-000000000099',
      '9a400000-0000-4000-8000-000000000002',
      'mobile-v1:second-review:bad-conversion'
    );
  exception when sqlstate '23503' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Second review failed: mismatched WO was accepted as follow-up conversion';
  end if;
end;
$$;

reset role;
rollback;

select 'mobile_v1_second_codex_hardening_ok' as result;
