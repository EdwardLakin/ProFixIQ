\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('59100000-0000-4000-8000-000000000001', 'product-shop-owner@example.test', '{"full_name":"Product Shop Owner"}'::jsonb),
  ('59100000-0000-4000-8000-000000000002', 'product-complete-owner@example.test', '{"full_name":"Product Complete Owner"}'::jsonb),
  ('59100000-0000-4000-8000-000000000003', 'product-field-owner@example.test', '{"full_name":"Product Field Owner"}'::jsonb),
  ('59100000-0000-4000-8000-000000000004', 'product-fleet-owner@example.test', '{"full_name":"Product Fleet Owner"}'::jsonb),
  ('59100000-0000-4000-8000-000000000005', 'product-null-owner@example.test', '{"full_name":"Product Null Owner"}'::jsonb),
  ('59100000-0000-4000-8000-000000000006', 'product-suspended-owner@example.test', '{"full_name":"Product Suspended Owner"}'::jsonb),
  ('59100000-0000-4000-8000-000000000007', 'product-read-only-owner@example.test', '{"full_name":"Product Read Only Owner"}'::jsonb),
  ('59100000-0000-4000-8000-000000000008', 'product-null-tech@example.test', '{"full_name":"Product Null Tech"}'::jsonb),
  ('59100000-0000-4000-8000-000000000009', 'product-shop-tech@example.test', '{"full_name":"Product Shop Tech"}'::jsonb),
  ('59100000-0000-4000-8000-000000000014', 'product-fleet-shop-owner@example.test', '{"full_name":"Product Fleet Shop Owner"}'::jsonb),
  ('59110000-0000-4000-8000-000000000004', 'product-fleet-profile@example.test', '{"full_name":"Product Fleet Profile"}'::jsonb)
on conflict (id) do nothing;

-- Fleet memberships reference profiles.id, not the auth subject. Remove the
-- bootstrap profile for this imported actor before linking its canonical
-- profile id back to the real authenticated user.
delete from public.profiles
where id = '59100000-0000-4000-8000-000000000004';

insert into public.profiles (id, user_id, role, full_name)
values
  ('59100000-0000-4000-8000-000000000001', '59100000-0000-4000-8000-000000000001', 'owner', 'Product Shop Owner'),
  ('59100000-0000-4000-8000-000000000002', '59100000-0000-4000-8000-000000000002', 'owner', 'Product Complete Owner'),
  ('59100000-0000-4000-8000-000000000003', '59100000-0000-4000-8000-000000000003', 'owner', 'Product Field Owner'),
  ('59110000-0000-4000-8000-000000000004', '59100000-0000-4000-8000-000000000004', 'fleet_manager', 'Product Fleet Manager'),
  ('59100000-0000-4000-8000-000000000005', '59100000-0000-4000-8000-000000000005', 'owner', 'Product Null Owner'),
  ('59100000-0000-4000-8000-000000000006', '59100000-0000-4000-8000-000000000006', 'owner', 'Product Suspended Owner'),
  ('59100000-0000-4000-8000-000000000007', '59100000-0000-4000-8000-000000000007', 'owner', 'Product Read Only Owner'),
  ('59100000-0000-4000-8000-000000000008', '59100000-0000-4000-8000-000000000008', 'mechanic', 'Product Null Tech'),
  ('59100000-0000-4000-8000-000000000009', '59100000-0000-4000-8000-000000000009', 'mechanic', 'Product Shop Tech'),
  ('59100000-0000-4000-8000-000000000014', '59100000-0000-4000-8000-000000000014', 'owner', 'Product Fleet Shop Owner')
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  subscription_package, stripe_subscription_status,
  stripe_pricing_model, billing_entitlement_override
)
values
  ('59200000-0000-4000-8000-000000000001', '59100000-0000-4000-8000-000000000001', 'Product Shop', 'Product Shop', 10, 'shop_operations', 'active', 'product_packages_v1', null),
  ('59200000-0000-4000-8000-000000000002', '59100000-0000-4000-8000-000000000002', 'Product Complete', 'Product Complete', 10, 'complete_operations', 'past_due', 'product_packages_v1', null),
  ('59200000-0000-4000-8000-000000000003', '59100000-0000-4000-8000-000000000003', 'Product Field', 'Product Field', 1, 'field_service', 'active', 'product_packages_v1', null),
  ('59200000-0000-4000-8000-000000000004', '59100000-0000-4000-8000-000000000014', 'Product Fleet', 'Product Fleet', 10, 'fleet_maintenance', 'active', 'product_packages_v1', null),
  ('59200000-0000-4000-8000-000000000005', '59100000-0000-4000-8000-000000000005', 'Product Null', 'Product Null', 10, null, 'active', 'product_packages_v1', null),
  ('59200000-0000-4000-8000-000000000006', '59100000-0000-4000-8000-000000000006', 'Product Suspended', 'Product Suspended', 10, 'shop_operations', 'active', 'product_packages_v1', 'suspended'),
  ('59200000-0000-4000-8000-000000000007', '59100000-0000-4000-8000-000000000007', 'Product Read Only', 'Product Read Only', 10, 'shop_operations', 'active', 'product_packages_v1', 'read_only')
on conflict (id) do update
set owner_id = excluded.owner_id,
    subscription_package = excluded.subscription_package,
    stripe_subscription_status = excluded.stripe_subscription_status,
    stripe_pricing_model = excluded.stripe_pricing_model,
    billing_entitlement_override = excluded.billing_entitlement_override;

