-- Local deterministic regression fixtures. Invoke this file only through the
-- documented local `db reset --local --sql-paths` command. Trigger
-- execution is disabled for the fixture writes so no notification, email, SMS,
-- supplier, payment, or billing side effect can be produced while the canonical
-- rows are assembled.
set session_replication_role = replica;

with fixture_users(id, email, full_name) as (
  values
    ('f1100000-0000-4000-8000-000000000001'::uuid, 'pro-owner@regression.profixiq.invalid', 'Regression Pro Owner'),
    ('f1100000-0000-4000-8000-000000000002'::uuid, 'starter-owner@regression.profixiq.invalid', 'Regression Starter Owner'),
    ('f1100000-0000-4000-8000-000000000003'::uuid, 'manager@regression.profixiq.invalid', 'Regression Manager'),
    ('f1100000-0000-4000-8000-000000000004'::uuid, 'advisor@regression.profixiq.invalid', 'Regression Advisor'),
    ('f1100000-0000-4000-8000-000000000005'::uuid, 'technician@regression.profixiq.invalid', 'Regression Technician'),
    ('f1100000-0000-4000-8000-000000000006'::uuid, 'lead-tech@regression.profixiq.invalid', 'Regression Lead Tech'),
    ('f1100000-0000-4000-8000-000000000007'::uuid, 'parts@regression.profixiq.invalid', 'Regression Parts'),
    ('f1100000-0000-4000-8000-000000000008'::uuid, 'customer@regression.profixiq.invalid', 'Regression Customer'),
    ('f1100000-0000-4000-8000-000000000009'::uuid, 'fleet-manager@regression.profixiq.invalid', 'Regression Fleet Manager'),
    ('f1100000-0000-4000-8000-000000000010'::uuid, 'dispatcher@regression.profixiq.invalid', 'Regression Dispatcher'),
    ('f1100000-0000-4000-8000-000000000011'::uuid, 'driver@regression.profixiq.invalid', 'Regression Driver'),
    ('f1100000-0000-4000-8000-000000000012'::uuid, 'field-operator@regression.profixiq.invalid', 'Regression Field Operator'),
    ('f1100000-0000-4000-8000-000000000013'::uuid, 'field-disabled@regression.profixiq.invalid', 'Regression Field Disabled'),
    ('f1100000-0000-4000-8000-000000000014'::uuid, 'administrator@regression.profixiq.invalid', 'Regression Administrator')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  fixture_users.id,
  'authenticated',
  'authenticated',
  fixture_users.email,
  extensions.crypt('ProFixIQ-Regression-Only!', extensions.gen_salt('bf')),
  '2026-08-21T18:00:00Z'::timestamptz,
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', fixture_users.full_name),
  '2026-08-21T18:00:00Z'::timestamptz,
  '2026-08-21T18:00:00Z'::timestamptz
from fixture_users
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

with fixture_users(id, email) as (
  values
    ('f1100000-0000-4000-8000-000000000001'::uuid, 'pro-owner@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000002'::uuid, 'starter-owner@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000003'::uuid, 'manager@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000004'::uuid, 'advisor@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000005'::uuid, 'technician@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000006'::uuid, 'lead-tech@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000007'::uuid, 'parts@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000008'::uuid, 'customer@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000009'::uuid, 'fleet-manager@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000010'::uuid, 'dispatcher@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000011'::uuid, 'driver@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000012'::uuid, 'field-operator@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000013'::uuid, 'field-disabled@regression.profixiq.invalid'),
    ('f1100000-0000-4000-8000-000000000014'::uuid, 'administrator@regression.profixiq.invalid')
)
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at
)
select
  fixture_users.id,
  fixture_users.id,
  fixture_users.email,
  jsonb_build_object('sub', fixture_users.id::text, 'email', fixture_users.email),
  'email',
  '2026-08-21T18:00:00Z'::timestamptz,
  '2026-08-21T18:00:00Z'::timestamptz,
  '2026-08-21T18:00:00Z'::timestamptz
from fixture_users
on conflict (id) do update set
  user_id = excluded.user_id,
  provider_id = excluded.provider_id,
  identity_data = excluded.identity_data,
  updated_at = excluded.updated_at;

insert into public.profiles (
  id, user_id, email, full_name, role, completed_onboarding,
  must_change_password, shop_id, created_at, updated_at
)
values
  ('f1100000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000001', 'pro-owner@regression.profixiq.invalid', 'Regression Pro Owner', 'owner', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000002', 'f1100000-0000-4000-8000-000000000002', 'starter-owner@regression.profixiq.invalid', 'Regression Starter Owner', 'owner', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000003', 'f1100000-0000-4000-8000-000000000003', 'manager@regression.profixiq.invalid', 'Regression Manager', 'manager', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000004', 'f1100000-0000-4000-8000-000000000004', 'advisor@regression.profixiq.invalid', 'Regression Advisor', 'advisor', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000005', 'f1100000-0000-4000-8000-000000000005', 'technician@regression.profixiq.invalid', 'Regression Technician', 'mechanic', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000006', 'f1100000-0000-4000-8000-000000000006', 'lead-tech@regression.profixiq.invalid', 'Regression Lead Tech', 'lead_hand', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000007', 'f1100000-0000-4000-8000-000000000007', 'parts@regression.profixiq.invalid', 'Regression Parts', 'parts', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000008', 'f1100000-0000-4000-8000-000000000008', 'customer@regression.profixiq.invalid', 'Regression Customer', 'customer', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000009', 'f1100000-0000-4000-8000-000000000009', 'fleet-manager@regression.profixiq.invalid', 'Regression Fleet Manager', 'fleet_manager', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000010', 'f1100000-0000-4000-8000-000000000010', 'dispatcher@regression.profixiq.invalid', 'Regression Dispatcher', 'dispatcher', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000011', 'f1100000-0000-4000-8000-000000000011', 'driver@regression.profixiq.invalid', 'Regression Driver', 'driver', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000012', 'f1100000-0000-4000-8000-000000000012', 'field-operator@regression.profixiq.invalid', 'Regression Field Operator', 'mechanic', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000013', 'f1100000-0000-4000-8000-000000000013', 'field-disabled@regression.profixiq.invalid', 'Regression Field Disabled', 'mechanic', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1100000-0000-4000-8000-000000000014', 'f1100000-0000-4000-8000-000000000014', 'administrator@regression.profixiq.invalid', 'Regression Administrator', 'admin', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z')
on conflict (id) do update set
  user_id = excluded.user_id,
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  completed_onboarding = excluded.completed_onboarding,
  must_change_password = excluded.must_change_password,
  shop_id = excluded.shop_id,
  updated_at = excluded.updated_at;

insert into public.shops (
  id, owner_id, name, shop_name, business_name, slug, plan, user_limit,
  timezone, country, province, city, accepts_online_booking,
  auto_send_quote_email, email_on_complete, require_authorization, use_ai,
  stripe_pricing_model, stripe_subscription_status, subscription_package,
  created_by, created_at, updated_at
)
values
  (
    'f1000000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000001',
    'Regression Pro Shop', 'Regression Pro Shop', 'Regression Pro Shop',
    'regression-pro-shop', 'pro', 50, 'America/Edmonton', 'CA', 'AB',
    'Calgary', false, false, false, true, false, 'product_packages_v1',
    'active', 'complete_operations',
    'f1100000-0000-4000-8000-000000000001',
    '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'f1100000-0000-4000-8000-000000000002',
    'Regression Starter Shop', 'Regression Starter Shop',
    'Regression Starter Shop', 'regression-starter-shop', 'starter', 10,
    'America/Edmonton', 'CA', 'AB', 'Calgary', false, false, false, true,
    false, 'product_packages_v1', 'active', 'shop_operations',
    'f1100000-0000-4000-8000-000000000002',
    '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'
  )
on conflict (id) do update set
  owner_id = excluded.owner_id,
  name = excluded.name,
  shop_name = excluded.shop_name,
  business_name = excluded.business_name,
  slug = excluded.slug,
  plan = excluded.plan,
  user_limit = excluded.user_limit,
  timezone = excluded.timezone,
  accepts_online_booking = excluded.accepts_online_booking,
  auto_send_quote_email = excluded.auto_send_quote_email,
  email_on_complete = excluded.email_on_complete,
  require_authorization = excluded.require_authorization,
  use_ai = excluded.use_ai,
  stripe_pricing_model = excluded.stripe_pricing_model,
  stripe_subscription_status = excluded.stripe_subscription_status,
  subscription_package = excluded.subscription_package,
  updated_at = excluded.updated_at;

