\set ON_ERROR_STOP on

begin;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.consume_ai_route_quota(uuid,uuid,text,integer,integer,integer,numeric,numeric)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.consume_ai_route_quota(uuid,uuid,text,integer,integer,integer,numeric,numeric)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.consume_ai_route_quota(uuid,uuid,text,integer,integer,integer,numeric,numeric)',
    'EXECUTE'
  ) then
    raise exception 'P0-005 runtime assertion failed: claim RPC ACL is unsafe';
  end if;

  if has_function_privilege(
    'anon',
    'public.complete_ai_route_quota(uuid,uuid,uuid,text,numeric,boolean)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.complete_ai_route_quota(uuid,uuid,uuid,text,numeric,boolean)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.complete_ai_route_quota(uuid,uuid,uuid,text,numeric,boolean)',
    'EXECUTE'
  ) then
    raise exception 'P0-005 runtime assertion failed: completion RPC ACL is unsafe';
  end if;

  if has_table_privilege('anon', 'private.ai_route_usage_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'private.ai_route_usage_receipts', 'SELECT')
     or has_table_privilege('service_role', 'private.ai_route_usage_receipts', 'SELECT') then
    raise exception 'P0-005 runtime assertion failed: private usage receipts are exposed';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '55000000-0000-4000-8000-000000000001',
    'p0-005-owner-a@example.com',
    '{"full_name":"P0-005 Owner A"}'::jsonb
  ),
  (
    '56000000-0000-4000-8000-000000000002',
    'p0-005-owner-b@example.com',
    '{"full_name":"P0-005 Owner B"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '55000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    'owner',
    'P0-005 Owner A'
  ),
  (
    '56000000-0000-4000-8000-000000000002',
    '56000000-0000-4000-8000-000000000002',
    'owner',
    'P0-005 Owner B'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  (
    'a5100000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    'P0-005 Shop A',
    'P0-005 Shop A',
    3
  ),
  (
    'b5200000-0000-4000-8000-000000000002',
    '56000000-0000-4000-8000-000000000002',
    'P0-005 Shop B',
    'P0-005 Shop B',
    3
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '55000000-0000-4000-8000-000000000001'::uuid
    then 'a5100000-0000-4000-8000-000000000001'::uuid
  else 'b5200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '55000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000002'
);

set local role service_role;

do $$
declare
  v_allowed boolean;
begin
  begin
    select allowed
    into v_allowed
    from public.consume_ai_route_quota(
      'b5200000-0000-4000-8000-000000000002',
      '55000000-0000-4000-8000-000000000001',
      'dtc_suggest',
      2,
      4,
      300,
      10,
      0.1
    );
    raise exception 'P0-005 runtime assertion failed: cross-shop actor was accepted';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

do $$
declare
  v_attempt integer;
  v_allowed boolean;
  v_reason text;
  v_receipt uuid;
begin
  for v_attempt in 1..2 loop
    select allowed, receipt_id
    into v_allowed, v_receipt
    from public.consume_ai_route_quota(
      'a5100000-0000-4000-8000-000000000001',
      '55000000-0000-4000-8000-000000000001',
      'dtc_suggest',
      2,
      4,
      300,
      10,
      0.1
    );
    if not v_allowed or v_receipt is null then
      raise exception 'P0-005 runtime assertion failed: valid rate claim was denied';
    end if;
  end loop;

  select allowed, denial_reason
  into v_allowed, v_reason
  from public.consume_ai_route_quota(
    'a5100000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    'dtc_suggest',
    2,
    4,
    300,
    10,
    0.1
  );

  if v_allowed or v_reason <> 'rate_limited' then
    raise exception 'P0-005 runtime assertion failed: actor rate limit was bypassed';
  end if;
end
$$;

do $$
declare
  v_allowed boolean;
  v_reason text;
  v_receipt_one uuid;
  v_receipt_two uuid;
  v_completed boolean;
begin
  select allowed, receipt_id
  into v_allowed, v_receipt_one
  from public.consume_ai_route_quota(
    'a5100000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    'inspection_interpret',
    10,
    20,
    300,
    0.05,
    0.04
  );

  if not v_allowed or v_receipt_one is null then
    raise exception 'P0-005 runtime assertion failed: budget claim was denied';
  end if;

  select public.complete_ai_route_quota(
    v_receipt_one,
    'a5100000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    'inspection_interpret',
    0.01,
    true
  ) into v_completed;

  if not v_completed then
    raise exception 'P0-005 runtime assertion failed: valid receipt was not completed';
  end if;

  select public.complete_ai_route_quota(
    v_receipt_one,
    'a5100000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    'inspection_interpret',
    0.01,
    true
  ) into v_completed;

  if v_completed then
    raise exception 'P0-005 runtime assertion failed: receipt completion was replayable';
  end if;

  select allowed, receipt_id
  into v_allowed, v_receipt_two
  from public.consume_ai_route_quota(
    'a5100000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    'inspection_interpret',
    10,
    20,
    300,
    0.05,
    0.04
  );

  if not v_allowed or v_receipt_two is null then
    raise exception 'P0-005 runtime assertion failed: reconciled budget was not reusable';
  end if;

  select allowed, denial_reason
  into v_allowed, v_reason
  from public.consume_ai_route_quota(
    'a5100000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000001',
    'inspection_interpret',
    10,
    20,
    300,
    0.05,
    0.04
  );

  if v_allowed or v_reason <> 'hard_budget_exceeded' then
    raise exception 'P0-005 runtime assertion failed: hard budget was bypassed';
  end if;
end
$$;

reset role;
rollback;
