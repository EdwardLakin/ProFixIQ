\set ON_ERROR_STOP on

-- @regression-flow parts.request-to-po
-- Proves the approved request -> grouped purchase-order contract against a
-- clean replayed database. The fixture deliberately uses two tenants with the
-- same supplier display name and a lead_hand whose auth id is profiles.user_id.

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '71000000-0000-4000-8000-000000000001',
    'parts-po-owner-a@example.com',
    '{"full_name":"Parts PO Owner A"}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'parts-po-lead-a@example.com',
    '{"full_name":"Parts PO Lead A"}'::jsonb
  ),
  (
    '71100000-0000-4000-8000-000000000002',
    'parts-po-lead-profile-a@example.com',
    '{"full_name":"Parts PO Lead Profile A"}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    'parts-po-advisor-a@example.com',
    '{"full_name":"Parts PO Advisor A"}'::jsonb
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    'parts-po-owner-b@example.com',
    '{"full_name":"Parts PO Owner B"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'owner',
    'Parts PO Owner A'
  ),
  (
    '71100000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'lead_hand',
    'Parts PO Lead A'
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000003',
    'advisor',
    'Parts PO Advisor A'
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'owner',
    'Parts PO Owner B'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (
  id, owner_id, business_name, name,
  subscription_package, stripe_subscription_status,
  stripe_pricing_model, billing_entitlement_override
)
values
  (
    '7a000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Parts PO Runtime Shop A',
    'Parts PO Runtime Shop A',
    'shop_operations',
    'active',
    'product_packages_v1',
    null
  ),
  (
    '7b000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'Parts PO Runtime Shop B',
    'Parts PO Runtime Shop B',
    'shop_operations',
    'active',
    'product_packages_v1',
    null
  )
on conflict (id) do update
set owner_id = excluded.owner_id,
    subscription_package = excluded.subscription_package,
    stripe_subscription_status = excluded.stripe_subscription_status,
    stripe_pricing_model = excluded.stripe_pricing_model,
    billing_entitlement_override = excluded.billing_entitlement_override;

update public.profiles
set shop_id = case
  when id = '72000000-0000-4000-8000-000000000001'::uuid
    then '7b000000-0000-4000-8000-000000000001'::uuid
  else '7a000000-0000-4000-8000-000000000001'::uuid
end,
    -- The canonical insert trigger initializes user_id from id. Restore this
    -- imported-profile shape after insert so the runtime proves user_id auth.
    user_id = case
      when id = '71100000-0000-4000-8000-000000000002'::uuid
        then '71000000-0000-4000-8000-000000000002'::uuid
      else user_id
    end
where id in (
  '71000000-0000-4000-8000-000000000001',
  '71100000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000001'
);

insert into public.suppliers (id, shop_id, name)
values
  (
    '7c000000-0000-4000-8000-000000000001',
    '7a000000-0000-4000-8000-000000000001',
    'Shared Runtime Supplier'
  ),
  (
    '7c000000-0000-4000-8000-000000000002',
    '7a000000-0000-4000-8000-000000000001',
    'Second Runtime Supplier'
  ),
  (
    '7c000000-0000-4000-8000-000000000003',
    '7b000000-0000-4000-8000-000000000001',
    'Shared Runtime Supplier'
  );

insert into public.stock_locations (id, shop_id, code, name)
values (
  '7c100000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000001',
  'RUNTIME-BIN',
  'Runtime parts bin'
);

insert into public.purchase_orders (
  id,
  shop_id,
  supplier_id,
  status,
  notes
) values
  (
    '7d000000-0000-4000-8000-000000000001',
    '7b000000-0000-4000-8000-000000000001',
    '7c000000-0000-4000-8000-000000000003',
    'draft',
    'Cross-shop guard fixture'
  ),
  (
    '7d000000-0000-4000-8000-000000000003',
    '7a000000-0000-4000-8000-000000000001',
    '7c000000-0000-4000-8000-000000000001',
    'submitted',
    'Generic-only completion fixture'
  ),
  (
    '7d000000-0000-4000-8000-000000000004',
    '7a000000-0000-4000-8000-000000000001',
    '7c000000-0000-4000-8000-000000000001',
    'submitted',
    'Mixed catalog/free-text completion fixture'
  );

insert into public.work_orders (id, shop_id, status, type)
values
  (
    '7e000000-0000-4000-8000-000000000001',
    '7a000000-0000-4000-8000-000000000001',
    'in_progress',
    'repair'
  ),
  (
    '7e000000-0000-4000-8000-000000000002',
    '7b000000-0000-4000-8000-000000000001',
    'in_progress',
    'repair'
  );

insert into public.work_order_lines (
  id,
  work_order_id,
  shop_id,
  status,
  approval_state
) values
  (
    '7f000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7a000000-0000-4000-8000-000000000001',
    'active',
    'approved'
  ),
  (
    '7f000000-0000-4000-8000-000000000002',
    '7e000000-0000-4000-8000-000000000002',
    '7b000000-0000-4000-8000-000000000001',
    'active',
    'approved'
  ),
  (
    '7f000000-0000-4000-8000-000000000003',
    '7e000000-0000-4000-8000-000000000001',
    '7a000000-0000-4000-8000-000000000001',
    'awaiting_approval',
    'pending'
  );

insert into public.parts (
  id,
  shop_id,
  name,
  part_number,
  sku,
  cost,
  default_cost,
  price,
  default_price
) values
  (
    '73000000-0000-4000-8000-000000000001',
    '7a000000-0000-4000-8000-000000000001',
    'Sentinel Catalog Part',
    'SENTINEL-40-80',
    'SENTINEL-40-80',
    40,
    30,
    80,
    80
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '7a000000-0000-4000-8000-000000000001',
    'Second Catalog Sentinel',
    'SENTINEL-40-80-B',
    'SENTINEL-40-80-B',
    40,
    30,
    80,
    80
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '7a000000-0000-4000-8000-000000000001',
    'Preapproval Catalog Sentinel',
    'PREAPPROVAL',
    'PREAPPROVAL',
    40,
    30,
    80,
    80
  ),
  (
    '73000000-0000-4000-8000-000000000004',
    '7a000000-0000-4000-8000-000000000001',
    'Unauthorized Catalog Sentinel',
    'UNAUTHORIZED',
    'UNAUTHORIZED',
    40,
    30,
    80,
    80
  ),
  (
    '73000000-0000-4000-8000-000000000005',
    '7a000000-0000-4000-8000-000000000001',
    'Explicit Equal-Cost Catalog Sentinel',
    'EXPLICIT-80-80',
    'EXPLICIT-80-80',
    40,
    30,
    80,
    80
  );

insert into public.part_requests (
  id,
  shop_id,
  work_order_id,
  job_id,
  status,
  notes
) values
  (
    '74000000-0000-4000-8000-000000000001',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    'approved',
    'Catalog request'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    'approved',
    'Second catalog request'
  ),
  (
    '74000000-0000-4000-8000-000000000003',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    'approved',
    'Free-text request'
  ),
  (
    '74000000-0000-4000-8000-000000000004',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000003',
    'requested',
    'Preapproval request'
  ),
  (
    '74000000-0000-4000-8000-000000000005',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    'approved',
    'Unauthorized request'
  ),
  (
    '74000000-0000-4000-8000-000000000006',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    'approved',
    'Explicit zero-margin acquisition request'
  ),
  (
    '74000000-0000-4000-8000-000000000007',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    'approved',
    'Multi-PO free-text receipt request'
  ),
  (
    '74000000-0000-4000-8000-000000000008',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    'approved',
    'Mixed PO request-backed free-text receipt'
  ),
  (
    '74000000-0000-4000-8000-000000000009',
    '7b000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000002',
    '7f000000-0000-4000-8000-000000000002',
    'approved',
    'Cross-shop receipt guard request'
  );

insert into public.part_request_items (
  id,
  request_id,
  shop_id,
  work_order_id,
  work_order_line_id,
  part_id,
  vendor_id,
  description,
  requested_part_number,
  requested_manufacturer,
  qty,
  qty_requested,
  qty_approved,
  unit_cost,
  unit_price,
  quoted_price,
  approved,
  status
) values
  (
    '75000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '7c000000-0000-4000-8000-000000000001',
    'Catalog sentinel',
    'SENTINEL-40-80',
    'Runtime Manufacturer',
    2,
    2,
    2,
    80,
    80,
    80,
    true,
    'approved'
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000002',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000002',
    '7c000000-0000-4000-8000-000000000001',
    'Second catalog sentinel',
    'SENTINEL-40-80-B',
    'Runtime Manufacturer',
    1,
    1,
    1,
    35,
    80,
    80,
    true,
    'approved'
  ),
  (
    '75000000-0000-4000-8000-000000000003',
    '74000000-0000-4000-8000-000000000003',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    null,
    '7c000000-0000-4000-8000-000000000001',
    'Free-text special-order part',
    'FREE-TEXT-40-80',
    'Runtime Vendor Brand',
    1,
    1,
    1,
    80,
    80,
    80,
    true,
    'approved'
  ),
  (
    '75000000-0000-4000-8000-000000000004',
    '74000000-0000-4000-8000-000000000003',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    null,
    '7c000000-0000-4000-8000-000000000001',
    'Free-text missing acquisition cost',
    'FREE-TEXT-NO-COST',
    'Runtime Vendor Brand',
    1,
    1,
    1,
    80,
    80,
    80,
    true,
    'approved'
  ),
  (
    '75000000-0000-4000-8000-000000000005',
    '74000000-0000-4000-8000-000000000004',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000003',
    '7c000000-0000-4000-8000-000000000001',
    'Preapproval catalog part',
    'PREAPPROVAL',
    'Runtime Manufacturer',
    1,
    1,
    0,
    40,
    80,
    80,
    false,
    'quoted'
  ),
  (
    '75000000-0000-4000-8000-000000000006',
    '74000000-0000-4000-8000-000000000005',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000004',
    '7c000000-0000-4000-8000-000000000001',
    'Unauthorized catalog part',
    'UNAUTHORIZED',
    'Runtime Manufacturer',
    1,
    1,
    1,
    40,
    80,
    80,
    true,
    'approved'
  );

insert into public.part_request_items (
  id,
  request_id,
  shop_id,
  work_order_id,
  work_order_line_id,
  part_id,
  vendor_id,
  description,
  requested_part_number,
  requested_manufacturer,
  qty,
  qty_requested,
  qty_approved,
  unit_cost,
  unit_price,
  quoted_price,
  approved,
  status,
  po_id,
  qty_ordered
) values
  (
    '75000000-0000-4000-8000-000000000007',
    '74000000-0000-4000-8000-000000000006',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000005',
    '7c000000-0000-4000-8000-000000000001',
    'Explicit cost equals sell sentinel',
    'EXPLICIT-80-80',
    'Runtime Manufacturer',
    1,
    1,
    1,
    80,
    80,
    80,
    true,
    'approved',
    null,
    0
  ),
  (
    '75000000-0000-4000-8000-000000000008',
    '74000000-0000-4000-8000-000000000009',
    '7b000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000002',
    '7f000000-0000-4000-8000-000000000002',
    null,
    '7c000000-0000-4000-8000-000000000003',
    'Cross-shop receipt guard item',
    'CROSS-SHOP-RECEIPT',
    'Runtime Manufacturer',
    1,
    1,
    1,
    40,
    80,
    80,
    true,
    'ordered',
    '7d000000-0000-4000-8000-000000000001',
    1
  ),
  (
    '75000000-0000-4000-8000-000000000009',
    '74000000-0000-4000-8000-000000000007',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    null,
    '7c000000-0000-4000-8000-000000000001',
    'Multi-PO free-text part',
    'MULTI-PO-FREE-TEXT',
    'Runtime Vendor Brand',
    2,
    2,
    2,
    80,
    80,
    80,
    true,
    'approved',
    null,
    0
  ),
  (
    '75000000-0000-4000-8000-000000000010',
    '74000000-0000-4000-8000-000000000008',
    '7a000000-0000-4000-8000-000000000001',
    '7e000000-0000-4000-8000-000000000001',
    '7f000000-0000-4000-8000-000000000001',
    null,
    '7c000000-0000-4000-8000-000000000001',
    'Mixed PO request-backed free-text part',
    'MIXED-PO-FREE-TEXT',
    'Runtime Vendor Brand',
    1,
    1,
    1,
    40,
    80,
    80,
    true,
    'ordered',
    '7d000000-0000-4000-8000-000000000004',
    1
  );

insert into public.purchase_order_lines (
  id,
  po_id,
  part_id,
  description,
  qty,
  unit_cost,
  received_qty,
  part_request_item_id,
  work_order_part_id,
  idempotency_key
) values
  (
    '7d100000-0000-4000-8000-000000000001',
    '7d000000-0000-4000-8000-000000000001',
    null,
    'Cross-shop free-text receipt guard',
    1,
    40,
    0,
    '75000000-0000-4000-8000-000000000008',
    null,
    'cross-shop-receipt-fixture'
  ),
  (
    '7d100000-0000-4000-8000-000000000003',
    '7d000000-0000-4000-8000-000000000003',
    null,
    'Generic-only free-text completion with one cancelled unit',
    2,
    12,
    0,
    null,
    null,
    'generic-only-completion-fixture'
  ),
  (
    '7d100000-0000-4000-8000-000000000004',
    '7d000000-0000-4000-8000-000000000004',
    '73000000-0000-4000-8000-000000000001',
    'Already-received catalog line on mixed PO',
    1,
    40,
    1,
    null,
    null,
    'mixed-catalog-fixture'
  ),
  (
    '7d100000-0000-4000-8000-000000000005',
    '7d000000-0000-4000-8000-000000000004',
    null,
    'Generic line on mixed PO',
    1,
    15,
    0,
    null,
    null,
    'mixed-generic-fixture'
  ),
  (
    '7d100000-0000-4000-8000-000000000006',
    '7d000000-0000-4000-8000-000000000004',
    null,
    'Request-backed free-text line on mixed PO',
    1,
    40,
    0,
    '75000000-0000-4000-8000-000000000010',
    null,
    'mixed-request-fixture'
  );

update public.purchase_order_lines
set cancelled_qty = 1
where id = '7d100000-0000-4000-8000-000000000003';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000002',
  true
);

