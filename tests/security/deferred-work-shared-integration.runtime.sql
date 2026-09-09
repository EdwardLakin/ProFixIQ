\set ON_ERROR_STOP on

-- @regression-flow work-orders.deferred-carry-forward
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('73100000-0000-4000-8000-000000000001', 'deferred-owner@example.com', '{"full_name":"Deferred Owner"}'::jsonb),
  ('73100000-0000-4000-8000-000000000002', 'deferred-tech@example.com', '{"full_name":"Deferred Tech"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('73100000-0000-4000-8000-000000000001', '73100000-0000-4000-8000-000000000001', 'owner', 'Deferred Owner'),
  ('73100000-0000-4000-8000-000000000002', '73100000-0000-4000-8000-000000000002', 'mechanic', 'Deferred Tech')
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values (
  '73200000-0000-4000-8000-000000000001',
  '73100000-0000-4000-8000-000000000001',
  'Deferred Integration Shop',
  'Deferred Integration Shop'
);

update public.profiles
set shop_id = '73200000-0000-4000-8000-000000000001'
where id in (
  '73100000-0000-4000-8000-000000000001',
  '73100000-0000-4000-8000-000000000002'
);

insert into public.vehicles (
  id, shop_id, unit_number, vin, year, make, model
)
values
  (
    '73300000-0000-4000-8000-000000000001',
    '73200000-0000-4000-8000-000000000001',
    'DEF-01', '1DEFERRED00000001', 2022, 'Ford', 'F-550'
  ),
  (
    '73300000-0000-4000-8000-000000000002',
    '73200000-0000-4000-8000-000000000001',
    'DEF-02', '1DEFERRED00000002', 2021, 'Freightliner', 'M2'
  );

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values
  (
    '73400000-0000-4000-8000-000000000001',
    '73200000-0000-4000-8000-000000000001',
    'DEF-SOURCE-1',
    '73300000-0000-4000-8000-000000000001',
    'in_progress', 'work_order',
    '73100000-0000-4000-8000-000000000001'
  ),
  (
    '73400000-0000-4000-8000-000000000002',
    '73200000-0000-4000-8000-000000000001',
    'DEF-SOURCE-2',
    '73300000-0000-4000-8000-000000000002',
    'in_progress', 'work_order',
    '73100000-0000-4000-8000-000000000001'
  );

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  approval_state, job_type, complaint, description, notes, user_id
)
values
  (
    '73500000-0000-4000-8000-000000000001',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000001',
    '73300000-0000-4000-8000-000000000001',
    'job', 'on_hold', 'declined', 'repair',
    'Front lower ball joint play', 'Replace front lower ball joints',
    'Previous technician measured excessive play.',
    '73100000-0000-4000-8000-000000000002'
  ),
  (
    '73500000-0000-4000-8000-000000000002',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000002',
    '73300000-0000-4000-8000-000000000002',
    'job', 'on_hold', 'declined', 'repair',
    'Rear brake shoes worn', 'Replace rear brake shoes',
    'Previous technician found shoes near limit.',
    '73100000-0000-4000-8000-000000000002'
  );

-- Deliberately leave source_work_order_line_id null. The shared provenance
-- normalizer must promote the established metadata key into the canonical
-- column for inspection-origin recommendations.
insert into public.work_order_quote_lines (
  id, shop_id, work_order_id, work_order_line_id,
  source_work_order_line_id, vehicle_id, title, description,
  line_type, job_type, status, stage, decision,
  labor_hours, est_labor_hours, labor_rate, labor_total, parts_total,
  subtotal, discount_total, tax_total, grand_total, metadata,
  declined_at, created_at, updated_at
)
values
  (
    '73600000-0000-4000-8000-000000000001',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000001',
    null, null,
    '73300000-0000-4000-8000-000000000001',
    'Front lower ball joints', 'Replace front lower ball joints',
    'job', 'repair', 'declined', 'customer_declined', 'declined',
    2.0, 2.0, 150.00, 300.00, 700.00,
    1000.00, 0, 50.00, 1050.00,
    '{"source":"inspection","source_work_order_line_id":"73500000-0000-4000-8000-000000000001"}'::jsonb,
    '2026-08-01T18:00:00Z', '2026-08-01T17:00:00Z', '2026-08-01T18:00:00Z'
  ),
  (
    '73600000-0000-4000-8000-000000000002',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000002',
    null, null,
    '73300000-0000-4000-8000-000000000002',
    'Rear brake shoes', 'Replace rear brake shoes',
    'job', 'repair', 'deferred', 'customer_deferred', 'deferred',
    3.0, 3.0, 150.00, 450.00, 550.00,
    1000.00, 0, 50.00, 1050.00,
    '{"source":"inspection","source_work_order_line_id":"73500000-0000-4000-8000-000000000002"}'::jsonb,
    null, '2026-08-02T17:00:00Z', '2026-08-02T18:00:00Z'
  );

