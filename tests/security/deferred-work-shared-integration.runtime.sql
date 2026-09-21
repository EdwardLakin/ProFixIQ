\set ON_ERROR_STOP on

-- @regression-flow work-orders.deferred-recommendation-actions
--
-- Contract change (explicitly approved by the user): the automatic carry-
-- forward trigger that used to silently insert a passive 'deferred' line
-- into every new work order for a vehicle with unresolved declined/deferred
-- history has been retired (see
-- 20260921060000_replace_deferred_carry_forward_with_explicit_actions.sql).
-- This file replaces the old trigger-behavior regression coverage with
-- coverage for the three explicit advisor actions that took its place: Add,
-- Decline, and Completed elsewhere.
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('74100000-0000-4000-8000-000000000001', 'deferred-owner@example.com', '{"full_name":"Deferred Owner"}'::jsonb),
  ('74100000-0000-4000-8000-000000000002', 'deferred-mechanic@example.com', '{"full_name":"Deferred Mechanic"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('74100000-0000-4000-8000-000000000001', '74100000-0000-4000-8000-000000000001', 'owner', 'Deferred Owner'),
  ('74100000-0000-4000-8000-000000000002', '74100000-0000-4000-8000-000000000002', 'mechanic', 'Deferred Mechanic')
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values (
  '74200000-0000-4000-8000-000000000001',
  '74100000-0000-4000-8000-000000000001',
  'Deferred Actions Shop',
  'Deferred Actions Shop'
);

update public.profiles
set shop_id = '74200000-0000-4000-8000-000000000001'
where id in (
  '74100000-0000-4000-8000-000000000001',
  '74100000-0000-4000-8000-000000000002'
);

insert into public.vehicles (id, shop_id, unit_number, vin, year, make, model)
values
  (
    '74300000-0000-4000-8000-000000000001',
    '74200000-0000-4000-8000-000000000001',
    'DEF-01', '1DEFACTION0000001', 2022, 'Ford', 'F-550'
  ),
  (
    '74300000-0000-4000-8000-000000000002',
    '74200000-0000-4000-8000-000000000001',
    'DEF-02', '1DEFACTION0000002', 2021, 'Ford', 'F-350'
  );

-- Source visit: vehicle 1 has a declined recommendation still unresolved.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '74400000-0000-4000-8000-000000000001',
  '74200000-0000-4000-8000-000000000001',
  'DEF-SOURCE-1',
  '74300000-0000-4000-8000-000000000001',
  'completed', 'work_order',
  '74100000-0000-4000-8000-000000000001'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  approval_state, job_type, complaint, description, notes, user_id
)
values (
  '74500000-0000-4000-8000-000000000001',
  '74200000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000001',
  '74300000-0000-4000-8000-000000000001',
  'job', 'on_hold', 'declined', 'repair',
  'Front lower ball joint play', 'Replace front lower ball joints',
  'Customer declined at time of visit.',
  '74100000-0000-4000-8000-000000000002'
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
  '74600000-0000-4000-8000-000000000001',
  '74200000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000001',
  null, '74500000-0000-4000-8000-000000000001',
  '74300000-0000-4000-8000-000000000001',
  'Front lower ball joints', 'Replace front lower ball joints',
  'job', 'repair', 'declined', 'customer_declined', 'declined',
  2.0, 2.0, 150.00, 300.00, 700.00,
  1000.00, 0, 50.00, 1050.00,
  '{}'::jsonb,
  '2026-08-01T18:00:00Z', '2026-08-01T17:00:00Z', '2026-08-01T18:00:00Z'
);

-- ---------------------------------------------------------------------
-- Finding: the automatic carry-forward trigger is retired. A new work
-- order for the same vehicle must receive nothing automatically.
-- ---------------------------------------------------------------------

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '74400000-0000-4000-8000-000000000010',
  '74200000-0000-4000-8000-000000000001',
  'DEF-DEST-NO-AUTO',
  '74300000-0000-4000-8000-000000000001',
  'in_progress', 'work_order',
  '74100000-0000-4000-8000-000000000001'
);