create temp table parts_request_to_po_results (
  attempt text primary key,
  result jsonb not null
);
grant select, insert on table parts_request_to_po_results to authenticated;

set local role authenticated;

insert into parts_request_to_po_results (attempt, result)
select
  'catalog_first',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id := '75000000-0000-4000-8000-000000000001',
    p_qty := 2,
    p_idempotency_key := '7a000000-0000-4000-8000-000000000001:parts-order:catalog-first',
    p_supplier_id := '7c000000-0000-4000-8000-000000000001'
  );

insert into parts_request_to_po_results (attempt, result)
select
  'catalog_exact_replay',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id := '75000000-0000-4000-8000-000000000001',
    p_qty := 2,
    p_idempotency_key := '7a000000-0000-4000-8000-000000000001:parts-order:catalog-first',
    p_supplier_id := '7c000000-0000-4000-8000-000000000001'
  );

insert into parts_request_to_po_results (attempt, result)
select
  'catalog_domain_replay',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id := '75000000-0000-4000-8000-000000000001',
    p_qty := 2,
    p_idempotency_key := '7a000000-0000-4000-8000-000000000001:parts-order:catalog-different-key',
    p_supplier_id := '7c000000-0000-4000-8000-000000000001'
  );

insert into parts_request_to_po_results (attempt, result)
select
  'catalog_same_supplier',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id := '75000000-0000-4000-8000-000000000002',
    p_qty := 1,
    p_idempotency_key := '7a000000-0000-4000-8000-000000000001:parts-order:catalog-second-item',
    p_supplier_id := '7c000000-0000-4000-8000-000000000001'
  );

