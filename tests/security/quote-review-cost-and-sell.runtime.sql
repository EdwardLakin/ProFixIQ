\set ON_ERROR_STOP on

-- @regression-flow quotes.review-cost-and-sell
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '40100000-0000-4000-8000-000000000001',
    'quote-cost-sell-owner-a@example.com',
    '{"full_name":"Quote Cost Sell Owner A"}'::jsonb
  ),
  (
    '40100000-0000-4000-8000-000000000002',
    'quote-cost-sell-owner-b@example.com',
    '{"full_name":"Quote Cost Sell Owner B"}'::jsonb
  ),
  (
    '40100000-0000-4000-8000-000000000003',
    'quote-cost-sell-portal@example.com',
    '{}'::jsonb
  ),
  (
    '40100000-0000-4000-8000-000000000011',
    'quote-cost-sell-owner-a-profile@example.com',
    '{"full_name":"Quote Cost Sell Owner A Profile"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '40100000-0000-4000-8000-000000000011',
    '40100000-0000-4000-8000-000000000001',
    'owner',
    'Quote Cost Sell Owner A'
  ),
  (
    '40100000-0000-4000-8000-000000000002',
    '40100000-0000-4000-8000-000000000002',
    'owner',
    'Quote Cost Sell Owner B'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

-- The canonical BEFORE INSERT trigger initializes user_id from id. Restore the
-- imported profile-to-auth identity this fixture needs after the insert path.
update public.profiles
set user_id = '40100000-0000-4000-8000-000000000001'
where id = '40100000-0000-4000-8000-000000000011';

delete from public.profiles
where id = '40100000-0000-4000-8000-000000000003';

insert into public.shops (id, owner_id, business_name, name, labor_rate)
values
  (
    '40200000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000011',
    'Quote Cost Sell Shop A',
    'Quote Cost Sell Shop A',
    0
  ),
  (
    '40200000-0000-4000-8000-000000000002',
    '40100000-0000-4000-8000-000000000002',
    'Quote Cost Sell Shop B',
    'Quote Cost Sell Shop B',
    0
  );

update public.profiles
set shop_id = case id
  when '40100000-0000-4000-8000-000000000011'::uuid
    then '40200000-0000-4000-8000-000000000001'::uuid
  else '40200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '40100000-0000-4000-8000-000000000011',
  '40100000-0000-4000-8000-000000000002'
);

insert into public.customers (id, shop_id, user_id, name, email)
values (
  '40800000-0000-4000-8000-000000000001',
  '40200000-0000-4000-8000-000000000001',
  '40100000-0000-4000-8000-000000000003',
  'Quote Cost Sell Portal Customer',
  'quote-cost-sell-portal@example.com'
);

insert into public.customer_portal_invites (
  id,
  shop_id,
  customer_id,
  email,
  token,
  accepted_at,
  accepted_by_user_id,
  revoked_at
) values (
  '40900000-0000-4000-8000-000000000001',
  '40200000-0000-4000-8000-000000000001',
  '40800000-0000-4000-8000-000000000001',
  'quote-cost-sell-portal@example.com',
  '40900000-0000-4000-8000-000000000002',
  now(),
  '40100000-0000-4000-8000-000000000003',
  null
);

insert into public.work_orders (
  id,
  shop_id,
  customer_id,
  status,
  type,
  record_type,
  estimate_number,
  estimate_status
) values
  (
    '40300000-0000-4000-8000-000000000001',
    '40200000-0000-4000-8000-000000000001',
    '40800000-0000-4000-8000-000000000001',
    'in_progress',
    'repair',
    'work_order',
    null,
    null
  ),
  (
    '40300000-0000-4000-8000-000000000002',
    '40200000-0000-4000-8000-000000000001',
    '40800000-0000-4000-8000-000000000001',
    'in_progress',
    'repair',
    'estimate',
    'EST-QCS-1',
    'waiting_for_parts'
  ),
  (
    '40300000-0000-4000-8000-000000000003',
    '40200000-0000-4000-8000-000000000001',
    '40800000-0000-4000-8000-000000000001',
    'in_progress',
    'repair',
    'work_order',
    null,
    null
  );

insert into public.work_order_quote_lines (
  id,
  shop_id,
  work_order_id,
  description,
  job_type,
  status,
  stage,
  sent_to_customer_at,
  parts_total,
  subtotal,
  grand_total,
  metadata
) values
  (
    '40400000-0000-4000-8000-000000000001',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Runtime quote cost/sell boundary',
    'repair',
    'pending_parts',
    'advisor_pending',
    null,
    0,
    0,
    0,
    '{}'::jsonb
  ),
  (
    '40400000-0000-4000-8000-000000000002',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Protected sent legacy quote',
    'repair',
    'sent',
    'sent',
    now(),
    40,
    40,
    40,
    jsonb_build_object(
      'parts_quote', jsonb_build_object(
        'parts_total', 40,
        'items', jsonb_build_array(jsonb_build_object(
          'id', '40700000-0000-4000-8000-000000000003',
          'description', 'Protected sent sentinel',
          'qty', 1,
          'unit_price', 40,
          'line_total', 40
        ))
      ),
      'parts', jsonb_build_array(jsonb_build_object(
        'description', 'Protected sent sentinel',
        'qty', 1,
        'unitCost', 40,
        'unitPrice', 80
      ))
    )
  ),
  (
    '40400000-0000-4000-8000-000000000003',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000002',
    'Locked estimate legacy quote',
    'repair',
    'pending_parts',
    'advisor_pending',
    null,
    0,
    0,
    0,
    jsonb_build_object('labor_rate', 0)
  ),
  (
    '40400000-0000-4000-8000-000000000004',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Timestamp-only protected quote',
    'repair',
    'quoted',
    'ready_to_send',
    now(),
    40,
    40,
    40,
    jsonb_build_object(
      'parts_quote', jsonb_build_object(
        'parts_total', 40,
        'items', jsonb_build_array(jsonb_build_object(
          'id', '40700000-0000-4000-8000-000000000005',
          'description', 'Timestamp-only sentinel',
          'qty', 1,
          'unit_price', 40,
          'line_total', 40
        ))
      )
    )
  ),
  (
    '40400000-0000-4000-8000-000000000005',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Stage-only protected quote',
    'repair',
    'quoted',
    'customer_pending',
    null,
    40,
    40,
    40,
    jsonb_build_object(
      'parts_quote', jsonb_build_object(
        'parts_total', 40,
        'items', jsonb_build_array(jsonb_build_object(
          'id', '40700000-0000-4000-8000-000000000006',
          'description', 'Stage-only sentinel',
          'qty', 1,
          'unit_price', 40,
          'line_total', 40
        ))
      )
    )
  ),
  (
    '40400000-0000-4000-8000-000000000006',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Snapshot-only protected quote',
    'repair',
    'sent',
    'sent',
    now(),
    40,
    40,
    40,
    jsonb_build_object(
      'parts', jsonb_build_array(jsonb_build_object(
        'description', 'Snapshot-only sentinel',
        'qty', 1,
        'unitCost', 40,
        'unitPrice', 80,
        'lineTotal', 80
      ))
    )
  ),
  (
    '40400000-0000-4000-8000-000000000007',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Equal-sum item drift protected quote',
    'repair',
    'sent',
    'sent',
    now(),
    80,
    80,
    80,
    jsonb_build_object(
      'parts_quote', jsonb_build_object(
        'parts_total', 80,
        'items', jsonb_build_array(
          jsonb_build_object(
            'id', '40700000-0000-4000-8000-000000000007',
            'description', 'Equal-sum sentinel A',
            'qty', 1,
            'unit_price', 40,
            'line_total', 40
          ),
          jsonb_build_object(
            'id', '40700000-0000-4000-8000-000000000008',
            'description', 'Equal-sum sentinel B',
            'qty', 1,
            'unit_price', 40,
            'line_total', 40
          )
        )
      )
    )
  );

