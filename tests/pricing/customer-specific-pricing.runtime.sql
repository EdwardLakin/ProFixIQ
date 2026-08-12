\set ON_ERROR_STOP on

-- @regression-flow pricing.customer-specific
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '51100000-0000-4000-8000-000000000001',
    'pricing-owner-a@example.com',
    '{"full_name":"Pricing Owner A"}'::jsonb
  ),
  (
    '51100000-0000-4000-8000-000000000002',
    'pricing-owner-b@example.com',
    '{"full_name":"Pricing Owner B"}'::jsonb
  ),
  (
    '51100000-0000-4000-8000-000000000011',
    'pricing-owner-a-profile@example.com',
    '{"full_name":"Pricing Owner A Profile"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '51100000-0000-4000-8000-000000000011',
    '51100000-0000-4000-8000-000000000001',
    'owner',
    'Pricing Owner A'
  ),
  (
    '51100000-0000-4000-8000-000000000002',
    '51100000-0000-4000-8000-000000000002',
    'owner',
    'Pricing Owner B'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

update public.profiles
set user_id = '51100000-0000-4000-8000-000000000001'
where id = '51100000-0000-4000-8000-000000000011';

insert into public.shops (id, owner_id, business_name, name, labor_rate, country)
values
  (
    '51200000-0000-4000-8000-000000000001',
    '51100000-0000-4000-8000-000000000011',
    'Customer Pricing Shop A',
    'Customer Pricing Shop A',
    150,
    'CA'
  ),
  (
    '51200000-0000-4000-8000-000000000002',
    '51100000-0000-4000-8000-000000000002',
    'Customer Pricing Shop B',
    'Customer Pricing Shop B',
    160,
    'CA'
  );

update public.profiles
set shop_id = case id
  when '51100000-0000-4000-8000-000000000011'::uuid
    then '51200000-0000-4000-8000-000000000001'::uuid
  else '51200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '51100000-0000-4000-8000-000000000011',
  '51100000-0000-4000-8000-000000000002'
);

insert into public.customers (
  id,
  shop_id,
  name,
  business_name,
  account_type,
  active
) values (
  '51300000-0000-4000-8000-000000000001',
  '51200000-0000-4000-8000-000000000001',
  'Northside Transport',
  'Northside Transport',
  'business',
  true
);

insert into public.work_orders (
  id,
  shop_id,
  customer_id,
  status,
  type,
  record_type
) values (
  '51400000-0000-4000-8000-000000000001',
  '51200000-0000-4000-8000-000000000001',
  '51300000-0000-4000-8000-000000000001',
  'in_progress',
  'repair',
  'work_order'
);

insert into public.work_order_quote_lines (
  id,
  shop_id,
  work_order_id,
  description,
  job_type,
  status,
  stage,
  labor_hours,
  est_labor_hours,
  labor_rate,
  labor_total,
  parts_total,
  subtotal,
  grand_total,
  metadata
) values (
  '51500000-0000-4000-8000-000000000001',
  '51200000-0000-4000-8000-000000000001',
  '51400000-0000-4000-8000-000000000001',
  'Customer pricing runtime repair',
  'repair',
  'quoted',
  'ready_to_send',
  2,
  2,
  150,
  300,
  200,
  500,
  500,
  jsonb_build_object('labor_rate', 150)
);

insert into public.parts (
  id,
  shop_id,
  name,
  part_number,
  sku,
  cost,
  price
) values (
  '51600000-0000-4000-8000-000000000001',
  '51200000-0000-4000-8000-000000000001',
  'Pricing runtime part',
  'PRICE-RUNTIME',
  'PRICE-RUNTIME',
  100,
  200
);

insert into public.part_requests (
  id,
  shop_id,
  work_order_id,
  quote_line_id,
  requested_by,
  status
) values (
  '51700000-0000-4000-8000-000000000001',
  '51200000-0000-4000-8000-000000000001',
  '51400000-0000-4000-8000-000000000001',
  '51500000-0000-4000-8000-000000000001',
  '51100000-0000-4000-8000-000000000001',
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
) values (
  '51800000-0000-4000-8000-000000000001',
  '51700000-0000-4000-8000-000000000001',
  '51200000-0000-4000-8000-000000000001',
  '51400000-0000-4000-8000-000000000001',
  '51500000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000001',
  'Pricing runtime part',
  1,
  1,
  100,
  200,
  200,
  'requested'
);

select public.create_customer_pricing_agreement_atomic(
  '51200000-0000-4000-8000-000000000001',
  '51300000-0000-4000-8000-000000000001',
  'customer_specific',
  'Preferred customer rate',
  'CAD',
  130,
  0,
  5,
  current_date,
  null,
  'Approved preferred customer terms',
  null,
  'pricing-runtime-customer-rate',
  '51100000-0000-4000-8000-000000000001',
  now()
);

select public.create_customer_pricing_agreement_atomic(
  '51200000-0000-4000-8000-000000000001',
  '51300000-0000-4000-8000-000000000001',
  'customer_contract',
  'Northside volume contract',
  'CAD',
  110,
  0,
  10,
  current_date,
  null,
  'Signed annual volume agreement',
  null,
  'pricing-runtime-contract',
  '51100000-0000-4000-8000-000000000001',
  now()
);

select public.apply_customer_pricing_to_quote_atomic(
  '51200000-0000-4000-8000-000000000001',
  '51400000-0000-4000-8000-000000000001',
  array['51500000-0000-4000-8000-000000000001'::uuid],
  '51100000-0000-4000-8000-000000000001',
  now()
);

do $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_item public.part_request_items%rowtype;
  v_snapshot public.pricing_resolution_snapshots%rowtype;
