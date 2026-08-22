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
    ('f1100000-0000-4000-8000-000000000013'::uuid, 'field-disabled@regression.profixiq.invalid', 'Regression Field Disabled')
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
    ('f1100000-0000-4000-8000-000000000013'::uuid, 'field-disabled@regression.profixiq.invalid')
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
  ('f1100000-0000-4000-8000-000000000013', 'f1100000-0000-4000-8000-000000000013', 'field-disabled@regression.profixiq.invalid', 'Regression Field Disabled', 'mechanic', true, false, null, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z')
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
    'f1100000-0000-4000-8000-000000000013'::uuid
  ) then 'f1000000-0000-4000-8000-000000000001'::uuid
  else null
end
where id between
  'f1100000-0000-4000-8000-000000000001'::uuid and
  'f1100000-0000-4000-8000-000000000013'::uuid;

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
  ('f1000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000013', 'mechanic', 'f1100000-0000-4000-8000-000000000001')
on conflict (shop_id, user_id) do update set role = excluded.role;

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

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, assigned_tech_id, description,
  complaint, job_type, line_type, status, line_status, approval_state,
  approval_at, approval_by, labor_time, price_estimate,
  external_id, created_at, updated_at
)
values (
  'f1600000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'f1500000-0000-4000-8000-000000000001',
  'f1300000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000005',
  'Replace air dryer cartridge', 'Air system purges frequently', 'repair',
  'job', 'awaiting', 'authorized', 'approved',
  '2026-08-21T18:10:00Z', 'f1100000-0000-4000-8000-000000000008',
  2.50, 507.50, 'regression-authorized-repair-line',
  '2026-08-21T18:00:00Z', '2026-08-21T18:10:00Z'
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
  external_id = excluded.external_id,
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

-- Trigger suppression also skips scheduler resource synchronization. Rebuild
-- the same canonical capacity/technician state those triggers own.
insert into public.scheduling_resources (
  id, shop_id, code, name, resource_type, mode, profile_id,
  public_bookable, is_fallback, active, sort_order, metadata,
  created_at, updated_at
)
values
  ('f1d00000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'default-capacity', 'Shop capacity', 'capacity', 'shop', null, true, true, true, 1000, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'default-capacity', 'Shop capacity', 'capacity', 'shop', null, true, true, true, 1000, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'tech:f1100000-0000-4000-8000-000000000005', 'Regression Technician', 'technician', 'both', 'f1100000-0000-4000-8000-000000000005', false, false, true, 200, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'tech:f1100000-0000-4000-8000-000000000006', 'Regression Lead Tech', 'technician', 'both', 'f1100000-0000-4000-8000-000000000006', false, false, true, 200, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001', 'tech:f1100000-0000-4000-8000-000000000012', 'Regression Field Operator', 'technician', 'both', 'f1100000-0000-4000-8000-000000000012', false, false, true, 200, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z'),
  ('f1d00000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000001', 'tech:f1100000-0000-4000-8000-000000000013', 'Regression Field Disabled', 'technician', 'both', 'f1100000-0000-4000-8000-000000000013', false, false, true, 200, '{"fixture":"profixiq-regression-v1"}'::jsonb, '2026-08-21T18:00:00Z', '2026-08-21T18:00:00Z')
on conflict (id) do update set
  shop_id = excluded.shop_id,
  code = excluded.code,
  name = excluded.name,
  resource_type = excluded.resource_type,
  mode = excluded.mode,
  profile_id = excluded.profile_id,
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
        ('f1100000-0000-4000-8000-000000000013'::uuid, 'field-disabled@regression.profixiq.invalid', 'mechanic', 'f1000000-0000-4000-8000-000000000001'::uuid)
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
    from public.work_order_quote_lines quote_line
    join public.work_orders work_order on work_order.id = quote_line.work_order_id
    join public.customers customer on customer.id = work_order.customer_id
    where quote_line.id = 'f1700000-0000-4000-8000-000000000001'
      and quote_line.status = 'approved'
      and quote_line.stage = 'customer_approved'
      and quote_line.decision = 'approved'
      and quote_line.approved_at is not null
      and customer.user_id = 'f1100000-0000-4000-8000-000000000008'
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
    select 1 from public.mobile_field_operators
    where profile_id = 'f1100000-0000-4000-8000-000000000012'
      and enabled
  ) or not exists (
    select 1 from public.mobile_field_operators
    where profile_id = 'f1100000-0000-4000-8000-000000000013'
      and not enabled
  ) then
    raise exception 'Field-enabled/disabled actor fixtures are incomplete';
  end if;

  select count(*) into v_count
  from public.scheduling_resources
  where id in (
    'f1d00000-0000-4000-8000-000000000001',
    'f1d00000-0000-4000-8000-000000000002',
    'f1d00000-0000-4000-8000-000000000003',
    'f1d00000-0000-4000-8000-000000000004',
    'f1d00000-0000-4000-8000-000000000005',
    'f1d00000-0000-4000-8000-000000000006'
  ) and active;
  if v_count <> 6 or not exists (
    select 1
    from public.scheduling_resources r
    where r.id = 'f1d00000-0000-4000-8000-000000000005'
      and r.shop_id = 'f1000000-0000-4000-8000-000000000001'
      and r.profile_id = 'f1100000-0000-4000-8000-000000000012'
      and r.resource_type = 'technician'
      and r.mode = 'both'
      and r.active
  ) then
    raise exception 'Scheduler capacity fixtures are incomplete';
  end if;
end
$regression_fixture_assertions$;