-- Converted-at-only handoffs and malformed historical JSON must be treated as
-- protected customer records without making the forward repair abort.
insert into public.work_order_quote_lines (
  id, shop_id, work_order_id, description, job_type, status, stage,
  sent_to_customer_at, converted_at, parts_total, subtotal, grand_total,
  metadata
) values
  (
    '40400000-0000-4000-8000-000000000008',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Converted-at-only protected quote',
    'repair',
    'quoted',
    'ready_to_send',
    null,
    now(),
    40,
    40,
    40,
    jsonb_build_object(
      'parts_quote', jsonb_build_object(
        'parts_total', 40,
        'items', jsonb_build_array(jsonb_build_object(
          'description', 'Converted-only sentinel',
          'qty', 1,
          'unit_price', 40,
          'line_total', 40
        ))
      )
    )
  ),
  (
    '40400000-0000-4000-8000-000000000009',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Scalar item protected quote',
    'repair',
    'sent',
    'sent',
    now(),
    null,
    40,
    40,
    40,
    jsonb_build_object(
      'parts_quote', jsonb_build_object(
        'parts_total', 40,
        'items', jsonb_build_array(40)
      )
    )
  ),
  (
    '40400000-0000-4000-8000-000000000010',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    'Non-object parts quote container',
    'repair',
    'sent',
    'sent',
    now(),
    null,
    40,
    40,
    40,
    jsonb_build_object(
      'parts_quote', 'null'::jsonb,
      'parts', jsonb_build_array(jsonb_build_object(
        'description', 'Malformed-container sentinel',
        'qty', 1,
        'unitCost', 40,
        'unitPrice', 80,
        'lineTotal', 80
      ))
    )
  ),
  (
    '40400000-0000-4000-8000-000000000011',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000003',
    'Financially locked metadata repair sentinel',
    'repair',
    'quoted',
    'ready_to_send',
    null,
    null,
    40,
    40,
    40,
    jsonb_build_object(
      'parts_quote', jsonb_build_object(
        'parts_total', 40,
        'items', jsonb_build_array(jsonb_build_object(
          'description', 'Financial-lock sentinel',
          'qty', 1,
          'unit_cost', 40,
          'unit_price', 80,
          'line_total', 80
        ))
      )
    )
  );

insert into public.invoice_versions (
  id,
  shop_id,
  work_order_id,
  version_number,
  lifecycle_status,
  currency,
  snapshot,
  snapshot_hash,
  issued_at
) values (
  '40b00000-0000-4000-8000-000000000001',
  '40200000-0000-4000-8000-000000000001',
  '40300000-0000-4000-8000-000000000003',
  1,
  'issued',
  'CAD',
  '{}'::jsonb,
  'quote-cost-sell-financial-lock-sentinel',
  now()
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
    '40500000-0000-4000-8000-000000000001',
    '40200000-0000-4000-8000-000000000001',
    'Explicit 40/80 sentinel',
    'SENTINEL-EXPLICIT',
    'SENTINEL-EXPLICIT',
    null,
    40,
    80,
    null
  ),
  (
    '40500000-0000-4000-8000-000000000002',
    '40200000-0000-4000-8000-000000000001',
    'Cost-only sentinel',
    'SENTINEL-COST-ONLY',
    'SENTINEL-COST-ONLY',
    null,
    40,
    null,
    null
  );

insert into public.part_requests (
  id,
  shop_id,
  work_order_id,
  quote_line_id,
  requested_by,
  source_context,
  source_revision,
  status
) values
  (
    '40600000-0000-4000-8000-000000000001',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000001',
    '40100000-0000-4000-8000-000000000001',
    null,
    null,
    'requested'
  ),
  (
    '40600000-0000-4000-8000-000000000002',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000002',
    '40100000-0000-4000-8000-000000000001',
    null,
    null,
    'requested'
  ),
  (
    '40600000-0000-4000-8000-000000000003',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000002',
    '40400000-0000-4000-8000-000000000003',
    '40100000-0000-4000-8000-000000000001',
    'estimate',
    1,
    'requested'
  ),
  (
    '40600000-0000-4000-8000-000000000004',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000004',
    '40100000-0000-4000-8000-000000000001',
    null,
    null,
    'requested'
  ),
  (
    '40600000-0000-4000-8000-000000000005',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000005',
    '40100000-0000-4000-8000-000000000001',
    null,
    null,
    'requested'
  ),
  (
    '40600000-0000-4000-8000-000000000006',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000007',
    '40100000-0000-4000-8000-000000000001',
    null,
    null,
    'requested'
  );