do $trigger_retired$
begin
  if exists (
    select 1 from public.work_order_lines
    where work_order_id = '74400000-0000-4000-8000-000000000010'
  ) then
    raise exception 'A new work order received an automatically carried line; the trigger should be retired.';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_work_orders_carry_forward_deferred_work'
  ) then
    raise exception 'trg_work_orders_carry_forward_deferred_work still exists; it should have been dropped.';
  end if;

  if exists (
    select 1 from pg_proc
    where proname = 'carry_forward_deferred_work_for_work_order'
  ) then
    raise exception 'carry_forward_deferred_work_for_work_order still exists; it should have been dropped.';
  end if;
end;
$trigger_retired$;

-- ---------------------------------------------------------------------
-- Establish the service_role execution context all three RPCs require.
-- ---------------------------------------------------------------------

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- ---------------------------------------------------------------------
-- Add: brings the recommendation onto the new work order as a real,
-- actionable line, carrying its pricing forward.
-- ---------------------------------------------------------------------

do $add_recommendation$
declare
  v_result jsonb;
  v_line public.work_order_lines%rowtype;
  v_quote public.work_order_quote_lines%rowtype;
  v_line_count integer;
begin
  v_result := public.add_deferred_recommendation_to_work_order(
    '74200000-0000-4000-8000-000000000001',
    '74400000-0000-4000-8000-000000000010',
    '74600000-0000-4000-8000-000000000001',
    '74700000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001'
  );

  if (v_result ->> 'ok')::boolean is not true
     or (v_result ->> 'idempotent')::boolean is not false
     or v_result ->> 'line_id' <> '74700000-0000-4000-8000-000000000001' then
    raise exception 'Unexpected add result: %', v_result;
  end if;

  select * into v_line
  from public.work_order_lines
  where id = '74700000-0000-4000-8000-000000000001';

  if not found
     or v_line.work_order_id is distinct from '74400000-0000-4000-8000-000000000010'::uuid
     or v_line.vehicle_id is distinct from '74300000-0000-4000-8000-000000000001'::uuid
     or v_line.status is distinct from 'awaiting_approval'
     or v_line.approval_state is distinct from 'pending'
     or v_line.description is distinct from 'Replace front lower ball joints' then
    raise exception 'Added line does not match expected contract: %', row_to_json(v_line);
  end if;

  select * into v_quote
  from public.work_order_quote_lines
  where work_order_line_id = '74700000-0000-4000-8000-000000000001';

  if not found
     or v_quote.source_work_order_line_id is distinct from '74500000-0000-4000-8000-000000000001'::uuid
     or v_quote.source_row_id is distinct from '74600000-0000-4000-8000-000000000001'
     or v_quote.grand_total is distinct from 1050.00
     or lower(coalesce(v_quote.metadata ->> 'carry_forward', 'false')) <> 'true' then
    raise exception 'Added quote line does not match expected contract: %', row_to_json(v_quote);
  end if;

  -- Idempotent retry with the same client-supplied line id must not create
  -- a second line.
  v_result := public.add_deferred_recommendation_to_work_order(
    '74200000-0000-4000-8000-000000000001',
    '74400000-0000-4000-8000-000000000010',
    '74600000-0000-4000-8000-000000000001',
    '74700000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001'
  );

  if (v_result ->> 'idempotent')::boolean is not true then
    raise exception 'Retried add was not reported idempotent: %', v_result;
  end if;

  select count(*) into v_line_count
  from public.work_order_lines
  where work_order_id = '74400000-0000-4000-8000-000000000010';

  if v_line_count <> 1 then
    raise exception 'Idempotent retry created % lines; expected exactly 1.', v_line_count;
  end if;
end;
$add_recommendation$;

-- A mechanic is not an authorized actor for this action.
do $add_forbidden_role$
declare
  v_denied boolean := false;
begin
  begin
    perform public.add_deferred_recommendation_to_work_order(
      '74200000-0000-4000-8000-000000000001',
      '74400000-0000-4000-8000-000000000010',
      '74600000-0000-4000-8000-000000000001',
      '74700000-0000-4000-8000-000000000099',
      '74100000-0000-4000-8000-000000000002',
      '74100000-0000-4000-8000-000000000002'
    );
  exception
    when others then
      if sqlerrm = 'DEFERRED_RECOMMENDATION_ACTOR_FORBIDDEN' then
        v_denied := true;
      else
        raise exception 'Unexpected error rejecting mechanic actor: %', sqlerrm;
      end if;
  end;

  if not v_denied then
    raise exception 'A mechanic was allowed to add a deferred recommendation.';
  end if;