update public.profiles
set shop_id = case id
  when '59100000-0000-4000-8000-000000000001'::uuid then '59200000-0000-4000-8000-000000000001'::uuid
  when '59100000-0000-4000-8000-000000000002'::uuid then '59200000-0000-4000-8000-000000000002'::uuid
  when '59100000-0000-4000-8000-000000000003'::uuid then '59200000-0000-4000-8000-000000000003'::uuid
  when '59110000-0000-4000-8000-000000000004'::uuid then '59200000-0000-4000-8000-000000000004'::uuid
  when '59100000-0000-4000-8000-000000000014'::uuid then '59200000-0000-4000-8000-000000000004'::uuid
  when '59100000-0000-4000-8000-000000000005'::uuid then '59200000-0000-4000-8000-000000000005'::uuid
  when '59100000-0000-4000-8000-000000000006'::uuid then '59200000-0000-4000-8000-000000000006'::uuid
  when '59100000-0000-4000-8000-000000000007'::uuid then '59200000-0000-4000-8000-000000000007'::uuid
  when '59100000-0000-4000-8000-000000000008'::uuid then '59200000-0000-4000-8000-000000000005'::uuid
  else '59200000-0000-4000-8000-000000000001'::uuid
end
where id in (
  '59100000-0000-4000-8000-000000000001',
  '59100000-0000-4000-8000-000000000002',
  '59100000-0000-4000-8000-000000000003',
  '59110000-0000-4000-8000-000000000004',
  '59100000-0000-4000-8000-000000000005',
  '59100000-0000-4000-8000-000000000006',
  '59100000-0000-4000-8000-000000000007',
  '59100000-0000-4000-8000-000000000008',
  '59100000-0000-4000-8000-000000000009',
  '59100000-0000-4000-8000-000000000014'
);

insert into public.customers (id, shop_id, name)
values
  ('59300000-0000-4000-8000-000000000001', '59200000-0000-4000-8000-000000000001', 'Product Shop Customer'),
  ('59300000-0000-4000-8000-000000000002', '59200000-0000-4000-8000-000000000002', 'Product Complete Fleet Customer'),
  ('59300000-0000-4000-8000-000000000004', '59200000-0000-4000-8000-000000000004', 'Product Fleet Customer'),
  ('59300000-0000-4000-8000-000000000005', '59200000-0000-4000-8000-000000000005', 'Product Null Customer');

insert into public.vehicles (id, shop_id, customer_id, year, make, model)
values
  ('59400000-0000-4000-8000-000000000001', '59200000-0000-4000-8000-000000000001', '59300000-0000-4000-8000-000000000001', 2025, 'Test', 'Shop Unit'),
  ('59400000-0000-4000-8000-000000000002', '59200000-0000-4000-8000-000000000002', '59300000-0000-4000-8000-000000000002', 2025, 'Test', 'Complete Fleet Unit'),
  ('59400000-0000-4000-8000-000000000004', '59200000-0000-4000-8000-000000000004', '59300000-0000-4000-8000-000000000004', 2025, 'Test', 'Fleet Unit'),
  ('59400000-0000-4000-8000-000000000005', '59200000-0000-4000-8000-000000000005', '59300000-0000-4000-8000-000000000005', 2025, 'Test', 'Null Unit');

insert into public.work_orders (id, shop_id, vehicle_id, custom_id, status)
values
  ('59500000-0000-4000-8000-000000000001', '59200000-0000-4000-8000-000000000001', null, 'PRODUCT-SHOP-1', 'in_progress'),
  ('59500000-0000-4000-8000-000000000002', '59200000-0000-4000-8000-000000000002', null, 'PRODUCT-COMPLETE-1', 'in_progress'),
  ('59500000-0000-4000-8000-000000000003', '59200000-0000-4000-8000-000000000003', null, 'PRODUCT-FIELD-LINKED', 'in_progress'),
  ('59500000-0000-4000-8000-000000000013', '59200000-0000-4000-8000-000000000003', null, 'PRODUCT-FIELD-UNLINKED', 'in_progress'),
  ('59500000-0000-4000-8000-000000000004', '59200000-0000-4000-8000-000000000004', '59400000-0000-4000-8000-000000000004', 'PRODUCT-FLEET-LINKED', 'in_progress'),
  ('59500000-0000-4000-8000-000000000014', '59200000-0000-4000-8000-000000000004', '59400000-0000-4000-8000-000000000004', 'PRODUCT-FLEET-UNLINKED', 'in_progress'),
  ('59500000-0000-4000-8000-000000000005', '59200000-0000-4000-8000-000000000005', null, 'PRODUCT-NULL-1', 'in_progress'),
  ('59500000-0000-4000-8000-000000000006', '59200000-0000-4000-8000-000000000006', null, 'PRODUCT-SUSPENDED-1', 'in_progress'),
  ('59500000-0000-4000-8000-000000000007', '59200000-0000-4000-8000-000000000007', null, 'PRODUCT-READ-ONLY-1', 'in_progress'),
  ('59500000-0000-4000-8000-000000000010', '59200000-0000-4000-8000-000000000001', '59400000-0000-4000-8000-000000000001', 'PRODUCT-SHOP-DRAFT-PO', 'new');

update public.work_orders
set customer_id = '59300000-0000-4000-8000-000000000002',
    vehicle_id = '59400000-0000-4000-8000-000000000002'
where id = '59500000-0000-4000-8000-000000000002';

insert into public.suppliers (id, shop_id, name, is_active)
values (
  '59d00000-0000-4000-8000-000000000001',
  '59200000-0000-4000-8000-000000000001',
  'Product Shop Supplier',
  true
);

insert into public.purchase_orders (
  id, shop_id, supplier_id, status, po_number, work_order_id
)
values (
  '59e00000-0000-4000-8000-000000000001',
  '59200000-0000-4000-8000-000000000001',
  '59d00000-0000-4000-8000-000000000001',
  'draft',
  'PRODUCT-SHOP-PO-1',
  '59500000-0000-4000-8000-000000000010'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, line_type, status, description
)
select
  ('59600000-0000-4000-8000-' || right(replace(work_order.id::text, '-', ''), 12))::uuid,
  work_order.shop_id,
  work_order.id,
  'job',
  'in_progress',
  'Product boundary line'
from public.work_orders work_order
where work_order.id in (
  '59500000-0000-4000-8000-000000000001',
  '59500000-0000-4000-8000-000000000002',
  '59500000-0000-4000-8000-000000000003',
  '59500000-0000-4000-8000-000000000013',
  '59500000-0000-4000-8000-000000000004',
  '59500000-0000-4000-8000-000000000014',
  '59500000-0000-4000-8000-000000000005',
  '59500000-0000-4000-8000-000000000006',
  '59500000-0000-4000-8000-000000000007'
);