insert into public.part_request_items (
  id,
  request_id,
  shop_id,
  work_order_id,
  quote_line_id,
  part_id,
  description,
  qty,
  qty_requested,
  unit_cost,
  unit_price,
  quoted_price,
  status
) values
  (
    '40700000-0000-4000-8000-000000000001',
    '40600000-0000-4000-8000-000000000001',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000001',
    '40500000-0000-4000-8000-000000000001',
    'Explicit 40/80 sentinel',
    1,
    1,
    40,
    80,
    null,
    'requested'
  ),
  (
    '40700000-0000-4000-8000-000000000002',
    '40600000-0000-4000-8000-000000000001',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000001',
    '40500000-0000-4000-8000-000000000002',
    'Cost-only sentinel',
    1,
    1,
    40,
    null,
    null,
    'requested'
  ),
  (
    '40700000-0000-4000-8000-000000000003',
    '40600000-0000-4000-8000-000000000002',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000002',
    '40500000-0000-4000-8000-000000000001',
    'Protected sent sentinel',
    1,
    1,
    40,
    80,
    null,
    'requested'
  ),
  (
    '40700000-0000-4000-8000-000000000004',
    '40600000-0000-4000-8000-000000000003',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000002',
    '40400000-0000-4000-8000-000000000003',
    '40500000-0000-4000-8000-000000000001',
    'Locked estimate sentinel',
    1,
    1,
    40,
    80,
    null,
    'requested'
  ),
  (
    '40700000-0000-4000-8000-000000000005',
    '40600000-0000-4000-8000-000000000004',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000004',
    '40500000-0000-4000-8000-000000000001',
    'Timestamp-only sentinel',
    1,
    1,
    40,
    80,
    null,
    'requested'
  ),
  (
    '40700000-0000-4000-8000-000000000006',
    '40600000-0000-4000-8000-000000000005',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000005',
    '40500000-0000-4000-8000-000000000001',
    'Stage-only sentinel',
    1,
    1,
    40,
    80,
    null,
    'requested'
  ),
  (
    '40700000-0000-4000-8000-000000000007',
    '40600000-0000-4000-8000-000000000006',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000007',
    '40500000-0000-4000-8000-000000000001',
    'Equal-sum sentinel A',
    1,
    1,
    20,
    30,
    null,
    'requested'
  ),
  (
    '40700000-0000-4000-8000-000000000008',
    '40600000-0000-4000-8000-000000000006',
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000007',
    '40500000-0000-4000-8000-000000000001',
    'Equal-sum sentinel B',
    1,
    1,
    30,
    50,
    null,
    'requested'
  );

-- Seed a legacy unit_cost-derived locked estimate while Parts still owns the
-- pricing step, then hand the estimate back to the advisor. The repair must
-- sanitize customer metadata without touching the locked decision totals.
select set_config('app.parts_lifecycle_reconciling', '1', true);

update public.work_order_quote_lines
set status = 'quoted',
    stage = 'ready_to_send',
    parts_total = 40,
    subtotal = 40,
    grand_total = 40,
    metadata = jsonb_build_object(
      'labor_rate', 0,
      'parts_quote', jsonb_build_object(
        'parts_total', 40,
        'items', jsonb_build_array(jsonb_build_object(
          'id', '40700000-0000-4000-8000-000000000004',
          'description', 'Locked estimate sentinel',
          'qty', 1,
          'unit_price', 40,
          'line_total', 40
        ))
      ),
      'parts', jsonb_build_array(jsonb_build_object(
        'description', 'Locked estimate sentinel',
        'qty', 1,
        'unitCost', 40,
        'unitPrice', 80
      ))
    )
where id = '40400000-0000-4000-8000-000000000003';

select set_config('app.parts_lifecycle_reconciling', '0', true);

update public.work_orders
set estimate_status = 'ready_for_advisor'
where id = '40300000-0000-4000-8000-000000000002';

update public.work_order_quote_lines q
set metadata = private.sanitize_quote_line_pricing_metadata(q.shop_id, q.id)
where q.id in (
  '40400000-0000-4000-8000-000000000002',
  '40400000-0000-4000-8000-000000000003',
  '40400000-0000-4000-8000-000000000004',
  '40400000-0000-4000-8000-000000000005',
  '40400000-0000-4000-8000-000000000006',
  '40400000-0000-4000-8000-000000000007',
  '40400000-0000-4000-8000-000000000008',
  '40400000-0000-4000-8000-000000000009',
  '40400000-0000-4000-8000-000000000010'
);

do $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_item jsonb;
  v_expected_status text;
  v_expected_stage text;
