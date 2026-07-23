\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'parts-runtime-owner@example.com',
    '{"full_name":"Parts Runtime Owner"}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'parts-runtime-attacker@example.com',
    '{"full_name":"Parts Runtime Attacker"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'owner',
    'Parts Runtime Owner'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'owner',
    'Parts Runtime Attacker'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Runtime Shop A',
    'Runtime Shop A'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'Runtime Shop B',
    'Runtime Shop B'
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '10000000-0000-4000-8000-000000000001'::uuid
    then 'a0000000-0000-4000-8000-000000000001'::uuid
  else 'b0000000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);

insert into public.work_orders (id, shop_id, status, type)
values (
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'in_progress',
  'repair'
);

insert into public.work_order_lines (
  id,
  work_order_id,
  shop_id,
  status,
  approval_state,
  assigned_tech_id
) values (
  'd0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'active',
  'approved',
  '10000000-0000-4000-8000-000000000001'
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
) values (
  'e0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Runtime Brake Pad',
  'RUNTIME-BP',
  'RUNTIME-BP',
  10,
  11,
  null,
  25
);

insert into public.stock_locations (id, shop_id, code, name)
values (
  'f0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'MAIN',
  'Main'
);

insert into public.stock_moves (
  shop_id,
  part_id,
  location_id,
  qty_change,
  reason,
  reference_kind,
  reference_id,
  created_by,
  idempotency_key,
  lifecycle_quantity,
  metadata
) values (
  'a0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  10,
  'receive',
  'runtime_fixture',
  'e0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001:runtime:receive',
  10,
  '{"operation":"runtime_fixture"}'::jsonb
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

create temp table direct_runtime_results (
  attempt text primary key,
  result jsonb not null
);
grant select, insert on table direct_runtime_results to authenticated;

set local role authenticated;
insert into direct_runtime_results (attempt, result)
select
  'first',
  public.parts_attach_and_issue_line_part_atomic(
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    2.5,
    12,
    'a0000000-0000-4000-8000-000000000001:runtime:direct-use-1'
  );
reset role;

do $$
declare
  v_wop public.work_order_parts%rowtype;
begin
  select *
    into v_wop
  from public.work_order_parts
  where work_order_line_id =
      'd0000000-0000-4000-8000-000000000001'
    and part_id = 'e0000000-0000-4000-8000-000000000001'
    and source_parts_request_item_id is null
    and is_active;

  if not found then
    raise exception 'Runtime assertion failed: canonical direct WOP missing.';
  end if;
  if v_wop.quantity <> 2.5
     or v_wop.quantity_requested <> 2.5
     or v_wop.quantity_consumed <> 2.5
     or v_wop.quantity_allocated <> 0 then
    raise exception 'Runtime assertion failed: direct WOP counters are wrong.';
  end if;
  if v_wop.unit_price <> 25
     or v_wop.unit_sell_price_snapshot <> 25
     or v_wop.total_price <> 62.5 then
    raise exception
      'Runtime assertion failed: default sell-price fallback is wrong.';
  end if;
  if (
    select count(*)
    from public.work_order_part_allocations
    where work_order_part_id = v_wop.id
  ) <> 0 then
    raise exception 'Runtime assertion failed: full issue left an allocation.';
  end if;
  if (
    select count(*)
    from public.stock_moves
    where work_order_part_id = v_wop.id
      and lower(reason::text) = 'wo_allocate'
  ) <> 1 then
    raise exception 'Runtime assertion failed: allocation audit is missing.';
  end if;
  if (
    select count(*)
    from public.stock_moves
    where work_order_part_id = v_wop.id
      and lower(reason::text) = 'consume'
  ) <> 1 then
    raise exception 'Runtime assertion failed: consume move count is wrong.';
  end if;
  if public.parts_on_hand(
    v_wop.shop_id,
    v_wop.part_id,
    'f0000000-0000-4000-8000-000000000001'
  ) <> 7.5 then
    raise exception 'Runtime assertion failed: on-hand did not decrease once.';
  end if;
end
$$;

create function pg_temp.expect_idempotency_conflict()
returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_attach_and_issue_line_part_atomic(
      'd0000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001',
      1,
      12,
      'a0000000-0000-4000-8000-000000000001:runtime:direct-use-1'
    );
  exception when others then
    if sqlerrm = 'PARTS_IDEMPOTENCY_KEY_CONFLICT' then
      return;
    end if;
    raise;
  end;
  raise exception 'Runtime assertion failed: conflicting retry succeeded.';
end;
$$;

set local role authenticated;
select pg_temp.expect_idempotency_conflict();
reset role;

-- A new operation for the same line/part must reuse the canonical direct WOP.
set local role authenticated;
select public.parts_attach_and_issue_line_part_atomic(
  'd0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  0.5,
  null,
  'a0000000-0000-4000-8000-000000000001:runtime:direct-use-2'
);
reset role;

do $$
begin
  if (
    select count(*)
    from public.work_order_parts
    where work_order_line_id =
        'd0000000-0000-4000-8000-000000000001'
      and part_id = 'e0000000-0000-4000-8000-000000000001'
      and source_parts_request_item_id is null
      and is_active
  ) <> 1 then
    raise exception 'Runtime assertion failed: direct WOP was duplicated.';
  end if;
  if not exists (
    select 1
    from public.work_order_parts
    where work_order_line_id =
        'd0000000-0000-4000-8000-000000000001'
      and part_id = 'e0000000-0000-4000-8000-000000000001'
      and source_parts_request_item_id is null
      and quantity = 3
      and quantity_requested = 3
      and quantity_consumed = 3
      and quantity_allocated = 0
  ) then
    raise exception 'Runtime assertion failed: reused WOP counters are wrong.';
  end if;
end
$$;

-- Replay after another successful mutation. The durable receipt must remain
-- stable instead of recomputing live inventory state.
set local role authenticated;
insert into direct_runtime_results (attempt, result)
select
  'replay',
  public.parts_attach_and_issue_line_part_atomic(
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    2.5,
    12,
    'a0000000-0000-4000-8000-000000000001:runtime:direct-use-1'
  );
reset role;

do $$
declare
  v_first jsonb;
  v_replay jsonb;
begin
  select result into v_first
  from direct_runtime_results
  where attempt = 'first';

  select result into v_replay
  from direct_runtime_results
  where attempt = 'replay';

  if coalesce((v_replay ->> 'idempotent')::boolean, false) is not true
     or (v_first - 'idempotent') is distinct from
       (v_replay - 'idempotent') then
    raise exception
      'Runtime assertion failed: replay did not return the durable receipt.';
  end if;
  if (
    select count(*)
    from public.stock_moves
    where idempotency_key =
      'a0000000-0000-4000-8000-000000000001:runtime:direct-use-1'
  ) <> 1 then
    raise exception 'Runtime assertion failed: replay duplicated consumption.';
  end if;
  if public.parts_on_hand(
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001'
  ) <> 7 then
    raise exception 'Runtime assertion failed: replay changed on-hand.';
  end if;
end
$$;

-- Seed the durable receipt shape written by the 3a4dfee API, then retry that
-- request through the new canonical RPC. A lost response across the deployment
-- boundary must not consume the part twice.
insert into public.work_order_part_allocations (
  work_order_line_id,
  work_order_id,
  shop_id,
  part_id,
  location_id,
  qty,
  unit_cost,
  work_order_part_id
)
select
  work_order_line_id,
  work_order_id,
  shop_id,
  part_id,
  'f0000000-0000-4000-8000-000000000001',
  1,
  11,
  id
from public.work_order_parts
where work_order_line_id =
    'd0000000-0000-4000-8000-000000000001'
  and part_id = 'e0000000-0000-4000-8000-000000000001'
  and source_parts_request_item_id is null
  and is_active;

-- Reproduce the deployed direct-use counter update without allowing the
-- approved-line auto-request trigger to reinterpret it as request lineage.
select set_config('app.parts_direct_use', '1', true);
update public.work_order_parts
set quantity = quantity + 1,
    quantity_requested = quantity_requested + 1,
    quantity_received = quantity_received + 1,
    quantity_allocated = quantity_allocated + 1,
    total_price = total_price + 25,
    updated_at = now()
where work_order_line_id =
    'd0000000-0000-4000-8000-000000000001'
  and part_id = 'e0000000-0000-4000-8000-000000000001'
  and source_parts_request_item_id is null
  and is_active;
select set_config('app.parts_direct_use', '0', true);

set local role authenticated;
select public.parts_issue_work_order_part(
  (
    select (result ->> 'work_order_part_id')::uuid
    from direct_runtime_results
    where attempt = 'first'
  ),
  'f0000000-0000-4000-8000-000000000001',
  1,
  'a0000000-0000-4000-8000-000000000001:issue:a0000000-0000-4000-8000-000000000001:legacy-consume:cross-release'
);

insert into direct_runtime_results (attempt, result)
select
  'legacy_replay',
  public.parts_attach_and_issue_line_part_atomic(
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    1,
    null,
    'a0000000-0000-4000-8000-000000000001:issue:a0000000-0000-4000-8000-000000000001:legacy-consume:cross-release'
  );
reset role;

do $$
begin
  if not exists (
    select 1
    from direct_runtime_results
    where attempt = 'legacy_replay'
      and result @> jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'operation', 'legacy_issue_replay',
        'issued_qty', 1
      )
  ) then
    raise exception
      'Runtime assertion failed: legacy deployment retry was not recognized.';
  end if;
  if (
    select count(*)
    from public.stock_moves
    where idempotency_key =
      'a0000000-0000-4000-8000-000000000001:issue:a0000000-0000-4000-8000-000000000001:legacy-consume:cross-release'
      and lower(reason::text) = 'consume'
  ) <> 1 then
    raise exception
      'Runtime assertion failed: legacy deployment retry consumed twice.';
  end if;
  if not exists (
    select 1
    from public.work_order_parts
    where work_order_line_id =
        'd0000000-0000-4000-8000-000000000001'
      and part_id = 'e0000000-0000-4000-8000-000000000001'
      and quantity = 4
      and quantity_requested = 4
      and quantity_consumed = 4
      and quantity_allocated = 0
  ) then
    raise exception
      'Runtime assertion failed: cross-release WOP counters are wrong.';
  end if;
  if public.parts_on_hand(
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001'
  ) <> 6 then
    raise exception
      'Runtime assertion failed: legacy retry changed on-hand twice.';
  end if;