begin
  select * into strict v_line
  from public.work_order_quote_lines
  where id = '51500000-0000-4000-8000-000000000001';

  select * into strict v_item
  from public.part_request_items
  where id = '51800000-0000-4000-8000-000000000001';

  select * into strict v_snapshot
  from public.pricing_resolution_snapshots
  where id = v_line.customer_pricing_snapshot_id;

  if v_line.labor_rate is distinct from 110::numeric
     or v_line.labor_total is distinct from 220::numeric
     or v_line.parts_total is distinct from 180::numeric
     or v_line.subtotal is distinct from 400::numeric
     or v_line.grand_total is distinct from 400::numeric then
    raise exception 'Contract pricing did not resolve expected quote totals: %', row_to_json(v_line);
  end if;
  if v_item.unit_cost is distinct from 100::numeric
     or v_item.unit_price is distinct from 180::numeric
     or v_item.quoted_price is distinct from 180::numeric then
    raise exception 'Parts sell discount changed acquisition cost or missed sell fields: %', row_to_json(v_item);
  end if;
  if v_snapshot.source_type is distinct from 'customer_contract'
     or v_snapshot.precedence_rank is distinct from 800
     or v_snapshot.base_labor_rate is distinct from 150::numeric
     or v_snapshot.resolved_labor_rate is distinct from 110::numeric
     or v_snapshot.base_parts_total is distinct from 200::numeric
     or v_snapshot.resolved_parts_total is distinct from 180::numeric then
    raise exception 'Pricing provenance snapshot is incorrect: %', row_to_json(v_snapshot);
  end if;
end;
$$;

-- A replay must not compound discounts or manufacture duplicate history.
select public.apply_customer_pricing_to_quote_atomic(
  '51200000-0000-4000-8000-000000000001',
  '51400000-0000-4000-8000-000000000001',
  array['51500000-0000-4000-8000-000000000001'::uuid],
  '51100000-0000-4000-8000-000000000001',
  now()
);

do $$
begin
  if (
    select count(*)
    from public.pricing_resolution_snapshots
    where quote_line_id = '51500000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Idempotent pricing replay created duplicate snapshots.';
  end if;
  if (
    select quoted_price
    from public.part_request_items
    where id = '51800000-0000-4000-8000-000000000001'
  ) is distinct from 180::numeric then
    raise exception 'Idempotent pricing replay compounded the parts discount.';
  end if;
end;
$$;

select public.retire_customer_pricing_agreement_atomic(
  '51200000-0000-4000-8000-000000000001',
  (
    select id
    from public.customer_pricing_agreements
    where customer_id = '51300000-0000-4000-8000-000000000001'
      and source_type = 'customer_contract'
  ),
  '51100000-0000-4000-8000-000000000001',
  'Annual contract ended',
  now()
);

select public.apply_customer_pricing_to_quote_atomic(
  '51200000-0000-4000-8000-000000000001',
  '51400000-0000-4000-8000-000000000001',
  array['51500000-0000-4000-8000-000000000001'::uuid],
  '51100000-0000-4000-8000-000000000001',
  now()
);

do $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_snapshot public.pricing_resolution_snapshots%rowtype;
begin
  select * into strict v_line
  from public.work_order_quote_lines
  where id = '51500000-0000-4000-8000-000000000001';
  select * into strict v_snapshot
  from public.pricing_resolution_snapshots
  where id = v_line.customer_pricing_snapshot_id;

  if v_line.labor_rate is distinct from 130::numeric
     or v_line.parts_total is distinct from 190::numeric
     or v_snapshot.source_type is distinct from 'customer_specific'
     or v_snapshot.base_labor_rate is distinct from 150::numeric
     or v_snapshot.base_parts_total is distinct from 200::numeric then
    raise exception 'Contract retirement did not fall back to the un-compounded customer rate.';
  end if;
end;
$$;

-- Cross-shop staff cannot create or apply Shop A pricing.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  v_denied boolean := false;
begin
  begin
    perform public.create_customer_pricing_agreement_atomic(
      '51200000-0000-4000-8000-000000000001',
      '51300000-0000-4000-8000-000000000001',
      'customer_specific',
      'Cross-shop probe',
      'CAD',
      50,
      0,
      0,
      current_date,
      null,
      'Cross-shop probe should fail',
      null,
      'pricing-runtime-cross-shop',
      '51100000-0000-4000-8000-000000000002',
      now()
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Cross-shop actor created a customer pricing agreement.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

-- Agreement and resolution history are append-only even for privileged SQL.
do $$
declare
  v_snapshot_id uuid;
  v_agreement_id uuid;
  v_snapshot_blocked boolean := false;
  v_agreement_blocked boolean := false;
begin
  select id into strict v_snapshot_id
  from public.pricing_resolution_snapshots
  where quote_line_id = '51500000-0000-4000-8000-000000000001'
  order by resolved_at
  limit 1;

  select id into strict v_agreement_id
  from public.customer_pricing_agreements
  where customer_id = '51300000-0000-4000-8000-000000000001'
    and source_type = 'customer_contract';

  begin
    update public.pricing_resolution_snapshots
    set resolved_labor_rate = 1
    where id = v_snapshot_id;
  exception when object_not_in_prerequisite_state then
    v_snapshot_blocked := true;
  end;

  begin
    delete from public.customer_pricing_agreements
    where id = v_agreement_id;
  exception when object_not_in_prerequisite_state then
    v_agreement_blocked := true;
  end;

  if not v_snapshot_blocked or not v_agreement_blocked then
    raise exception 'Customer pricing history was not immutable.';
  end if;
end;
$$;

rollback;