begin
  for v_line in
    select *
    from public.work_order_quote_lines
    where id in (
      '40400000-0000-4000-8000-000000000002',
      '40400000-0000-4000-8000-000000000003'
    )
  loop
    v_expected_status := case
      when v_line.id = '40400000-0000-4000-8000-000000000002'::uuid
        then 'sent'
      else 'quoted'
    end;
    v_expected_stage := case
      when v_line.id = '40400000-0000-4000-8000-000000000002'::uuid
        then 'sent'
      else 'ready_to_send'
    end;

    if v_line.parts_total is distinct from 40::numeric
       or v_line.subtotal is distinct from 40::numeric
       or v_line.grand_total is distinct from 40::numeric
       or v_line.status::text is distinct from v_expected_status
       or v_line.stage::text is distinct from v_expected_stage then
      raise exception
        'Protected/locked decision changed for %: parts %, subtotal %, grand %, state %/%',
        v_line.id, v_line.parts_total, v_line.subtotal, v_line.grand_total,
        v_line.status, v_line.stage;
    end if;

    select item.value
    into strict v_item
    from jsonb_array_elements(v_line.metadata -> 'parts_quote' -> 'items')
      as item(value)
    limit 1;

    if v_item -> 'unit_price' is distinct from 'null'::jsonb
       or v_item -> 'line_total' is distinct from 'null'::jsonb
       or (v_item ->> 'quote_ready')::boolean is not false
       or v_line.metadata -> 'parts_quote' -> 'parts_total'
          is distinct from 'null'::jsonb
       or (v_line.metadata -> 'parts_quote' ->> 'quoted_count')::integer <> 0
       or (v_line.metadata -> 'parts_quote' ->> 'pending_count')::integer <> 1 then
      raise exception 'Protected/locked mismatched customer pricing was not quarantined for %: %',
        v_line.id, v_line.metadata -> 'parts_quote';
    end if;
    if v_item ?| array[
      'unitCost', 'unit_cost', 'cost', 'defaultCost', 'default_cost',
      'acquisitionCost', 'acquisition_cost'
    ] then
      raise exception 'Protected/locked parts_quote still exposes cost for %: %',
        v_line.id, v_item;
    end if;
    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_line.metadata -> 'parts', '[]'::jsonb))
        as part(value)
      where part.value ?| array[
        'unitCost', 'unit_cost', 'cost', 'defaultCost', 'default_cost',
        'acquisitionCost', 'acquisition_cost'
      ]
    ) then
      raise exception 'Protected/locked technician metadata still exposes cost for %', v_line.id;
    end if;
    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_line.metadata -> 'parts', '[]'::jsonb))
        as part(value)
      where part.value ?| array[
        'unitPrice', 'unit_price', 'unitSellPrice', 'unit_sell_price',
        'price', 'lineTotal', 'line_total'
      ]
    ) then
      raise exception 'Protected/locked mismatched technician pricing was not quarantined for %',
        v_line.id;
    end if;
    if (v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
          ->> 'decision_totals_preserved')::boolean is not true
       or (v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
          ->> 'manual_review_required')::boolean is not true
       or (v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
          ->> 'customer_pricing_quarantined')::boolean is not true
       or v_line.metadata -> 'parts_quote' -> 'pricing_sanitization' ->> 'reason'
          is distinct from 'protected_decision_total_mismatch' then
      raise exception 'Protected/locked audit marker missing for %: %',
        v_line.id,
        v_line.metadata -> 'parts_quote' -> 'pricing_sanitization';
    end if;
  end loop;
end;
$$;

do $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_reason text;
begin
  for v_line in
    select *
    from public.work_order_quote_lines
    where id in (
      '40400000-0000-4000-8000-000000000004',
      '40400000-0000-4000-8000-000000000005',
      '40400000-0000-4000-8000-000000000008'
    )
    order by id
  loop
    if v_line.parts_total is distinct from 40::numeric
       or v_line.subtotal is distinct from 40::numeric
       or v_line.grand_total is distinct from 40::numeric then
      raise exception 'Timestamp/stage/converted-only protected totals changed for %', v_line.id;
    end if;
    if coalesce(
      v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
        ->> 'customer_pricing_quarantined',
      'false'
    ) <> 'true' then
      raise exception 'Timestamp/stage/converted-only handoff was not quarantined for %: %',
        v_line.id, v_line.metadata;
    end if;
  end loop;

  select * into strict v_line
  from public.work_order_quote_lines
  where id = '40400000-0000-4000-8000-000000000006';
  v_reason := v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
    ->> 'reason';
  if v_line.parts_total is distinct from 40::numeric
     or v_line.subtotal is distinct from 40::numeric
     or v_line.grand_total is distinct from 40::numeric
     or v_reason is distinct from 'protected_snapshot_without_canonical_items'
     or coalesce(
       v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
         ->> 'customer_pricing_quarantined',
       'false'
     ) <> 'true'
     or jsonb_array_length(v_line.metadata -> 'parts_quote' -> 'items') <> 0
     or v_line.metadata -> 'parts_quote' -> 'parts_total'
        is distinct from 'null'::jsonb then
    raise exception 'Snapshot-only protected pricing was not safely quarantined: %',
      v_line.metadata;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_line.metadata -> 'parts') part(value)
    where part.value ?| array[
      'unitCost', 'unit_cost', 'cost', 'defaultCost', 'default_cost',
      'acquisitionCost', 'acquisition_cost', 'unitPrice', 'unit_price',
      'unitSellPrice', 'unit_sell_price', 'price', 'lineTotal', 'line_total'
    ]
  ) then
    raise exception 'Snapshot-only protected detail still exposes pricing: %',
      v_line.metadata -> 'parts';
  end if;

  select * into strict v_line
  from public.work_order_quote_lines
  where id = '40400000-0000-4000-8000-000000000007';
  v_reason := v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
    ->> 'reason';
  if v_line.parts_total is distinct from 80::numeric
     or v_line.subtotal is distinct from 80::numeric
     or v_line.grand_total is distinct from 80::numeric
     or v_reason is distinct from 'protected_item_pricing_mismatch'
     or coalesce(
       v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
         ->> 'customer_pricing_quarantined',
       'false'
     ) <> 'true'
     or v_line.metadata -> 'parts_quote' -> 'parts_total'
        is distinct from 'null'::jsonb
     or exists (
       select 1
       from jsonb_array_elements(v_line.metadata -> 'parts_quote' -> 'items')
         item(value)
       where item.value -> 'unit_price' is distinct from 'null'::jsonb
          or item.value -> 'line_total' is distinct from 'null'::jsonb
          or coalesce((item.value ->> 'quote_ready')::boolean, true)
     ) then
    raise exception 'Equal-sum item drift did not quarantine finalized detail: %',
      v_line.metadata -> 'parts_quote';
  end if;
end;
$$;

do $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_item jsonb;
  v_sanitized jsonb;
  v_financial_guard_restored boolean := false;