update public.profiles
set shop_id = case
  when id = 'f1100000-0000-4000-8000-000000000002'::uuid
    then 'f1000000-0000-4000-8000-000000000002'::uuid
  when id in (
    'f1100000-0000-4000-8000-000000000001'::uuid,
    'f1100000-0000-4000-8000-000000000003'::uuid,
    'f1100000-0000-4000-8000-000000000004'::uuid,
    'f1100000-0000-4000-8000-000000000005'::uuid,
    'f1100000-0000-4000-8000-000000000006'::uuid,
    'f1100000-0000-4000-8000-000000000007'::uuid,
    'f1100000-0000-4000-8000-000000000012'::uuid,
    'f1100000-0000-4000-8000-000000000013'::uuid,
    'f1100000-0000-4000-8000-000000000014'::uuid
  ) then 'f1000000-0000-4000-8000-000000000001'::uuid
  else null
end
where id between
  'f1100000-0000-4000-8000-000000000001'::uuid and
  'f1100000-0000-4000-8000-000000000014'::uuid;

insert into public.shop_members (shop_id, user_id, role, created_by)
values
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000001', 'owner', 'f1100000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002', 'f1100000-0000-4000-8000-000000000002', 'owner', 'f1100000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000003', 'manager', 'f1100000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000004', 'advisor', 'f1100000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000005', 'mechanic', 'f1100000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000006', 'lead_hand', 'f1100000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000007', 'parts', 'f1100000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000012', 'mechanic', 'f1100000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000013', 'mechanic', 'f1100000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000014', 'admin', 'f1100000-0000-4000-8000-000000000001')
on conflict (shop_id, user_id) do update set role = excluded.role;

