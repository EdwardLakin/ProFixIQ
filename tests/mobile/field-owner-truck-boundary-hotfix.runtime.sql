\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('8fa00000-0000-4000-8000-000000000001', 'field-hotfix-owner@example.com', '{}'::jsonb),
  ('8fa00000-0000-4000-8000-000000000002', 'field-hotfix-impostor@example.com', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  '8fa00000-0000-4000-8000-000000000001',
  '8fa00000-0000-4000-8000-000000000001',
  'owner',
  'Field Hotfix Owner',
  'field-hotfix-owner@example.com',
  null
)
on conflict (id) do update
set user_id = excluded.user_id, role = 'owner', shop_id = null;

insert into public.shops (
  id, owner_id, business_name, name, user_limit, accepts_online_booking,
  min_notice_minutes, max_lead_days, location_type, country,
  billing_entitlement_override, subscription_package
)
values (
  '8fb00000-0000-4000-8000-000000000001',
  '8fa00000-0000-4000-8000-000000000001',
  'Field Truck Boundary Hotfix',
  'Field Truck Boundary Hotfix',
  1,
  true,
  0,
  365,
  'repair_facility',
  'CA',
  'internal_demo',
  'field_service'
)
on conflict (id) do update
set owner_id = excluded.owner_id,
    subscription_package = 'field_service';

update public.profiles
set shop_id = '8fb00000-0000-4000-8000-000000000001'
where id = '8fa00000-0000-4000-8000-000000000001';

insert into public.mobile_service_settings (
  shop_id, service_model, solo_mode, dispatch_enabled,
  service_vehicles_enabled, field_operator_count_target,
  onboarding_completed_at, configured_by
)
values (
  '8fb00000-0000-4000-8000-000000000001',
  'mobile',
  true,
  false,
  true,
  1,
  now(),
  '8fa00000-0000-4000-8000-000000000001'
)
on conflict (shop_id) do update
set service_model = 'mobile',
    solo_mode = true,
    dispatch_enabled = false,
    service_vehicles_enabled = true,
    field_operator_count_target = 1,
    onboarding_completed_at = now();

insert into public.mobile_field_operators (shop_id, profile_id, enabled)
values (
  '8fb00000-0000-4000-8000-000000000001',
  '8fa00000-0000-4000-8000-000000000001',
  true
)
on conflict (shop_id, profile_id) do update set enabled = true;

insert into public.service_vehicles (
  id, shop_id, name, unit_number, primary_user_id, active, capabilities
)
values
  (
    '8fc00000-0000-4000-8000-000000000001',
    '8fb00000-0000-4000-8000-000000000001',
    'Owner Truck A',
    'HOTFIX-A',
    '8fa00000-0000-4000-8000-000000000001',
    true,
    '{"mobile_v1":true}'::jsonb
  ),
  (
    '8fc00000-0000-4000-8000-000000000002',
    '8fb00000-0000-4000-8000-000000000001',
    'Owner Truck B',
    'HOTFIX-B',
    '8fa00000-0000-4000-8000-000000000001',
    true,
    '{"mobile_v1":true}'::jsonb
  )
on conflict (id) do nothing;

-- Reproduce the arbitrary assignment created by the first #1530 migration.
insert into public.field_service_vehicle_assignments (
  shop_id, service_vehicle_id, profile_id, assigned_by_profile_id
)
values (
  '8fb00000-0000-4000-8000-000000000001',
  '8fc00000-0000-4000-8000-000000000001',
  '8fa00000-0000-4000-8000-000000000001',
  '8fa00000-0000-4000-8000-000000000001'
)
on conflict do nothing;

select private.repair_standalone_field_vehicle_assignments();