begin
  select * into strict v_line
  from public.work_order_quote_lines
  where id = '40400000-0000-4000-8000-000000000009';
  v_item := v_line.metadata -> 'parts_quote' -> 'items' -> 0;
  if jsonb_typeof(v_item) is distinct from 'object'
     or v_item -> 'unit_price' is distinct from 'null'::jsonb
     or v_item -> 'line_total' is distinct from 'null'::jsonb
     or coalesce(
       v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
         ->> 'customer_pricing_quarantined',
       'false'
     ) <> 'true' then
    raise exception 'Scalar historical quote item did not sanitize safely: %',
      v_line.metadata;
  end if;

  select * into strict v_line
  from public.work_order_quote_lines
  where id = '40400000-0000-4000-8000-000000000010';
  if jsonb_typeof(v_line.metadata -> 'parts_quote') is distinct from 'object'
     or coalesce(
       v_line.metadata -> 'parts_quote' -> 'pricing_sanitization'
         ->> 'customer_pricing_quarantined',
       'false'
     ) <> 'true'
     or exists (
       select 1
       from jsonb_array_elements(v_line.metadata -> 'parts') part(value)
       where part.value ?| array[
         'unitCost', 'unit_cost', 'cost', 'defaultCost', 'default_cost',
         'acquisitionCost', 'acquisition_cost', 'unitPrice', 'unit_price',
         'unitSellPrice', 'unit_sell_price', 'price', 'lineTotal', 'line_total'
       ]
     ) then
    raise exception 'Non-object parts_quote did not normalize and quarantine: %',
      v_line.metadata;
  end if;

  v_sanitized := private.sanitize_quote_line_pricing_metadata(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000011'
  );
  if coalesce(
       v_sanitized -> 'parts_quote' -> 'pricing_sanitization'
         ->> 'customer_pricing_quarantined',
       'false'
     ) <> 'true'
     or v_sanitized -> 'parts_quote' -> 'items' -> 0 -> 'unit_price'
        is distinct from 'null'::jsonb
     or v_sanitized -> 'parts_quote' -> 'items' -> 0 ?| array[
       'unitCost', 'unit_cost', 'cost', 'defaultCost', 'default_cost',
       'acquisitionCost', 'acquisition_cost'
     ] then
    raise exception 'Financially locked quote was not handled as protected: %',
      v_sanitized;
  end if;

  begin
    update public.work_order_quote_lines
    set description = description || ' forbidden ordinary edit'
    where id = '40400000-0000-4000-8000-000000000011';
  exception when raise_exception then
    v_financial_guard_restored := sqlerrm = 'WORK_ORDER_FINANCIALLY_LOCKED';
  end;
  if not v_financial_guard_restored then
    raise exception 'Financial child guard was not restored after metadata backfill';
  end if;
end;
$$;

-- Database guards must stop direct send, decision/materialization, and estimate
-- reservation bypasses even when an application preflight is skipped.
do $$
declare
  v_blocked boolean;
  v_trusted_remediation_allowed boolean := false;
begin
  v_blocked := false;
  begin
    update public.work_order_quote_lines
    set status = 'sent', stage = 'sent', sent_at = now()
    where id = '40400000-0000-4000-8000-000000000004';
  exception when sqlstate '55000' then
    v_blocked := sqlerrm like 'QUOTE_PRICING_QUARANTINED:%';
  end;
  if not v_blocked then
    raise exception 'Direct quarantined quote send was not blocked';
  end if;

  v_blocked := false;
  begin
    perform public.apply_customer_quote_decision_engine_atomic(
      '40200000-0000-4000-8000-000000000001',
      '40300000-0000-4000-8000-000000000001',
      array['40400000-0000-4000-8000-000000000004'::uuid],
      'approve',
      false,
      '40800000-0000-4000-8000-000000000001',
      '40100000-0000-4000-8000-000000000001',
      'quote-cost-sell-quarantine-direct-decision',
      now()
    );
  exception when sqlstate '55000' then
    v_blocked := sqlerrm like 'QUOTE_PRICING_QUARANTINED:%';
  end;
  if not v_blocked then
    raise exception 'Direct quarantined quote decision/materialization was not blocked';
  end if;

  v_blocked := false;
  begin
    insert into public.work_order_lines (
      shop_id, work_order_id, description, job_type, status, line_status,
      approval_state, source_row_id
    ) values (
      '40200000-0000-4000-8000-000000000001',
      '40300000-0000-4000-8000-000000000001',
      'Forbidden direct quarantined materialization',
      'repair',
      'awaiting',
      'authorized',
      'approved',
      '40400000-0000-4000-8000-000000000004'
    );
  exception when sqlstate '55000' then
    v_blocked := sqlerrm like 'QUOTE_PRICING_QUARANTINED:%';
  end;
  if not v_blocked then
    raise exception 'Direct quarantined work-line materialization was not blocked';
  end if;

  v_blocked := false;
  begin
    insert into public.work_order_lines (
      shop_id, work_order_id, description, job_type, status, line_status,
      approval_state, external_id
    ) values (
      '40200000-0000-4000-8000-000000000001',
      '40300000-0000-4000-8000-000000000001',
      'Forbidden external-id quarantined materialization',
      'repair',
      'awaiting',
      'authorized',
      'approved',
      'quote_line:40400000-0000-4000-8000-000000000004'
    );
  exception when sqlstate '55000' then
    v_blocked := sqlerrm like 'QUOTE_PRICING_QUARANTINED:%';
  end;
  if not v_blocked then
    raise exception 'External-id quarantined work-line materialization was not blocked';
  end if;

  v_blocked := false;
  begin
    insert into public.estimate_events (
      id, shop_id, work_order_id, revision, event_type, actor_profile_id,
      snapshot, idempotency_key
    ) values (
      '40a00000-0000-4000-8000-000000000001',
      '40200000-0000-4000-8000-000000000001',
      '40300000-0000-4000-8000-000000000002',
      1,
      'send_reserved',
      '40100000-0000-4000-8000-000000000011',
      jsonb_build_object(
        'quote_line_ids', jsonb_build_array(
          '40400000-0000-4000-8000-000000000003'
        )
      ),
      'quote-cost-sell-quarantine-direct-reserve'
    );
  exception when sqlstate '55000' then
    v_blocked := sqlerrm like 'QUOTE_PRICING_QUARANTINED:%';
  end;
  if not v_blocked then
    raise exception 'Direct quarantined estimate reservation was not blocked';
  end if;

  begin
    update public.work_order_quote_lines
    set metadata = metadata #- array[
      'parts_quote', 'pricing_sanitization', 'customer_pricing_quarantined'
    ]::text[]
    where id = '40400000-0000-4000-8000-000000000005';
    v_trusted_remediation_allowed := true;
    raise exception using
      errcode = 'P0001',
      message = 'rollback trusted-remediation probe';
  exception when sqlstate 'P0001' then
    null;
  end;
  if not v_trusted_remediation_allowed then
    raise exception 'Trusted postgres remediation could not clear quarantine';
  end if;
  if coalesce((
    select metadata -> 'parts_quote' -> 'pricing_sanitization'
      ->> 'customer_pricing_quarantined'
    from public.work_order_quote_lines
    where id = '40400000-0000-4000-8000-000000000005'
  ), 'false') <> 'true' then
    raise exception 'Trusted remediation rollback did not preserve fixture quarantine';
  end if;