insert into public.staff_capability_overrides (
  id, shop_id, profile_id, capability_key, effect, changed_by_profile_id,
  created_at, updated_at
)
values (
  'f1e00000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000005',
  'work_order.assignment.manage', 'allow',
  'f1100000-0000-4000-8000-000000000014',
  '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  profile_id = excluded.profile_id,
  capability_key = excluded.capability_key,
  effect = excluded.effect,
  changed_by_profile_id = excluded.changed_by_profile_id,
  updated_at = excluded.updated_at;

insert into public.customers (
  id, shop_id, user_id, name, first_name, last_name, business_name, email,
  phone, account_type, is_fleet, active, external_id, created_at, updated_at
)
values
  ('f1200000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000008', 'Regression Customer', 'Regression', 'Customer', null, 'customer@regression.profixiq.invalid', '+1-555-010-0101', 'individual', false, true, 'regression-customer', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1200000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', null, 'Unrelated Regression Customer', 'Unrelated', 'Customer', null, 'unrelated-customer@regression.profixiq.invalid', '+1-555-010-0102', 'individual', false, true, 'regression-unrelated-customer', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1200000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', null, 'Regression Fleet Account', null, null, 'Regression Fleet Account', 'fleet-contact@regression.profixiq.invalid', '+1-555-010-0103', 'fleet', true, true, 'regression-fleet-customer', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  user_id = excluded.user_id,
  name = excluded.name,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  business_name = excluded.business_name,
  email = excluded.email,
  phone = excluded.phone,
  account_type = excluded.account_type,
  is_fleet = excluded.is_fleet,
  active = excluded.active,
  external_id = excluded.external_id,
  updated_at = excluded.updated_at;

insert into public.vehicles (
  id, shop_id, customer_id, vin, year, make, model, unit_number,
  license_plate, mileage, engine_hours, odometer_unit, status, external_id,
  created_at
)
values
  ('f1300000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001', 'REGRESSION0000001', 2021, 'Ford', 'F-150', 'CUST-01', 'REG-101', '85000', null, 'km', 'active', 'regression-customer-vehicle', '2026-08-21T18:00:00Z'),
  ('f1300000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000002', 'REGRESSION0000002', 2019, 'Chevrolet', 'Silverado', 'OTHER-01', 'REG-102', '120000', null, 'km', 'active', 'regression-unrelated-vehicle', '2026-08-21T18:00:00Z'),
  ('f1300000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000003', 'REGRESSION0000003', 2020, 'Freightliner', 'Cascadia', 'FLEET-101', 'REG-103', '410000', 8300, 'km', 'active', 'regression-fleet-asset-1', '2026-08-21T18:00:00Z'),
  ('f1300000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000003', 'REGRESSION0000004', 2018, 'Kenworth', 'T680', 'FLEET-102', 'REG-104', '525000', 10100, 'km', 'active', 'regression-fleet-asset-2', '2026-08-21T18:00:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  customer_id = excluded.customer_id,
  vin = excluded.vin,
  year = excluded.year,
  make = excluded.make,
  model = excluded.model,
  unit_number = excluded.unit_number,
  license_plate = excluded.license_plate,
  mileage = excluded.mileage,
  engine_hours = excluded.engine_hours,
  odometer_unit = excluded.odometer_unit,
  status = excluded.status,
  external_id = excluded.external_id;

insert into public.fleets (
  id, shop_id, customer_id, name, contact_name, contact_email, contact_phone,
  notes, active, created_by, created_at, updated_at
)
values (
  'f1400000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f1200000-0000-4000-8000-000000000003',
  'Regression Fleet', 'Regression Fleet Manager',
  'fleet-manager@regression.profixiq.invalid', '+1-555-010-0200',
  'Deterministic Fleet regression fixture', true,
  'f1100000-0000-4000-8000-000000000001',
  '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  customer_id = excluded.customer_id,
  name = excluded.name,
  contact_name = excluded.contact_name,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  notes = excluded.notes,
  active = excluded.active,
  updated_at = excluded.updated_at;

insert into public.fleet_members (
  fleet_id, shop_id, user_id, role, created_by, created_at, updated_at
)
values
  ('f1400000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000009', 'fleet_manager', 'f1100000-0000-4000-8000-000000000001', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1400000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000010', 'dispatcher', 'f1100000-0000-4000-8000-000000000001', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1400000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000011', 'driver', 'f1100000-0000-4000-8000-000000000001', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z')
on conflict (fleet_id, user_id) do update set
  shop_id = excluded.shop_id,
  role = excluded.role,
  updated_at = excluded.updated_at;

insert into public.fleet_vehicles (
  fleet_id, vehicle_id, active, nickname, shop_id, created_at
)
values
  ('f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000003', true, 'Unit 101', 'f1000000-0000-4000-8000-000000000001', '2026-08-21T18:00:00Z'),
  ('f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000004', true, 'Unit 102', 'f1000000-0000-4000-8000-000000000001', '2026-08-21T18:00:00Z')
on conflict (fleet_id, vehicle_id) do update set
  active = excluded.active,
  nickname = excluded.nickname,
  shop_id = excluded.shop_id;

insert into public.fleet_dispatch_assignments (
  id, shop_id, fleet_id, vehicle_id, driver_profile_id, driver_name,
  unit_label, vehicle_identifier, route_label, state, active,
  pretrip_required, pretrip_due_local_time, next_pretrip_due, assigned_at,
  assigned_by, created_at, updated_at
)
values
  ('f1c00000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000003', 'f1100000-0000-4000-8000-000000000011', 'Regression Driver', 'FLEET-101', 'REGRESSION0000003', 'Calgary North', 'pretrip_due', true, true, '07:00', '2026-08-22T13:00:00Z', '2026-08-21T18:00:00Z', 'f1100000-0000-4000-8000-000000000010', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1c00000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000004', 'f1100000-0000-4000-8000-000000000011', 'Regression Driver', 'FLEET-102', 'REGRESSION0000004', 'Calgary South', 'pretrip_due', true, true, '07:00', '2026-08-22T13:00:00Z', '2026-08-21T18:00:00Z', 'f1100000-0000-4000-8000-000000000010', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  fleet_id = excluded.fleet_id,
  vehicle_id = excluded.vehicle_id,
  driver_profile_id = excluded.driver_profile_id,
  state = excluded.state,
  active = excluded.active,
  next_pretrip_due = excluded.next_pretrip_due,
  updated_at = excluded.updated_at;

insert into public.work_orders (
  id, shop_id, custom_id, customer_id, vehicle_id, customer_name, advisor_id,
  status, approval_state, record_type, payment_status, labor_total, parts_total,
  invoice_total, outstanding_balance, estimate_status, estimate_revision,
  estimate_created_at, estimate_created_by, estimate_sent_at, estimate_sent_by,
  estimate_authorized_at, customer_approval_at, customer_approved_by,
  customer_agreed_at, created_by, created_at, updated_at
)
values
  ('f1500000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'REG-WO-AUTHORIZED-001', 'f1200000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000001', 'Regression Customer', 'f1100000-0000-4000-8000-000000000004', 'in_progress', 'approved', 'work_order', 'unpaid', 362.50, 145.00, 507.50, 507.50, 'approved', 1, '2026-08-21T18:00:00Z', 'f1100000-0000-4000-8000-000000000004', '2026-08-21T18:05:00Z', 'f1100000-0000-4000-8000-000000000004', '2026-08-21T18:10:00Z', '2026-08-21T18:10:00Z', 'f1100000-0000-4000-8000-000000000008', '2026-08-21T18:10:00Z', 'f1100000-0000-4000-8000-000000000004', '2026-08-21T18:00:00Z', '2026-08-21T18:10:00Z'),
  ('f1500000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'REG-WO-UNRELATED-001', 'f1200000-0000-4000-8000-000000000002', 'f1300000-0000-4000-8000-000000000002', 'Unrelated Regression Customer', 'f1100000-0000-4000-8000-000000000002', 'awaiting_approval', 'pending', 'estimate', 'unpaid', 120.00, 60.00, 180.00, 180.00, 'sent', 1, '2026-08-21T18:00:00Z', 'f1100000-0000-4000-8000-000000000002', '2026-08-21T18:05:00Z', 'f1100000-0000-4000-8000-000000000002', null, null, null, null, 'f1100000-0000-4000-8000-000000000002', '2026-08-21T18:00:00Z', '2026-08-21T18:05:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  custom_id = excluded.custom_id,
  customer_id = excluded.customer_id,
  vehicle_id = excluded.vehicle_id,
  customer_name = excluded.customer_name,
  advisor_id = excluded.advisor_id,
  status = excluded.status,
  approval_state = excluded.approval_state,
  record_type = excluded.record_type,
  payment_status = excluded.payment_status,
  labor_total = excluded.labor_total,
  parts_total = excluded.parts_total,
  invoice_total = excluded.invoice_total,
  outstanding_balance = excluded.outstanding_balance,
  estimate_status = excluded.estimate_status,
  estimate_revision = excluded.estimate_revision,
  estimate_sent_at = excluded.estimate_sent_at,
  estimate_authorized_at = excluded.estimate_authorized_at,
  customer_approval_at = excluded.customer_approval_at,
  customer_approved_by = excluded.customer_approved_by,
  customer_agreed_at = excluded.customer_agreed_at,
  updated_at = excluded.updated_at;

-- Trigger suppression skips normalize_work_order_line_status(), so persist the
-- canonical stored value that the punch workflow derives from `in_progress`.
insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, assigned_tech_id, description,
  complaint, job_type, line_type, status, line_status, approval_state,
  approval_at, approval_by, labor_time, price_estimate, punched_in_at,
  punched_out_at,
  external_id, created_at, updated_at
)
values (
  'f1600000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f1500000-0000-4000-8000-000000000001',
  'f1300000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000005',
  'Replace air dryer cartridge', 'Air system purges frequently', 'repair',
  'job', 'active', 'authorized', 'approved',
  '2026-08-21T18:10:00Z', 'f1100000-0000-4000-8000-000000000008',
  2.50, 507.50, '2026-08-21T18:22:00Z', '2026-08-21T18:52:00Z',
  'regression-authorized-repair-line',
  '2026-08-21T18:00:00Z', '2026-08-21T18:52:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  work_order_id = excluded.work_order_id,
  vehicle_id = excluded.vehicle_id,
  assigned_tech_id = excluded.assigned_tech_id,
  description = excluded.description,
  complaint = excluded.complaint,
  job_type = excluded.job_type,
  line_type = excluded.line_type,
  status = excluded.status,
  line_status = excluded.line_status,
  approval_state = excluded.approval_state,
  approval_at = excluded.approval_at,
  approval_by = excluded.approval_by,
  labor_time = excluded.labor_time,
  price_estimate = excluded.price_estimate,
  punched_in_at = excluded.punched_in_at,
  punched_out_at = excluded.punched_out_at,
  external_id = excluded.external_id,
  updated_at = excluded.updated_at;

insert into public.work_order_line_technicians (
  work_order_line_id, technician_id, assigned_by, assigned_at
)
values (
  'f1600000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000005',
  'f1100000-0000-4000-8000-000000000004',
  '2026-08-21T18:00:00Z'
)
on conflict (work_order_line_id, technician_id) do update set
  assigned_by = excluded.assigned_by,
  assigned_at = excluded.assigned_at;

insert into public.inspections (
  id, shop_id, work_order_id, work_order_line_id, vehicle_id, user_id,
  inspection_type, status, completed, is_draft, locked, is_canonical,
  sync_revision, signing_cycle, started_at, finalized_at, finalized_by,
  summary, notes, created_at, updated_at
)
values (
  'f1f00000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f1500000-0000-4000-8000-000000000001',
  'f1600000-0000-4000-8000-000000000001',
  'f1300000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000005',
  'maintenance50-air', 'completed', true, false, true, true,
  1, 0, '2026-08-21T18:12:00Z', '2026-08-21T18:20:00Z',
  'f1100000-0000-4000-8000-000000000004',
  '{"id":"f1f00000-0000-4000-8000-000000000001","vehicleId":"f1300000-0000-4000-8000-000000000001","workOrderId":"f1500000-0000-4000-8000-000000000001","workOrderLineId":"f1600000-0000-4000-8000-000000000001","templateName":"50-point Air Brake Inspection","brakeType":"air","location":"shop","currentSectionIndex":0,"currentItemIndex":0,"isListening":false,"status":"completed","started":true,"completed":true,"isPaused":false,"syncRevision":1,"serverUpdatedAt":"2026-08-21T18:20:00Z","sections":[{"title":"Air system","items":[{"item":"Air dryer purge cycle","status":"recommend","notes":"Recommend replacing the air dryer cartridge.","parts":[{"description":"Air dryer cartridge","qty":1}],"laborHours":2.5}]}],"quote":[],"fixture":"profixiq-regression-v1"}'::jsonb,
  'Completed inspection with one repair recommendation.',
  '2026-08-21T18:12:00Z', '2026-08-21T18:20:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  work_order_id = excluded.work_order_id,
  work_order_line_id = excluded.work_order_line_id,
  vehicle_id = excluded.vehicle_id,
  user_id = excluded.user_id,
  inspection_type = excluded.inspection_type,
  status = excluded.status,
  completed = excluded.completed,
  is_draft = excluded.is_draft,
  locked = excluded.locked,
  is_canonical = excluded.is_canonical,
  sync_revision = excluded.sync_revision,
  signing_cycle = excluded.signing_cycle,
  started_at = excluded.started_at,
  finalized_at = excluded.finalized_at,
  finalized_by = excluded.finalized_by,
  summary = excluded.summary,
  notes = excluded.notes,
  updated_at = excluded.updated_at;

insert into public.inspection_signatures (
  id, inspection_id, role, signed_by, signed_name, signature_image_path,
  signature_hash, signing_cycle, signed_sync_revision, signed_summary_hash,
  signed_summary, signed_at, ip_address, user_agent
)
select
  'f2a00000-0000-4000-8000-000000000001', inspection.id, 'advisor',
  'f1100000-0000-4000-8000-000000000004', 'Regression Advisor', null, null,
  inspection.signing_cycle, inspection.sync_revision,
  encode(
    extensions.digest(convert_to(inspection.summary::text, 'UTF8'), 'sha256'),
    'hex'
  ),
  inspection.summary, '2026-08-21T18:20:00Z', '127.0.0.1',
  'ProFixIQ deterministic regression fixture'
from public.inspections inspection
where inspection.id = 'f1f00000-0000-4000-8000-000000000001'
on conflict (id) do update set
  inspection_id = excluded.inspection_id,
  role = excluded.role,
  signed_by = excluded.signed_by,
  signed_name = excluded.signed_name,
  signature_image_path = excluded.signature_image_path,
  signature_hash = excluded.signature_hash,
  signing_cycle = excluded.signing_cycle,
  signed_sync_revision = excluded.signed_sync_revision,
  signed_summary_hash = excluded.signed_summary_hash,
  signed_summary = excluded.signed_summary,
  signed_at = excluded.signed_at,
  ip_address = excluded.ip_address,
  user_agent = excluded.user_agent;

insert into public.inspection_items (
  id, inspection_id, section, label, value, status, notes, created_at
)
values (
  'f2000000-0000-4000-8000-000000000001',
  'f1f00000-0000-4000-8000-000000000001',
  'Air system', 'Air dryer purge cycle', 'Frequent purge', 'recommend',
  'Recommend replacing the air dryer cartridge.',
  '2026-08-21T18:18:00Z'
)
on conflict (id) do update set
  inspection_id = excluded.inspection_id,
  section = excluded.section,
  label = excluded.label,
  value = excluded.value,
  status = excluded.status,
  notes = excluded.notes;

insert into public.work_order_line_labor_segments (
  id, shop_id, work_order_id, work_order_line_id, technician_id, created_by,
  source, pause_reason, started_at, ended_at, created_at, updated_at
)
values (
  'f2100000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f1500000-0000-4000-8000-000000000001',
  'f1600000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000005',
  'f1100000-0000-4000-8000-000000000005',
  'job_punch', 'labor_pause', '2026-08-21T18:22:00Z', '2026-08-21T18:52:00Z',
  '2026-08-21T18:22:00Z', '2026-08-21T18:52:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  work_order_id = excluded.work_order_id,
  work_order_line_id = excluded.work_order_line_id,
  technician_id = excluded.technician_id,
  created_by = excluded.created_by,
  source = excluded.source,
  pause_reason = excluded.pause_reason,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  updated_at = excluded.updated_at;

insert into public.work_order_parts (
  id, shop_id, work_order_id, work_order_line_id, lifecycle_status,
  description_snapshot, manufacturer_snapshot, part_number_snapshot,
  sku_snapshot, quantity, quantity_requested, unit_cost_snapshot,
  unit_sell_price_snapshot, unit_price, total_price, is_active,
  created_at, updated_at
)
values (
  'f1800000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f1500000-0000-4000-8000-000000000001',
  'f1600000-0000-4000-8000-000000000001',
  'quoted', 'Air dryer cartridge', 'Bendix', 'AD-REG-001', 'REG-AD-001',
  1, 1, 90.00, 145.00, 145.00, 145.00, true,
  '2026-08-21T18:00:00Z', '2026-08-21T18:10:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  work_order_id = excluded.work_order_id,
  work_order_line_id = excluded.work_order_line_id,
  lifecycle_status = excluded.lifecycle_status,
  description_snapshot = excluded.description_snapshot,
  manufacturer_snapshot = excluded.manufacturer_snapshot,
  part_number_snapshot = excluded.part_number_snapshot,
  sku_snapshot = excluded.sku_snapshot,
  quantity = excluded.quantity,
  quantity_requested = excluded.quantity_requested,
  unit_cost_snapshot = excluded.unit_cost_snapshot,
  unit_sell_price_snapshot = excluded.unit_sell_price_snapshot,
  unit_price = excluded.unit_price,
  total_price = excluded.total_price,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

insert into public.work_order_quote_lines (
  id, shop_id, work_order_id, work_order_line_id, source_work_order_line_id,
  external_id, title, description, line_type, job_type, status, stage,
  decision, labor_hours, est_labor_hours, labor_rate, labor_total, parts_total,
  subtotal, discount_total, tax_total, grand_total, metadata, created_by,
  approved_by, sent_by, approved_at, sent_at, sent_to_customer_at,
  created_at, updated_at
)
values
  ('f1700000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1500000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000001', 'regression-authorized-quote', 'Air dryer service', 'Replace air dryer cartridge using quoted Bendix part', 'job', 'repair', 'approved', 'customer_approved', 'approved', 2.50, 2.50, 145.00, 362.50, 145.00, 507.50, 0, 0, 507.50, '{"fixture":"profixiq-regression-v1","parts_quote":{"items":[{"part_number":"AD-REG-001","description":"Air dryer cartridge","quantity":1,"unit_cost":90,"unit_price":145}]}}'::jsonb, 'f1100000-0000-4000-8000-000000000004', 'f1100000-0000-4000-8000-000000000008', 'f1100000-0000-4000-8000-000000000004', '2026-08-21T18:10:00Z', '2026-08-21T18:05:00Z', '2026-08-21T18:05:00Z', '2026-08-21T18:00:00Z', '2026-08-21T18:10:00Z'),
  ('f1700000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'f1500000-0000-4000-8000-000000000002', null, null, 'regression-unrelated-quote', 'Unrelated starter quote', 'Starter-shop quote that must never appear for the Pro customer', 'job', 'repair', 'sent', 'sent', null, 1.00, 1.00, 120.00, 120.00, 60.00, 180.00, 0, 0, 180.00, '{"fixture":"profixiq-regression-v1","unrelated":true}'::jsonb, 'f1100000-0000-4000-8000-000000000002', null, 'f1100000-0000-4000-8000-000000000002', null, '2026-08-21T18:05:00Z', '2026-08-21T18:05:00Z', '2026-08-21T18:00:00Z', '2026-08-21T18:05:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  work_order_id = excluded.work_order_id,
  work_order_line_id = excluded.work_order_line_id,
  source_work_order_line_id = excluded.source_work_order_line_id,
  external_id = excluded.external_id,
  title = excluded.title,
  description = excluded.description,
  line_type = excluded.line_type,
  job_type = excluded.job_type,
  status = excluded.status,
  stage = excluded.stage,
  decision = excluded.decision,
  labor_hours = excluded.labor_hours,
  est_labor_hours = excluded.est_labor_hours,
  labor_rate = excluded.labor_rate,
  labor_total = excluded.labor_total,
  parts_total = excluded.parts_total,
  subtotal = excluded.subtotal,
  discount_total = excluded.discount_total,
  tax_total = excluded.tax_total,
  grand_total = excluded.grand_total,
  metadata = excluded.metadata,
  approved_by = excluded.approved_by,
  sent_by = excluded.sent_by,
  approved_at = excluded.approved_at,
  sent_at = excluded.sent_at,
  sent_to_customer_at = excluded.sent_to_customer_at,
  updated_at = excluded.updated_at;

insert into public.stock_locations (id, shop_id, code, name)
values (
  'f2500000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'TRUCK-REG-01', 'Regression Service Truck Inventory'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  code = excluded.code,
  name = excluded.name;

insert into public.parts (
  id, shop_id, name, description, price, cost, part_number, category,
  sku, supplier, warranty_months, created_at
)
values (
  'f2700000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'Air-line fitting', 'DOT air-line fitting stocked on the Field service truck',
  15.00, 3.50, 'REG-FIT-001', 'Air system', 'REG-FIT-001',
  'Regression Supplier', 0, '2026-08-21T18:00:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  cost = excluded.cost,
  part_number = excluded.part_number,
  category = excluded.category,
  sku = excluded.sku,
  supplier = excluded.supplier,
  warranty_months = excluded.warranty_months;

insert into public.work_order_parts (
  id, shop_id, work_order_id, work_order_line_id, part_id, lifecycle_status,
  description_snapshot, manufacturer_snapshot, part_number_snapshot,
  sku_snapshot, quantity, quantity_requested, quantity_ordered,
  quantity_received, quantity_allocated, quantity_consumed, quantity_returned,
  quantity_cancelled, unit_cost_snapshot, unit_sell_price_snapshot, unit_price,
  total_price, is_active, created_at, updated_at
)
values (
  'f1800000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000001',
  'f1500000-0000-4000-8000-000000000001',
  'f1600000-0000-4000-8000-000000000001',
  'f2700000-0000-4000-8000-000000000001', 'received',
  'Air-line fitting', 'DOT', 'REG-FIT-001', 'REG-FIT-001',
  1, 1, 0, 1, 0, 0, 0, 0, 3.50, 0, 0, 0, true,
  '2026-08-21T18:26:00Z', '2026-08-21T18:40:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  work_order_id = excluded.work_order_id,
  work_order_line_id = excluded.work_order_line_id,
  part_id = excluded.part_id,
  lifecycle_status = excluded.lifecycle_status,
  description_snapshot = excluded.description_snapshot,
  manufacturer_snapshot = excluded.manufacturer_snapshot,
  part_number_snapshot = excluded.part_number_snapshot,
  sku_snapshot = excluded.sku_snapshot,
  quantity = excluded.quantity,
  quantity_requested = excluded.quantity_requested,
  quantity_ordered = excluded.quantity_ordered,
  quantity_received = excluded.quantity_received,
  quantity_allocated = excluded.quantity_allocated,
  quantity_consumed = excluded.quantity_consumed,
  quantity_returned = excluded.quantity_returned,
  quantity_cancelled = excluded.quantity_cancelled,
  unit_cost_snapshot = excluded.unit_cost_snapshot,
  unit_sell_price_snapshot = excluded.unit_sell_price_snapshot,
  unit_price = excluded.unit_price,
  total_price = excluded.total_price,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

insert into public.part_requests (
  id, shop_id, work_order_id, job_id, quote_line_id, requested_by,
  assigned_to, status, notes, handoff_completed_at, handoff_completed_by,
  created_at
)
values
  (
    'f2200000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'f1500000-0000-4000-8000-000000000001',
    'f1600000-0000-4000-8000-000000000001',
    'f1700000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000005',
    'f1100000-0000-4000-8000-000000000007',
    'approved', 'One received fitting and one pending mounting-hardware item.',
    null, null, '2026-08-21T18:24:00Z'
  )
on conflict (id) do update set
  shop_id = excluded.shop_id,
  work_order_id = excluded.work_order_id,
  job_id = excluded.job_id,
  quote_line_id = excluded.quote_line_id,
  requested_by = excluded.requested_by,
  assigned_to = excluded.assigned_to,
  status = excluded.status,
  notes = excluded.notes,
  handoff_completed_at = excluded.handoff_completed_at,
  handoff_completed_by = excluded.handoff_completed_by;

insert into public.part_request_items (
  id, request_id, shop_id, work_order_id, work_order_line_id, quote_line_id,
  part_id, source_work_order_part_id, location_id, description,
  requested_manufacturer, requested_part_number, qty, qty_requested,
  qty_approved, qty_ordered, qty_received, approved, status, unit_cost,
  unit_price, quoted_price, source_row_id, created_at, updated_at
)
values
  (
    'f2300000-0000-4000-8000-000000000001',
    'f2200000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'f1500000-0000-4000-8000-000000000001',
    'f1600000-0000-4000-8000-000000000001', null, null, null, null,
    'Air dryer mounting hardware', null, 'REG-MOUNT-001', 1, 1, 1, 0, 0, true,
    'approved', 1.00, 0, 0, 'regression:pending-mounting-hardware',
    '2026-08-21T18:24:00Z', '2026-08-21T18:24:00Z'
  ),
  (
    'f2300000-0000-4000-8000-000000000002',
    'f2200000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'f1500000-0000-4000-8000-000000000001',
    'f1600000-0000-4000-8000-000000000001',
    'f1700000-0000-4000-8000-000000000001',
    'f2700000-0000-4000-8000-000000000001',
    'f1800000-0000-4000-8000-000000000002',
    'f2500000-0000-4000-8000-000000000001',
    'Air-line fitting', 'DOT', 'REG-FIT-001', 1, 1, 1, 0, 1, true,
    'received', 3.50, 0, 0,
    'regression:received-air-line-fitting',
    '2026-08-21T18:26:00Z', '2026-08-21T18:40:00Z'
  )
on conflict (id) do update set
  request_id = excluded.request_id,
  shop_id = excluded.shop_id,
  work_order_id = excluded.work_order_id,
  work_order_line_id = excluded.work_order_line_id,
  quote_line_id = excluded.quote_line_id,
  part_id = excluded.part_id,
  source_work_order_part_id = excluded.source_work_order_part_id,
  location_id = excluded.location_id,
  description = excluded.description,
  requested_manufacturer = excluded.requested_manufacturer,
  requested_part_number = excluded.requested_part_number,
  qty = excluded.qty,
  qty_requested = excluded.qty_requested,
  qty_approved = excluded.qty_approved,
  qty_ordered = excluded.qty_ordered,
  qty_received = excluded.qty_received,
  approved = excluded.approved,
  status = excluded.status,
  unit_cost = excluded.unit_cost,
  unit_price = excluded.unit_price,
  quoted_price = excluded.quoted_price,
  source_row_id = excluded.source_row_id,
  updated_at = excluded.updated_at;

insert into public.part_request_lines (
  id, request_id, work_order_line_id, created_at
)
values
  ('f2400000-0000-4000-8000-000000000001', 'f2200000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000001', '2026-08-21T18:24:00Z')
on conflict (id) do update set
  request_id = excluded.request_id,
  work_order_line_id = excluded.work_order_line_id;

update public.work_order_parts
set source_parts_request_id = 'f2200000-0000-4000-8000-000000000001',
    source_parts_request_item_id = 'f2300000-0000-4000-8000-000000000002',
    updated_at = '2026-08-21T18:40:00Z'
where id = 'f1800000-0000-4000-8000-000000000002';

insert into public.stock_moves (
  id, shop_id, part_id, location_id, qty_change, lifecycle_quantity, reason,
  reference_kind, reference_id, part_request_item_id, work_order_part_id,
  created_by, idempotency_key, metadata, created_at
)
values (
  'f2800000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f2700000-0000-4000-8000-000000000001',
  'f2500000-0000-4000-8000-000000000001',
  1, 1, 'receive', 'part_request_item',
  'f2300000-0000-4000-8000-000000000002',
  'f2300000-0000-4000-8000-000000000002',
  'f1800000-0000-4000-8000-000000000002',
  'f1100000-0000-4000-8000-000000000007',
  'f1000000-0000-4000-8000-000000000001:regression:field-truck-receipt',
  '{"fixture":"profixiq-regression-v1","operation":"receive","qty_received":1}'::jsonb,
  '2026-08-21T18:40:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  part_id = excluded.part_id,
  location_id = excluded.location_id,
  qty_change = excluded.qty_change,
  lifecycle_quantity = excluded.lifecycle_quantity,
  reason = excluded.reason,
  reference_kind = excluded.reference_kind,
  reference_id = excluded.reference_id,
  part_request_item_id = excluded.part_request_item_id,
  work_order_part_id = excluded.work_order_part_id,
  created_by = excluded.created_by,
  idempotency_key = excluded.idempotency_key,
  metadata = excluded.metadata;

insert into public.part_stock (
  id, part_id, location_id, qty_on_hand, qty_reserved, reorder_point,
  reorder_qty
)
values (
  'f2900000-0000-4000-8000-000000000001',
  'f2700000-0000-4000-8000-000000000001',
  'f2500000-0000-4000-8000-000000000001',
  1, 0, 1, 4
)
on conflict (id) do update set
  part_id = excluded.part_id,
  location_id = excluded.location_id,
  qty_on_hand = excluded.qty_on_hand,
  qty_reserved = excluded.qty_reserved,
  reorder_point = excluded.reorder_point,
  reorder_qty = excluded.reorder_qty;

insert into public.mobile_service_settings (
  shop_id, service_model, solo_mode, dispatch_enabled,
  service_vehicles_enabled, truck_inventory_enabled, default_visit_minutes,
  field_operator_count_target, onboarding_completed_at, configured_by,
  created_at, updated_at
)
values (
  'f1000000-0000-4000-8000-000000000001', 'both', false, true, true, true,
  60, 1, '2026-08-21T18:00:00Z',
  'f1100000-0000-4000-8000-000000000001',
  '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'
)
on conflict (shop_id) do update set
  service_model = excluded.service_model,
  solo_mode = excluded.solo_mode,
  dispatch_enabled = excluded.dispatch_enabled,
  service_vehicles_enabled = excluded.service_vehicles_enabled,
  truck_inventory_enabled = excluded.truck_inventory_enabled,
  default_visit_minutes = excluded.default_visit_minutes,
  field_operator_count_target = excluded.field_operator_count_target,
  onboarding_completed_at = excluded.onboarding_completed_at,
  configured_by = excluded.configured_by,
  updated_at = excluded.updated_at;

insert into public.mobile_field_operators (
  shop_id, profile_id, enabled, created_by, created_at, updated_at
)
values
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000012', true, 'f1100000-0000-4000-8000-000000000001', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000013', false, 'f1100000-0000-4000-8000-000000000001', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z')
on conflict (shop_id, profile_id) do update set
  enabled = excluded.enabled,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at;

insert into public.service_vehicles (
  id, shop_id, name, unit_number, primary_user_id, stock_location_id,
  active, capabilities, created_by, created_at, updated_at
)
values (
  'f2600000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'Regression Service Truck', 'FIELD-01',
  'f1100000-0000-4000-8000-000000000012',
  'f2500000-0000-4000-8000-000000000001', true,
  '{"mobile_v1":true,"truck_inventory":true}'::jsonb,
  'f1100000-0000-4000-8000-000000000014',
  '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'
)
on conflict (id) do update set
  shop_id = excluded.shop_id,
  name = excluded.name,
  unit_number = excluded.unit_number,
  primary_user_id = excluded.primary_user_id,
  stock_location_id = excluded.stock_location_id,
  active = excluded.active,
  capabilities = excluded.capabilities,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at;

insert into public.field_service_vehicle_assignments (
  shop_id, service_vehicle_id, profile_id, assigned_by_profile_id,
  created_at, updated_at
)
values (
  'f1000000-0000-4000-8000-000000000001',
  'f2600000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000012',
  'f1100000-0000-4000-8000-000000000014',
  '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'
)
on conflict (shop_id, service_vehicle_id) do update set
  profile_id = excluded.profile_id,
  assigned_by_profile_id = excluded.assigned_by_profile_id,
  updated_at = excluded.updated_at;

-- Trigger suppression also skips scheduler resource synchronization. Rebuild
-- the same canonical capacity/technician state those triggers own.
insert into public.scheduling_resources (
  id, shop_id, code, name, resource_type, mode, profile_id,
  service_vehicle_id, stock_location_id,
  public_bookable, is_fallback, active, sort_order, metadata,
  created_at, updated_at
)
values
  ('f1d00000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'default-capacity', 'Shop capacity', 'capacity', 'shop', null, null, null, true, true, true, 1000, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'default-capacity', 'Shop capacity', 'capacity', 'shop', null, null, null, true, true, true, 1000, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'tech:f1100000-0000-4000-8000-000000000005', 'Regression Technician', 'technician', 'both', 'f1100000-0000-4000-8000-000000000005', null, null, false, false, true, 200, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'tech:f1100000-0000-4000-8000-000000000006', 'Regression Lead Tech', 'technician', 'both', 'f1100000-0000-4000-8000-000000000006', null, null, false, false, true, 200, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'tech:f1100000-0000-4000-8000-000000000012', 'Regression Field Operator', 'technician', 'both', 'f1100000-0000-4000-8000-000000000012', null, null, false, false, true, 200, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000001', 'tech:f1100000-0000-4000-8000-000000000013', 'Regression Field Disabled', 'technician', 'both', 'f1100000-0000-4000-8000-000000000013', null, null, false, false, true, 200, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000007', 'f1000000-0000-4000-8000-000000000001', 'service-vehicle:f2600000-0000-4000-8000-000000000001', 'Regression Service Truck', 'service_vehicle', 'mobile', null, 'f2600000-0000-4000-8000-000000000001', 'f2500000-0000-4000-8000-000000000001', true, false, true, 100, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  code = excluded.code,
  name = excluded.name,
  resource_type = excluded.resource_type,
  mode = excluded.mode,
  profile_id = excluded.profile_id,
  service_vehicle_id = excluded.service_vehicle_id,
  stock_location_id = excluded.stock_location_id,
  public_bookable = excluded.public_bookable,
  is_fallback = excluded.is_fallback,
  active = excluded.active,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = excluded.updated_at;

insert into public.fleet_pretrip_reports (
  id, shop_id, fleet_id, vehicle_id, driver_profile_id, driver_name,
  inspection_date, odometer_km, checklist, notes, has_defects, source,
  status, created_at, updated_at
)
values
  ('f1a00000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000003', 'f1100000-0000-4000-8000-000000000011', 'Regression Driver', '2026-08-21', 410000, '{"brakes":{"status":"ok"},"lights":{"status":"ok"},"tires":{"status":"ok"},"engineHours":"8300"}'::jsonb, 'Clear pre-trip fixture', false, 'mobile_pretrip', 'reviewed', '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1a00000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000004', 'f1100000-0000-4000-8000-000000000011', 'Regression Driver', '2026-08-21', 525000, '{"brakes":{"status":"fail","notes":"Air leak at chamber"},"lights":{"status":"fail","notes":"Left marker lamp out"},"tires":{"status":"ok"},"engineHours":"10100"}'::jsonb, 'Defect pre-trip fixture', true, 'mobile_pretrip', 'open', '2026-08-21T18:05:00Z', '2026-08-21T18:05:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  fleet_id = excluded.fleet_id,
  vehicle_id = excluded.vehicle_id,
  driver_profile_id = excluded.driver_profile_id,
  driver_name = excluded.driver_name,
  inspection_date = excluded.inspection_date,
  odometer_km = excluded.odometer_km,
  checklist = excluded.checklist,
  notes = excluded.notes,
  has_defects = excluded.has_defects,
  source = excluded.source,
  status = excluded.status,
  updated_at = excluded.updated_at;

insert into public.fleet_service_requests (
  id, shop_id, fleet_id, vehicle_id, source_pretrip_id, title, summary,
  severity, status, scheduled_for_date, operation_key, request_fingerprint,
  requested_for_date, submitted_at, created_by_profile_id,
  created_at, updated_at
)
values
  ('f1900000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000004', 'f1a00000-0000-4000-8000-000000000002', 'Repair air leak', 'Inspect and repair the reported brake chamber air leak.', 'safety', 'open', null, 'regression:fleet-request:air-leak', 'regression-fleet-request-air-leak', '2026-08-22', '2026-08-21T18:10:00Z', 'f1100000-0000-4000-8000-000000000009', '2026-08-21T18:10:00Z', '2026-08-21T18:10:00Z'),
  ('f1900000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000003', null, 'Scheduled PM inspection', 'Complete the scheduled fleet PM inspection.', 'maintenance', 'scheduled', '2026-08-28', 'regression:fleet-request:scheduled-pm', 'regression-fleet-request-scheduled-pm', '2026-08-28', '2026-08-21T18:15:00Z', 'f1100000-0000-4000-8000-000000000010', '2026-08-21T18:15:00Z', '2026-08-21T18:15:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  fleet_id = excluded.fleet_id,
  vehicle_id = excluded.vehicle_id,
  source_pretrip_id = excluded.source_pretrip_id,
  title = excluded.title,
  summary = excluded.summary,
  severity = excluded.severity,
  status = excluded.status,
  scheduled_for_date = excluded.scheduled_for_date,
  operation_key = excluded.operation_key,
  request_fingerprint = excluded.request_fingerprint,
  requested_for_date = excluded.requested_for_date,
  submitted_at = excluded.submitted_at,
  created_by_profile_id = excluded.created_by_profile_id,
  updated_at = excluded.updated_at;

insert into public.fleet_unit_defects (
  id, shop_id, fleet_id, vehicle_id, source_pretrip_id, defect_key, label,
  severity, state, description, reported_by, reported_at,
  service_request_id, notify_dispatcher, intake_required,
  marks_vehicle_attention, created_at, updated_at
)
values
  ('f1b00000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000004', 'f1a00000-0000-4000-8000-000000000002', 'brakes', 'Brakes / air system', 'safety', 'converted', 'Air leak at chamber', 'f1100000-0000-4000-8000-000000000011', '2026-08-21T18:05:00Z', 'f1900000-0000-4000-8000-000000000001', true, true, true, '2026-08-21T18:05:00Z', '2026-08-21T18:10:00Z'),
  ('f1b00000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000004', 'f1a00000-0000-4000-8000-000000000002', 'lights', 'Lights & signals', 'compliance', 'open', 'Left marker lamp out', 'f1100000-0000-4000-8000-000000000011', '2026-08-21T18:05:00Z', null, true, false, true, '2026-08-21T18:05:00Z', '2026-08-21T18:05:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  fleet_id = excluded.fleet_id,
  vehicle_id = excluded.vehicle_id,
  source_pretrip_id = excluded.source_pretrip_id,
  defect_key = excluded.defect_key,
  label = excluded.label,
  severity = excluded.severity,
  state = excluded.state,
  description = excluded.description,
  reported_by = excluded.reported_by,
  reported_at = excluded.reported_at,
  service_request_id = excluded.service_request_id,
  notify_dispatcher = excluded.notify_dispatcher,
  intake_required = excluded.intake_required,
  marks_vehicle_attention = excluded.marks_vehicle_attention,
  updated_at = excluded.updated_at;

set session_replication_role = origin;

do $regression_fixture_assertions$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.shops
  where id in (
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002'
  ) and plan in ('pro', 'starter');
  if v_count <> 2 then
    raise exception 'Regression fixture shops were not recreated deterministically';
  end if;

  if exists (
    with expected(id, email, role, shop_id) as (
      values
        ('f1100000-0000-4000-8000-000000000001'::uuid, 'pro-owner@regression.profixiq.invalid', 'owner', 'f1000000-0000-4000-8000-000000000001'::uuid),
        ('f1100000-0000-4000-8000-000000000002'::uuid, 'starter-owner@regression.profixiq.invalid', 'owner', 'f1000000-0000-4000-8000-000000000002'::uuid),
        ('f1100000-0000-4000-8000-000000000003'::uuid, 'manager@regression.profixiq.invalid', 'manager', 'f1000000-0000-4000-8000-000000000001'::uuid),
        ('f1100000-0000-4000-8000-000000000004'::uuid, 'advisor@regression.profixiq.invalid', 'advisor', 'f1000000-0000-4000-8000-000000000001'::uuid),
        ('f1100000-0000-4000-8000-000000000005'::uuid, 'technician@regression.profixiq.invalid', 'mechanic', 'f1000000-0000-4000-8000-000000000001'::uuid),
        ('f1100000-0000-4000-8000-000000000006'::uuid, 'lead-tech@regression.profixiq.invalid', 'lead_hand', 'f1000000-0000-4000-8000-000000000001'::uuid),
        ('f1100000-0000-4000-8000-000000000007'::uuid, 'parts@regression.profixiq.invalid', 'parts', 'f1000000-0000-4000-8000-000000000001'::uuid),
        ('f1100000-0000-4000-8000-000000000008'::uuid, 'customer@regression.profixiq.invalid', 'customer', null),
        ('f1100000-0000-4000-8000-000000000009'::uuid, 'fleet-manager@regression.profixiq.invalid', 'fleet_manager', null),
        ('f1100000-0000-4000-8000-000000000010'::uuid, 'dispatcher@regression.profixiq.invalid', 'dispatcher', null),
        ('f1100000-0000-4000-8000-000000000011'::uuid, 'driver@regression.profixiq.invalid', 'driver', null),
        ('f1100000-0000-4000-8000-000000000012'::uuid, 'field-operator@regression.profixiq.invalid', 'mechanic', 'f1000000-0000-4000-8000-000000000001'::uuid),
        ('f1100000-0000-4000-8000-000000000013'::uuid, 'field-disabled@regression.profixiq.invalid', 'mechanic', 'f1000000-0000-4000-8000-000000000001'::uuid),
        ('f1100000-0000-4000-8000-000000000014'::uuid, 'administrator@regression.profixiq.invalid', 'admin', 'f1000000-0000-4000-8000-000000000001'::uuid)
    )
    select 1
    from expected e
    left join auth.users u on u.id = e.id
    left join public.profiles p on p.id = e.id
    where u.id is null
      or u.email is distinct from e.email
      or p.user_id is distinct from e.id
      or p.email is distinct from e.email
      or p.role is distinct from e.role
      or p.shop_id is distinct from e.shop_id
      or (
        e.shop_id is not null
        and not exists (
          select 1
          from public.shop_members sm
          where sm.shop_id = e.shop_id
            and sm.user_id = e.id
            and sm.role = e.role
        )
      )
      or (
        e.shop_id is null
        and exists (
          select 1
          from public.shop_members sm
          where sm.user_id = e.id
            and sm.shop_id in (
              'f1000000-0000-4000-8000-000000000001',
              'f1000000-0000-4000-8000-000000000002'
            )
        )
      )
  ) then
    raise exception 'Regression fixture persona identity/role/tenant tuples are incomplete';
  end if;

  if not exists (
    select 1
    from public.staff_capability_overrides override
    join public.profiles target
      on target.id = override.profile_id
    join public.profiles changer
      on changer.id = override.changed_by_profile_id
    where override.id = 'f1e00000-0000-4000-8000-000000000001'
      and override.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and override.profile_id = 'f1100000-0000-4000-8000-000000000005'
      and override.capability_key = 'work_order.assignment.manage'
      and override.effect = 'allow'
      and override.changed_by_profile_id = 'f1100000-0000-4000-8000-000000000014'
      and target.shop_id = override.shop_id
      and changer.shop_id = override.shop_id
  ) then
    raise exception 'Individual capability override fixture is incomplete';
  end if;

  if not exists (
    select 1
    from public.work_order_line_technicians assignment
    join public.work_order_lines line
      on line.id = assignment.work_order_line_id
    join public.profiles technician
      on technician.id = assignment.technician_id
    join public.profiles assigner
      on assigner.id = assignment.assigned_by
    where assignment.work_order_line_id = 'f1600000-0000-4000-8000-000000000001'
      and assignment.technician_id = 'f1100000-0000-4000-8000-000000000005'
      and line.assigned_tech_id = assignment.technician_id
      and line.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and technician.shop_id = line.shop_id
      and assigner.shop_id = line.shop_id
  ) then
    raise exception 'Canonical technician assignment fixture is incomplete';
  end if;

  if not exists (
    select 1
    from public.work_order_quote_lines quote_line
    join public.work_orders work_order on work_order.id = quote_line.work_order_id
    join public.customers customer on customer.id = work_order.customer_id
    where quote_line.id = 'f1700000-0000-4000-8000-000000000001'
      and quote_line.status = 'approved'
      and quote_line.stage = 'customer_approved'
      and quote_line.decision = 'approved'
      and quote_line.approved_at is not null
      and quote_line.parts_total = 145.00
      and quote_line.grand_total = 507.50
      and customer.user_id = 'f1100000-0000-4000-8000-000000000008'
      and (
        select coalesce(sum(part.total_price), 0)
        from public.work_order_parts part
        where part.work_order_id = work_order.id
          and part.is_active
      ) = quote_line.parts_total
  ) then
    raise exception 'Authorized customer quote fixture is incomplete';
  end if;

  if not exists (
    select 1
    from public.work_order_quote_lines quote_line
    join public.work_orders work_order on work_order.id = quote_line.work_order_id
    where quote_line.id = 'f1700000-0000-4000-8000-000000000002'
      and quote_line.status = 'sent'
      and quote_line.shop_id = 'f1000000-0000-4000-8000-000000000002'
      and work_order.customer_id = 'f1200000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Unrelated customer quote fixture is incomplete';
  end if;

  if not exists (
    select 1
    from public.work_order_parts part
    join public.work_order_lines line on line.id = part.work_order_line_id
    where part.id = 'f1800000-0000-4000-8000-000000000001'
      and part.lifecycle_status = 'quoted'
      and line.labor_time = 2.50
  ) then
    raise exception 'Labor and quoted-parts fixture is incomplete';
  end if;

  if not exists (
    select 1
    from public.inspections inspection
    join public.work_orders work_order
      on work_order.id = inspection.work_order_id
    join public.work_order_lines line
      on line.id = inspection.work_order_line_id
    join public.vehicles vehicle
      on vehicle.id = inspection.vehicle_id
    join public.profiles inspector
      on inspector.id = inspection.user_id
    join public.profiles finalizer
      on finalizer.id = inspection.finalized_by
    join public.inspection_signatures signature
      on signature.inspection_id = inspection.id
    join public.profiles signer
      on signer.id = signature.signed_by
    join public.inspection_items item
      on item.inspection_id = inspection.id
    join public.work_order_line_labor_segments labor
      on labor.work_order_line_id = inspection.work_order_line_id
    join public.profiles technician
      on technician.id = labor.technician_id
    join public.profiles labor_creator
      on labor_creator.id = labor.created_by
    where inspection.id = 'f1f00000-0000-4000-8000-000000000001'
      and inspection.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and inspection.work_order_id = 'f1500000-0000-4000-8000-000000000001'
      and inspection.work_order_line_id = 'f1600000-0000-4000-8000-000000000001'
      and work_order.shop_id = inspection.shop_id
      and work_order.vehicle_id = inspection.vehicle_id
      and line.shop_id = inspection.shop_id
      and line.work_order_id = inspection.work_order_id
      and line.status = 'active'
      and line.punched_in_at = labor.started_at
      and line.punched_out_at = labor.ended_at
      and line.updated_at = labor.ended_at
      and vehicle.shop_id = inspection.shop_id
      and inspector.shop_id = inspection.shop_id
      and finalizer.shop_id = inspection.shop_id
      and signer.shop_id = inspection.shop_id
      and inspection.is_canonical
      and inspection.status = 'completed'
      and inspection.completed
      and not inspection.is_draft
      and inspection.locked
      and inspection.sync_revision = 1
      and inspection.summary->>'id' = inspection.id::text
      and inspection.summary->>'workOrderId' = inspection.work_order_id::text
      and inspection.summary->>'workOrderLineId' = inspection.work_order_line_id::text
      and inspection.summary->>'status' = 'completed'
      and inspection.summary->>'syncRevision' = '1'
      and jsonb_array_length(inspection.summary->'sections') = 1
      and signature.id = 'f2a00000-0000-4000-8000-000000000001'
      and signature.role = 'advisor'
      and signature.signed_by = inspection.finalized_by
      and signature.signing_cycle = inspection.signing_cycle
      and signature.signed_sync_revision = inspection.sync_revision
      and signature.signed_summary = inspection.summary
      and signature.signed_summary_hash = encode(
        extensions.digest(
          convert_to(signature.signed_summary::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
      and item.id = 'f2000000-0000-4000-8000-000000000001'
      and item.status = 'recommend'
      and inspection.summary #>> '{sections,0,items,0,item}' = item.label
      and inspection.summary #>> '{sections,0,items,0,status}' = item.status
      and labor.id = 'f2100000-0000-4000-8000-000000000001'
      and labor.shop_id = inspection.shop_id
      and labor.work_order_id = inspection.work_order_id
      and labor.technician_id = 'f1100000-0000-4000-8000-000000000005'
      and technician.shop_id = labor.shop_id
      and labor_creator.shop_id = labor.shop_id
      and labor.pause_reason = 'labor_pause'
      and labor.ended_at is not null
      and labor.ended_at > labor.started_at
  ) then
    raise exception 'Inspection and labor evidence fixtures are incomplete';
  end if;

  if not exists (
    select 1
    from public.part_requests request
    join public.work_orders work_order
      on work_order.id = request.work_order_id
    join public.work_order_lines line
      on line.id = request.job_id
    join public.work_order_quote_lines quote_line
      on quote_line.id = request.quote_line_id
    join public.profiles requester
      on requester.id = request.requested_by
    join public.profiles assignee
      on assignee.id = request.assigned_to
    join public.part_request_items item on item.request_id = request.id
    join public.part_request_lines request_line on request_line.request_id = request.id
    where request.id = 'f2200000-0000-4000-8000-000000000001'
      and request.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and request.status = 'approved'
      and request.handoff_completed_at is null
      and request.handoff_completed_by is null
      and work_order.shop_id = request.shop_id
      and line.shop_id = request.shop_id
      and line.work_order_id = request.work_order_id
      and quote_line.shop_id = request.shop_id
      and quote_line.work_order_id = request.work_order_id
      and quote_line.work_order_line_id = request.job_id
      and requester.shop_id = request.shop_id
      and assignee.shop_id = request.shop_id
      and item.id = 'f2300000-0000-4000-8000-000000000001'
      and item.shop_id = request.shop_id
      and item.work_order_id = request.work_order_id
      and item.work_order_line_id = request.job_id
      and item.status = 'approved'
      and item.approved
      and item.qty_requested = 1
      and item.qty_approved = 1
      and item.qty_ordered = 0
      and item.qty_received = 0
      and item.unit_cost = 1.00
      and item.unit_price = 0
      and item.quoted_price = 0
      and request_line.id = 'f2400000-0000-4000-8000-000000000001'
      and request_line.work_order_line_id = 'f1600000-0000-4000-8000-000000000001'
  ) or not exists (
    select 1
    from public.part_requests request
    join public.work_orders work_order
      on work_order.id = request.work_order_id
    join public.work_order_lines line
      on line.id = request.job_id
    join public.part_request_items item on item.request_id = request.id
    join public.work_order_parts part
      on part.id = item.source_work_order_part_id
    join public.parts catalog_part
      on catalog_part.id = item.part_id
    join public.stock_locations location
      on location.id = item.location_id
    where request.id = 'f2200000-0000-4000-8000-000000000001'
      and request.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and request.status = 'approved'
      and work_order.shop_id = request.shop_id
      and line.shop_id = request.shop_id
      and line.work_order_id = request.work_order_id
      and item.id = 'f2300000-0000-4000-8000-000000000002'
      and item.shop_id = request.shop_id
      and item.work_order_id = request.work_order_id
      and item.work_order_line_id = request.job_id
      and item.status = 'received'
      and item.approved
      and item.qty_requested = 1
      and item.qty_approved = 1
      and item.qty_ordered = 0
      and item.qty_received = 1
      and item.part_id = 'f2700000-0000-4000-8000-000000000001'
      and item.location_id = 'f2500000-0000-4000-8000-000000000001'
      and catalog_part.shop_id = request.shop_id
      and location.shop_id = request.shop_id
      and part.id = 'f1800000-0000-4000-8000-000000000002'
      and part.shop_id = request.shop_id
      and part.work_order_id = request.work_order_id
      and part.work_order_line_id = request.job_id
      and part.lifecycle_status = 'received'
      and part.quantity_received = 1
      and part.part_id = item.part_id
      and part.source_parts_request_id = request.id
      and part.source_parts_request_item_id = item.id
      and part.unit_sell_price_snapshot = 0
      and part.unit_price = 0
      and part.total_price = 0
  ) then
    raise exception 'Pending and received Parts fixtures are incomplete';
  end if;

  select count(*) into v_count
  from public.fleet_vehicles
  where fleet_id = 'f1400000-0000-4000-8000-000000000001';
  if v_count <> 2 then
    raise exception 'Fleet asset fixtures are incomplete';
  end if;

  select count(*) into v_count
  from public.fleet_service_requests
  where fleet_id = 'f1400000-0000-4000-8000-000000000001';
  if v_count <> 2 then
    raise exception 'Fleet request fixtures are incomplete';
  end if;

  select count(*) into v_count
  from public.fleet_pretrip_reports
  where fleet_id = 'f1400000-0000-4000-8000-000000000001';
  if v_count <> 2 then
    raise exception 'Fleet pre-trip fixtures are incomplete';
  end if;

  select count(*) into v_count
  from public.fleet_unit_defects
  where fleet_id = 'f1400000-0000-4000-8000-000000000001';
  if v_count <> 2 then
    raise exception 'Fleet defect fixtures are incomplete';
  end if;

  if not exists (
    select 1
    from public.mobile_field_operators operator
    join public.profiles profile on profile.id = operator.profile_id
    join public.profiles creator on creator.id = operator.created_by
    where operator.profile_id = 'f1100000-0000-4000-8000-000000000012'
      and operator.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and profile.shop_id = operator.shop_id
      and creator.shop_id = operator.shop_id
      and operator.enabled
  ) or not exists (
    select 1
    from public.mobile_field_operators operator
    join public.profiles profile on profile.id = operator.profile_id
    join public.profiles creator on creator.id = operator.created_by
    where operator.profile_id = 'f1100000-0000-4000-8000-000000000013'
      and operator.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and profile.shop_id = operator.shop_id
      and creator.shop_id = operator.shop_id
      and not operator.enabled
  ) then
    raise exception 'Field-enabled/disabled actor fixtures are incomplete';
  end if;

  if not exists (
    select 1
    from public.service_vehicles vehicle
    join public.profiles primary_operator
      on primary_operator.id = vehicle.primary_user_id
    join public.profiles vehicle_creator
      on vehicle_creator.id = vehicle.created_by
    join public.field_service_vehicle_assignments assignment
      on assignment.shop_id = vehicle.shop_id
     and assignment.service_vehicle_id = vehicle.id
    join public.profiles assigned_operator
      on assigned_operator.id = assignment.profile_id
    join public.profiles assignment_actor
      on assignment_actor.id = assignment.assigned_by_profile_id
    join public.stock_locations location on location.id = vehicle.stock_location_id
    join public.parts part on part.shop_id = vehicle.shop_id
    join public.stock_moves move
      on move.shop_id = vehicle.shop_id
     and move.part_id = part.id
     and move.location_id = location.id
    join public.profiles move_actor on move_actor.id = move.created_by
    join public.part_request_items request_item
      on request_item.id = move.part_request_item_id
    join public.work_order_parts work_order_part
      on work_order_part.id = move.work_order_part_id
    join public.part_stock stock
      on stock.part_id = part.id
     and stock.location_id = location.id
    where vehicle.id = 'f2600000-0000-4000-8000-000000000001'
      and vehicle.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and vehicle.primary_user_id = 'f1100000-0000-4000-8000-000000000012'
      and vehicle.capabilities @> '{"mobile_v1":true,"truck_inventory":true}'::jsonb
      and assignment.profile_id = 'f1100000-0000-4000-8000-000000000012'
      and primary_operator.shop_id = vehicle.shop_id
      and vehicle_creator.shop_id = vehicle.shop_id
      and assigned_operator.shop_id = vehicle.shop_id
      and assignment_actor.shop_id = vehicle.shop_id
      and location.id = 'f2500000-0000-4000-8000-000000000001'
      and location.shop_id = vehicle.shop_id
      and part.id = 'f2700000-0000-4000-8000-000000000001'
      and move.id = 'f2800000-0000-4000-8000-000000000001'
      and move_actor.shop_id = vehicle.shop_id
      and move.qty_change = 1
      and move.lifecycle_quantity = 1
      and move.reason = 'receive'
      and move.metadata->>'operation' = 'receive'
      and (move.metadata->>'qty_received')::numeric = move.lifecycle_quantity
      and move.reference_kind = 'part_request_item'
      and move.reference_id = 'f2300000-0000-4000-8000-000000000002'
      and move.part_request_item_id = 'f2300000-0000-4000-8000-000000000002'
      and move.work_order_part_id = 'f1800000-0000-4000-8000-000000000002'
      and request_item.shop_id = vehicle.shop_id
      and request_item.part_id = part.id
      and request_item.location_id = location.id
      and work_order_part.shop_id = vehicle.shop_id
      and work_order_part.part_id = part.id
      and stock.id = 'f2900000-0000-4000-8000-000000000001'
      and stock.qty_on_hand = 1
      and stock.qty_reserved = 0
      and stock.qty_on_hand >= 0
      and stock.qty_reserved >= 0
      and stock.qty_on_hand = (
        select coalesce(sum(ledger.qty_change), 0)
        from public.stock_moves ledger
        where ledger.part_id = stock.part_id
          and ledger.location_id = stock.location_id
          and ledger.shop_id = vehicle.shop_id
          and ledger.reason not in ('wo_allocate', 'wo_release')
      )
  ) then
    raise exception 'Field service truck and inventory fixtures are incomplete';
  end if;

  select count(*) into v_count
  from public.scheduling_resources
  where id in (
    'f1d00000-0000-4000-8000-000000000001',
    'f1d00000-0000-4000-8000-000000000002',
    'f1d00000-0000-4000-8000-000000000003',
    'f1d00000-0000-4000-8000-000000000004',
    'f1d00000-0000-4000-8000-000000000005',
    'f1d00000-0000-4000-8000-000000000006',
    'f1d00000-0000-4000-8000-000000000007'
  ) and active;
  if v_count <> 7 or not exists (
    select 1
    from public.scheduling_resources r
    where r.id = 'f1d00000-0000-4000-8000-000000000005'
      and r.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and r.profile_id = 'f1100000-0000-4000-8000-000000000012'
      and r.resource_type = 'technician'
      and r.mode = 'both'
      and r.active
  ) or not exists (
    select 1
    from public.scheduling_resources r
    where r.id = 'f1d00000-0000-4000-8000-000000000007'
      and r.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and r.service_vehicle_id = 'f2600000-0000-4000-8000-000000000001'
      and r.stock_location_id = 'f2500000-0000-4000-8000-000000000001'
      and r.resource_type = 'service_vehicle'
      and r.mode = 'mobile'
      and r.active
  ) then
    raise exception 'Scheduler capacity fixtures are incomplete';
  end if;
end
$regression_fixture_assertions$;