-- The second row represents a true deferral date rather than a decline date.
update public.work_order_quote_lines
set deferred_at = '2026-08-02T18:00:00Z'
where id = '73600000-0000-4000-8000-000000000002';

do $deferred_contract$
declare
  v_carried_line_id uuid;
  v_count integer;
begin
  if exists (
    select 1
    from public.work_order_quote_lines quote_line
    where quote_line.id = '73600000-0000-4000-8000-000000000001'
      and quote_line.source_work_order_line_id is distinct from
          '73500000-0000-4000-8000-000000000001'::uuid
  ) or exists (
    select 1
    from public.work_order_quote_lines quote_line
    where quote_line.id = '73600000-0000-4000-8000-000000000002'
      and quote_line.source_work_order_line_id is distinct from
          '73500000-0000-4000-8000-000000000002'::uuid
  ) then
    raise exception 'Metadata-only inspection provenance was not normalized.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.carry_forward_deferred_work_for_work_order()',
    'EXECUTE'
  ) then
    raise exception 'Authenticated can execute the private carry-forward trigger function.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.normalize_quote_line_source_work_order_line()',
    'EXECUTE'
  ) then
    raise exception 'Authenticated can execute the private provenance normalizer.';
  end if;
end;
$deferred_contract$;

-- Make auth.uid() resolve to the current advisor for carried-line attribution.
select set_config(
  'request.jwt.claim.sub',
  '73100000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Quote-only portal placeholders must not receive technical carry-forward rows.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, external_id, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000010',
  '73200000-0000-4000-8000-000000000001',
  'DEF-PORTAL-1',
  '73300000-0000-4000-8000-000000000001',
  'new', 'work_order', 'portal_quote:runtime-1',
  '73100000-0000-4000-8000-000000000001'
);

-- Historical imports are archival and must not receive carry-forward rows.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000011',
  '73200000-0000-4000-8000-000000000001',
  'DEF-HIST-1',
  '73300000-0000-4000-8000-000000000001',
  'completed', 'work_order', 'historical_import',
  '73100000-0000-4000-8000-000000000001'
);

do $placeholder_guards$
begin
  if exists (
    select 1 from public.work_order_lines
    where work_order_id in (
      '73400000-0000-4000-8000-000000000010'::uuid,
      '73400000-0000-4000-8000-000000000011'::uuid
    )
  ) then
    raise exception 'Portal/historical placeholder received a carried deferred line.';
  end if;
end;
$placeholder_guards$;

-- Operational work order for vehicle 1: exactly one deferred line follows.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000020',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-1',
  '73300000-0000-4000-8000-000000000001',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

do $initial_carry$
declare
  v_line public.work_order_lines%rowtype;
  v_quote public.work_order_quote_lines%rowtype;
begin
  select line.* into v_line
  from public.work_order_lines line
  where line.work_order_id = '73400000-0000-4000-8000-000000000020'
    and line.shop_id = '73200000-0000-4000-8000-000000000001';

  if not found
     or v_line.vehicle_id is distinct from '73300000-0000-4000-8000-000000000001'::uuid
     or v_line.status is distinct from 'deferred'
     or v_line.approval_state is distinct from 'declined'
     or v_line.user_id is distinct from '73100000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Initial carried line did not preserve deferred/non-punchable/current-actor contract.';
  end if;

  select quote_line.* into v_quote
  from public.work_order_quote_lines quote_line
  where quote_line.work_order_id = '73400000-0000-4000-8000-000000000020'
    and quote_line.work_order_line_id = v_line.id;

  if not found
     or v_quote.source_work_order_line_id is distinct from '73500000-0000-4000-8000-000000000001'::uuid
     or v_quote.source_row_id is distinct from '73600000-0000-4000-8000-000000000001'::uuid
     or lower(coalesce(v_quote.metadata ->> 'carry_forward', 'false')) <> 'true'
     or (v_quote.metadata ->> 'source_actor_user_id') is distinct from '73100000-0000-4000-8000-000000000002' then
    raise exception 'Initial carried quote provenance is incomplete.';
  end if;