end;
$$;

-- A postgres-owned SECURITY DEFINER writer models legacy atomic RPCs such as
-- complete_estimate_parts_quote_atomic. The trigger must inspect the JWT actor,
-- not mistake the function owner's current_user for trusted remediation.
create function public.quote_cost_sell_runtime_definer_clear_probe(
  p_quote_line_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.work_order_quote_lines
  set metadata = metadata #- array[
    'parts_quote', 'pricing_sanitization', 'customer_pricing_quarantined'
  ]::text[]
  where id = p_quote_line_id;
$$;
revoke all on function public.quote_cost_sell_runtime_definer_clear_probe(uuid)
  from public, anon;
grant execute on function public.quote_cost_sell_runtime_definer_clear_probe(uuid)
  to authenticated;

-- The trusted worker path sees the handed-off estimate and must preserve its
-- locked commercial decision without attempting a resync.
do $$
declare
  v_result jsonb;
begin
  v_result := public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000003'
  );
  if v_result ->> 'skipped' is distinct from 'locked_estimate_pricing' then
    raise exception 'Locked estimate unexpectedly accepted a commercial resync: %',
      v_result;
  end if;
end;
$$;

-- An authenticated Shop A owner may invoke the canonical sell sync for an
-- editable line. Restrictive estimate UPDATE RLS must hide the handed-off
-- estimate from this SECURITY INVOKER function, while customer-handed-off
-- ordinary lines remain protected by their durable lifecycle state.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  v_result jsonb;
  v_locked_before jsonb;
  v_locked_after jsonb;
  v_clear_blocked boolean := false;
  v_definer_clear_blocked boolean := false;
begin
  begin
    update public.work_order_quote_lines
    set metadata = metadata #- array[
      'parts_quote', 'pricing_sanitization', 'customer_pricing_quarantined'
    ]::text[]
    where id = '40400000-0000-4000-8000-000000000004';
  exception when insufficient_privilege then
    v_clear_blocked := sqlerrm like 'QUOTE_PRICING_QUARANTINED:%';
  end;
  if not v_clear_blocked then
    raise exception 'Same-shop authenticated actor cleared quote pricing quarantine';
  end if;

  begin
    perform public.quote_cost_sell_runtime_definer_clear_probe(
      '40400000-0000-4000-8000-000000000004'
    );
  exception when insufficient_privilege then
    v_definer_clear_blocked :=
      sqlerrm like 'QUOTE_PRICING_QUARANTINED:%';
  end;
  if not v_definer_clear_blocked then
    raise exception 'Authenticated SECURITY DEFINER writer cleared quote pricing quarantine';
  end if;

  v_result := public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000001'
  );
  if (v_result ->> 'ok')::boolean is not true
     or v_result ->> 'status' is distinct from 'pending_parts'
     or (v_result ->> 'pendingCount')::integer <> 1
     or (v_result ->> 'partsTotal')::numeric <> 80::numeric then
    raise exception 'Own-shop canonical pricing sync failed: %', v_result;
  end if;

  v_result := public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000002'
  );
  if v_result ->> 'skipped' is distinct from 'protected_quote_line_state' then
    raise exception 'Sent quote was not protected from resync: %', v_result;
  end if;

  select to_jsonb(q)
    into strict v_locked_before
  from public.work_order_quote_lines q
  where q.id = '40400000-0000-4000-8000-000000000003';

  v_result := public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000003'
  );
  if coalesce((v_result ->> 'ok')::boolean, true)
     or v_result ->> 'error' is distinct from 'Quote line not found for shop' then
    raise exception 'Authenticated actor bypassed locked-estimate UPDATE RLS: %',
      v_result;
  end if;

  select to_jsonb(q)
    into strict v_locked_after
  from public.work_order_quote_lines q
  where q.id = '40400000-0000-4000-8000-000000000003';
  if v_locked_after is distinct from v_locked_before then
    raise exception 'Authenticated locked-estimate sync attempt mutated pricing';
  end if;

  v_result := public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000004'
  );
  if v_result ->> 'skipped' is distinct from 'protected_quote_line_state' then
    raise exception 'Timestamp-only customer handoff was not protected: %', v_result;
  end if;

  v_result := public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000005'
  );
  if v_result ->> 'skipped' is distinct from 'protected_quote_line_state' then
    raise exception 'Stage-only customer handoff was not protected: %', v_result;
  end if;

  v_result := public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000008'
  );
  if v_result ->> 'skipped' is distinct from 'protected_quote_line_state' then
    raise exception 'Converted-at-only customer handoff was not protected: %', v_result;
  end if;
end;
$$;

reset role;

create temporary table quote_cost_sell_guard_snapshot on commit drop as
select id, metadata, parts_total, subtotal, grand_total, status, stage
from public.work_order_quote_lines
where id = '40400000-0000-4000-8000-000000000001';

-- A different-shop staff profile and a portal-only customer are both denied
-- before the invoker function can read or mutate tenant-private request data.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  v_denied boolean := false;
  v_result jsonb;
