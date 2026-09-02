\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('9a500000-0000-4000-8000-000000000001', 'mobile-postmerge-owner@example.com', '{"full_name":"Postmerge Owner"}'::jsonb),
  ('9a500000-0000-4000-8000-000000000002', 'mobile-postmerge-service@example.com', '{"full_name":"Postmerge Service"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  ('9a500000-0000-4000-8000-000000000001', '9a500000-0000-4000-8000-000000000001', 'owner', 'Postmerge Owner', 'mobile-postmerge-owner@example.com', null),
  ('9a500000-0000-4000-8000-000000000002', '9a500000-0000-4000-8000-000000000002', 'service', 'Postmerge Service', 'mobile-postmerge-service@example.com', null)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type, country, stripe_subscription_status,
  stripe_pricing_model, subscription_package
)
values (
  '9b500000-0000-4000-8000-000000000001',
  '9a500000-0000-4000-8000-000000000001',
  'Mobile Postmerge Runtime', 'Mobile Postmerge Runtime', 10,
  true, 0, 365, 'repair_facility', 'CA',
  'active', 'product_packages_v1', 'complete_operations'
)
on conflict (id) do update
set country = excluded.country,
    stripe_subscription_status = excluded.stripe_subscription_status,
    stripe_pricing_model = excluded.stripe_pricing_model,
    subscription_package = excluded.subscription_package;

update public.profiles
set shop_id = '9b500000-0000-4000-8000-000000000001'
where id in (
  '9a500000-0000-4000-8000-000000000001',
  '9a500000-0000-4000-8000-000000000002'
);

-- Owner configures a shop-only, solo/no-dispatch operation. The supported
-- field operator must still own rapid shop visits even though service mode is
-- not "mobile".
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a500000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_intake jsonb;
  v_visit_id uuid;
  v_booking_id uuid;
  v_version integer;
  v_denied boolean := false;
  v_handoff jsonb;
  v_work_order_id uuid;
  v_line_id uuid;
  v_line_count integer;
  v_line public.work_order_lines%rowtype;
  v_repeat jsonb;