end;
$initial_carry$;

-- Updating the same vehicle fires UPDATE OF vehicle_id but must remain idempotent.
update public.work_orders
set vehicle_id = vehicle_id
where id = '73400000-0000-4000-8000-000000000020';

do $idempotency$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.work_order_quote_lines quote_line
  where quote_line.work_order_id = '73400000-0000-4000-8000-000000000020'
    and quote_line.source_work_order_line_id = '73500000-0000-4000-8000-000000000001'
    and lower(coalesce(quote_line.metadata ->> 'carry_forward', 'false')) = 'true';

  if v_count <> 1 then
    raise exception 'Same-vehicle replay created % carried copies; expected 1.', v_count;
  end if;
end;
$idempotency$;

-- Supported create-flow vehicle reassignment must remove vehicle 1's carried
-- row and atomically replace it with vehicle 2's unresolved recommendation.
update public.work_orders
set vehicle_id = '73300000-0000-4000-8000-000000000002'
where id = '73400000-0000-4000-8000-000000000020';

do $vehicle_reassignment$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.work_order_lines line
  where line.work_order_id = '73400000-0000-4000-8000-000000000020';

  if v_count <> 1 then
    raise exception 'Vehicle reassignment left % carried lines; expected 1.', v_count;
  end if;

  if not exists (
    select 1
    from public.work_order_lines line
    join public.work_order_quote_lines quote_line
      on quote_line.work_order_line_id = line.id
     and quote_line.work_order_id = line.work_order_id
    where line.work_order_id = '73400000-0000-4000-8000-000000000020'
      and line.vehicle_id = '73300000-0000-4000-8000-000000000002'
      and line.status = 'deferred'
      and quote_line.source_work_order_line_id = '73500000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Vehicle reassignment did not reconcile to vehicle 2 history.';
  end if;

  if exists (
    select 1
    from public.work_order_quote_lines quote_line
    where quote_line.work_order_id = '73400000-0000-4000-8000-000000000020'
      and quote_line.source_work_order_line_id = '73500000-0000-4000-8000-000000000001'
      and lower(coalesce(quote_line.metadata ->> 'carry_forward', 'false')) = 'true'
  ) then
    raise exception 'Vehicle 1 provenance survived reassignment to vehicle 2.';
  end if;
end;
$vehicle_reassignment$;

-- Completion of the original source line itself resolves the vehicle 2 thread.
update public.work_order_lines
set status = 'completed'
where id = '73500000-0000-4000-8000-000000000002';

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000021',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-2',
  '73300000-0000-4000-8000-000000000002',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

do $source_completion$
begin
  if exists (
    select 1 from public.work_order_lines
    where work_order_id = '73400000-0000-4000-8000-000000000021'
  ) then
    raise exception 'Completed source recommendation was carried forward again.';
  end if;
end;
$source_completion$;

-- Vehicle 1 remains unresolved, so a fresh destination carries it once.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000022',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-3',
  '73300000-0000-4000-8000-000000000001',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

-- Completing that descendant resolves the lineage even though the original
-- source line remains on hold.
update public.work_order_lines
set status = 'completed'
where work_order_id = '73400000-0000-4000-8000-000000000022'
  and status = 'deferred';

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000023',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-4',
  '73300000-0000-4000-8000-000000000001',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

do $descendant_completion$
begin
  if exists (
    select 1 from public.work_order_lines
    where work_order_id = '73400000-0000-4000-8000-000000000023'
  ) then
    raise exception 'Completed descendant recommendation was carried forward again.';
  end if;
end;
$descendant_completion$;

rollback;