end;
$add_forbidden_role$;

-- A recommendation cannot be added onto a work order for a different
-- vehicle than the one it was declined on.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '74400000-0000-4000-8000-000000000011',
  '74200000-0000-4000-8000-000000000001',
  'DEF-DEST-WRONG-VEHICLE',
  '74300000-0000-4000-8000-000000000002',
  'in_progress', 'work_order',
  '74100000-0000-4000-8000-000000000001'
);

do $add_vehicle_mismatch$
declare
  v_denied boolean := false;
begin
  begin
    perform public.add_deferred_recommendation_to_work_order(
      '74200000-0000-4000-8000-000000000001',
      '74400000-0000-4000-8000-000000000011',
      '74600000-0000-4000-8000-000000000001',
      '74700000-0000-4000-8000-000000000098',
      '74100000-0000-4000-8000-000000000001',
      '74100000-0000-4000-8000-000000000001'
    );
  exception
    when others then
      if sqlerrm = 'DEFERRED_RECOMMENDATION_VEHICLE_MISMATCH' then
        v_denied := true;
      else
        raise exception 'Unexpected error rejecting vehicle mismatch: %', sqlerrm;
      end if;
  end;

  if not v_denied then
    raise exception 'A recommendation was added across vehicles.';
  end if;
end;
$add_vehicle_mismatch$;

-- A closed (archived) work order cannot receive a new add.
-- work_orders_status_check only permits 'new', 'awaiting',
-- 'awaiting_approval', 'queued', 'in_progress', 'on_hold', 'planned', and
-- 'completed', so a closed work order is represented by archived_at rather
-- than a non-existent status value.
insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id,
  archived_at
)
values (
  '74400000-0000-4000-8000-000000000012',
  '74200000-0000-4000-8000-000000000001',
  'DEF-DEST-CLOSED',
  '74300000-0000-4000-8000-000000000001',
  'completed', 'work_order',
  '74100000-0000-4000-8000-000000000001',
  now()
);

do $add_closed_work_order$
declare
  v_denied boolean := false;
begin
  begin
    perform public.add_deferred_recommendation_to_work_order(
      '74200000-0000-4000-8000-000000000001',
      '74400000-0000-4000-8000-000000000012',
      '74600000-0000-4000-8000-000000000001',
      '74700000-0000-4000-8000-000000000097',
      '74100000-0000-4000-8000-000000000001',
      '74100000-0000-4000-8000-000000000001'
    );
  exception
    when others then
      if sqlerrm = 'DEFERRED_RECOMMENDATION_WORK_ORDER_CLOSED' then
        v_denied := true;
      else
        raise exception 'Unexpected error rejecting closed work order: %', sqlerrm;
      end if;
  end;

  if not v_denied then
    raise exception 'A recommendation was added onto an invoiced work order.';
  end if;
end;
$add_closed_work_order$;

-- ---------------------------------------------------------------------
-- Decline: a second, independent recommendation (still unresolved) is
-- declined again at a new visit. Quote-only; no work order line.
-- ---------------------------------------------------------------------

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '74400000-0000-4000-8000-000000000002',
  '74200000-0000-4000-8000-000000000001',
  'DEF-SOURCE-2',
  '74300000-0000-4000-8000-000000000001',
  'completed', 'work_order',
  '74100000-0000-4000-8000-000000000001'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  approval_state, job_type, complaint, description, notes, user_id
)
values (
  '74500000-0000-4000-8000-000000000002',
  '74200000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000002',
  '74300000-0000-4000-8000-000000000001',
  'job', 'on_hold', 'declined', 'repair',
  'Rear brake shoes worn', 'Replace rear brake shoes',
  'Customer declined at time of visit.',
  '74100000-0000-4000-8000-000000000002'
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
  '74600000-0000-4000-8000-000000000002',
  '74200000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000002',
  null, '74500000-0000-4000-8000-000000000002',
  '74300000-0000-4000-8000-000000000001',
  'Rear brake shoes', 'Replace rear brake shoes',
  'job', 'repair', 'declined', 'customer_declined', 'declined',
  3.0, 3.0, 150.00, 450.00, 550.00,
  1000.00, 0, 50.00, 1050.00,
  '{}'::jsonb,
  '2026-08-02T18:00:00Z', '2026-08-02T17:00:00Z', '2026-08-02T18:00:00Z'
);

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '74400000-0000-4000-8000-000000000020',
  '74200000-0000-4000-8000-000000000001',
  'DEF-DEST-DECLINE',
  '74300000-0000-4000-8000-000000000001',
  'in_progress', 'work_order',
  '74100000-0000-4000-8000-000000000001'
);

