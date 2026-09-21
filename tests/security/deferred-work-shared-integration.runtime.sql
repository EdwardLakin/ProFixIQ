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
     or v_quote.source_row_id is distinct from '73600000-0000-4000-8000-000000000001'
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

-- ---------------------------------------------------------------------------
-- Regression coverage for PR #1637 review findings fixed after the fact
-- (#1637 shipped with 6 unresolved P1 threads; this section exercises each).
-- ---------------------------------------------------------------------------

-- Finding: two deferred findings from ONE inspection must carry as two
-- separate lineages, not collapse into one shared root.
insert into public.vehicles (id, shop_id, unit_number, vin, year, make, model)
values (
  '73300000-0000-4000-8000-000000000003',
  '73200000-0000-4000-8000-000000000001',
  'DEF-03', '1DEFERRED00000003', 2023, 'Ram', '5500'
);

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000040',
  '73200000-0000-4000-8000-000000000001',
  'DEF-SOURCE-MULTI-INSPECTION',
  '73300000-0000-4000-8000-000000000003',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  approval_state, job_type, complaint, description, notes, user_id
)
values (
  '73500000-0000-4000-8000-000000000004',
  '73200000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000040',
  '73300000-0000-4000-8000-000000000003',
  'job', 'completed', 'approved', 'inspection',
  'Annual inspection', 'Annual inspection',
  'Inspection completed; two findings remain unresolved.',
  '73100000-0000-4000-8000-000000000002'
);

insert into public.inspections (
  id, shop_id, work_order_id, work_order_line_id, vehicle_id, user_id,
  inspection_type, status, completed, is_draft, locked, is_canonical,
  sync_revision, signing_cycle, started_at, finalized_at, finalized_by,
  summary, notes, created_at, updated_at
)
values (
  '73700000-0000-4000-8000-000000000002',
  '73200000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000040',
  '73500000-0000-4000-8000-000000000004',
  '73300000-0000-4000-8000-000000000003',
  '73100000-0000-4000-8000-000000000002',
  'annual', 'completed', true, false, true, true,
  1, 1,
  '2026-08-03T16:00:00Z', '2026-08-03T17:00:00Z',
  '73100000-0000-4000-8000-000000000002',
  '{"items":[{"item":"Front brake pads","status":"fail"},{"item":"Rear shocks","status":"fail"}]}'::jsonb,
  'Two-finding inspection fixture',
  '2026-08-03T16:00:00Z', '2026-08-03T17:00:00Z'
);

-- Both quote lines share the same inspection anchor as source_work_order_line_id
-- but carry distinct inspection_finding_identity values, matching the real
-- inspection-import shape (20260715060100_phase5_atomic_inspection_quote_import.sql).
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
    '73600000-0000-4000-8000-000000000003',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000040',
    null, '73500000-0000-4000-8000-000000000004',
    '73300000-0000-4000-8000-000000000003',
    'Front brake pads', 'Replace front brake pads',
    'job', 'repair', 'declined', 'customer_declined', 'declined',
    1.0, 1.0, 150.00, 150.00, 200.00,
    350.00, 0, 17.50, 367.50,
    '{"source":"inspection","inspection_finding_identity":"finding-brake-pads"}'::jsonb,
    '2026-08-03T18:00:00Z', '2026-08-03T17:00:00Z', '2026-08-03T18:00:00Z'
  ),
  (
    '73600000-0000-4000-8000-000000000004',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000040',
    null, '73500000-0000-4000-8000-000000000004',
    '73300000-0000-4000-8000-000000000003',
    'Rear shocks', 'Replace rear shocks',
    'job', 'repair', 'declined', 'customer_declined', 'declined',
    2.0, 2.0, 150.00, 300.00, 400.00,
    700.00, 0, 35.00, 735.00,
    '{"source":"inspection","inspection_finding_identity":"finding-rear-shocks"}'::jsonb,
    '2026-08-03T18:05:00Z', '2026-08-03T17:05:00Z', '2026-08-03T18:05:00Z'
  );

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000041',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-MULTI-1',
  '73300000-0000-4000-8000-000000000003',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

do $multi_finding_carry$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.work_order_lines line
  where line.work_order_id = '73400000-0000-4000-8000-000000000041';

  if v_count <> 2 then
    raise exception 'Two-finding inspection carried % lines; expected 2 (one per finding).', v_count;
  end if;

  if not exists (
    select 1 from public.work_order_quote_lines
    where work_order_id = '73400000-0000-4000-8000-000000000041'
      and metadata ->> 'inspection_finding_identity' = 'finding-brake-pads'
  ) or not exists (
    select 1 from public.work_order_quote_lines
    where work_order_id = '73400000-0000-4000-8000-000000000041'
      and metadata ->> 'inspection_finding_identity' = 'finding-rear-shocks'
  ) then
    raise exception 'Both inspection findings were not independently carried forward.';
  end if;