end
$$;

create function pg_temp.expect_insufficient_stock()
returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_attach_and_issue_line_part_atomic(
      'd0000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001',
      99,
      null,
      'a0000000-0000-4000-8000-000000000001:runtime:insufficient'
    );
  exception when others then
    if sqlerrm = 'Insufficient available stock.' then
      return;
    end if;
    raise;
  end;
  raise exception 'Runtime assertion failed: insufficient stock succeeded.';
end;
$$;

set local role authenticated;
select pg_temp.expect_insufficient_stock();
reset role;

do $$
begin
  if exists (
    select 1
    from public.stock_moves
    where idempotency_key like
      'a0000000-0000-4000-8000-000000000001:runtime:insufficient%'
  ) then
    raise exception 'Runtime assertion failed: failed use left stock moves.';
  end if;
  if public.parts_on_hand(
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001'
  ) <> 6 then
    raise exception 'Runtime assertion failed: failed use changed on-hand.';
  end if;
end
$$;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.parts_issue_work_order_part(uuid,uuid,numeric,text)',
    'EXECUTE'
  ) then
    raise exception
      'Runtime assertion failed: authenticated cannot execute low-level issue RPC.';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.parts_attach_and_issue_line_part_atomic(uuid,uuid,uuid,numeric,numeric,text)',
    'EXECUTE'
  ) then
    raise exception
      'Runtime assertion failed: authenticated cannot execute canonical Use Part RPC.';
  end if;