do $decline_recommendation$
declare
  v_result jsonb;
  v_quote_line_id uuid;
  v_quote public.work_order_quote_lines%rowtype;
  v_quote_count integer;
begin
  v_result := public.decline_deferred_recommendation(
    '74200000-0000-4000-8000-000000000001',
    '74400000-0000-4000-8000-000000000020',
    '74600000-0000-4000-8000-000000000002',
    '74800000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001',
    'Customer declined again'
  );

  if (v_result ->> 'ok')::boolean is not true
     or (v_result ->> 'idempotent')::boolean is not false then
    raise exception 'Unexpected decline result: %', v_result;
  end if;

  v_quote_line_id := (v_result ->> 'quote_line_id')::uuid;

  select * into v_quote
  from public.work_order_quote_lines
  where id = v_quote_line_id;

  if not found
     or v_quote.work_order_id is distinct from '74400000-0000-4000-8000-000000000020'::uuid
     or v_quote.work_order_line_id is not null
     or v_quote.source_work_order_line_id is distinct from '74500000-0000-4000-8000-000000000002'::uuid
     or v_quote.source_row_id is distinct from '74600000-0000-4000-8000-000000000002'
     or v_quote.decision is distinct from 'declined'
     or v_quote.declined_at is null
     or v_quote.decline_reason is distinct from 'Customer declined again' then
    raise exception 'Declined quote line does not match expected contract: %', row_to_json(v_quote);
  end if;

  if exists (
    select 1 from public.work_order_lines
    where work_order_id = '74400000-0000-4000-8000-000000000020'
  ) then
    raise exception 'Decline created a work order line; it must remain quote-only.';
  end if;

  -- Idempotent retry with the same action id must not create a second row.
  v_result := public.decline_deferred_recommendation(
    '74200000-0000-4000-8000-000000000001',
    '74400000-0000-4000-8000-000000000020',
    '74600000-0000-4000-8000-000000000002',
    '74800000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001',
    'Customer declined again'
  );

  if (v_result ->> 'idempotent')::boolean is not true then
    raise exception 'Retried decline was not reported idempotent: %', v_result;
  end if;

  select count(*) into v_quote_count
  from public.work_order_quote_lines
  where work_order_id = '74400000-0000-4000-8000-000000000020';

  if v_quote_count <> 1 then
    raise exception 'Idempotent decline retry created % quote lines; expected exactly 1.', v_quote_count;
  end if;
end;
$decline_recommendation$;

-- ---------------------------------------------------------------------
-- Completed elsewhere: a third, independent recommendation is closed out
-- permanently. Idempotent; blocks a later Add on the same recommendation.
-- ---------------------------------------------------------------------

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '74400000-0000-4000-8000-000000000003',
  '74200000-0000-4000-8000-000000000001',
  'DEF-SOURCE-3',
  '74300000-0000-4000-8000-000000000001',
  'completed', 'work_order',
  '74100000-0000-4000-8000-000000000001'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, vehicle_id, line_type, status,
  approval_state, job_type, complaint, description, notes, user_id
)
values (
  '74500000-0000-4000-8000-000000000003',
  '74200000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000003',
  '74300000-0000-4000-8000-000000000001',
  'job', 'on_hold', 'declined', 'repair',
  'Cabin air filter dirty', 'Replace cabin air filter',
  'Customer declined at time of visit.',
  '74100000-0000-4000-8000-000000000002'
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
  '74600000-0000-4000-8000-000000000003',
  '74200000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000003',
  null, '74500000-0000-4000-8000-000000000003',
  '74300000-0000-4000-8000-000000000001',
  'Cabin air filter', 'Replace cabin air filter',
  'job', 'repair', 'declined', 'customer_declined', 'declined',
  0.3, 0.3, 150.00, 45.00, 25.00,
  70.00, 0, 3.50, 73.50,
  '{}'::jsonb,
  '2026-08-03T18:00:00Z', '2026-08-03T17:00:00Z', '2026-08-03T18:00:00Z'
);