do $$
begin
  if exists (
    select 1
    from public.field_service_vehicle_assignments assignment
    where assignment.shop_id = '8fb00000-0000-4000-8000-000000000001'
      and assignment.profile_id = '8fa00000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Field boundary hotfix failed: ambiguous assignment was not physically quarantined';
  end if;

  if not exists (
    select 1
    from private.field_service_vehicle_assignment_quarantine quarantine
    where quarantine.shop_id = '8fb00000-0000-4000-8000-000000000001'
      and quarantine.service_vehicle_id = '8fc00000-0000-4000-8000-000000000001'
      and quarantine.profile_id = '8fa00000-0000-4000-8000-000000000001'
      and quarantine.reason = 'ambiguous_owner_vehicle_set'
  ) then
    raise exception 'Field boundary hotfix failed: ambiguous assignment quarantine was not observable';
  end if;

  if not public.mobile_profile_has_field_service_access(
    '8fb00000-0000-4000-8000-000000000001',
    '8fa00000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Field boundary hotfix failed: truck ambiguity revoked standalone Field entitlement';
  end if;
end;
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8fa00000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
begin
  if not public.mobile_dispatch_profile_eligible(
    '8fb00000-0000-4000-8000-000000000001',
    '8fa00000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Field boundary hotfix failed: canonical owner lost dispatch eligibility during truck repair';
  end if;

  if public.field_actor_can_access_service_vehicle(
    '8fb00000-0000-4000-8000-000000000001',
    '8fc00000-0000-4000-8000-000000000001'
  ) or public.field_actor_can_access_service_vehicle(
    '8fb00000-0000-4000-8000-000000000001',
    '8fc00000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Field boundary hotfix failed: ambiguous My Truck remained accessible';
  end if;
end;
$$;

reset role;

-- Removing the second candidate must not resurrect the arbitrary assignment.
update public.service_vehicles
set active = false
where id = '8fc00000-0000-4000-8000-000000000002';

do $$
begin
  if exists (
    select 1
    from public.field_service_vehicle_assignments assignment
    where assignment.shop_id = '8fb00000-0000-4000-8000-000000000001'
      and assignment.profile_id = '8fa00000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Field boundary hotfix failed: quarantined assignment reappeared after cardinality changed';
  end if;
end;
$$;

-- Reproduce a canonical owner assigned to the wrong active truck while A is
-- the sole owner-primary truck. The repair must quarantine B and restore A.
update public.service_vehicles
set active = true,
    primary_user_id = null
where id = '8fc00000-0000-4000-8000-000000000002';

insert into public.field_service_vehicle_assignments (
  shop_id, service_vehicle_id, profile_id, assigned_by_profile_id
)
values (
  '8fb00000-0000-4000-8000-000000000001',
  '8fc00000-0000-4000-8000-000000000002',
  '8fa00000-0000-4000-8000-000000000001',
  '8fa00000-0000-4000-8000-000000000001'
);

select private.repair_standalone_field_vehicle_assignments();

do $$
begin
  if not exists (
    select 1
    from private.field_service_vehicle_assignment_quarantine quarantine
    where quarantine.shop_id = '8fb00000-0000-4000-8000-000000000001'
      and quarantine.service_vehicle_id = '8fc00000-0000-4000-8000-000000000002'
      and quarantine.profile_id = '8fa00000-0000-4000-8000-000000000001'
      and quarantine.reason = 'assigned_vehicle_not_unique_owner_vehicle'
  ) then
    raise exception 'Field boundary hotfix failed: mismatched owner assignment was not quarantined';
  end if;

  if not exists (
    select 1
    from public.field_service_vehicle_assignments assignment
    where assignment.shop_id = '8fb00000-0000-4000-8000-000000000001'
      and assignment.profile_id = '8fa00000-0000-4000-8000-000000000001'
      and assignment.service_vehicle_id = '8fc00000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Field boundary hotfix failed: unique canonical owner truck was not restored';
  end if;
end;
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8fa00000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
begin
  if not public.field_actor_can_access_service_vehicle(
    '8fb00000-0000-4000-8000-000000000001',
    '8fc00000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Field boundary hotfix failed: unique owner-primary assignment was not accessible';
  end if;

  if public.field_actor_can_access_service_vehicle(
    '8fb00000-0000-4000-8000-000000000001',
    '8fc00000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Field boundary hotfix failed: non-owner-primary truck was exposed as My Truck';
  end if;
end;
$$;

reset role;

-- Historical role-labelled owners are quarantined rather than merely hidden.
insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  '8fa00000-0000-4000-8000-000000000002',
  '8fa00000-0000-4000-8000-000000000002',
  'owner',
  'Field Hotfix Impostor',
  'field-hotfix-impostor@example.com',
  '8fb00000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = 'owner',
    shop_id = excluded.shop_id;

insert into public.mobile_field_operators (shop_id, profile_id, enabled)
values (
  '8fb00000-0000-4000-8000-000000000001',
  '8fa00000-0000-4000-8000-000000000002',
  true
)
on conflict (shop_id, profile_id) do update set enabled = true;

insert into public.service_vehicles (
  id, shop_id, name, unit_number, primary_user_id, active, capabilities
)
values (
  '8fc00000-0000-4000-8000-000000000003',
  '8fb00000-0000-4000-8000-000000000001',
  'Historical Team Truck',
  'HOTFIX-C',
  '8fa00000-0000-4000-8000-000000000002',
  true,
  '{"mobile_v1":true}'::jsonb
)
on conflict (id) do nothing;

insert into public.field_service_vehicle_assignments (
  shop_id, service_vehicle_id, profile_id, assigned_by_profile_id
)
values (
  '8fb00000-0000-4000-8000-000000000001',
  '8fc00000-0000-4000-8000-000000000003',
  '8fa00000-0000-4000-8000-000000000002',
  '8fa00000-0000-4000-8000-000000000001'
);

select private.repair_standalone_field_vehicle_assignments();

do $$
begin
  if exists (
    select 1
    from public.field_service_vehicle_assignments assignment
    where assignment.shop_id = '8fb00000-0000-4000-8000-000000000001'
      and assignment.profile_id = '8fa00000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Field boundary hotfix failed: non-canonical role-labelled owner assignment survived';
  end if;

  if not exists (
    select 1
    from private.field_service_vehicle_assignment_quarantine quarantine
    where quarantine.shop_id = '8fb00000-0000-4000-8000-000000000001'
      and quarantine.profile_id = '8fa00000-0000-4000-8000-000000000002'
      and quarantine.reason = 'non_canonical_profile'
  ) then
    raise exception 'Field boundary hotfix failed: non-canonical assignment was not observably quarantined';
  end if;
end;
$$;

rollback;