end
$$;

create function pg_temp.expect_cross_shop_denied(
  p_work_order_part_id uuid
) returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_issue_work_order_part(
      p_work_order_part_id,
      'f0000000-0000-4000-8000-000000000001',
      1,
      'a0000000-0000-4000-8000-000000000001:runtime:cross-shop'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'Runtime assertion failed: cross-shop direct RPC succeeded.';
end;
$$;

create function pg_temp.expect_cross_shop_canonical_denied()
returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_attach_and_issue_line_part_atomic(
      'd0000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000001',
      1,
      null,
      'a0000000-0000-4000-8000-000000000001:runtime:cross-shop-canonical'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception
    'Runtime assertion failed: cross-shop canonical RPC succeeded.';
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select pg_temp.expect_cross_shop_denied((
  select (result ->> 'work_order_part_id')::uuid
  from direct_runtime_results
  where attempt = 'first'
));
select pg_temp.expect_cross_shop_canonical_denied();
reset role;

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

-- Exercise the real Complete handoff against the hardened issue primitive.
insert into public.part_requests (
  id,
  shop_id,
  work_order_id,
  job_id,
  requested_by,
  status
) values (
  '90000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'approved'
);

insert into public.part_request_items (
  id,
  request_id,
  shop_id,
  work_order_id,
  work_order_line_id,
  part_id,
  description,
  qty,
  qty_requested,
  qty_approved,
  qty_received,
  quoted_price,
  unit_price,
  unit_cost,
  status,
  approved
) values (
  '91000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'Runtime handoff part',
  1,
  1,
  1,
  1,
  25,
  25,
  11,
  'received',
  true
);

create function pg_temp.expect_cross_shop_attach_denied()
returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_attach_request_item(
      '91000000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then
    return;
  end;
  raise exception
    'Runtime assertion failed: cross-shop request-item attach succeeded.';
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select pg_temp.expect_cross_shop_attach_denied();
reset role;

do $$
begin
  if exists (
    select 1
    from public.work_order_parts
    where source_parts_request_item_id =
      '91000000-0000-4000-8000-000000000001'
  ) then
    raise exception
      'Runtime assertion failed: denied attach materialized a WOP.';
  end if;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select public.parts_attach_request_item(
  '91000000-0000-4000-8000-000000000001'
);
select public.parts_allocate_request_item(
  '91000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  1,
  'a0000000-0000-4000-8000-000000000001:runtime:handoff:allocate'
);
reset role;

create temp table handoff_runtime_results (
  attempt text primary key,
  result jsonb not null
);
grant select, insert on table handoff_runtime_results to authenticated;

set local role authenticated;
insert into handoff_runtime_results (attempt, result)
select
  'first',
  public.parts_complete_request_handoff_atomic(
    'a0000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001:parts-handoff:90000000-0000-4000-8000-000000000001:runtime',
    now()
  );
reset role;

do $$
begin
  if not exists (
    select 1
    from handoff_runtime_results
    where attempt = 'first'
      and result @> jsonb_build_object(
        'ok', true,
        'idempotent', false,
        'request_id', '90000000-0000-4000-8000-000000000001'::uuid,
        'status', 'fulfilled'
      )
  ) then
    raise exception 'Runtime assertion failed: first handoff result is wrong.';
  end if;
  if not exists (
    select 1
    from public.part_requests
    where id = '90000000-0000-4000-8000-000000000001'
      and status::text = 'fulfilled'
      and handoff_completed_at is not null
      and handoff_completed_by =
        '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Runtime assertion failed: request was not fulfilled.';
  end if;
  if not exists (
    select 1
    from public.part_request_items
    where id = '91000000-0000-4000-8000-000000000001'
      and qty_reserved = 0
      and qty_consumed = 1
      and status::text = 'consumed'
  ) then
    raise exception 'Runtime assertion failed: request item was not consumed.';
  end if;
  if exists (
    select 1
    from public.work_order_part_allocations allocation
    join public.work_order_parts work_order_part
      on work_order_part.id = allocation.work_order_part_id
    where work_order_part.source_parts_request_item_id =
      '91000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Runtime assertion failed: handoff left an allocation.';
  end if;
  if not exists (
    select 1
    from public.work_order_parts
    where source_parts_request_item_id =
      '91000000-0000-4000-8000-000000000001'
      and quantity_requested = 1
      and quantity_allocated = 0
      and quantity_consumed = 1
      and lifecycle_status = 'consumed'
  ) then
    raise exception 'Runtime assertion failed: handoff WOP counters are wrong.';
  end if;
  if (
    select count(*)
    from public.parts_request_handoff_keys
    where request_id = '90000000-0000-4000-8000-000000000001'
      and result = (
        select result
        from handoff_runtime_results
        where attempt = 'first'
      )
  ) <> 1 then
    raise exception 'Runtime assertion failed: handoff receipt is wrong.';
  end if;
  if (
    select count(*)
    from public.stock_moves move
    join public.work_order_parts work_order_part
      on work_order_part.id = move.work_order_part_id
    where move.part_request_item_id =
      '91000000-0000-4000-8000-000000000001'
      and work_order_part.source_parts_request_item_id =
        '91000000-0000-4000-8000-000000000001'
      and lower(move.reason::text) = 'consume'
      and move.qty_change = -1
      and move.created_by =
        '10000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Runtime assertion failed: handoff consume lineage is wrong.';
  end if;
  if public.parts_on_hand(
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001'
  ) <> 5 then
    raise exception 'Runtime assertion failed: handoff on-hand is wrong.';
  end if;
end
$$;

-- Replay Complete and prove it does not issue the staged part twice.
set local role authenticated;
insert into handoff_runtime_results (attempt, result)
select
  'replay',
  public.parts_complete_request_handoff_atomic(
    'a0000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001:parts-handoff:90000000-0000-4000-8000-000000000001:runtime',
    now()
  );
reset role;

do $$
begin
  if not exists (
    select 1
    from handoff_runtime_results first_attempt
    join handoff_runtime_results replay
      on replay.attempt = 'replay'
    where first_attempt.attempt = 'first'
      and (first_attempt.result - 'idempotent') =
        (replay.result - 'idempotent')
      and replay.result ->> 'idempotent' = 'true'
  ) then
    raise exception 'Runtime assertion failed: handoff replay result changed.';
  end if;
  if (
    select count(*)
    from public.stock_moves
    where part_request_item_id =
      '91000000-0000-4000-8000-000000000001'
      and lower(reason::text) = 'consume'
  ) <> 1 then
    raise exception 'Runtime assertion failed: handoff replay issued twice.';
  end if;
  if (
    select count(*)
    from public.parts_request_handoff_keys
    where request_id = '90000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Runtime assertion failed: handoff replay duplicated receipt.';
  end if;
  if public.parts_on_hand(
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001'
  ) <> 5 then
    raise exception 'Runtime assertion failed: handoff replay changed on-hand.';
  end if;
end
$$;

-- Build an inconsistent two-item package. The second item advertises reserved
-- stock but has no allocation, so Complete must roll back the first item issue.
insert into public.part_requests (
  id,
  shop_id,
  work_order_id,
  job_id,
  requested_by,
  status
) values (
  '92000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'approved'
);

insert into public.part_request_items (
  id,
  request_id,
  shop_id,
  work_order_id,
  work_order_line_id,
  part_id,
  description,
  qty,
  qty_requested,
  qty_approved,
  qty_received,
  quoted_price,
  unit_price,
  unit_cost,
  status,
  approved
) values
  (
    '93000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'Runtime rollback first item',
    1,
    1,
    1,
    1,
    25,
    25,
    11,
    'received',
    true
  ),
  (
    '94000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'Runtime rollback missing allocation',
    1,
    1,
    1,
    1,
    25,
    25,
    11,
    'received',
    true
  );

set local role authenticated;
select public.parts_attach_request_item(
  '93000000-0000-4000-8000-000000000003'
);
select public.parts_attach_request_item(
  '94000000-0000-4000-8000-000000000004'
);
select public.parts_allocate_request_item(
  '93000000-0000-4000-8000-000000000003',
  'f0000000-0000-4000-8000-000000000001',
  1,
  'a0000000-0000-4000-8000-000000000001:runtime:rollback:allocate'
);
reset role;

update public.part_request_items
set qty_reserved = 1,
    status = 'reserved'
where id = '94000000-0000-4000-8000-000000000004';

update public.work_order_parts
set quantity_allocated = 1
where source_parts_request_item_id =
  '94000000-0000-4000-8000-000000000004';

create function pg_temp.expect_handoff_rollback()
returns void
language plpgsql
as $$
begin
  begin
    perform public.parts_complete_request_handoff_atomic(
      'a0000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001:parts-handoff:92000000-0000-4000-8000-000000000002:runtime',
      now()
    );
  exception when others then
    if sqlerrm like 'Staged allocation is incomplete%' then
      return;
    end if;
    raise;
  end;
  raise exception 'Runtime assertion failed: inconsistent handoff succeeded.';
end;
$$;

set local role authenticated;
select pg_temp.expect_handoff_rollback();
reset role;

do $$
begin
  if not exists (
    select 1
    from public.work_order_part_allocations allocation
    join public.work_order_parts work_order_part
      on work_order_part.id = allocation.work_order_part_id
    where work_order_part.source_parts_request_item_id =
      '93000000-0000-4000-8000-000000000003'
      and allocation.qty = 1
  ) then
    raise exception 'Runtime assertion failed: failed handoff consumed allocation.';
  end if;
  if exists (
    select 1
    from public.stock_moves
    where idempotency_key like
      'a0000000-0000-4000-8000-000000000001:parts-handoff:92000000-0000-4000-8000-000000000002:runtime:allocation:%'
  ) then
    raise exception 'Runtime assertion failed: failed handoff left a consume move.';
  end if;
  if exists (
    select 1
    from public.parts_request_handoff_keys
    where request_id = '92000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Runtime assertion failed: failed handoff stored a receipt.';
  end if;
  if not exists (
    select 1
    from public.part_requests
    where id = '92000000-0000-4000-8000-000000000002'
      and status::text <> 'fulfilled'
      and handoff_completed_at is null
      and handoff_completed_by is null
  ) then
    raise exception 'Runtime assertion failed: failed request state changed.';
  end if;
  if (
    select count(*)
    from public.part_request_items
    where id in (
      '93000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000004'
    )
      and qty_reserved = 1
      and qty_consumed = 0
  ) <> 2 then
    raise exception 'Runtime assertion failed: failed item counters changed.';
  end if;
  if (
    select count(*)
    from public.work_order_parts
    where source_parts_request_item_id in (
      '93000000-0000-4000-8000-000000000003',
      '94000000-0000-4000-8000-000000000004'
    )
      and quantity_allocated = 1
      and quantity_consumed = 0
  ) <> 2 then
    raise exception 'Runtime assertion failed: failed WOP counters changed.';
  end if;
  if public.parts_on_hand(
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001'
  ) <> 5 then
    raise exception 'Runtime assertion failed: failed handoff changed on-hand.';
  end if;
end
$$;

select 'use_part_handoff_runtime_ok' as result;

rollback;
