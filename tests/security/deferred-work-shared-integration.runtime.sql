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
    'DEF-SOURCE-INSPECTION',
    '73300000-0000-4000-8000-000000000001',
    'in_progress', 'work_order',
    '73100000-0000-4000-8000-000000000001'
  ),
  (
    '73400000-0000-4000-8000-000000000002',
    '73200000-0000-4000-8000-000000000001',
    'DEF-SOURCE-REPAIR',
    '73300000-0000-4000-8000-000000000002',
    'in_progress', 'work_order',
    '73100000-0000-4000-8000-000000000001'
  );

-- Vehicle 1 recommendation originates from a real, completed inspection anchor.
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
    'job', 'completed', 'approved', 'inspection',
    'Annual inspection', 'Annual inspection',
    'Inspection completed; repair recommendation remains unresolved.',
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

insert into public.inspections (
  id, shop_id, work_order_id, work_order_line_id, vehicle_id, user_id,
  inspection_type, status, completed, is_draft, locked, is_canonical,
  sync_revision, signing_cycle, started_at, finalized_at, finalized_by,
  summary, notes, created_at, updated_at
)
values (
  '73700000-0000-4000-8000-000000000001',
  '73200000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000001',
  '73500000-0000-4000-8000-000000000001',
  '73300000-0000-4000-8000-000000000001',
  '73100000-0000-4000-8000-000000000002',
  'annual', 'completed', true, false, true, true,
  1, 1,
  '2026-08-01T16:00:00Z', '2026-08-01T17:00:00Z',
  '73100000-0000-4000-8000-000000000002',
  '{"items":[{"item":"Front lower ball joint","status":"fail","note":"Excessive play"}]}'::jsonb,
  'Completed inspection fixture',
  '2026-08-01T16:00:00Z', '2026-08-01T17:00:00Z'
);

-- Deliberately leave source_work_order_line_id null. The shared provenance
-- normalizer must promote the established metadata key into the canonical column.
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
    '{"source":"inspection","source_work_order_line_id":"73500000-0000-4000-8000-000000000001","photo_urls":["https://example.invalid/deferred-ball-joint.jpg"]}'::jsonb,
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

update public.work_order_quote_lines
set deferred_at = '2026-08-02T18:00:00Z'
where id = '73600000-0000-4000-8000-000000000002';

do $deferred_contract$
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
    raise exception 'Metadata-only recommendation provenance was not normalized.';
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

select set_config(
  'request.jwt.claim.sub',
  '73100000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Portal quote shells must remain free of technical carry-forward.
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

-- Canonical imports use type=repair plus non-null source_intake_id.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, type,
  source_intake_id, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000011',
  '73200000-0000-4000-8000-000000000001',
  'DEF-HIST-1',
  '73300000-0000-4000-8000-000000000001',
  'completed', 'work_order', 'repair',
  '73800000-0000-4000-8000-000000000001',
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
    raise exception 'Portal/import placeholder received a carried deferred line.';
  end if;
end;
$placeholder_guards$;

-- Initial operational visit must carry the completed-inspection recommendation.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, approval_state, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000020',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-1',
  '73300000-0000-4000-8000-000000000001',
  'in_progress', 'work_order', 'pending',
  '73100000-0000-4000-8000-000000000001'
);

do $initial_carry$
declare
  v_line public.work_order_lines%rowtype;
  v_quote public.work_order_quote_lines%rowtype;
  v_parent public.work_orders%rowtype;
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
    raise exception 'Completed inspection recommendation did not carry as passive deferred context.';
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

  select wo.* into v_parent
  from public.work_orders wo
  where wo.id = '73400000-0000-4000-8000-000000000020';

  if v_parent.status is distinct from 'in_progress'
     or v_parent.approval_state is distinct from 'pending' then
    raise exception 'Passive deferred context changed parent WO state to %/%',
      v_parent.status, v_parent.approval_state;
  end if;

  if not exists (
    select 1
    from public.work_order_media media
    where media.work_order_id = v_parent.id
      and media.quote_line_id = v_quote.id
      and media.url = 'https://example.invalid/deferred-ball-joint.jpg'
  ) then
    raise exception 'Carried inspection evidence was not materialized for reassignment cleanup test.';
  end if;
end;
$initial_carry$;

-- Same-vehicle replay is idempotent.
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

-- Estimate creation is skipped; canonical estimate->WO transition must reconcile.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000030',
  '73200000-0000-4000-8000-000000000001',
  'DEF-ESTIMATE-1',
  '73300000-0000-4000-8000-000000000002',
  'new', 'estimate',
  '73100000-0000-4000-8000-000000000001'
);

do $estimate_initial_skip$
begin
  if exists (
    select 1 from public.work_order_lines
    where work_order_id = '73400000-0000-4000-8000-000000000030'
  ) then
    raise exception 'Initial estimate creation received deferred technical context.';
  end if;
end;
$estimate_initial_skip$;

update public.work_orders
set record_type = 'work_order'
where id = '73400000-0000-4000-8000-000000000030';

do $estimate_conversion$
begin
  if not exists (
    select 1
    from public.work_order_lines line
    join public.work_order_quote_lines quote_line
      on quote_line.work_order_line_id = line.id
    where line.work_order_id = '73400000-0000-4000-8000-000000000030'
      and line.status = 'deferred'
      and quote_line.source_work_order_line_id = '73500000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Estimate-to-work-order conversion did not reconcile deferred history.';
  end if;
end;
$estimate_conversion$;

-- Vehicle reassignment removes prior vehicle evidence before quote/line cleanup,
-- then carries only the newly selected vehicle's unresolved recommendation.
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
    from public.work_order_media media
    where media.work_order_id = '73400000-0000-4000-8000-000000000020'
      and media.url = 'https://example.invalid/deferred-ball-joint.jpg'
  ) then
    raise exception 'Vehicle 1 carried evidence survived reassignment to vehicle 2.';
  end if;
end;
$vehicle_reassignment$;

-- Completing a real, non-inspection root repair resolves that lineage.
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
    raise exception 'Completed non-inspection source repair was carried forward again.';
  end if;
end;
$source_completion$;

-- Vehicle 1 is still unresolved despite its completed inspection anchor.
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

-- Completing the carried descendant is an actual repair resolution signal.
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
    raise exception 'Completed repair descendant did not resolve inspection-origin recommendation.';
  end if;
end;
$descendant_completion$;

rollback;