end;
$multi_finding_carry$;

-- Completing ONE finding's carried descendant must resolve only that finding,
-- not the whole shared inspection anchor.
update public.work_order_lines
set status = 'completed'
where work_order_id = '73400000-0000-4000-8000-000000000041'
  and id in (
    select work_order_line_id
    from public.work_order_quote_lines
    where work_order_id = '73400000-0000-4000-8000-000000000041'
      and metadata ->> 'inspection_finding_identity' = 'finding-brake-pads'
  );

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000042',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-MULTI-2',
  '73300000-0000-4000-8000-000000000003',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

do $multi_finding_partial_resolution$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.work_order_lines line
  where line.work_order_id = '73400000-0000-4000-8000-000000000042';

  if v_count <> 1 then
    raise exception 'Expected only the unresolved rear-shocks finding to carry; got % lines.', v_count;
  end if;

  if not exists (
    select 1 from public.work_order_quote_lines
    where work_order_id = '73400000-0000-4000-8000-000000000042'
      and metadata ->> 'inspection_finding_identity' = 'finding-rear-shocks'
  ) then
    raise exception 'The still-unresolved rear-shocks finding did not carry forward.';
  end if;

  if exists (
    select 1 from public.work_order_quote_lines
    where work_order_id = '73400000-0000-4000-8000-000000000042'
      and metadata ->> 'inspection_finding_identity' = 'finding-brake-pads'
  ) then
    raise exception 'The already-resolved brake-pads finding carried forward again.';
  end if;
end;
$multi_finding_partial_resolution$;

-- Finding: archival is a visibility state, not resolution. A declined
-- recommendation whose source work order was archived must still carry.
insert into public.vehicles (id, shop_id, unit_number, vin, year, make, model)
values (
  '73300000-0000-4000-8000-000000000004',
  '73200000-0000-4000-8000-000000000001',
  'DEF-04', '1DEFERRED00000004', 2020, 'Chevrolet', 'Silverado'
);

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000050',
  '73200000-0000-4000-8000-000000000001',
  'DEF-SOURCE-ARCHIVED',
  '73300000-0000-4000-8000-000000000004',
  'completed', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  approval_state, job_type, complaint, description, notes, user_id
)
values (
  '73500000-0000-4000-8000-000000000005',
  '73200000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000050',
  '73300000-0000-4000-8000-000000000004',
  'job', 'on_hold', 'declined', 'repair',
  'Alignment out of spec', 'Perform four-wheel alignment',
  'Customer declined at time of visit.',
  '73100000-0000-4000-8000-000000000002'
);

insert into public.work_order_quote_lines (
  id, shop_id, work_order_id, work_order_line_id,
  source_work_order_line_id, vehicle_id, title, description,
  line_type, job_type, status, stage, decision,
  labor_hours, est_labor_hours, labor_rate, labor_total, parts_total,
  subtotal, discount_total, tax_total, grand_total, metadata,
  declined_at, created_at, updated_at
)
values (
  '73600000-0000-4000-8000-000000000005',
  '73200000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000050',
  null, '73500000-0000-4000-8000-000000000005',
  '73300000-0000-4000-8000-000000000004',
  'Four-wheel alignment', 'Perform four-wheel alignment',
  'job', 'repair', 'declined', 'customer_declined', 'declined',
  1.0, 1.0, 150.00, 150.00, 0,
  150.00, 0, 7.50, 157.50,
  '{}'::jsonb,
  '2026-08-04T18:00:00Z', '2026-08-04T17:00:00Z', '2026-08-04T18:00:00Z'
);

-- Archive the source visit. The canonical archive action is a visibility
-- change; it must not erase the still-unresolved recommendation.
update public.work_orders
set archived_at = '2026-08-05T00:00:00Z'
where id = '73400000-0000-4000-8000-000000000050';

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000051',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-ARCHIVED-1',
  '73300000-0000-4000-8000-000000000004',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