insert into public.work_order_quote_lines (
  id, shop_id, work_order_id, description, job_type, status, stage, metadata
)
select
  ('59700000-0000-4000-8000-' || right(replace(work_order.id::text, '-', ''), 12))::uuid,
  work_order.shop_id,
  work_order.id,
  'Product boundary quote',
  'repair',
  'pending_parts',
  'advisor_pending',
  '{}'::jsonb
from public.work_orders work_order
where work_order.id in (
  '59500000-0000-4000-8000-000000000001',
  '59500000-0000-4000-8000-000000000002',
  '59500000-0000-4000-8000-000000000003',
  '59500000-0000-4000-8000-000000000013',
  '59500000-0000-4000-8000-000000000004',
  '59500000-0000-4000-8000-000000000014',
  '59500000-0000-4000-8000-000000000005',
  '59500000-0000-4000-8000-000000000006',
  '59500000-0000-4000-8000-000000000007'
);

insert into public.work_order_line_technicians (
  work_order_line_id, technician_id, assigned_by
)
select
  line.id,
  shop.owner_id,
  shop.owner_id
from public.work_order_lines line
join public.shops shop on shop.id = line.shop_id
where line.id::text like '59600000-0000-4000-8000-%';

-- Canonical standalone Field setup: one owner/operator and one active truck.
insert into public.mobile_service_settings (
  shop_id, service_model, solo_mode, dispatch_enabled,
  service_vehicles_enabled, field_operator_count_target,
  onboarding_completed_at, configured_by
)
values (
  '59200000-0000-4000-8000-000000000003',
  'mobile', true, false, true, 1, now(),
  '59100000-0000-4000-8000-000000000003'
)
on conflict (shop_id) do update
set service_model = 'mobile',
    solo_mode = true,
    onboarding_completed_at = now();

insert into public.mobile_field_operators (shop_id, profile_id, enabled)
values (
  '59200000-0000-4000-8000-000000000003',
  '59100000-0000-4000-8000-000000000003',
  true
)
on conflict (shop_id, profile_id) do update set enabled = true;

insert into public.service_vehicles (
  id, shop_id, name, unit_number, primary_user_id, active, capabilities
)
values (
  '59800000-0000-4000-8000-000000000003',
  '59200000-0000-4000-8000-000000000003',
  'Product Field Truck',
  'PRODUCT-FIELD-TRUCK',
  '59100000-0000-4000-8000-000000000003',
  true,
  '{"mobile_v1":true}'::jsonb
);

insert into public.service_visits (
  id, shop_id, work_order_id, mode, status, assigned_user_id
)
values
  (
    '59900000-0000-4000-8000-000000000003',
    '59200000-0000-4000-8000-000000000003',
    '59500000-0000-4000-8000-000000000003',
    'mobile',
    'working',
    '59100000-0000-4000-8000-000000000003'
  ),
  (
    '59900000-0000-4000-8000-000000000005',
    '59200000-0000-4000-8000-000000000005',
    '59500000-0000-4000-8000-000000000005',
    'shop',
    'working',
    '59100000-0000-4000-8000-000000000005'
  );

-- Canonical Fleet linkage: membership plus one service request linked to one
-- of the two same-shop Work Orders.
insert into public.fleets (id, shop_id, customer_id, name, active)
values
  (
    '59a00000-0000-4000-8000-000000000002',
    '59200000-0000-4000-8000-000000000002',
    '59300000-0000-4000-8000-000000000002',
    'Product Complete Fleet',
    true
  ),
  (
    '59a00000-0000-4000-8000-000000000004',
    '59200000-0000-4000-8000-000000000004',
    '59300000-0000-4000-8000-000000000004',
    'Product Fleet',
    true
  );

insert into public.fleet_members (fleet_id, shop_id, user_id, role)
values (
  '59a00000-0000-4000-8000-000000000004',
  '59200000-0000-4000-8000-000000000004',
  '59110000-0000-4000-8000-000000000004',
  'manager'
);

insert into public.fleet_vehicles (fleet_id, vehicle_id, shop_id, active)
values
  (
    '59a00000-0000-4000-8000-000000000002',
    '59400000-0000-4000-8000-000000000002',
    '59200000-0000-4000-8000-000000000002',
    true
  ),
  (
    '59a00000-0000-4000-8000-000000000004',
    '59400000-0000-4000-8000-000000000004',
    '59200000-0000-4000-8000-000000000004',
    true
  );

insert into public.fleet_service_requests (
  id, shop_id, fleet_id, vehicle_id, title, summary, severity,
  status, work_order_id
)
values
  (
    '59b00000-0000-4000-8000-000000000002',
    '59200000-0000-4000-8000-000000000002',
    '59a00000-0000-4000-8000-000000000002',
    '59400000-0000-4000-8000-000000000002',
    'Product Complete Fleet Request',
    'Positive Shop-side Fleet handoff',
    'recommend',
    'scheduled',
    '59500000-0000-4000-8000-000000000002'
  ),
  (
    '59b00000-0000-4000-8000-000000000004',
    '59200000-0000-4000-8000-000000000004',
    '59a00000-0000-4000-8000-000000000004',
    '59400000-0000-4000-8000-000000000004',
    'Product Fleet Request',
    'Product boundary Fleet request',
    'recommend',
    'scheduled',
    '59500000-0000-4000-8000-000000000004'
  );

update public.work_orders
set source_fleet_service_request_id = case id
  when '59500000-0000-4000-8000-000000000002'::uuid then
    '59b00000-0000-4000-8000-000000000002'::uuid
  else '59b00000-0000-4000-8000-000000000004'::uuid
end
where id in (
  '59500000-0000-4000-8000-000000000002',
  '59500000-0000-4000-8000-000000000004'
);

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do update set public = false;

insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata)
values
  (
    '59c00000-0000-4000-8000-000000000001',
    'job-photos',
    'wo/59500000-0000-4000-8000-000000000001/lines/59600000-0000-4000-8000-000000000001/59c00000-0000-4000-8000-000000000011_shop.jpg',
    '59100000-0000-4000-8000-000000000001',
    '59100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","fixture":"shop"}'::jsonb
  ),
  (
    '59c00000-0000-4000-8000-000000000003',
    'job-photos',
    'wo/59500000-0000-4000-8000-000000000003/lines/59600000-0000-4000-8000-000000000003/59c00000-0000-4000-8000-000000000013_field-linked.jpg',
    '59100000-0000-4000-8000-000000000003',
    '59100000-0000-4000-8000-000000000003',
    '{"mimetype":"image/jpeg","fixture":"field-linked"}'::jsonb
  ),
  (
    '59c00000-0000-4000-8000-000000000013',
    'job-photos',
    'wo/59500000-0000-4000-8000-000000000013/lines/59600000-0000-4000-8000-000000000013/59c00000-0000-4000-8000-000000000113_field-unlinked.jpg',
    '59100000-0000-4000-8000-000000000003',
    '59100000-0000-4000-8000-000000000003',
    '{"mimetype":"image/jpeg","fixture":"field-unlinked"}'::jsonb
  ),
  (
    '59c00000-0000-4000-8000-000000000004',
    'job-photos',
    'wo/59500000-0000-4000-8000-000000000004/lines/59600000-0000-4000-8000-000000000004/59c00000-0000-4000-8000-000000000014_fleet-linked.jpg',
    '59100000-0000-4000-8000-000000000014',
    '59100000-0000-4000-8000-000000000014',
    '{"mimetype":"image/jpeg","fixture":"fleet-linked"}'::jsonb
  ),
  (
    '59c00000-0000-4000-8000-000000000014',
    'job-photos',
    'wo/59500000-0000-4000-8000-000000000014/lines/59600000-0000-4000-8000-000000000014/59c00000-0000-4000-8000-000000000114_fleet-unlinked.jpg',
    '59100000-0000-4000-8000-000000000014',
    '59100000-0000-4000-8000-000000000014',
    '{"mimetype":"image/jpeg","fixture":"fleet-unlinked"}'::jsonb
  ),
  (
    '59c00000-0000-4000-8000-000000000005',
    'job-photos',
    'wo/59500000-0000-4000-8000-000000000005/lines/59600000-0000-4000-8000-000000000005/59c00000-0000-4000-8000-000000000015_null.jpg',
    '59100000-0000-4000-8000-000000000005',
    '59100000-0000-4000-8000-000000000005',
    '{"mimetype":"image/jpeg","fixture":"null"}'::jsonb
  );

update public.work_order_media
set visibility = 'customer'
where storage_path in (
  'wo/59500000-0000-4000-8000-000000000004/lines/59600000-0000-4000-8000-000000000004/59c00000-0000-4000-8000-000000000014_fleet-linked.jpg',
  'wo/59500000-0000-4000-8000-000000000014/lines/59600000-0000-4000-8000-000000000014/59c00000-0000-4000-8000-000000000114_fleet-unlinked.jpg'
);

insert into public.work_order_media_annotations (
  shop_id, media_id, version, overlay, visibility, created_by,
  client_mutation_id
)
select
  media.shop_id,
  media.id,
  1,
  '[]'::jsonb,
  media.visibility,
  media.user_id,
  'product-boundary:seed-annotation:' || media.id::text
from public.work_order_media media
where media.storage_path in (
  'wo/59500000-0000-4000-8000-000000000003/lines/59600000-0000-4000-8000-000000000003/59c00000-0000-4000-8000-000000000013_field-linked.jpg',
  'wo/59500000-0000-4000-8000-000000000013/lines/59600000-0000-4000-8000-000000000013/59c00000-0000-4000-8000-000000000113_field-unlinked.jpg',
  'wo/59500000-0000-4000-8000-000000000004/lines/59600000-0000-4000-8000-000000000004/59c00000-0000-4000-8000-000000000014_fleet-linked.jpg',
  'wo/59500000-0000-4000-8000-000000000014/lines/59600000-0000-4000-8000-000000000014/59c00000-0000-4000-8000-000000000114_fleet-unlinked.jpg',
  'wo/59500000-0000-4000-8000-000000000005/lines/59600000-0000-4000-8000-000000000005/59c00000-0000-4000-8000-000000000015_null.jpg'
);

select set_config(
  'product_boundary.null_media_id',
  media.id::text,
  true
)
from public.work_order_media media
where media.storage_path =
  'wo/59500000-0000-4000-8000-000000000005/lines/59600000-0000-4000-8000-000000000005/59c00000-0000-4000-8000-000000000015_null.jpg';

