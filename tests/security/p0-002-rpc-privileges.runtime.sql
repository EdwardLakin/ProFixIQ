\set ON_ERROR_STOP on

begin;

-- Prove the repaired default ACLs on objects created after the migration.
create table public.p0_002_default_table_probe (
  id integer primary key
);
create sequence public.p0_002_default_sequence_probe;
create function public.p0_002_default_function_probe()
returns integer
language sql
as $$
  select 1;
$$;

do $$
begin
  if has_table_privilege(
    'anon',
    'public.p0_002_default_table_probe',
    'SELECT'
  )
  or has_table_privilege(
    'authenticated',
    'public.p0_002_default_table_probe',
    'SELECT'
  )
  or not has_table_privilege(
    'service_role',
    'public.p0_002_default_table_probe',
    'SELECT'
  ) then
    raise exception
      'P0-002 runtime assertion failed: future table ACL is unsafe';
  end if;

  if has_sequence_privilege(
    'anon',
    'public.p0_002_default_sequence_probe',
    'USAGE'
  )
  or has_sequence_privilege(
    'authenticated',
    'public.p0_002_default_sequence_probe',
    'USAGE'
  )
  or not has_sequence_privilege(
    'service_role',
    'public.p0_002_default_sequence_probe',
    'USAGE'
  ) then
    raise exception
      'P0-002 runtime assertion failed: future sequence ACL is unsafe';
  end if;

  if has_function_privilege(
    'anon',
    'public.p0_002_default_function_probe()',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.p0_002_default_function_probe()',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.p0_002_default_function_probe()',
    'EXECUTE'
  ) then
    raise exception
      'P0-002 runtime assertion failed: future function ACL is unsafe';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '41000000-0000-4000-8000-000000000001',
    'p0-002-owner-a@example.com',
    '{"full_name":"P0-002 Owner A"}'::jsonb
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    'p0-002-owner-b@example.com',
    '{"full_name":"P0-002 Owner B"}'::jsonb
  ),
  (
    '43000000-0000-4000-8000-000000000003',
    'p0-002-tech-a@example.com',
    '{"full_name":"P0-002 Tech A"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '41000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'owner',
    'P0-002 Owner A'
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    '42000000-0000-4000-8000-000000000002',
    'owner',
    'P0-002 Owner B'
  ),
  (
    '43000000-0000-4000-8000-000000000003',
    '43000000-0000-4000-8000-000000000003',
    'mechanic',
    'P0-002 Tech A'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (
  id,
  owner_id,
  business_name,
  name,
  user_limit
) values
  (
    'a2100000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'P0-002 Shop A',
    'P0-002 Shop A',
    3
  ),
  (
    'b2200000-0000-4000-8000-000000000002',
    '42000000-0000-4000-8000-000000000002',
    'P0-002 Shop B',
    'P0-002 Shop B',
    3
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '42000000-0000-4000-8000-000000000002'::uuid
    then 'b2200000-0000-4000-8000-000000000002'::uuid
  else 'a2100000-0000-4000-8000-000000000001'::uuid
end
where id in (
  '41000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000002',
  '43000000-0000-4000-8000-000000000003'
);

insert into public.parts (id, shop_id, name, part_number, sku)
values
  (
    'a2300000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    'P0-002 Part A',
    'P0-002-A',
    'P0-002-A'
  ),
  (
    'b2400000-0000-4000-8000-000000000002',
    'b2200000-0000-4000-8000-000000000002',
    'P0-002 Part B',
    'P0-002-B',
    'P0-002-B'
  );

insert into public.stock_locations (id, shop_id, code, name)
values
  (
    'a2500000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    'P02A',
    'P0-002 Location A'
  ),
  (
    'b2600000-0000-4000-8000-000000000002',
    'b2200000-0000-4000-8000-000000000002',
    'P02B',
    'P0-002 Location B'
  );

do $$
begin
  if has_function_privilege(
    'anon',
    'public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'authenticated',
    'public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'P0-002 runtime assertion failed: hardened stock RPC ACL is wrong';
  end if;

  if has_function_privilege(
    'anon',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'service_role',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'P0-002 runtime assertion failed: unsafe enum overload remains exposed';
  end if;

  if has_function_privilege(
    'anon',
    'private.profixiq_apply_stock_move_core(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'private.profixiq_apply_stock_move_core(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'service_role',
    'private.profixiq_apply_stock_move_core(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'P0-002 runtime assertion failed: private stock core is exposed';
  end if;

  if has_function_privilege(
    'anon',
    'public.increment_user_limit(uuid,integer)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.increment_user_limit(uuid,integer)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.increment_user_limit(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception
      'P0-002 runtime assertion failed: user-limit RPC ACL is wrong';
  end if;
end
$$;

create function pg_temp.expect_stock_move_denied(
  p_part uuid,
  p_location uuid,
  p_reference uuid
) returns void
language plpgsql
as $$
begin
  begin
    perform public.apply_stock_move(
      p_part,
      p_location,
      1,
      'receive',
      'p0_002_denied',
      p_reference
    );
  exception when insufficient_privilege then
    return;
  end;

  raise exception
    'P0-002 runtime assertion failed: denied stock move succeeded';
end;
$$;
grant execute on function pg_temp.expect_stock_move_denied(uuid, uuid, uuid)
  to anon, authenticated;

create function pg_temp.expect_user_limit_denied()
returns void
language plpgsql
as $$
begin
  begin
    perform public.increment_user_limit(
      'a2100000-0000-4000-8000-000000000001',
      1
    );
  exception when insufficient_privilege then
    return;
  end;

  raise exception
    'P0-002 runtime assertion failed: denied user-limit mutation succeeded';
end;
$$;
grant execute on function pg_temp.expect_user_limit_denied()
  to anon, authenticated;

set local role anon;
select pg_temp.expect_stock_move_denied(
  'a2300000-0000-4000-8000-000000000001',
  'a2500000-0000-4000-8000-000000000001',
  'a2700000-0000-4000-8000-000000000001'
);
select pg_temp.expect_user_limit_denied();
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '41000000-0000-4000-8000-000000000001',
  true
);

create temp table p0_002_move_results (
  attempt text primary key,
  move_id uuid not null
);
grant select, insert on table p0_002_move_results to authenticated;

set local role authenticated;
insert into p0_002_move_results (attempt, move_id)
select
  'first',
  public.apply_stock_move(
    'a2300000-0000-4000-8000-000000000001',
    'a2500000-0000-4000-8000-000000000001',
    5,
    'receive',
    'parts_request_initial_stock',
    'a2300000-0000-4000-8000-000000000001'
  );

insert into p0_002_move_results (attempt, move_id)
select
  'replay',
  public.apply_stock_move(
    'a2300000-0000-4000-8000-000000000001',
    'a2500000-0000-4000-8000-000000000001',
    5,
    'receive',
    'parts_request_initial_stock',
    'a2300000-0000-4000-8000-000000000001'
  );
reset role;

do $$
begin
  if not exists (
    select 1
    from p0_002_move_results first_attempt
    join p0_002_move_results replay
      on replay.attempt = 'replay'
     and replay.move_id = first_attempt.move_id
    where first_attempt.attempt = 'first'
  ) then
    raise exception
      'P0-002 runtime assertion failed: stable retry returned another move';
  end if;

  if (
    select count(*)
    from public.stock_moves
    where shop_id = 'a2100000-0000-4000-8000-000000000001'
      and reference_kind = 'parts_request_initial_stock'
  ) <> 1 then
    raise exception
      'P0-002 runtime assertion failed: stable retry duplicated stock';
  end if;
end
$$;

create function pg_temp.expect_idempotency_conflict()
returns void
language plpgsql
as $$
begin
  begin
    perform public.apply_stock_move(
      'a2300000-0000-4000-8000-000000000001',
      'a2500000-0000-4000-8000-000000000001',
      6,
      'receive',
      'parts_request_initial_stock',
      'a2300000-0000-4000-8000-000000000001'
    );
  exception when invalid_parameter_value then
    if sqlerrm = 'STOCK_MOVE_IDEMPOTENCY_CONFLICT' then
      return;
    end if;
    raise;
  end;

  raise exception
    'P0-002 runtime assertion failed: conflicting retry succeeded';
end;
$$;
grant execute on function pg_temp.expect_idempotency_conflict()
  to authenticated;

set local role authenticated;
select pg_temp.expect_idempotency_conflict();

-- A rolling-deployment placeholder remains intentionally non-idempotent.
select public.apply_stock_move(
  'a2300000-0000-4000-8000-000000000001',
  'a2500000-0000-4000-8000-000000000001',
  1,
  'receive',
  'manual_receive',
  'a2300000-0000-4000-8000-000000000001'
);
select public.apply_stock_move(
  'a2300000-0000-4000-8000-000000000001',
  'a2500000-0000-4000-8000-000000000001',
  1,
  'receive',
  'manual_receive',
  'a2300000-0000-4000-8000-000000000001'
);

select public.apply_stock_move(
  'a2300000-0000-4000-8000-000000000001',
  'a2500000-0000-4000-8000-000000000001',
  2,
  'consume',
  'p0_002_consumption',
  'a2800000-0000-4000-8000-000000000001'
);

select pg_temp.expect_user_limit_denied();
reset role;

-- Shop B cannot mutate Shop A.
select set_config(
  'request.jwt.claim.sub',
  '42000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select pg_temp.expect_stock_move_denied(
  'a2300000-0000-4000-8000-000000000001',
  'a2500000-0000-4000-8000-000000000001',
  'b2900000-0000-4000-8000-000000000002'
);
reset role;

-- Same-shop technicians cannot mutate inventory.
select set_config(
  'request.jwt.claim.sub',
  '43000000-0000-4000-8000-000000000003',
  true
);
set local role authenticated;
select pg_temp.expect_stock_move_denied(
  'a2300000-0000-4000-8000-000000000001',
  'a2500000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003'
);
reset role;

-- An allowed Shop A actor still cannot bind a Shop B location.
select set_config(
  'request.jwt.claim.sub',
  '41000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select pg_temp.expect_stock_move_denied(
  'a2300000-0000-4000-8000-000000000001',
  'b2600000-0000-4000-8000-000000000002',
  'a3100000-0000-4000-8000-000000000001'
);
reset role;

-- Server-only flows retain their intended capability.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
select public.apply_stock_move(
  'b2400000-0000-4000-8000-000000000002',
  'b2600000-0000-4000-8000-000000000002',
  3,
  'receive',
  'p0_002_service_receive',
  'b3200000-0000-4000-8000-000000000002'
);
select public.increment_user_limit(
  'a2100000-0000-4000-8000-000000000001',
  2
);
reset role;

do $$
begin
  if public.parts_on_hand(
    'a2100000-0000-4000-8000-000000000001',
    'a2300000-0000-4000-8000-000000000001',
    'a2500000-0000-4000-8000-000000000001'
  ) <> 5 then
    raise exception
      'P0-002 runtime assertion failed: Shop A ledger total is wrong';
  end if;

  if not exists (
    select 1
    from public.part_stock
    where part_id = 'a2300000-0000-4000-8000-000000000001'
      and location_id = 'a2500000-0000-4000-8000-000000000001'
      and qty_on_hand = 5
  ) then
    raise exception
      'P0-002 runtime assertion failed: legacy stock cache is wrong';
  end if;

  if (
    select c.relkind = 'v'
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'part_stock_summary'
  ) then
    if not exists (
      select 1
      from public.part_stock_summary
      where part_id = 'a2300000-0000-4000-8000-000000000001'
        and shop_id = 'a2100000-0000-4000-8000-000000000001'
        and on_hand = 5
    ) then
      raise exception
        'P0-002 runtime assertion failed: stock summary view is wrong';
    end if;
  else
    if not exists (
      select 1
      from public.part_stock_summary
      where part_id = 'a2300000-0000-4000-8000-000000000001'
        and location_id = 'a2500000-0000-4000-8000-000000000001'
        and shop_id = 'a2100000-0000-4000-8000-000000000001'
        and qty_on_hand = 5
    ) then
      raise exception
        'P0-002 runtime assertion failed: baseline stock summary cache is wrong';
    end if;
  end if;

  if public.parts_on_hand(
    'b2200000-0000-4000-8000-000000000002',
    'b2400000-0000-4000-8000-000000000002',
    'b2600000-0000-4000-8000-000000000002'
  ) <> 3 then
    raise exception
      'P0-002 runtime assertion failed: service-role receipt failed';
  end if;

  if not exists (
    select 1
    from public.shops
    where id = 'a2100000-0000-4000-8000-000000000001'
      -- The canonical billing trigger normalizes the insert to the default
      -- plan cap (10) before this service-only RPC increments it by 2.
      and user_limit = 12
  ) then
    raise exception
      'P0-002 runtime assertion failed: service user-limit mutation failed after plan normalization';
  end if;

  if exists (
    select 1
    from public.stock_moves
    where reference_kind = 'p0_002_denied'
  ) then
    raise exception
      'P0-002 runtime assertion failed: a denied stock move persisted';
  end if;
end
$$;

select 'p0_002_rpc_privileges_runtime_ok' as result;

rollback;