begin
  begin
    v_result := public.sync_quote_line_pricing_from_parts(
      '40200000-0000-4000-8000-000000000001',
      '40400000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied and coalesce((v_result ->> 'ok')::boolean, true) then
    raise exception 'Cross-shop staff unexpectedly invoked Quote Review pricing sync: %',
      v_result;
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"40100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $$
declare
  v_denied boolean := false;
  v_result jsonb;
begin
  begin
    v_result := public.sync_quote_line_pricing_from_parts(
      '40200000-0000-4000-8000-000000000001',
      '40400000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied and coalesce((v_result ->> 'ok')::boolean, true) then
    raise exception 'Portal customer unexpectedly invoked Quote Review pricing sync: %',
      v_result;
  end if;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.work_order_quote_lines q
    join quote_cost_sell_guard_snapshot snapshot using (id)
    where q.metadata is distinct from snapshot.metadata
       or q.parts_total is distinct from snapshot.parts_total
       or q.subtotal is distinct from snapshot.subtotal
       or q.grand_total is distinct from snapshot.grand_total
       or q.status is distinct from snapshot.status
       or q.stage is distinct from snapshot.stage
  ) then
    raise exception 'Denied cross-shop/portal invocations mutated the target quote line';
  end if;
end;
$$;

do $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_explicit jsonb;
  v_cost_only jsonb;
begin
  select *
  into strict v_line
  from public.work_order_quote_lines
  where id = '40400000-0000-4000-8000-000000000001';

  select item.value
  into strict v_explicit
  from jsonb_array_elements(v_line.metadata -> 'parts_quote' -> 'items')
    as item(value)
  where item.value ->> 'id' = '40700000-0000-4000-8000-000000000001';

  select item.value
  into strict v_cost_only
  from jsonb_array_elements(v_line.metadata -> 'parts_quote' -> 'items')
    as item(value)
  where item.value ->> 'id' = '40700000-0000-4000-8000-000000000002';

  if v_line.parts_total is distinct from 80::numeric then
    raise exception 'Runtime assertion failed: expected sell total 80, got %.',
      v_line.parts_total;
  end if;
  if (v_line.metadata -> 'parts_quote' ->> 'quoted_count')::integer <> 1
     or (v_line.metadata -> 'parts_quote' ->> 'pending_count')::integer <> 1 then
    raise exception 'Runtime assertion failed: explicit and cost-only readiness were collapsed: %.',
      v_line.metadata -> 'parts_quote';
  end if;
  if v_line.status <> 'pending_parts' or v_line.stage <> 'advisor_pending' then
    raise exception 'Runtime assertion failed: cost-only item made quote ready: %/%',
      v_line.status, v_line.stage;
  end if;

  if (v_explicit ->> 'unit_price')::numeric <> 80::numeric
     or (v_explicit ->> 'line_total')::numeric <> 80::numeric
     or (v_explicit ->> 'quote_ready')::boolean is not true then
    raise exception 'Runtime assertion failed: explicit $80 sell was not retained: %.',
      v_explicit;
  end if;
  if v_explicit ?| array['unit_cost', 'unitCost', 'cost', 'default_cost'] then
    raise exception 'Runtime assertion failed: acquisition cost leaked into quote metadata: %.',
      v_explicit;
  end if;

  if v_cost_only -> 'unit_price' is distinct from 'null'::jsonb
     or v_cost_only -> 'line_total' is distinct from 'null'::jsonb
     or (v_cost_only ->> 'quote_ready')::boolean is not false then
    raise exception 'Runtime assertion failed: $40 acquisition cost became customer sell: %.',
      v_cost_only;
  end if;
  if v_cost_only ?| array['unit_cost', 'unitCost', 'cost', 'default_cost'] then
    raise exception 'Runtime assertion failed: cost-only acquisition leaked into quote metadata: %.',
      v_cost_only;
  end if;
end;
$$;

-- A trusted, service-role-only remediation restores exact customer sell detail
-- without changing the protected decision totals or lifecycle state.
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

do $$
declare
  v_before public.work_order_quote_lines%rowtype;
  v_after public.work_order_quote_lines%rowtype;
  v_result jsonb;
  v_replay jsonb;
  v_conflict boolean := false;
begin
  select *
    into strict v_before
  from public.work_order_quote_lines
  where id = '40400000-0000-4000-8000-000000000002';

  v_result := public.remediate_quote_line_pricing_quarantine(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000002',
    '40100000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'id', '40700000-0000-4000-8000-000000000003',
      'description', 'Protected sent sentinel',
      'qty', 1,
      'unit_price', 40
    )),
    'quote-cost-sell-remediation-1',
    'Runtime verified finalized customer pricing'
  );

  select *
    into strict v_after
  from public.work_order_quote_lines
  where id = '40400000-0000-4000-8000-000000000002';

  if coalesce((v_result ->> 'ok')::boolean, false) is not true
     or coalesce((v_result ->> 'idempotent')::boolean, true) is not false then
    raise exception 'Pricing remediation did not return a first-write result: %',
      v_result;
  end if;
  if v_after.parts_total is distinct from v_before.parts_total
     or v_after.subtotal is distinct from v_before.subtotal
     or v_after.grand_total is distinct from v_before.grand_total
     or v_after.status is distinct from v_before.status
     or v_after.stage is distinct from v_before.stage
     or v_after.sent_to_customer_at is distinct from v_before.sent_to_customer_at then
    raise exception 'Pricing remediation changed durable decision state or totals';
  end if;
  if coalesce(
    (v_after.metadata -> 'parts_quote' -> 'pricing_sanitization'
      ->> 'customer_pricing_quarantined')::boolean,
    true
  ) is not false
     or coalesce(
       (v_after.metadata -> 'parts_quote' -> 'pricing_sanitization'
         ->> 'customer_pricing_remediated')::boolean,
       false
     ) is not true then
    raise exception 'Pricing remediation did not clear and audit quarantine: %',
      v_after.metadata -> 'parts_quote' -> 'pricing_sanitization';
  end if;
  if (v_after.metadata -> 'parts_quote' -> 'items' -> 0 ->> 'unit_price')::numeric
       is distinct from 40::numeric
     or (v_after.metadata -> 'parts_quote' -> 'items' -> 0 ->> 'line_total')::numeric
       is distinct from 40::numeric then
    raise exception 'Pricing remediation did not restore exact customer sell detail: %',
      v_after.metadata -> 'parts_quote' -> 'items';
  end if;
  if (v_after.metadata -> 'parts' -> 0) ?| array[
    'unit_cost', 'unitCost', 'cost', 'default_cost',
    'unit_price', 'unitPrice', 'price', 'line_total'
  ] then
    raise exception 'Pricing remediation leaked commercial values to legacy snapshots: %',
      v_after.metadata -> 'parts';
  end if;
  if not exists (
    select 1
    from public.operational_events event
    where event.shop_id = '40200000-0000-4000-8000-000000000001'
      and event.event_type = 'quote.pricing_quarantine.remediated'
      and event.entity_id = '40400000-0000-4000-8000-000000000002'
      and event.idempotency_key =
        'quote-pricing-remediation:quote-cost-sell-remediation-1'
  ) then
    raise exception 'Pricing remediation audit event is missing';
  end if;

  v_replay := public.remediate_quote_line_pricing_quarantine(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000002',
    '40100000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'id', '40700000-0000-4000-8000-000000000003',
      'description', 'Protected sent sentinel',
      'qty', 1,
      'unit_price', 40
    )),
    'quote-cost-sell-remediation-1',
    'Runtime verified finalized customer pricing'
  );
  if coalesce((v_replay ->> 'idempotent')::boolean, false) is not true then
    raise exception 'Pricing remediation exact replay was not idempotent: %',
      v_replay;
  end if;

  begin
    perform public.remediate_quote_line_pricing_quarantine(
      '40200000-0000-4000-8000-000000000001',
      '40400000-0000-4000-8000-000000000002',
      '40100000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'description', 'Changed replay',
        'qty', 1,
        'unit_price', 40
      )),
      'quote-cost-sell-remediation-1',
      'Runtime verified finalized customer pricing'
    );
  exception when invalid_parameter_value then
    if sqlerrm not like '%QUOTE_PRICING_REMEDIATION_IDEMPOTENCY_CONFLICT%' then
      raise;
    end if;
    v_conflict := true;
  end;
  if not v_conflict then
    raise exception 'Changed pricing remediation replay did not conflict';
  end if;