insert into parts_request_to_po_results (attempt, result)
select
  'manual_explicit_cost',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id := '75000000-0000-4000-8000-000000000003',
    p_qty := 1,
    p_idempotency_key := '7a000000-0000-4000-8000-000000000001:parts-order:manual',
    p_supplier_id := '7c000000-0000-4000-8000-000000000001',
    p_unit_cost := 40
  );

insert into parts_request_to_po_results (attempt, result)
select
  'catalog_explicit_cost_equals_sell',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id := '75000000-0000-4000-8000-000000000007',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-order:explicit-cost-80',
    p_supplier_id := '7c000000-0000-4000-8000-000000000001',
    p_unit_cost := 80
  );

reset role;

do $assert_success$
declare
  v_po_id uuid;
  v_catalog_line public.purchase_order_lines%rowtype;
  v_distinct_cost_line public.purchase_order_lines%rowtype;
  v_explicit_equal_sell_line public.purchase_order_lines%rowtype;
  v_manual_line public.purchase_order_lines%rowtype;
begin
  select (result ->> 'po_id')::uuid
    into v_po_id
  from parts_request_to_po_results
  where attempt = 'catalog_first';

  if v_po_id is null then
    raise exception 'Parts request-to-PO regression: first call returned no PO.';
  end if;
  if (
    select count(*)
    from public.purchase_orders purchase_order
    where purchase_order.shop_id = '7a000000-0000-4000-8000-000000000001'
      and purchase_order.supplier_id = '7c000000-0000-4000-8000-000000000001'
      and lower(purchase_order.status) in ('draft', 'open')
  ) <> 1 then
    raise exception 'Parts request-to-PO regression: supplier PO was duplicated.';
  end if;
  if not exists (
    select 1
    from public.purchase_orders purchase_order
    where purchase_order.id = v_po_id
      and purchase_order.status = 'draft'
  ) then
    raise exception 'Parts request-to-PO regression: new header is not draft.';
  end if;

  select *
    into v_catalog_line
  from public.purchase_order_lines line
  where line.part_request_item_id =
    '75000000-0000-4000-8000-000000000001';

  if not found
     or v_catalog_line.po_id <> v_po_id
     or v_catalog_line.part_id <>
       '73000000-0000-4000-8000-000000000001'::uuid
     or v_catalog_line.work_order_part_id is null
     or v_catalog_line.qty <> 2
     or v_catalog_line.unit_cost <> 40 then
    raise exception
      'Parts request-to-PO regression: catalog line lost identity, quantity, or acquisition cost.';
  end if;
  if v_catalog_line.unit_cost = 80 then
    raise exception 'Parts request-to-PO regression: customer sell price reached the PO.';
  end if;
  if not exists (
    select 1
    from public.part_request_items item
    where item.id = '75000000-0000-4000-8000-000000000001'
      and item.unit_cost = 40
      and item.unit_price = 80
      and item.quoted_price = 80
  ) then
    raise exception
      'Parts request-to-PO regression: acquisition reconciliation overwrote or retained sell as cost.';
  end if;

  select *
    into v_distinct_cost_line
  from public.purchase_order_lines line
  where line.part_request_item_id =
    '75000000-0000-4000-8000-000000000002';

  if not found or v_distinct_cost_line.unit_cost <> 35 then
    raise exception
      'Parts request-to-PO regression: distinct staged acquisition cost did not beat catalog cost.';
  end if;

  select *
    into v_explicit_equal_sell_line
  from public.purchase_order_lines line
  where line.part_request_item_id =
    '75000000-0000-4000-8000-000000000007';

  if not found or v_explicit_equal_sell_line.unit_cost <> 80 then
    raise exception
      'Parts request-to-PO regression: explicit acquisition cost equal to sell was not authoritative.';
  end if;

  if (
    select count(*)
    from public.purchase_order_lines line
    where line.part_request_item_id =
      '75000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Parts request-to-PO regression: replay duplicated catalog line.';
  end if;

  if not exists (
    select 1
    from parts_request_to_po_results
    where attempt = 'catalog_exact_replay'
      and (result ->> 'idempotent')::boolean
  ) then
    raise exception 'Parts request-to-PO regression: exact-key replay was not idempotent.';
  end if;
  if not exists (
    select 1
    from parts_request_to_po_results
    where attempt = 'catalog_domain_replay'
      and (result ->> 'domain_replay')::boolean
      and (result ->> 'ordered_qty')::numeric = 2
      and (result ->> 'remaining_to_order')::numeric = 0
      and (result ->> 'work_order_part_id')::uuid =
        v_catalog_line.work_order_part_id
  ) then
    raise exception 'Parts request-to-PO regression: different-key domain replay failed.';
  end if;

  if (
    select count(distinct line.po_id)
    from public.purchase_order_lines line
    where line.part_request_item_id in (
      '75000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      '75000000-0000-4000-8000-000000000003',
      '75000000-0000-4000-8000-000000000007'
    )
  ) <> 1 then
    raise exception 'Parts request-to-PO regression: same-supplier items were not grouped.';
  end if;

  select *
    into v_manual_line
  from public.purchase_order_lines line
  where line.part_request_item_id =
    '75000000-0000-4000-8000-000000000003';

  if not found
     or v_manual_line.po_id <> v_po_id
     or v_manual_line.part_id is null
     or v_manual_line.work_order_part_id is null
     or v_manual_line.unit_cost <> 40 then
    raise exception
      'Parts request-to-PO regression: request-backed line did not materialize inventory/WOP identity or lost acquisition cost.';
  end if;
  if not exists (
    select 1
    from public.part_request_items item
    where item.id = '75000000-0000-4000-8000-000000000003'
      and item.part_id = v_manual_line.part_id
      and item.po_id = v_po_id
      and item.qty_ordered = 1
      and item.unit_cost = 40
      and item.unit_price = 80
      and item.quoted_price = 80
      and item.status = 'ordered'
  ) then
    raise exception 'Parts request-to-PO regression: manual request state did not reconcile.';
  end if;
  if not exists (
    select 1
    from public.work_order_parts part
    where part.source_parts_request_item_id =
      '75000000-0000-4000-8000-000000000003'
      and part.id = v_manual_line.work_order_part_id
      and part.part_id = v_manual_line.part_id
  ) then
    raise exception 'Parts request-to-PO regression: request-backed ordering did not create its WOP.';
  end if;
  if not exists (
    select 1
    from public.parts_lifecycle_operations operation
    where operation.part_request_item_id =
      '75000000-0000-4000-8000-000000000001'
      and operation.result -> '_request' = jsonb_build_object(
        'request_item_id',
          '75000000-0000-4000-8000-000000000001'::uuid,
        'qty', 2,
        'po_id', null,
        'supplier_id',
          '7c000000-0000-4000-8000-000000000001'::uuid,
        'unit_cost', null,
        'location_id', null,
        'notes', null
      )
  ) then
    raise exception
      'Parts request-to-PO regression: durable receipt lost its request payload.';
  end if;
end
$assert_success$;

-- Simulate a durable operation written by the pre-payload wrapper. The PO and
-- line receipt remain intact; only the later `_request` binding is absent.
update public.parts_lifecycle_operations operation
set result = operation.result - '_request'
where operation.part_request_item_id =
    '75000000-0000-4000-8000-000000000002'
  and operation.idempotency_key =
    '7a000000-0000-4000-8000-000000000001:parts-order:catalog-second-item';

do $assert_legacy_fixture$
begin
  if not exists (
    select 1
    from public.parts_lifecycle_operations operation
    where operation.part_request_item_id =
        '75000000-0000-4000-8000-000000000002'
      and not (operation.result ? '_request')
  ) then
    raise exception
      'Parts request-to-PO regression: legacy receipt fixture was not created.';
  end if;
end
$assert_legacy_fixture$;

-- A second editable header is intentional for the partial-order fixture. The
-- first unit is ordered on the earlier grouped PO and the second unit here.
insert into public.purchase_orders (
  id,
  shop_id,
  supplier_id,
  status,
  notes
) values (
  '7d000000-0000-4000-8000-000000000002',
  '7a000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000001',
  'draft',
  'Later partial-order header'
);

insert into public.purchase_order_lines (
  id,
  po_id,
  part_id,
  description,
  qty,
  unit_cost,
  received_qty,
  part_request_item_id,
  work_order_part_id,
  idempotency_key
)
select
  '7d100000-0000-4000-8000-000000000002',
  (result ->> 'po_id')::uuid,
  null,
  'Generic free-text line must be mapped before receipt',
  1,
  10,
  0,
  null,
  null,
  'generic-free-text-receipt-fixture'
from parts_request_to_po_results
where attempt = 'catalog_first';

create function pg_temp.expect_parts_po_error(
  p_item_id uuid,
  p_supplier_id uuid,
  p_po_id uuid,
  p_unit_cost numeric,
  p_key text,
  p_expected text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_create_or_reuse_po_line_for_request(
      p_request_item_id := p_item_id,
      p_qty := 1,
      p_idempotency_key := p_key,
      p_po_id := p_po_id,
      p_supplier_id := p_supplier_id,
      p_unit_cost := p_unit_cost
    );
  exception when others then
    if position(p_expected in sqlerrm) > 0 then
      return;
    end if;
    raise exception
      'Parts request-to-PO regression: expected %, got %',
      p_expected,
      sqlerrm;
  end;
  raise exception
    'Parts request-to-PO regression: expected error % but call succeeded',
    p_expected;
end;
$$;
grant execute on function pg_temp.expect_parts_po_error(
  uuid, uuid, uuid, numeric, text, text
) to authenticated;

create function pg_temp.expect_parts_po_payload_conflict(
  p_qty numeric,
  p_unit_cost numeric,
  p_location_id uuid,
  p_notes text,
  p_changed_field text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_create_or_reuse_po_line_for_request(
      p_request_item_id := '75000000-0000-4000-8000-000000000001',
      p_qty := p_qty,
      p_idempotency_key :=
        '7a000000-0000-4000-8000-000000000001:parts-order:catalog-first',
      p_supplier_id := '7c000000-0000-4000-8000-000000000001',
      p_unit_cost := p_unit_cost,
      p_location_id := p_location_id,
      p_notes := p_notes
    );
  exception when others then
    if position('PARTS_ORDER_IDEMPOTENCY_CONFLICT' in sqlerrm) > 0 then
      return;
    end if;
    raise exception
      'Parts request-to-PO regression: % replay expected payload conflict, got %',
      p_changed_field,
      sqlerrm;
  end;
  raise exception
    'Parts request-to-PO regression: % replay rebound a durable key',
    p_changed_field;
end;
$$;
grant execute on function pg_temp.expect_parts_po_payload_conflict(
  numeric, numeric, uuid, text, text
) to authenticated;

create function pg_temp.expect_legacy_parts_po_conflict(
  p_qty numeric,
  p_unit_cost numeric,
  p_location_id uuid,
  p_supplier_id uuid,
  p_po_id uuid,
  p_changed_field text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_create_or_reuse_po_line_for_request(
      p_request_item_id :=
        '75000000-0000-4000-8000-000000000002',
      p_qty := p_qty,
      p_idempotency_key :=
        '7a000000-0000-4000-8000-000000000001:parts-order:catalog-second-item',
      p_po_id := p_po_id,
      p_supplier_id := p_supplier_id,
      p_unit_cost := p_unit_cost,
      p_location_id := p_location_id
    );
  exception when others then
    if position('PARTS_ORDER_IDEMPOTENCY_CONFLICT' in sqlerrm) > 0 then
      return;
    end if;
    raise exception
      'Parts request-to-PO regression: legacy % replay expected payload conflict, got %',
      p_changed_field,
      sqlerrm;
  end;
  raise exception
    'Parts request-to-PO regression: legacy % replay rebound changed semantics',
    p_changed_field;
end;
$$;
grant execute on function pg_temp.expect_legacy_parts_po_conflict(
  numeric, numeric, uuid, uuid, uuid, text
) to authenticated;

create function pg_temp.expect_free_text_receipt_error(
  p_po_id uuid,
  p_line_id uuid,
  p_qty numeric,
  p_key text,
  p_expected text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_receive_free_text_po_line(
      p_po_id := p_po_id,
      p_po_line_id := p_line_id,
      p_qty := p_qty,
      p_idempotency_key := p_key
    );
  exception when others then
    if position(p_expected in sqlerrm) > 0 then
      return;
    end if;
    raise exception
      'Parts free-text receipt regression: expected %, got %',
      p_expected,
      sqlerrm;
  end;
  raise exception
    'Parts free-text receipt regression: expected error % but call succeeded',
    p_expected;
end;
$$;
grant execute on function pg_temp.expect_free_text_receipt_error(
  uuid, uuid, numeric, text, text
) to authenticated;

create function pg_temp.expect_ordered_attach_error(
  p_item_id uuid,
  p_part_id uuid,
  p_expected text
) returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_attach_inventory_to_request_item_atomic(
      p_item_id,
      p_part_id
    );
  exception when others then
    if position(p_expected in sqlerrm) > 0 then
      return;
    end if;
    raise exception
      'Parts ordered-attach regression: expected %, got %',
      p_expected,
      sqlerrm;
  end;
  raise exception
    'Parts ordered-attach regression: expected error % but call succeeded',
    p_expected;
end;
$$;
grant execute on function pg_temp.expect_ordered_attach_error(
  uuid, uuid, text
) to authenticated;

set local role authenticated;

select pg_temp.expect_legacy_parts_po_conflict(
  2,
  null,
  null,
  '7c000000-0000-4000-8000-000000000001',
  null,
  'quantity'
);
select pg_temp.expect_legacy_parts_po_conflict(
  1,
  99,
  null,
  '7c000000-0000-4000-8000-000000000001',
  null,
  'cost'
);
select pg_temp.expect_legacy_parts_po_conflict(
  1,
  null,
  '7c100000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000001',
  null,
  'location'
);
select pg_temp.expect_legacy_parts_po_conflict(
  1,
  null,
  null,
  '7c000000-0000-4000-8000-000000000002',
  null,
  'supplier target'
);

insert into parts_request_to_po_results (attempt, result)
values (
  'catalog_legacy_exact_replay',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id :=
      '75000000-0000-4000-8000-000000000002',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-order:catalog-second-item',
    p_supplier_id := '7c000000-0000-4000-8000-000000000001'
  )
);

insert into parts_request_to_po_results (attempt, result)
select
  'multi_po_first_order',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id :=
      '75000000-0000-4000-8000-000000000009',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-order:multi-po-first',
    p_po_id := (result ->> 'po_id')::uuid,
    p_unit_cost := 40
  )
from parts_request_to_po_results
where attempt = 'catalog_first';

insert into parts_request_to_po_results (attempt, result)
values (
  'multi_po_second_order',
  public.parts_create_or_reuse_po_line_for_request(
    p_request_item_id :=
      '75000000-0000-4000-8000-000000000009',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-order:multi-po-second',
    p_po_id := '7d000000-0000-4000-8000-000000000002',
    p_unit_cost := 40
  )
);

insert into parts_request_to_po_results (attempt, result)
select
  'multi_po_earlier_line_receipt',
  public.receive_part_request_item(
    p_item_id := '75000000-0000-4000-8000-000000000009',
    p_location_id := '7c100000-0000-4000-8000-000000000001',
    p_qty := 1,
    p_po_id := line.po_id,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:multi-po-first'
  )
from public.purchase_order_lines line
join parts_request_to_po_results first_order
  on first_order.attempt = 'multi_po_first_order'
 and first_order.result ->> 'purchase_order_line_id' = line.id::text;

insert into parts_request_to_po_results (attempt, result)
select
  'materialized_attach_replay',
  public.parts_attach_inventory_to_request_item_atomic(
    '75000000-0000-4000-8000-000000000003',
    item.part_id
  )
from public.part_request_items item
where item.id = '75000000-0000-4000-8000-000000000003';

select pg_temp.expect_free_text_receipt_error(
  (
    select line.po_id from public.purchase_order_lines line
    where line.id = '7d100000-0000-4000-8000-000000000002'
  ),
  '7d100000-0000-4000-8000-000000000002',
  0.001,
  '7a000000-0000-4000-8000-000000000001:parts-receipt:over-precision',
  'PARTS_RECEIPT_QUANTITY_PRECISION'
);

-- The receipt attempt above must run as the authenticated shop actor. Inspect
-- the protected operation ledger only after restoring the migration runner,
-- then resume the authenticated flow for the remaining receipt assertions.
reset role;

do $assert_overprecision$
begin
  if exists (
    select 1
    from public.parts_lifecycle_operations operation
    where operation.idempotency_key =
      '7a000000-0000-4000-8000-000000000001:parts-receipt:over-precision'
  ) then
    raise exception 'Over-precision receipt wrote an operation receipt';
  end if;
end;
$assert_overprecision$;

set local role authenticated;

insert into parts_request_to_po_results (attempt, result)
select
  'manual_receipt_first',
  public.receive_part_request_item(
    p_item_id := '75000000-0000-4000-8000-000000000003',
    p_location_id := '7c100000-0000-4000-8000-000000000001',
    p_qty := 1,
    p_po_id := line.po_id,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:manual-1'
  )
from public.purchase_order_lines line
where line.part_request_item_id =
  '75000000-0000-4000-8000-000000000003';

insert into parts_request_to_po_results (attempt, result)
select
  'manual_receipt_exact_replay',
  public.receive_part_request_item(
    p_item_id := '75000000-0000-4000-8000-000000000003',
    p_location_id := '7c100000-0000-4000-8000-000000000001',
    p_qty := 1,
    p_po_id := line.po_id,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:manual-1'
  )
from public.purchase_order_lines line
where line.part_request_item_id =
  '75000000-0000-4000-8000-000000000003';

insert into parts_request_to_po_results (attempt, result)
select
  'generic_receipt_first',
  public.parts_receive_free_text_po_line(
    p_po_id := (result ->> 'po_id')::uuid,
    p_po_line_id := '7d100000-0000-4000-8000-000000000002',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:generic'
  )
from parts_request_to_po_results
where attempt = 'catalog_first';

insert into parts_request_to_po_results (attempt, result)
select
  'generic_receipt_exact_replay',
  public.parts_receive_free_text_po_line(
    p_po_id := (result ->> 'po_id')::uuid,
    p_po_line_id := '7d100000-0000-4000-8000-000000000002',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:generic'
  )
from parts_request_to_po_results
where attempt = 'catalog_first';

insert into parts_request_to_po_results (attempt, result)
values (
  'generic_only_po_completion',
  public.parts_receive_free_text_po_line(
    p_po_id := '7d000000-0000-4000-8000-000000000003',
    p_po_line_id := '7d100000-0000-4000-8000-000000000003',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:generic-only'
  )
);

insert into parts_request_to_po_results (attempt, result)
values (
  'generic_only_po_completion_replay',
  public.parts_receive_free_text_po_line(
    p_po_id := '7d000000-0000-4000-8000-000000000003',
    p_po_line_id := '7d100000-0000-4000-8000-000000000003',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:generic-only'
  )
);

insert into parts_request_to_po_results (attempt, result)
values (
  'mixed_po_partial_completion',
  public.parts_receive_free_text_po_line(
    p_po_id := '7d000000-0000-4000-8000-000000000004',
    p_po_line_id := '7d100000-0000-4000-8000-000000000005',
    p_qty := 1,
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:mixed-generic'
  )
);

insert into parts_request_to_po_results (attempt, result)
values (
  'mixed_po_final_completion',
  public.receive_part_request_item(
    p_item_id := '75000000-0000-4000-8000-000000000010',
    p_location_id := '7c100000-0000-4000-8000-000000000001',
    p_qty := 1,
    p_po_id := '7d000000-0000-4000-8000-000000000004',
    p_idempotency_key :=
      '7a000000-0000-4000-8000-000000000001:parts-receipt:mixed-request'
  )
);

select pg_temp.expect_free_text_receipt_error(
  (
    select (result ->> 'po_id')::uuid
    from parts_request_to_po_results
    where attempt = 'catalog_first'
  ),
  '7d100000-0000-4000-8000-000000000002',
  1,
  '7a000000-0000-4000-8000-000000000001:parts-receipt:generic-different',
  'PARTS_RECEIPT_EXCEEDS_REMAINING'
);

select pg_temp.expect_free_text_receipt_error(
  '7d000000-0000-4000-8000-000000000001',
  '7d100000-0000-4000-8000-000000000001',
  1,
  '7a000000-0000-4000-8000-000000000001:parts-receipt:cross-shop',
  'PARTS_SHOP_ACCESS_DENIED'
);

select pg_temp.expect_parts_po_payload_conflict(
  1,
  null,
  null,
  null,
  'quantity'
);

select pg_temp.expect_parts_po_payload_conflict(
  2,
  39,
  null,
  null,
  'unit cost'
);

select pg_temp.expect_parts_po_payload_conflict(
  2,
  null,
  '7c100000-0000-4000-8000-000000000001',
  null,
  'location'
);

select pg_temp.expect_parts_po_payload_conflict(
  2,
  null,
  null,
  'changed header notes',
  'notes'
);

select pg_temp.expect_parts_po_error(
  '75000000-0000-4000-8000-000000000004',
  '7c000000-0000-4000-8000-000000000001',
  null,
  null,
  '7a000000-0000-4000-8000-000000000001:parts-order:manual-no-cost',
  'PARTS_ACQUISITION_COST_REQUIRED'
);

select pg_temp.expect_parts_po_error(
  '75000000-0000-4000-8000-000000000004',
  '7c000000-0000-4000-8000-000000000002',
  null,
  40,
  '7a000000-0000-4000-8000-000000000001:parts-order:vendor-mismatch',
  'PARTS_REQUEST_VENDOR_MISMATCH'
);

select pg_temp.expect_parts_po_error(
  '75000000-0000-4000-8000-000000000005',
  '7c000000-0000-4000-8000-000000000001',
  null,
  40,
  '7a000000-0000-4000-8000-000000000001:parts-order:preapproval',
  'PARTS_APPROVAL_REQUIRED'
);

select pg_temp.expect_parts_po_error(
  '75000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000003',
  null,
  40,
  '7a000000-0000-4000-8000-000000000001:parts-order:cross-shop-supplier',
  'Supplier not found for this shop.'
);

select pg_temp.expect_parts_po_error(
  '75000000-0000-4000-8000-000000000001',
  null,
  '7d000000-0000-4000-8000-000000000001',
  40,
  '7a000000-0000-4000-8000-000000000001:parts-order:cross-shop-po',
  'Purchase order belongs to a different shop.'
);

select pg_temp.expect_parts_po_error(
  '75000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000002',
  (
    select (result ->> 'po_id')::uuid
    from parts_request_to_po_results
    where attempt = 'catalog_first'
  ),
  40,
  '7a000000-0000-4000-8000-000000000001:parts-order:supplier-mismatch',
  'Purchase order supplier does not match the requested supplier.'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000003',
  true
);
set local role authenticated;

select pg_temp.expect_parts_po_error(
  '75000000-0000-4000-8000-000000000006',
  '7c000000-0000-4000-8000-000000000001',
  null,
  40,
  '7a000000-0000-4000-8000-000000000001:parts-order:unauthorized',
  'Parts ordering actor is not authorized for this shop.'
);

select pg_temp.expect_free_text_receipt_error(
  (
    select line.po_id
    from public.purchase_order_lines line
    where line.part_request_item_id =
      '75000000-0000-4000-8000-000000000003'
  ),
  (
    select line.id
    from public.purchase_order_lines line
    where line.part_request_item_id =
      '75000000-0000-4000-8000-000000000003'
  ),
  1,
  '7a000000-0000-4000-8000-000000000001:parts-receipt:unauthorized',
  'Parts receiving actor is not authorized for this shop.'
);

reset role;

do $assert_failures$
begin
  if not exists (
    select 1
    from public.purchase_order_lines line
    join public.part_request_items item
      on item.id = line.part_request_item_id
    where item.id = '75000000-0000-4000-8000-000000000003'
      and line.part_id = item.part_id
      and line.work_order_part_id is not null
      and line.received_qty = 1
      and item.part_id is not null
      and item.qty_received = 1
      and item.status = 'received'
  ) then
    raise exception
      'Parts request receipt regression: inventory/WOP identity or receipt state diverged.';
  end if;
  if not exists (
    select 1
    from parts_request_to_po_results
    where attempt = 'manual_receipt_exact_replay'
      and (result ->> 'idempotent')::boolean
      and (result ->> 'qty_received')::numeric = 1
  ) then
    raise exception
      'Parts free-text receipt regression: exact replay did not return its durable receipt.';
  end if;
  if not exists (
    select 1
    from parts_request_to_po_results replay
    join public.parts_lifecycle_operations operation
      on operation.part_request_item_id =
        '75000000-0000-4000-8000-000000000002'::uuid
     and operation.idempotency_key =
       '7a000000-0000-4000-8000-000000000001:parts-order:catalog-second-item'
    where replay.attempt = 'catalog_legacy_exact_replay'
      and (replay.result ->> 'idempotent')::boolean
      and operation.result -> '_request' = jsonb_build_object(
        'request_item_id',
          '75000000-0000-4000-8000-000000000002'::uuid,
        'qty', 1,
        'po_id', null,
        'supplier_id',
          '7c000000-0000-4000-8000-000000000001'::uuid,
        'unit_cost', null,
        'location_id', null,
        'notes', null
      )
  ) or (
    select count(*)
    from public.purchase_order_lines line
    where line.part_request_item_id =
      '75000000-0000-4000-8000-000000000002'
  ) <> 1 then
    raise exception
      'Parts request-to-PO regression: safe legacy replay did not bind its payload idempotently.';
  end if;
  if not exists (
    select 1
    from parts_request_to_po_results first_order
    join parts_request_to_po_results second_order
      on second_order.attempt = 'multi_po_second_order'
    join parts_request_to_po_results receipt
      on receipt.attempt = 'multi_po_earlier_line_receipt'
    join public.part_request_items item
      on item.id = '75000000-0000-4000-8000-000000000009'
    join public.purchase_order_lines first_line
      on first_line.id =
        (first_order.result ->> 'purchase_order_line_id')::uuid
    join public.purchase_order_lines second_line
      on second_line.id =
        (second_order.result ->> 'purchase_order_line_id')::uuid
    where first_order.attempt = 'multi_po_first_order'
      and first_line.po_id <> second_line.po_id
      and item.po_id = second_line.po_id
      and item.qty_ordered = 2
      and item.qty_received = 1
      and item.status = 'partially_received'
      and first_line.received_qty = 1
      and second_line.received_qty = 0
      and (receipt.result ->> 'purchase_order_id')::uuid = first_line.po_id
      and (receipt.result ->> 'work_order_part_id')::uuid = first_line.work_order_part_id
  ) then
    raise exception
      'Parts free-text receipt regression: an earlier partial-order PO line could not receive after item.po_id advanced.';
  end if;
  if not exists (
    select 1
    from public.stock_moves move
    where move.part_request_item_id =
      '75000000-0000-4000-8000-000000000003'
      and move.purchase_order_line_id is not null
      and move.work_order_part_id is not null
      and move.reason = 'receive'
  ) then
    raise exception
      'Parts request receipt regression: received request did not create inventory movement.';
  end if;
  if exists (
    select 1
    from public.purchase_order_lines line
    where line.id = '7d100000-0000-4000-8000-000000000001'
      and coalesce(line.received_qty, 0) <> 0
  ) then
    raise exception
      'Parts free-text receipt regression: rejected cross-shop receipt changed a line.';
  end if;
  if not exists (
    select 1
    from public.purchase_order_lines line
    where line.id = '7d100000-0000-4000-8000-000000000002'
      and line.part_request_item_id is null
      and line.part_id is null
      and line.work_order_part_id is null
      and line.received_qty = 1
  ) or not exists (
    select 1
    from parts_request_to_po_results
    where attempt = 'generic_receipt_exact_replay'
      and (result ->> 'idempotent')::boolean
      and (result ->> 'generic_line')::boolean
      and (result ->> 'line_received_qty')::numeric = 1
  ) then
    raise exception
      'Parts free-text receipt regression: generic manual PO replay was not atomic/idempotent.';
  end if;
  if not exists (
    select 1
    from public.purchase_orders purchase_order
    join public.purchase_order_lines line
      on line.po_id = purchase_order.id
    join parts_request_to_po_results receipt
      on receipt.attempt = 'generic_only_po_completion'
    join parts_request_to_po_results replay
      on replay.attempt = 'generic_only_po_completion_replay'
    where purchase_order.id = '7d000000-0000-4000-8000-000000000003'
      and purchase_order.status = 'received'
      and line.id = '7d100000-0000-4000-8000-000000000003'
      and line.qty = 2
      and line.cancelled_qty = 1
      and line.received_qty = 1
      and (receipt.result ->> 'po_closed')::boolean
      and receipt.result ->> 'po_status' = 'received'
      and (replay.result ->> 'idempotent')::boolean
      and (replay.result ->> 'po_closed')::boolean
      and replay.result ->> 'po_status' = 'received'
  ) then
    raise exception
      'Parts free-text receipt regression: a completed generic-only PO did not close atomically.';
  end if;
  if not exists (
    select 1
    from parts_request_to_po_results partial_receipt
    join parts_request_to_po_results final_receipt
      on final_receipt.attempt = 'mixed_po_final_completion'
    join public.purchase_orders purchase_order
      on purchase_order.id = '7d000000-0000-4000-8000-000000000004'
    join public.purchase_order_lines generic_line
      on generic_line.id = '7d100000-0000-4000-8000-000000000005'
    join public.purchase_order_lines request_line
      on request_line.id = '7d100000-0000-4000-8000-000000000006'
    join public.part_request_items item
      on item.id = '75000000-0000-4000-8000-000000000010'
    where partial_receipt.attempt = 'mixed_po_partial_completion'
      and not (partial_receipt.result ->> 'po_closed')::boolean
      and partial_receipt.result ->> 'po_status' = 'submitted'
      and (final_receipt.result ->> 'purchase_order_closed')::boolean
      and purchase_order.status = 'received'
      and generic_line.received_qty = 1
      and request_line.received_qty = 1
      and item.qty_received = 1
      and item.status = 'received'
  ) then
    raise exception
      'Parts free-text receipt regression: mixed PO partial/final header transitions were inconsistent.';
  end if;
  if exists (
    select 1
    from public.part_request_items item
    where item.id = '75000000-0000-4000-8000-000000000008'
      and coalesce(item.qty_received, 0) <> 0
  ) then
    raise exception
      'Parts free-text receipt regression: cross-shop rejection changed request state.';
  end if;
  if (
    select count(*)
    from public.purchase_orders purchase_order
    where purchase_order.shop_id = '7a000000-0000-4000-8000-000000000001'
  ) <> 4 then
    raise exception 'Parts request-to-PO regression: rejected calls wrote a PO header.';
  end if;
  if (
    select count(*)
    from public.purchase_order_lines line
    where line.part_request_item_id in (
      '75000000-0000-4000-8000-000000000004',
      '75000000-0000-4000-8000-000000000005',
      '75000000-0000-4000-8000-000000000006'
    )
  ) <> 0 then
    raise exception 'Parts request-to-PO regression: rejected calls wrote a PO line.';
  end if;
  if exists (
    select 1
    from public.part_request_items item
    where item.id in (
      '75000000-0000-4000-8000-000000000004',
      '75000000-0000-4000-8000-000000000005',
      '75000000-0000-4000-8000-000000000006'
    )
      and (
        item.po_id is not null
        or item.qty_ordered <> 0
      )
  ) then
    raise exception 'Parts request-to-PO regression: rejected calls changed request state.';
  end if;
  if (
    select count(*)
    from public.parts_lifecycle_operations operation
    where operation.part_request_item_id in (
      '75000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002',
      '75000000-0000-4000-8000-000000000003',
      '75000000-0000-4000-8000-000000000004',
      '75000000-0000-4000-8000-000000000005',
      '75000000-0000-4000-8000-000000000006',
      '75000000-0000-4000-8000-000000000007',
      '75000000-0000-4000-8000-000000000008',
      '75000000-0000-4000-8000-000000000009',
      '75000000-0000-4000-8000-000000000010'
    )
  ) <> 6 then
    raise exception 'Parts request-to-PO regression: replay/failure wrote extra operation receipts.';
  end if;
  if (
    select count(*)
    from public.parts_lifecycle_operations operation
    where operation.operation_type = 'receive_free_text_po_line'
  ) <> 3 then
    raise exception
      'Parts free-text receipt regression: replay/failure wrote extra receipt operations.';
  end if;
end
$assert_failures$;

rollback;