do $archived_source_still_carries$
begin
  if not exists (
    select 1
    from public.work_order_lines line
    join public.work_order_quote_lines quote_line
      on quote_line.work_order_line_id = line.id
    where line.work_order_id = '73400000-0000-4000-8000-000000000051'
      and line.status = 'deferred'
      and quote_line.source_work_order_line_id = '73500000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Archiving the source visit erased its still-unresolved recommendation.';
  end if;
end;
$archived_source_still_carries$;

-- Finding: correcting a work order's vehicle while one of its carried lines
-- has already been acted on must be rejected outright, not silently leave
-- that line, its quote, and its evidence on the old vehicle under a work
-- order that now points at a different one.
insert into public.vehicles (id, shop_id, unit_number, vin, year, make, model)
values
  (
    '73300000-0000-4000-8000-000000000005',
    '73200000-0000-4000-8000-000000000001',
    'DEF-05', '1DEFERRED00000005', 2019, 'GMC', 'Sierra'
  ),
  (
    '73300000-0000-4000-8000-000000000006',
    '73200000-0000-4000-8000-000000000001',
    'DEF-06', '1DEFERRED00000006', 2018, 'GMC', 'Sierra'
  );

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000060',
  '73200000-0000-4000-8000-000000000001',
  'DEF-SOURCE-ACTEDON',
  '73300000-0000-4000-8000-000000000005',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  approval_state, job_type, complaint, description, notes, user_id
)
values (
  '73500000-0000-4000-8000-000000000006',
  '73200000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000060',
  '73300000-0000-4000-8000-000000000005',
  'job', 'on_hold', 'declined', 'repair',
  'Serpentine belt cracked', 'Replace serpentine belt',
  'Customer declined at time of visit.',
  '73100000-0000-4000-8000-000000000002'
);

insert into public.work_order_quote_lines (
  id, shop_id, work_order_id, work_order_line_id,
  source_work_order_line_id, vehicle_id, title, description,
  line_type, job_type, status, stage, decision,
  labor_hours, est_labor_hours, labor_rate, labor_total, parts_total,
  subtotal, discount_total, tax_total, grand_total, metadata,
  declined_at, created_at, updated_at
)
values (
  '73600000-0000-4000-8000-000000000006',
  '73200000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000060',
  null, '73500000-0000-4000-8000-000000000006',
  '73300000-0000-4000-8000-000000000005',
  'Serpentine belt', 'Replace serpentine belt',
  'job', 'repair', 'declined', 'customer_declined', 'declined',
  0.5, 0.5, 150.00, 75.00, 60.00,
  135.00, 0, 6.75, 141.75,
  '{}'::jsonb,
  '2026-08-06T18:00:00Z', '2026-08-06T17:00:00Z', '2026-08-06T18:00:00Z'
);

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000061',
  '73200000-0000-4000-8000-000000000001',
  'DEF-DEST-ACTEDON-1',
  '73300000-0000-4000-8000-000000000005',
  'in_progress', 'work_order',
  '73100000-0000-4000-8000-000000000001'
);

-- Act on the carried line before the vehicle gets corrected: this is no
-- longer passive context, it is live work in progress. The BEFORE UPDATE
-- normalizer trigger (trg_normalize_work_order_line_status) rewrites
-- 'in_progress' to the canonical 'active' on write, so the stored value to
-- assert against is 'active', not the value this statement sends.
update public.work_order_lines
set status = 'in_progress'
where work_order_id = '73400000-0000-4000-8000-000000000061'
  and status = 'deferred';

-- Correcting the work order's vehicle while a carried line has been acted on
-- must be rejected outright, not silently leave that line, its quote, and its
-- evidence pointing at the old vehicle under a work order that now points at
-- a different one.
do $blocked_acted_on_reassignment$
declare
  v_caught boolean := false;
begin
  begin
    update public.work_orders
    set vehicle_id = '73300000-0000-4000-8000-000000000006'
    where id = '73400000-0000-4000-8000-000000000061';
  exception
    when others then
      v_caught := true;
      if position('already acted on' in sqlerrm) = 0 then
        raise exception 'Unexpected error blocking vehicle reassignment over acted-on carried work: %', sqlerrm;
      end if;
  end;

  if not v_caught then
    raise exception 'Vehicle reassignment over an acted-on carried line was not rejected.';
  end if;
end;
$blocked_acted_on_reassignment$;

do $atomic_acted_on_guard_state$
declare
  v_line_count integer;
  v_quote_count integer;
begin
  select count(*) into v_line_count
  from public.work_order_lines
  where work_order_id = '73400000-0000-4000-8000-000000000061'
    and status = 'active'
    and vehicle_id = '73300000-0000-4000-8000-000000000005';

  if v_line_count <> 1 then
    raise exception 'Acted-on carried line changed despite the rejected reassignment; expected 1 survivor on the original vehicle, got %.', v_line_count;
  end if;

  select count(*) into v_quote_count
  from public.work_order_quote_lines
  where work_order_id = '73400000-0000-4000-8000-000000000061'
    and source_work_order_line_id = '73500000-0000-4000-8000-000000000006'
    and lower(coalesce(metadata ->> 'carry_forward', 'false')) = 'true';

  if v_quote_count <> 1 then
    raise exception 'Acted-on carried line lost its quote despite the rejected reassignment; expected 1 survivor, got %.', v_quote_count;
  end if;

  if exists (
    select 1 from public.work_orders
    where id = '73400000-0000-4000-8000-000000000061'
      and vehicle_id is distinct from '73300000-0000-4000-8000-000000000005'::uuid
  ) then
    raise exception 'Work order vehicle_id changed despite the rejected reassignment.';
  end if;