end;
$$;

-- PFX-005/PFX-010: manual/vendor identity must advance through the same stage
-- contract, and customer delivery must reject any snapshot/total drift.
update public.part_request_items
set part_id = null,
    requested_part_number = 'MANUAL-COST-ONLY',
    quoted_price = 40,
    unit_price = 40
where id = '40700000-0000-4000-8000-000000000002';

do $$
declare
  v_stage text;
  v_result jsonb;
  v_mismatch_blocked boolean := false;
begin
  v_result := public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000001'
  );
  if (v_result ->> 'requiredCount')::integer <> 2
     or (v_result ->> 'quotedCount')::integer <> 2
     or (v_result ->> 'pendingCount')::integer <> 0
     or (v_result ->> 'partsTotal')::numeric <> 120::numeric then
    raise exception 'Canonical quoted-parts totals did not converge: %', v_result;
  end if;

  v_stage := public.parts_request_operational_stage(
    '40600000-0000-4000-8000-000000000001'
  );
  if v_stage is distinct from 'awaiting_approval' then
    raise exception 'Manual/vendor quoted request used a divergent stage: %', v_stage;
  end if;

  update public.part_request_items
  set status = 'ordered', qty_ordered = qty
  where id = '40700000-0000-4000-8000-000000000001';
  update public.part_requests
  set status = 'requested'
  where id = '40600000-0000-4000-8000-000000000001';
  v_stage := public.parts_request_operational_stage(
    '40600000-0000-4000-8000-000000000001'
  );
  if v_stage is distinct from 'order_receive' then
    raise exception 'Stale parent status overrode durable ordering progress: %', v_stage;
  end if;
  update public.part_request_items
  set status = 'quoted', qty_ordered = 0
  where id = '40700000-0000-4000-8000-000000000001';
  update public.part_requests
  set status = 'quoted'
  where id = '40600000-0000-4000-8000-000000000001';

  perform public.assert_quote_parts_publishable(
    '40200000-0000-4000-8000-000000000001',
    '40300000-0000-4000-8000-000000000001',
    array['40400000-0000-4000-8000-000000000001'::uuid]
  );

  update public.work_order_quote_lines
  set metadata = jsonb_set(
    metadata,
    '{parts_quote,parts_total}',
    '999'::jsonb,
    false
  )
  where id = '40400000-0000-4000-8000-000000000001';

  begin
    perform public.assert_quote_parts_publishable(
      '40200000-0000-4000-8000-000000000001',
      '40300000-0000-4000-8000-000000000001',
      array['40400000-0000-4000-8000-000000000001'::uuid]
    );
  exception when others then
    if sqlerrm not like '%QUOTE_PARTS_CONTRACT_MISMATCH%' then
      raise;
    end if;
    v_mismatch_blocked := true;
  end;
  if not v_mismatch_blocked then
    raise exception 'Quote publish guard accepted a mismatched parts snapshot';
  end if;

  perform public.sync_quote_line_pricing_from_parts(
    '40200000-0000-4000-8000-000000000001',
    '40400000-0000-4000-8000-000000000001'
  );
end;
$$;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.sync_quote_line_pricing_from_parts(uuid,uuid)',
    'execute'
  ) then
    raise exception 'Anon unexpectedly has Quote Review pricing sync execute privilege';
  end if;
  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where p.oid =
      'public.sync_quote_line_pricing_from_parts(uuid,uuid)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC unexpectedly has Quote Review pricing sync execute privilege';
  end if;
  if has_function_privilege(
    'service_role',
    'private.sanitize_quote_line_pricing_metadata(uuid,uuid)',
    'execute'
  ) then
    raise exception 'Service role unexpectedly has direct private sanitizer access';
  end if;
  if has_function_privilege(
    'anon',
    'public.remediate_quote_line_pricing_quarantine(uuid,uuid,uuid,jsonb,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.remediate_quote_line_pricing_quarantine(uuid,uuid,uuid,jsonb,text,text)',
    'execute'
  ) then
    raise exception 'Untrusted role can execute quote pricing remediation';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.remediate_quote_line_pricing_quarantine(uuid,uuid,uuid,jsonb,text,text)',
    'execute'
  ) then
    raise exception 'Service role cannot execute quote pricing remediation';
  end if;
  if has_function_privilege(
    'anon',
    'public.assert_quote_parts_publishable(uuid,uuid,uuid[])',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.assert_quote_parts_publishable(uuid,uuid,uuid[])',
    'execute'
  ) then
    raise exception 'Untrusted role can execute the quote publish guard';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.assert_quote_parts_publishable(uuid,uuid,uuid[])',
    'execute'
  ) then
    raise exception 'Service role cannot execute the quote publish guard';
  end if;
end;
$$;

rollback;