-- Inspect grants while the fixture still has catalog authority. The
-- authenticated role intentionally has no USAGE on the private schema, so
-- resolving private regprocedure names after SET ROLE would fail before
-- has_function_privilege can evaluate the explicit target role.
do $product_boundary_acl_contract$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc function_record
  join pg_namespace function_schema
    on function_schema.oid = function_record.pronamespace
  where function_schema.nspname = 'public'
    and function_record.proname = 'assign_work_order_line_technician_atomic';
  if v_count <> 2 then
    raise exception 'Assignment overload inventory drifted from one authenticated wrapper and one service core.';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.assign_work_order_line_technician_atomic(uuid,uuid,uuid,uuid,text,text,timestamptz)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.assign_work_order_line_technician_atomic(uuid,uuid,uuid,uuid,text,text,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'Canonical assignment core ACL drifted.';
  end if;

  if has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'Authenticated callers unexpectedly gained private schema access.';
  end if;

  if has_function_privilege(
       'authenticated',
       'private.save_work_order_media_annotation_product_core(uuid,jsonb,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.create_work_order_with_custom_id_product_core(uuid,uuid,uuid,text,integer,boolean,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.work_order_has_supplier_history(uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.work_order_delete_draft_product_core(uuid,uuid,text,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.mark_work_order_ready_product_core(uuid,uuid,uuid,text,timestamptz)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.materialize_offline_work_order_draft_product_core(uuid,uuid,text,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.assign_work_order_line_technician_product_core(uuid,uuid,uuid,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.get_work_order_assignments_product_core(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.convert_owned_fleet_request_work_order_product_core(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.convert_fleet_request_work_order_product_core(uuid)',
       'EXECUTE'
     ) then
    raise exception 'A private Work Order product core is directly executable.';
  end if;
end
$product_boundary_acl_contract$;

set local role authenticated;

do $product_boundary_runtime$
declare
  v_count integer;
  v_rows integer;
  v_insert_denied boolean;
  v_denied boolean;
  v_created_work_order_id uuid;
  v_conversion_status text;
  v_media_id uuid;
  v_result jsonb;
  v_replayed_result jsonb;
begin
  -- Shop Operations is fully entitled.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"59100000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  select count(*) into v_count
  from public.work_orders
  where shop_id = '59200000-0000-4000-8000-000000000001';
  if v_count <> 2 then
    raise exception 'Shop Operations actor did not retain Work Order access.';
  end if;

  update public.work_order_lines
  set description = 'Shop product update allowed'
  where work_order_id = '59500000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Shop Operations actor could not update its Work Order line.';
  end if;

  if (
    select count(*)
    from public.work_order_media
    where work_order_id = '59500000-0000-4000-8000-000000000001'
  ) <> 1 or (
    select count(*)
    from storage.objects
    where bucket_id = 'job-photos'
      and name like 'wo/59500000-0000-4000-8000-000000000001/%'
  ) <> 1 then
    raise exception 'Shop Operations evidence access was not preserved.';
  end if;

  select media.id into v_media_id
  from public.work_order_media media
  where media.work_order_id = '59500000-0000-4000-8000-000000000001';
  select public.save_work_order_media_annotation_atomic(
    v_media_id,
    '[]'::jsonb,
    'internal',
    'product-boundary:annotation-shop'
  ) into v_result;
  select public.save_work_order_media_annotation_atomic(
    v_media_id,
    '[]'::jsonb,
    'internal',
    'product-boundary:annotation-shop'
  ) into v_replayed_result;
  if nullif(v_result ->> 'id', '') is null
     or v_replayed_result ->> 'id' is distinct from v_result ->> 'id'
     or coalesce((v_replayed_result ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Annotation product wrapper broke idempotent replay.';
  end if;

  select created.id into v_created_work_order_id
  from public.create_work_order_with_custom_id(
    p_shop_id => '59200000-0000-4000-8000-000000000001',
    p_customer_id => '59300000-0000-4000-8000-000000000001',
    p_vehicle_id => '59400000-0000-4000-8000-000000000001'
  ) created;
  if v_created_work_order_id is null then
    raise exception 'Entitled custom-id Work Order creation failed.';
  end if;

  select public.work_order_delete_draft_atomic(
    '59200000-0000-4000-8000-000000000001',
    v_created_work_order_id,
    '59200000-0000-4000-8000-000000000001:delete-draft-work-order:'
      || v_created_work_order_id::text,
    '59100000-0000-4000-8000-000000000001'
  ) into v_result;
  select public.work_order_delete_draft_atomic(
    '59200000-0000-4000-8000-000000000001',
    v_created_work_order_id,
    '59200000-0000-4000-8000-000000000001:delete-draft-work-order:'
      || v_created_work_order_id::text,
    '59100000-0000-4000-8000-000000000001'
  ) into v_replayed_result;
  if coalesce((v_result ->> 'deleted')::boolean, false) is not true
     or coalesce((v_replayed_result ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Draft-delete product wrapper broke idempotent replay.';
  end if;

  v_denied := false;
  begin
    perform public.work_order_delete_draft_atomic(
      '59200000-0000-4000-8000-000000000001',
      '59500000-0000-4000-8000-000000000010',
      '59200000-0000-4000-8000-000000000001:delete-draft-work-order:59500000-0000-4000-8000-000000000010',
      '59100000-0000-4000-8000-000000000001'
    );
  exception when raise_exception then
    if sqlerrm <> 'WORK_ORDER_DELETE_FINANCIAL_OR_SUPPLIER_HISTORY' then
      raise;
    end if;
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Draft deletion ignored canonical purchase-order history.';
  end if;

  select public.materialize_offline_work_order_draft_atomic(
    '59200000-0000-4000-8000-000000000001',
    '59100000-0000-4000-8000-000000000001',
    'product-boundary:offline-shop',
    '59300000-0000-4000-8000-000000000001',
    '59400000-0000-4000-8000-000000000001',
    '{"lines":[{"tempId":"shop-line-1","lineType":"job","complaint":"Entitled offline materialization"}]}'::jsonb
  ) into v_result;
  select public.materialize_offline_work_order_draft_atomic(
    '59200000-0000-4000-8000-000000000001',
    '59100000-0000-4000-8000-000000000001',
    'product-boundary:offline-shop',
    '59300000-0000-4000-8000-000000000001',
    '59400000-0000-4000-8000-000000000001',
    '{"lines":[{"tempId":"shop-line-1","lineType":"job","complaint":"Entitled offline materialization"}]}'::jsonb
  ) into v_replayed_result;
  if nullif(v_result ->> 'workOrderId', '') is null
     or v_replayed_result ->> 'workOrderId' is distinct from v_result ->> 'workOrderId'
     or coalesce((v_replayed_result ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Offline Work Order product wrapper broke idempotent replay.';
  end if;

  select public.assign_work_order_line_technician_atomic(
    '59200000-0000-4000-8000-000000000001',
    '59600000-0000-4000-8000-000000000001',
    '59100000-0000-4000-8000-000000000009',
    '59100000-0000-4000-8000-000000000001',
    'product-boundary:assignment-shop'
  ) into v_result;
  if v_result ->> 'primary_technician_id'
       is distinct from '59100000-0000-4000-8000-000000000009' then
    raise exception 'Entitled assignment wrapper did not reach the canonical mutation.';
  end if;

  if not exists (
    select 1
    from public.get_work_order_assignments(
      '59500000-0000-4000-8000-000000000001'
    ) assignment
    where assignment.technician_id = '59100000-0000-4000-8000-000000000009'
  ) then
    raise exception 'Entitled assignment read wrapper lost the canonical result.';
  end if;

  update public.work_order_lines
  set status = 'completed'
  where id = '59600000-0000-4000-8000-000000000001';
  select public.mark_work_order_ready_atomic(
    '59200000-0000-4000-8000-000000000001',
    '59500000-0000-4000-8000-000000000001',
    '59100000-0000-4000-8000-000000000001',
    'product-boundary:mark-ready-shop'
  ) into v_result;
  select public.mark_work_order_ready_atomic(
    '59200000-0000-4000-8000-000000000001',
    '59500000-0000-4000-8000-000000000001',
    '59100000-0000-4000-8000-000000000001',
    'product-boundary:mark-ready-shop'
  ) into v_replayed_result;
  if v_result ->> 'status' is distinct from 'ready_to_invoice'
     or coalesce((v_replayed_result ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Mark-ready product wrapper broke idempotent replay.';
  end if;

  -- Complete past_due remains intentionally entitled through the canonical
  -- product helper rather than a duplicated status list in this migration.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"59100000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  select count(*) into v_count
  from public.work_orders
  where shop_id = '59200000-0000-4000-8000-000000000002';
  if v_count <> 1 then
    raise exception 'Complete past_due actor lost intended Shop access.';
  end if;

  -- Field can read only the Work Order linked to its mobile visit.  The same
  -- staff role must not make the unrelated same-shop Work Order visible.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"59100000-0000-4000-8000-000000000003","role":"authenticated"}',
    true
  );
  select count(*) into v_count
  from public.work_orders
  where shop_id = '59200000-0000-4000-8000-000000000003';
  if v_count <> 1 then
    raise exception 'Field actor did not receive exactly its linked Work Order.';
  end if;
  select count(*) into v_count
  from public.work_order_lines
  where shop_id = '59200000-0000-4000-8000-000000000003';
  if v_count <> 1 then
    raise exception 'Field Work Order line relationship was not preserved.';
  end if;
  select count(*) into v_count
  from public.work_order_quote_lines
  where shop_id = '59200000-0000-4000-8000-000000000003';
  if v_count <> 1 then
    raise exception 'Field quote-line relationship was not preserved.';
  end if;
  select count(*) into v_count
  from public.work_order_line_technicians assignment
  where assignment.work_order_line_id in (
    '59600000-0000-4000-8000-000000000003',
    '59600000-0000-4000-8000-000000000013'
  );
  if v_count <> 1 then
    raise exception 'Field assignment relationship was not preserved.';
  end if;

  if (
    select count(*)
    from public.work_order_media
    where shop_id = '59200000-0000-4000-8000-000000000003'
  ) <> 1 or not exists (
    select 1
    from public.work_order_media
    where work_order_id = '59500000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Field evidence was not limited to the linked mobile visit.';
  end if;
  if (
    select count(*)
    from public.work_order_media_annotations annotation
    where annotation.shop_id = '59200000-0000-4000-8000-000000000003'
  ) <> 1 then
    raise exception 'Field annotation reads escaped the linked mobile visit.';
  end if;
  if (
    select count(*)
    from storage.objects
    where bucket_id = 'job-photos'
      and name like 'wo/59500000-0000-4000-8000-000000000003/%'
  ) <> 1 or exists (
    select 1
    from storage.objects
    where name like 'wo/59500000-0000-4000-8000-000000000013/%'
  ) then
    raise exception 'Field job-photo storage escaped its linked mobile visit.';
  end if;

  insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata)
  values (
    '59c00000-0000-4000-8000-000000000023',
    'job-photos',
    'wo/59500000-0000-4000-8000-000000000003/lines/59600000-0000-4000-8000-000000000003/59c00000-0000-4000-8000-000000000123_field-write.jpg',
    '59100000-0000-4000-8000-000000000003',
    '59100000-0000-4000-8000-000000000003',
    '{"mimetype":"image/jpeg","fixture":"field-write"}'::jsonb
  );

  v_denied := false;
  begin
    insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata)
    values (
      '59c00000-0000-4000-8000-000000000033',
      'job-photos',
      'wo/59500000-0000-4000-8000-000000000013/lines/59600000-0000-4000-8000-000000000013/59c00000-0000-4000-8000-000000000133_field-denied.jpg',
      '59100000-0000-4000-8000-000000000003',
      '59100000-0000-4000-8000-000000000003',
      '{"mimetype":"image/jpeg","fixture":"field-denied"}'::jsonb
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Field actor uploaded evidence to an unrelated Work Order.';
  end if;

  v_denied := false;
  begin
    insert into public.work_order_media (
      shop_id, work_order_id, work_order_line_id, user_id, url, kind,
      source, client_mutation_id
    ) values (
      '59200000-0000-4000-8000-000000000003',
      '59500000-0000-4000-8000-000000000013',
      '59600000-0000-4000-8000-000000000013',
      '59100000-0000-4000-8000-000000000003',
      'https://example.test/product-field-unlinked.jpg',
      'photo',
      'runtime_test',
      'product-boundary:field-unlinked-media'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Field actor inserted media for an unrelated Work Order.';
  end if;

  update public.work_orders
  set status = 'completed'
  where id = '59500000-0000-4000-8000-000000000003';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'Field actor directly updated a Work Order without Shop entitlement.';
  end if;

  v_insert_denied := false;
  begin
    insert into public.work_orders (shop_id, custom_id, status)
    values (
      '59200000-0000-4000-8000-000000000003',
      'PRODUCT-FIELD-DIRECT-INSERT',
      'draft'
    );
  exception when sqlstate '42501' then
    v_insert_denied := true;
  end;
  if not v_insert_denied then
    raise exception 'Field actor directly inserted a Shop Work Order.';
  end if;

  select public.mobile_create_service_call_atomic(
    p_shop_id => '59200000-0000-4000-8000-000000000003',
    p_customer_id => null,
    p_customer_name => 'Product Field Handoff Customer',
    p_phone => '+1 555 591 0003',
    p_vehicle_id => null,
    p_vehicle_year => 2025,
    p_vehicle_make => 'Test',
    p_vehicle_model => 'Field Handoff Unit',
    p_vehicle_plate => 'PFX591F',
    p_address_line1 => '591 Product Boundary Road',
    p_city => 'Calgary',
    p_province_state => 'AB',
    p_postal_code => 'T2P 1J9',
    p_concern => 'Positive Field handoff product contract',
    p_starts_at => now() + interval '2 days',
    p_duration_minutes => 60,
    p_quoted_price => 100,
    p_currency => 'CAD',
    p_service_mode => 'mobile',
    p_actor_user_id => '59100000-0000-4000-8000-000000000003',
    p_operation_key => 'product-boundary:field-intake-positive'
  ) into v_result;
  if nullif(v_result ->> 'serviceVisitId', '') is null then
    raise exception 'Field rapid intake did not create an unlinked Service Visit.';
  end if;

  select public.mobile_materialize_service_visit_work_order_atomic(
    '59200000-0000-4000-8000-000000000003',
    (v_result ->> 'serviceVisitId')::uuid,
    '59100000-0000-4000-8000-000000000003',
    'product-boundary:field-handoff-positive'
  ) into v_result;
  select public.mobile_materialize_service_visit_work_order_atomic(
    '59200000-0000-4000-8000-000000000003',
    (v_result ->> 'serviceVisitId')::uuid,
    '59100000-0000-4000-8000-000000000003',
    'product-boundary:field-handoff-positive'
  ) into v_replayed_result;
  if nullif(v_result ->> 'workOrderId', '') is null
     or v_replayed_result ->> 'workOrderId' is distinct from v_result ->> 'workOrderId'
     or coalesce((v_replayed_result ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Field product wrapper broke mobile handoff idempotency.';
  end if;

  -- Fleet can read only the Work Order linked to its own service request.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"59100000-0000-4000-8000-000000000004","role":"authenticated"}',
    true
  );
  select count(*) into v_count
  from public.work_orders
  where shop_id = '59200000-0000-4000-8000-000000000004';
  if v_count <> 1 then
    raise exception 'Fleet actor did not receive exactly its linked Work Order.';
  end if;
  if not public.profixiq_fleet_has_product_access(
    '59a00000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Imported Fleet profile did not resolve its canonical membership entitlement.';
  end if;
  select count(*) into v_count
  from public.work_order_lines
  where shop_id = '59200000-0000-4000-8000-000000000004';
  if v_count <> 1 then
    raise exception 'Fleet Work Order line relationship was not preserved.';
  end if;
  select count(*) into v_count
  from public.work_order_quote_lines
  where shop_id = '59200000-0000-4000-8000-000000000004';
  if v_count <> 1 then
    raise exception 'Fleet quote-line relationship was not preserved.';
  end if;
  select count(*) into v_count
  from public.work_order_line_technicians assignment
  where assignment.work_order_line_id in (
    '59600000-0000-4000-8000-000000000004',
    '59600000-0000-4000-8000-000000000014'
  );
  if v_count <> 1 then
    raise exception 'Fleet assignment relationship was not preserved.';
  end if;
  if (
    select count(*)
    from public.work_order_media
    where shop_id = '59200000-0000-4000-8000-000000000004'
  ) <> 1 or not exists (
    select 1
    from public.work_order_media
    where work_order_id = '59500000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Imported Fleet evidence was not limited to its linked request.';
  end if;
  if (
    select count(*)
    from public.work_order_media_annotations annotation
    where annotation.shop_id = '59200000-0000-4000-8000-000000000004'
  ) <> 1 then
    raise exception 'Imported Fleet annotation reads escaped the linked request.';
  end if;
  if (
    select count(*)
    from storage.objects
    where bucket_id = 'job-photos'
      and name like 'wo/59500000-0000-4000-8000-000000000004/%'
  ) <> 1 or exists (
    select 1
    from storage.objects
    where name like 'wo/59500000-0000-4000-8000-000000000014/%'
  ) then
    raise exception 'Imported Fleet job-photo access escaped its linked request.';
  end if;

  v_denied := false;
  begin
    insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata)
    values (
      '59c00000-0000-4000-8000-000000000024',
      'job-photos',
      'wo/59500000-0000-4000-8000-000000000004/lines/59600000-0000-4000-8000-000000000004/59c00000-0000-4000-8000-000000000124_fleet-denied.jpg',
      '59100000-0000-4000-8000-000000000004',
      '59100000-0000-4000-8000-000000000004',
      '{"mimetype":"image/jpeg","fixture":"fleet-denied"}'::jsonb
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Fleet relationship became a job-photo write grant.';
  end if;

  v_denied := false;
  begin
    perform public.convert_owned_fleet_service_request_to_work_order_atomic(
      '59b00000-0000-4000-8000-000000000004'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Fleet-only actor bypassed Shop product access through owned conversion.';
  end if;

  v_denied := false;
  begin
    perform public.convert_fleet_service_request_to_work_order_atomic(
      '59b00000-0000-4000-8000-000000000004'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Fleet-only actor bypassed Shop product access through legacy conversion.';
  end if;

  select media.id into v_media_id
  from public.work_order_media media
  where media.work_order_id = '59500000-0000-4000-8000-000000000004';
  v_denied := false;
  begin
    perform public.save_work_order_media_annotation_atomic(
      v_media_id,
      '[]'::jsonb,
      'customer',
      'product-boundary:annotation-fleet-denied'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Fleet relationship became an annotation write grant.';
  end if;

  update public.work_orders
  set status = 'completed'
  where id = '59500000-0000-4000-8000-000000000004';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'Fleet actor directly updated a Work Order without Shop entitlement.';
  end if;

  -- A Complete Operations tenant retains its legitimate Shop-side Fleet
  -- handoff without weakening the separate Fleet-only member fixture above.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"59100000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  select conversion.work_order_id, conversion.conversion_status
    into v_created_work_order_id, v_conversion_status
  from public.convert_owned_fleet_service_request_to_work_order_atomic(
    '59b00000-0000-4000-8000-000000000002'
  ) conversion;
  if v_created_work_order_id is distinct from
       '59500000-0000-4000-8000-000000000002'::uuid
     or v_conversion_status is distinct from 'already_linked' then
    raise exception 'Entitled Shop owner lost the idempotent Fleet handoff.';
  end if;

  -- A product-catalog account with no package and explicit suspended/read-only
  -- overrides fail closed even though their owner roles are otherwise valid.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"59100000-0000-4000-8000-000000000005","role":"authenticated"}',
    true
  );
  select count(*) into v_count
  from public.work_orders
  where shop_id = '59200000-0000-4000-8000-000000000005';
  if v_count <> 0 then
    raise exception 'Null-package actor inherited Shop Work Order access.';
  end if;
  if exists (
    select 1
    from public.work_order_media
    where shop_id = '59200000-0000-4000-8000-000000000005'
  ) or exists (
    select 1
    from storage.objects
    where name like 'wo/59500000-0000-4000-8000-000000000005/%'
  ) then
    raise exception 'Null-package actor inherited Work Order evidence access.';
  end if;
  if exists (
    select 1
    from public.work_order_media_annotations annotation
    where annotation.shop_id = '59200000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Null-package actor inherited Work Order annotation access.';
  end if;

  v_denied := false;
  begin
    perform public.create_work_order_with_custom_id(
      p_shop_id => '59200000-0000-4000-8000-000000000005',
      p_customer_id => '59300000-0000-4000-8000-000000000005',
      p_vehicle_id => '59400000-0000-4000-8000-000000000005'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed custom-id Work Order creation.';
  end if;

  v_denied := false;
  begin
    perform public.work_order_delete_draft_atomic(
      '59200000-0000-4000-8000-000000000005',
      '59500000-0000-4000-8000-000000000005',
      '59200000-0000-4000-8000-000000000005:delete-draft-work-order:59500000-0000-4000-8000-000000000005',
      '59100000-0000-4000-8000-000000000005'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed draft Work Order deletion.';
  end if;

  v_denied := false;
  begin
    perform public.mark_work_order_ready_atomic(
      '59200000-0000-4000-8000-000000000005',
      '59500000-0000-4000-8000-000000000005',
      '59100000-0000-4000-8000-000000000005',
      'product-boundary:mark-ready-null'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed mark-ready product access.';
  end if;

  v_denied := false;
  begin
    perform public.materialize_offline_work_order_draft_atomic(
      '59200000-0000-4000-8000-000000000005',
      '59100000-0000-4000-8000-000000000005',
      'product-boundary:offline-null',
      '59300000-0000-4000-8000-000000000005',
      '59400000-0000-4000-8000-000000000005',
      '{"lines":[{"tempId":"null-line-1","lineType":"job","complaint":"Must be denied"}]}'::jsonb
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed offline Work Order materialization.';
  end if;

  v_denied := false;
  begin
    perform public.assign_work_order_line_technician_atomic(
      '59200000-0000-4000-8000-000000000005',
      '59600000-0000-4000-8000-000000000005',
      '59100000-0000-4000-8000-000000000008',
      '59100000-0000-4000-8000-000000000005',
      'product-boundary:assignment-null'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed assignment product access.';
  end if;

  v_denied := false;
  begin
    perform 1
    from public.get_work_order_assignments(
      '59500000-0000-4000-8000-000000000005'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed assignment-read product access.';
  end if;

  v_denied := false;
  begin
    perform public.mobile_materialize_service_visit_work_order_atomic(
      '59200000-0000-4000-8000-000000000005',
      '59900000-0000-4000-8000-000000000005',
      '59100000-0000-4000-8000-000000000005',
      'product-boundary:mobile-materialize-null'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed shop-mode mobile materialization.';
  end if;

  v_denied := false;
  begin
    insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata)
    values (
      '59c00000-0000-4000-8000-000000000025',
      'job-photos',
      'wo/59500000-0000-4000-8000-000000000005/lines/59600000-0000-4000-8000-000000000005/59c00000-0000-4000-8000-000000000125_null-denied.jpg',
      '59100000-0000-4000-8000-000000000005',
      '59100000-0000-4000-8000-000000000005',
      '{"mimetype":"image/jpeg","fixture":"null-denied"}'::jsonb
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed job-photo product access.';
  end if;

  v_denied := false;
  begin
    insert into public.work_order_media (
      shop_id, work_order_id, work_order_line_id, user_id, url, kind,
      source, client_mutation_id
    ) values (
      '59200000-0000-4000-8000-000000000005',
      '59500000-0000-4000-8000-000000000005',
      '59600000-0000-4000-8000-000000000005',
      '59100000-0000-4000-8000-000000000005',
      'https://example.test/product-null-denied.jpg',
      'photo',
      'runtime_test',
      'product-boundary:null-media'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed media-row product access.';
  end if;

  v_media_id := current_setting('product_boundary.null_media_id')::uuid;
  v_denied := false;
  begin
    perform public.save_work_order_media_annotation_atomic(
      v_media_id,
      '[]'::jsonb,
      'internal',
      'product-boundary:annotation-null-denied'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Null-package actor bypassed annotation product access.';
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"59100000-0000-4000-8000-000000000006","role":"authenticated"}',
    true
  );
  select count(*) into v_count
  from public.work_orders
  where shop_id = '59200000-0000-4000-8000-000000000006';
  if v_count <> 0 then
    raise exception 'Suspended actor inherited Shop Work Order access.';
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"59100000-0000-4000-8000-000000000007","role":"authenticated"}',
    true
  );
  select count(*) into v_count
  from public.work_orders
  where shop_id = '59200000-0000-4000-8000-000000000007';
  if v_count <> 0 then
    raise exception 'Read-only actor inherited Shop Work Order access.';
  end if;
end
$product_boundary_runtime$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);

rollback;
