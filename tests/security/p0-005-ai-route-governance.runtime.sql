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

  if has_schema_privilege('anon', 'private', 'USAGE')
     or has_schema_privilege('authenticated', 'private', 'USAGE')
     or has_table_privilege('anon', 'private.ai_usage_ledger', 'SELECT')
     or has_table_privilege('authenticated', 'private.ai_usage_ledger', 'SELECT')
     or not has_schema_privilege('service_role', 'private', 'USAGE')
     or not has_table_privilege('service_role', 'private.ai_usage_ledger', 'SELECT')
     or not has_table_privilege('service_role', 'private.ai_usage_ledger', 'INSERT') then
    raise exception 'P0-005 runtime assertion failed: private AI usage ledger ACL is unsafe';
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

set local role authenticated;

do $$
begin
  begin
    perform public.insert_ai_event(
      null,
      'ai_usage_record',
      jsonb_build_object(
        'event_key', 'p0-005-authenticated-ledger-attempt',
        'feature', 'dtc_suggest',
        'endpoint', '/api/work-orders/dtc-suggest',
        'provider', 'openai',
        'modality', 'text',
        'rate_card_version', 'runtime-test',
        'latency_ms', 1,
        'status', 'success'
      ),
      null,
      null,
      null,
      '__durable_ai_usage_ledger__'
    );
    raise exception 'P0-005 runtime assertion failed: authenticated actor wrote private AI ledger';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;
set local role service_role;

do $$
declare
  v_first uuid;
  v_retry uuid;
  v_provider_first uuid;
  v_provider_retry uuid;
  v_count integer;
begin
  begin
    perform public.insert_ai_event(
      'b5200000-0000-4000-8000-000000000002',
      'ai_usage_record',
      jsonb_build_object(
        'event_key', 'p0-005-cross-shop-ledger',
        'feature', 'dtc_suggest',
        'endpoint', '/api/work-orders/dtc-suggest',
        'provider', 'openai',
        'modality', 'text',
        'rate_card_version', 'runtime-test',
        'latency_ms', 1,
        'status', 'success'
      ),
      null,
      null,
      '55000000-0000-4000-8000-000000000001',
      '__durable_ai_usage_ledger__'
    );
    raise exception 'P0-005 runtime assertion failed: cross-shop AI ledger user was accepted';
  exception
    when insufficient_privilege then null;
  end;

  select public.insert_ai_event(
    'a5100000-0000-4000-8000-000000000001',
    'ai_usage_record',
    jsonb_build_object(
      'event_key', 'p0-005-ledger-event-1',
      'feature', 'dtc_suggest',
      'endpoint', '/api/work-orders/dtc-suggest',
      'provider', 'openai',
      'model', 'gpt-5.5',
      'modality', 'text',
      'rate_card_version', 'runtime-test',
      'prompt_tokens', 100,
      'cached_prompt_tokens', 20,
      'completion_tokens', 10,
      'total_tokens', 110,
      'estimated_cost_usd', 0.001,
      'latency_ms', 50,
      'status', 'success'
    ),
    null,
    null,
    '55000000-0000-4000-8000-000000000001',
    '__durable_ai_usage_ledger__'
  ) into v_first;

  select public.insert_ai_event(
    'a5100000-0000-4000-8000-000000000001',
    'ai_usage_record',
    jsonb_build_object(
      'event_key', 'p0-005-ledger-event-1',
      'feature', 'dtc_suggest',
      'endpoint', '/api/work-orders/dtc-suggest',
      'provider', 'openai',
      'model', 'gpt-5.5',
      'modality', 'text',
      'rate_card_version', 'runtime-test',
      'latency_ms', 50,
      'status', 'success'
    ),
    null,
    null,
    '55000000-0000-4000-8000-000000000001',
    '__durable_ai_usage_ledger__'
  ) into v_retry;

  if v_first is null or v_retry is distinct from v_first then
    raise exception 'P0-005 runtime assertion failed: AI ledger event-key retry was not idempotent';
  end if;

  select count(*) into v_count
  from private.ai_usage_ledger
  where event_key = 'p0-005-ledger-event-1';

  if v_count <> 1 then
    raise exception 'P0-005 runtime assertion failed: AI ledger event-key retry duplicated rows';
  end if;

  select public.insert_ai_event(
    'a5100000-0000-4000-8000-000000000001',
    'ai_usage_record',
    jsonb_build_object(
      'event_key', 'p0-005-provider-event-1',
      'feature', 'dtc_suggest',
      'endpoint', '/api/work-orders/dtc-suggest',
      'provider', 'openai',
      'model', 'gpt-5.5',
      'modality', 'text',
      'rate_card_version', 'runtime-test',
      'latency_ms', 50,
      'status', 'success',
      'provider_request_id', 'p0-005-provider-request-1'
    ),
    null,
    null,
    '55000000-0000-4000-8000-000000000001',
    '__durable_ai_usage_ledger__'
  ) into v_provider_first;

  select public.insert_ai_event(
    'a5100000-0000-4000-8000-000000000001',
    'ai_usage_record',
    jsonb_build_object(
      'event_key', 'p0-005-provider-event-2',
      'feature', 'dtc_suggest',
      'endpoint', '/api/work-orders/dtc-suggest',
      'provider', 'openai',
      'model', 'gpt-5.5',
      'modality', 'text',
      'rate_card_version', 'runtime-test',
      'latency_ms', 50,
      'status', 'success',
      'provider_request_id', 'p0-005-provider-request-1'
    ),
    null,
    null,
    '55000000-0000-4000-8000-000000000001',
    '__durable_ai_usage_ledger__'
  ) into v_provider_retry;

  if v_provider_first is null or v_provider_retry is distinct from v_provider_first then
    raise exception 'P0-005 runtime assertion failed: provider-request retry was not idempotent';
  end if;

  select count(*) into v_count
  from private.ai_usage_ledger
  where provider = 'openai'
    and provider_request_id = 'p0-005-provider-request-1'
    and feature = 'dtc_suggest';

  if v_count <> 1 then
    raise exception 'P0-005 runtime assertion failed: provider-request retry duplicated rows';
  end if;
end
$$;

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