end;
$atomic_acted_on_guard_state$;

-- Finding: private.reconcile_work_order_state must count an ordinarily
-- declined line (status = 'on_hold', line_status = 'declined', approval_state
-- = 'declined') toward v_declined_count so a work order with both approved
-- and declined lines resolves to approval_state = 'partial', not 'approved'.
insert into public.vehicles (id, shop_id, unit_number, vin, year, make, model)
values (
  '73300000-0000-4000-8000-000000000007',
  '73200000-0000-4000-8000-000000000001',
  'DEF-07', '1DEFERRED00000007', 2024, 'Toyota', 'Tundra'
);

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, approval_state, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000070',
  '73200000-0000-4000-8000-000000000001',
  'DEF-RECONCILE-1',
  '73300000-0000-4000-8000-000000000007',
  'awaiting_approval', 'work_order', 'pending',
  '73100000-0000-4000-8000-000000000001'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  line_status, approval_state, job_type, complaint, description, user_id
)
values
  (
    '73500000-0000-4000-8000-000000000007',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000070',
    '73300000-0000-4000-8000-000000000007',
    'job', 'queued', null, 'approved', 'repair',
    'Oil leak', 'Replace valve cover gasket',
    '73100000-0000-4000-8000-000000000002'
  ),
  (
    '73500000-0000-4000-8000-000000000008',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000070',
    '73300000-0000-4000-8000-000000000007',
    'job', 'on_hold', 'declined', 'declined', 'repair',
    'Cabin air filter dirty', 'Replace cabin air filter',
    '73100000-0000-4000-8000-000000000002'
  );

do $reconciler_partial_approval$
declare
  v_work_order public.work_orders%rowtype;
begin
  perform private.reconcile_work_order_state('73400000-0000-4000-8000-000000000070');

  select wo.* into v_work_order
  from public.work_orders wo
  where wo.id = '73400000-0000-4000-8000-000000000070';

  if v_work_order.approval_state is distinct from 'partial' then
    raise exception 'Work order with one approved and one declined line resolved to approval_state = %, expected partial.',
      v_work_order.approval_state;
  end if;
end;
$reconciler_partial_approval$;

-- Finding: the shop-assistant manual-decision path's canonical deferred shape
-- (status = 'on_hold', line_status = 'deferred', approval_state = 'declined')
-- is passive context, the same as a carry-forward row's status = 'deferred'.
-- It must not count toward v_declined_count either, or a work order with an
-- approved line and a shop-assistant-deferred line would resolve to
-- 'partial'/'declined' instead of 'approved'.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, approval_state, advisor_id
)
values (
  '73400000-0000-4000-8000-000000000071',
  '73200000-0000-4000-8000-000000000001',
  'DEF-RECONCILE-2',
  '73300000-0000-4000-8000-000000000007',
  'awaiting_approval', 'work_order', 'pending',
  '73100000-0000-4000-8000-000000000001'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  line_status, approval_state, job_type, complaint, description, user_id
)
values
  (
    '73500000-0000-4000-8000-000000000009',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000071',
    '73300000-0000-4000-8000-000000000007',
    'job', 'queued', null, 'approved', 'repair',
    'Serpentine belt noise', 'Replace serpentine belt',
    '73100000-0000-4000-8000-000000000002'
  ),
  (
    '73500000-0000-4000-8000-000000000010',
    '73200000-0000-4000-8000-000000000001',
    '73400000-0000-4000-8000-000000000071',
    '73300000-0000-4000-8000-000000000007',
    'job', 'on_hold', 'deferred', 'declined', 'repair',
    'Cabin air filter dirty', 'Replace cabin air filter',
    '73100000-0000-4000-8000-000000000002'
  );

do $reconciler_ignores_shop_assistant_deferred$
declare
  v_work_order public.work_orders%rowtype;
begin
  perform private.reconcile_work_order_state('73400000-0000-4000-8000-000000000071');

  select wo.* into v_work_order
  from public.work_orders wo
  where wo.id = '73400000-0000-4000-8000-000000000071';

  if v_work_order.approval_state is distinct from 'approved' then
    raise exception 'Work order with one approved line and one shop-assistant-deferred line resolved to approval_state = %, expected approved.',
      v_work_order.approval_state;
  end if;
end;
$reconciler_ignores_shop_assistant_deferred$;

rollback;
