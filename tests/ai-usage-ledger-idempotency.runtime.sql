begin;

-- Uses an existing shop/profile pair and rolls back. If a clean replay has no
-- fixtures this block becomes a no-op; deterministic fixture suites can supply
-- canonical ids without changing this migration contract.
do $test$
declare
  v_shop uuid;
  v_user uuid;
  v_first uuid;
  v_second uuid;
begin
  select p.shop_id, p.id
  into v_shop, v_user
  from public.profiles p
  where p.shop_id is not null
  order by p.created_at nulls last
  limit 1;

  if v_shop is null or v_user is null then
    return;
  end if;

  v_first := public.record_ai_usage_ledger(
    'runtime-test-event', v_shop, v_user, 'runtime_test', '/runtime-test',
    'openai', 'gpt-5.4-mini', 'text', 'runtime-test-rate-card',
    100, 20, 10, 110, null, null, null, null, 0.0001, 1,
    'success', null, null, 'runtime-provider-request', null, clock_timestamp()
  );

  v_second := public.record_ai_usage_ledger(
    'runtime-test-event', v_shop, v_user, 'runtime_test', '/runtime-test',
    'openai', 'gpt-5.4-mini', 'text', 'runtime-test-rate-card',
    100, 20, 10, 110, null, null, null, null, 0.0001, 1,
    'success', null, null, 'runtime-provider-request', null, clock_timestamp()
  );

  if v_first is null or v_second is null or v_first <> v_second then
    raise exception 'AI usage ledger idempotency failed';
  end if;

  if (select count(*) from private.ai_usage_ledger where event_key = 'runtime-test-event') <> 1 then
    raise exception 'AI usage ledger duplicate row created';
  end if;
end
$test$;

rollback;