insert into public.work_orders (
  id, shop_id, custom_id, vehicle_id, status, record_type, advisor_id
)
values (
  '74400000-0000-4000-8000-000000000030',
  '74200000-0000-4000-8000-000000000001',
  'DEF-DEST-RESOLVE',
  '74300000-0000-4000-8000-000000000001',
  'in_progress', 'work_order',
  '74100000-0000-4000-8000-000000000001'
);

do $resolve_elsewhere$
declare
  v_result jsonb;
  v_first_resolved_at timestamptz;
  v_quote public.work_order_quote_lines%rowtype;
  v_denied boolean := false;
begin
  v_result := public.resolve_deferred_recommendation_elsewhere(
    '74200000-0000-4000-8000-000000000001',
    '74400000-0000-4000-8000-000000000030',
    '74600000-0000-4000-8000-000000000003',
    '74100000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001',
    'Customer had it done at another shop'
  );

  if (v_result ->> 'ok')::boolean is not true
     or (v_result ->> 'idempotent')::boolean is not false then
    raise exception 'Unexpected resolve-elsewhere result: %', v_result;
  end if;

  select * into v_quote
  from public.work_order_quote_lines
  where id = '74600000-0000-4000-8000-000000000003';

  if v_quote.resolved_elsewhere_at is null
     or v_quote.resolved_elsewhere_by_user_id is distinct from '74100000-0000-4000-8000-000000000001'::uuid
     or (v_quote.metadata ->> 'resolved_elsewhere_note') is distinct from 'Customer had it done at another shop' then
    raise exception 'Resolved quote line does not match expected contract: %', row_to_json(v_quote);
  end if;

  v_first_resolved_at := v_quote.resolved_elsewhere_at;

  -- Idempotent retry must not disturb the original resolution timestamp.
  v_result := public.resolve_deferred_recommendation_elsewhere(
    '74200000-0000-4000-8000-000000000001',
    '74400000-0000-4000-8000-000000000030',
    '74600000-0000-4000-8000-000000000003',
    '74100000-0000-4000-8000-000000000001',
    '74100000-0000-4000-8000-000000000001',
    'A different note that must be ignored'
  );

  if (v_result ->> 'idempotent')::boolean is not true then
    raise exception 'Retried resolve-elsewhere was not reported idempotent: %', v_result;
  end if;

  select * into v_quote
  from public.work_order_quote_lines
  where id = '74600000-0000-4000-8000-000000000003';

  if v_quote.resolved_elsewhere_at is distinct from v_first_resolved_at then
    raise exception 'Idempotent retry changed the resolved_elsewhere_at timestamp.';
  end if;

  -- A resolved recommendation can no longer be added.
  begin
    perform public.add_deferred_recommendation_to_work_order(
      '74200000-0000-4000-8000-000000000001',
      '74400000-0000-4000-8000-000000000030',
      '74600000-0000-4000-8000-000000000003',
      '74700000-0000-4000-8000-000000000096',
      '74100000-0000-4000-8000-000000000001',
      '74100000-0000-4000-8000-000000000001'
    );
  exception
    when others then
      if sqlerrm = 'DEFERRED_RECOMMENDATION_ALREADY_RESOLVED' then
        v_denied := true;
      else
        raise exception 'Unexpected error adding an already-resolved recommendation: %', sqlerrm;
      end if;
  end;

  if not v_denied then
    raise exception 'An already-resolved recommendation was added onto a work order.';
  end if;
end;
$resolve_elsewhere$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

rollback;