begin
  perform public.mobile_configure_service_v1_atomic(
    '9b500000-0000-4000-8000-000000000001',
    'shop', true, false, false, false, 60, 1, true,
    null, null,
    '9a500000-0000-4000-8000-000000000001'
  );

  v_intake := public.mobile_create_service_call_atomic(
    '9b500000-0000-4000-8000-000000000001',
    null, 'Solo Shop Customer', '780-555-5101',
    null, 2020, 'Ford', 'F-350', 'POST5101',
    null, null, null, null,
    'Customer reports a front wheel bearing growl',
    '2099-10-01 15:00:00+00', 60, null, 'USD', 'mobile',
    '9a500000-0000-4000-8000-000000000001',
    'mobile-v1:postmerge:owner-intake'
  );

  v_visit_id := (v_intake ->> 'serviceVisitId')::uuid;
  v_booking_id := (v_intake ->> 'bookingId')::uuid;
  if v_intake ->> 'serviceMode' <> 'shop'
     or coalesce((v_intake ->> 'assignedToCurrentActor')::boolean, false) is not true then
    raise exception 'Postmerge hardening failed: solo shop intake was not owned by current field operator';
  end if;
  if not exists (
    select 1 from public.service_visits sv
    where sv.id = v_visit_id
      and sv.mode = 'shop'
      and sv.assigned_user_id = '9a500000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Postmerge hardening failed: solo shop Service Visit remained unassigned';
  end if;
  if not exists (
    select 1 from public.bookings b
    where b.id = v_booking_id and b.status = 'confirmed'
  ) then
    raise exception 'Postmerge hardening failed: rapid booking was not confirmed';
  end if;

  -- Travel and arrival are valid before a repair WO exists.
  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b500000-0000-4000-8000-000000000001', v_visit_id,
    'scheduled', 'dispatched', v_version,
    '9a500000-0000-4000-8000-000000000001',
    'mobile-v1:postmerge:dispatch'
  );
  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b500000-0000-4000-8000-000000000001', v_visit_id,
    'dispatched', 'en_route', v_version,
    '9a500000-0000-4000-8000-000000000001',
    'mobile-v1:postmerge:travel'
  );
  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b500000-0000-4000-8000-000000000001', v_visit_id,
    'en_route', 'arrived', v_version,
    '9a500000-0000-4000-8000-000000000001',
    'mobile-v1:postmerge:arrive'
  );

  -- But repair execution cannot begin before the canonical work-order handoff.
  select version into v_version from public.service_visits where id = v_visit_id;
  begin
    perform public.mobile_replay_service_visit_transition_atomic(
      '9b500000-0000-4000-8000-000000000001', v_visit_id,
      'arrived', 'working', v_version,
      '9a500000-0000-4000-8000-000000000001',
      'mobile-v1:postmerge:working-too-early'
    );
  exception when others then
    if position('linked work order is required' in lower(sqlerrm)) > 0 then
      v_denied := true;
    else
      raise;
    end if;
  end;
  if not v_denied then
    raise exception 'Postmerge hardening failed: repair started without a work order';
  end if;

  v_handoff := public.mobile_materialize_service_visit_work_order_atomic(
    '9b500000-0000-4000-8000-000000000001',
    v_visit_id,
    '9a500000-0000-4000-8000-000000000001',
    'mobile-v1:postmerge:handoff'
  );
  v_work_order_id := (v_handoff ->> 'workOrderId')::uuid;
  v_line_id := (v_handoff ->> 'initialWorkOrderLineId')::uuid;
  if v_work_order_id is null or v_line_id is null then
    raise exception 'Postmerge hardening failed: handoff did not return WO and initial line';
  end if;

  select count(*) into v_line_count
  from public.work_order_lines wol
  where wol.shop_id = '9b500000-0000-4000-8000-000000000001'
    and wol.work_order_id = v_work_order_id
    and wol.line_type = 'job'
    and wol.voided_at is null;
  if v_line_count <> 1 then
    raise exception 'Postmerge hardening failed: handoff did not create exactly one executable job line';
  end if;

  select * into v_line
  from public.work_order_lines wol
  where wol.id = v_line_id;
  if v_line.complaint <> 'Customer reports a front wheel bearing growl'
     or v_line.status <> 'awaiting'
     or v_line.job_type <> 'diagnosis'
     or coalesce(v_line.punchable, false) is not true
     or v_line.assigned_tech_id <> '9a500000-0000-4000-8000-000000000001'
     or v_line.assigned_to is not null then
    raise exception 'Postmerge hardening failed: initial line is not executable/assigned from intake concern';
  end if;
  if not exists (
    select 1 from public.work_order_line_technicians wolt
    where wolt.work_order_line_id = v_line_id
      and wolt.technician_id = '9a500000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Postmerge hardening failed: canonical technician assignment was not mirrored';
  end if;

  -- Handoff replay is idempotent and must not create another line.
  v_repeat := public.mobile_materialize_service_visit_work_order_atomic(
    '9b500000-0000-4000-8000-000000000001',
    v_visit_id,
    '9a500000-0000-4000-8000-000000000001',
    'mobile-v1:postmerge:handoff'
  );
  if coalesce((v_repeat ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Postmerge hardening failed: handoff replay lost idempotency';
  end if;
  select count(*) into v_line_count
  from public.work_order_lines wol
  where wol.shop_id = '9b500000-0000-4000-8000-000000000001'
    and wol.work_order_id = v_work_order_id
    and wol.line_type = 'job'
    and wol.voided_at is null;
  if v_line_count <> 1 then
    raise exception 'Postmerge hardening failed: handoff replay duplicated the initial line';
  end if;

  -- Once linked, the same canonical transition may enter working.
  select version into v_version from public.service_visits where id = v_visit_id;
  perform public.mobile_replay_service_visit_transition_atomic(
    '9b500000-0000-4000-8000-000000000001', v_visit_id,
    'arrived', 'working', v_version,
    '9a500000-0000-4000-8000-000000000001',
    'mobile-v1:postmerge:working-after-handoff'
  );

  perform set_config('mobile_postmerge.visit_id', v_visit_id::text, true);
  perform set_config('mobile_postmerge.work_order_id', v_work_order_id::text, true);
end;
$$;

reset role;

-- A different authorized actor must never receive the first actor's cached
-- handoff snapshot by reusing its operation key.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a500000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $$
declare
  v_denied boolean := false;
begin
  begin
    perform public.mobile_materialize_service_visit_work_order_atomic(
      '9b500000-0000-4000-8000-000000000001',
      current_setting('mobile_postmerge.visit_id')::uuid,
      '9a500000-0000-4000-8000-000000000002',
      'mobile-v1:postmerge:handoff'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Postmerge hardening failed: cross-actor handoff cache was returned';
  end if;
end;
$$;

reset role;

-- Revoke the original actor's shop membership through a trusted server/admin
-- context and prove neither handoff nor intake cache can return afterward.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
update public.profiles
set shop_id = null
where id = '9a500000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a500000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_handoff_denied boolean := false;
  v_intake_denied boolean := false;
begin
  begin
    perform public.mobile_materialize_service_visit_work_order_atomic(
      '9b500000-0000-4000-8000-000000000001',
      current_setting('mobile_postmerge.visit_id')::uuid,
      '9a500000-0000-4000-8000-000000000001',
      'mobile-v1:postmerge:handoff'
    );
  exception when sqlstate '42501' then
    v_handoff_denied := true;
  end;

  begin
    perform public.mobile_create_service_call_atomic(
      '9b500000-0000-4000-8000-000000000001',
      null, 'Solo Shop Customer', '780-555-5101',
      null, 2020, 'Ford', 'F-350', 'POST5101',
      null, null, null, null,
      'Customer reports a front wheel bearing growl',
      '2099-10-01 15:00:00+00', 60, null, 'CAD', 'shop',
      '9a500000-0000-4000-8000-000000000001',
      'mobile-v1:postmerge:owner-intake'
    );
  exception when sqlstate '42501' then
    v_intake_denied := true;
  end;

  if not v_handoff_denied or not v_intake_denied then
    raise exception 'Postmerge hardening failed: revoked membership received a cached Mobile result';
  end if;
end;
$$;

reset role;

-- Restore the owner through the same trusted server/admin context. Service is a
-- canonical work-order creator that legacy is_staff_for_shop does not know; its
-- confirmed rapid-intake booking must pass only the narrow Mobile path.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
update public.profiles
set shop_id = '9b500000-0000-4000-8000-000000000001'
where id = '9a500000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a500000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $$
declare
  v_intake jsonb;
  v_booking_id uuid;
begin
  v_intake := public.mobile_create_service_call_atomic(
    '9b500000-0000-4000-8000-000000000001',
    null, 'Service Role Intake', '780-555-5202',
    null, 2022, 'Ram', '3500', 'POST5202',
    null, null, null, null,
    'Customer requests charging-system diagnosis',
    '2099-10-01 18:00:00+00', 60, null, 'CAD', 'shop',
    '9a500000-0000-4000-8000-000000000002',
    'mobile-v1:postmerge:service-intake'
  );
  v_booking_id := (v_intake ->> 'bookingId')::uuid;
  if not exists (
    select 1 from public.bookings b
    where b.id = v_booking_id
      and b.status = 'confirmed'
      and b.lifecycle_metadata ->> 'source' = 'rapid_mobile_intake'
      and b.lifecycle_metadata ->> 'created_actor_mode' = 'staff'
  ) then
    raise exception 'Postmerge hardening failed: canonical service intake booking was rejected';
  end if;
end;
$$;

reset role;

-- Role revocation also uses the trusted server/admin context, then the original
-- actor retries the same intake key. Authorization must beat idempotency.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
update public.profiles
set role = 'parts'
where id = '9a500000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a500000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $$
declare
  v_denied boolean := false;
begin
  begin
    perform public.mobile_create_service_call_atomic(
      '9b500000-0000-4000-8000-000000000001',
      null, 'Service Role Intake', '780-555-5202',
      null, 2022, 'Ram', '3500', 'POST5202',
      null, null, null, null,
      'Customer requests charging-system diagnosis',
      '2099-10-01 18:00:00+00', 60, null, 'CAD', 'shop',
      '9a500000-0000-4000-8000-000000000002',
      'mobile-v1:postmerge:service-intake'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Postmerge hardening failed: revoked intake role received cached result';
  end if;
end;
$$;

reset role;
rollback;

select 'mobile_v1_postmerge_end_to_end_hardening_ok' as result;
