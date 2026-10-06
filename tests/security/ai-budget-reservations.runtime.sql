\set ON_ERROR_STOP on

-- Runtime assertions for 20261006220000_ai_shop_budget_reservations.sql.
-- Requires a database with public.shops and the anon/authenticated/service_role
-- roles. Runs in one transaction and rolls back.
begin;

insert into public.shops (id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'budget-a'),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'budget-b');

-- 1. Access control ---------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.grant_ai_budget(uuid,numeric,text,text,text,text)',
    'public.set_ai_budget_enforcement(uuid,text)',
    'public.set_ai_budget_pool_cap(uuid,text,numeric)',
    'public.reserve_ai_budget(uuid,text,text,numeric,text,uuid,integer)',
    'public.commit_ai_budget(uuid,uuid,numeric)',
    'public.release_ai_budget(uuid,uuid)',
    'public.get_ai_budget_status(uuid)',
    'public.release_stale_ai_budget_holds(uuid,integer)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE')
       or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'budget assertion failed: unsafe ACL on %', f;
    end if;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""']
            from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'budget assertion failed: % must be security definer with empty search_path', f;
    end if;
  end loop;

  foreach f in array array[
    'private.ai_shop_budgets', 'private.ai_budget_pools',
    'private.ai_budget_entries', 'private.ai_budget_reservations'
  ] loop
    if has_table_privilege('anon', f, 'SELECT')
       or has_table_privilege('authenticated', f, 'SELECT')
       or has_table_privilege('service_role', f, 'SELECT')
       or has_table_privilege('service_role', f, 'INSERT') then
      raise exception 'budget assertion failed: % is exposed', f;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = f::regclass) then
      raise exception 'budget assertion failed: % must have RLS enabled', f;
    end if;
  end loop;
end
$$;

create temp table t_ids (name text primary key, id uuid not null);
grant select, insert on t_ids to service_role;

set local role service_role;

-- 2. Shadow mode is the default: nothing is denied, nothing is held ----------
do $$
declare
  r record;
  s jsonb;
begin
  select * into r from public.reserve_ai_budget(
    'aaaaaaaa-0000-0000-0000-000000000001', 'copilot', 'technician_copilot_text', 1.00, 'shadow-1');
  if r.decision <> 'shadow_allowed' or r.denial_reason <> 'insufficient_balance' or r.replayed then
    raise exception 'shadow reserve should be allowed and flagged: %', r;
  end if;

  s := public.get_ai_budget_status('aaaaaaaa-0000-0000-0000-000000000001');
  if s->>'enforcement' <> 'shadow' or (s->>'availableUsd')::numeric <> 0
     or (s->>'shadowWouldDeny30d')::int <> 1 or (s->>'reservedUsd')::numeric <> 0 then
    raise exception 'shadow reservations must not touch the balance: %', s;
  end if;
end
$$;

-- 3. Enforce: the funded balance is the ceiling ------------------------------
do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  r record;
  g record;
  s jsonb;
begin
  perform public.set_ai_budget_enforcement(shop, 'enforce');

  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 1.00, 'unfunded-1');
  if r.decision <> 'denied' or r.denial_reason <> 'insufficient_balance' then
    raise exception 'unfunded shop must be denied when enforcing: %', r;
  end if;

  select * into g from public.grant_ai_budget(shop, 10.00, 'grant', 'manual', 'test', 'grant-1');
  if not g.applied then raise exception 'first grant must apply'; end if;
  select * into g from public.grant_ai_budget(shop, 10.00, 'grant', 'manual', 'test', 'grant-1');
  if g.applied then raise exception 'repeated grant key must not double-fund'; end if;
  if (public.get_ai_budget_status(shop)->>'fundedUsd')::numeric <> 10 then
    raise exception 'idempotent grant funded twice';
  end if;

  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 4.00, 'hold-a');
  if r.decision <> 'allowed' or r.available_usd <> 6 then
    raise exception 'first hold should leave 6 available: %', r;
  end if;
  insert into t_ids values ('hold-a', r.reservation_id);

  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 7.00, 'hold-too-big');
  if r.decision <> 'denied' then
    raise exception 'a hold above the available balance must be denied: %', r;
  end if;

  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 6.00, 'hold-b');
  if r.decision <> 'allowed' or r.available_usd <> 0 then
    raise exception 'exact-fit hold must be allowed: %', r;
  end if;
  insert into t_ids values ('hold-b', r.reservation_id);

  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 0.01, 'hold-c');
  if r.decision <> 'denied' then
    raise exception 'no balance left, must deny: %', r;
  end if;

  -- A key that is already running must never authorize a second provider call.
  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 4.00, 'hold-a');
  if not r.replayed or r.decision <> 'in_progress'
     or r.reservation_id <> (select id from t_ids where name = 'hold-a') then
    raise exception 'replay of a running key must report in_progress: %', r;
  end if;

  s := public.get_ai_budget_status(shop);
  if (s->>'reservedUsd')::numeric <> 10 or (s->>'deniedCount30d')::int <> 3 then
    raise exception 'unexpected status after holds: %', s;
  end if;
end
$$;

-- 4. Commit, release, tenant isolation ----------------------------------------
do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  other uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  hold_a uuid := (select id from t_ids where name = 'hold-a');
  hold_b uuid := (select id from t_ids where name = 'hold-b');
  c record;
  rel record;
  s jsonb;
begin
  -- Another shop cannot settle this shop's hold.
  select * into c from public.commit_ai_budget(hold_a, other, 1.00);
  if c.settled or c.status <> 'not_found' then
    raise exception 'cross-tenant commit must not find the hold: %', c;
  end if;

  select * into c from public.commit_ai_budget(hold_a, shop, 3.00);
  if not c.settled or c.status <> 'committed' or c.actual_usd <> 3 then
    raise exception 'commit should settle at the actual cost: %', c;
  end if;
  s := public.get_ai_budget_status(shop);
  if (s->>'availableUsd')::numeric <> 1 then
    raise exception 'committing 3 of a 4 hold should free 1: %', s;
  end if;

  select * into c from public.commit_ai_budget(hold_a, shop, 99.00);
  if c.settled or c.actual_usd <> 3 then
    raise exception 'a committed hold must not be re-settled: %', c;
  end if;

  select * into c from public.reserve_ai_budget(shop, 'copilot', 'f', 4.00, 'hold-a');
  if not c.replayed or c.decision <> 'completed' then
    raise exception 'replay of a finished key must report completed: %', c;
  end if;

  -- Unknown cost keeps the reserved amount rather than treating it as $0.
  select * into c from public.commit_ai_budget(hold_b, shop, null);
  if not c.settled or c.actual_usd <> 6 then
    raise exception 'null actual cost must fall back to the reservation: %', c;
  end if;

  select * into rel from public.release_ai_budget(hold_b, shop);
  if rel.settled then raise exception 'a committed hold must not be released'; end if;

  -- A hold that never reached the provider is released in full.
  select * into c from public.reserve_ai_budget(shop, 'copilot', 'f', 1.00, 'hold-d');
  if c.decision <> 'allowed' then raise exception 'hold-d should fit: %', c; end if;
  select * into rel from public.release_ai_budget(c.reservation_id, shop);
  if not rel.settled or rel.status <> 'released' then
    raise exception 'release should settle: %', rel;
  end if;
  if (public.get_ai_budget_status(shop)->>'availableUsd')::numeric <> 1 then
    raise exception 'released hold must return its balance';
  end if;
end
$$;

-- 5. Pool caps limit spend inside the balance -------------------------------
do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  r record;
  s jsonb;
begin
  perform public.grant_ai_budget(shop, 20.00, 'grant', 'manual', 'test', 'grant-2');
  perform public.set_ai_budget_pool_cap(shop, 'inspection', 5.00);

  select * into r from public.reserve_ai_budget(shop, 'inspection', 'f', 3.00, 'pool-1');
  if r.decision <> 'allowed' or r.pool_remaining_usd <> 2 then
    raise exception 'pool hold should leave 2 in the pool: %', r;
  end if;
  select * into r from public.reserve_ai_budget(shop, 'inspection', 'f', 3.00, 'pool-2');
  if r.decision <> 'denied' or r.denial_reason <> 'pool_cap_exceeded' then
    raise exception 'pool cap must deny even with shop balance left: %', r;
  end if;
  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 3.00, 'pool-3');
  if r.decision <> 'allowed' then
    raise exception 'an uncapped pool is unaffected by another pool cap: %', r;
  end if;

  s := public.get_ai_budget_status(shop);
  if jsonb_array_length(s->'pools') <> 1
     or (s->'pools'->0->>'remainingUsd')::numeric <> 2 then
    raise exception 'pool status is wrong: %', s;
  end if;

  -- A null cap removes the limit.
  perform public.set_ai_budget_pool_cap(shop, 'inspection', null);
  select * into r from public.reserve_ai_budget(shop, 'inspection', 'f', 3.00, 'pool-4');
  if r.decision <> 'allowed' then
    raise exception 'removing the cap must lift the limit: %', r;
  end if;
end
$$;

-- 6. Timed-out holds stay charged until settled or reconciled ----------------
reset role;
insert into public.shops (id, name) values ('aaaaaaaa-0000-0000-0000-000000000003', 'budget-c');
set local role service_role;

do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  r record;
begin
  perform public.set_ai_budget_enforcement(shop, 'enforce');
  perform public.grant_ai_budget(shop, 5.00, 'grant', 'manual', 'test', 'grant-c');
  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 5.00, 'crash-1', null, 30);
  insert into t_ids values ('crash-1', r.reservation_id);
  if r.decision <> 'allowed' then raise exception 'crash-1 should fit: %', r; end if;
end
$$;

reset role;
update private.ai_budget_reservations
set expires_at = clock_timestamp() - interval '1 minute'
where idempotency_key = 'crash-1';
set local role service_role;

do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  r record;
  c record;
  s jsonb;
begin
  -- The provider may have billed (a settlement can be lost), so a timed-out
  -- hold must NOT return its funds on its own.
  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 5.00, 'after-crash');
  if r.decision <> 'denied' or r.denial_reason <> 'insufficient_balance' then
    raise exception 'a timed-out hold must stay charged: %', r;
  end if;
  s := public.get_ai_budget_status(shop);
  if (s->>'overdueUnsettledUsd')::numeric <> 5 then
    raise exception 'overdue hold must be visible: %', s;
  end if;

  -- Retrying the timed-out key must not hand back a spendable hold.
  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 5.00, 'crash-1');
  if r.decision <> 'expired' or not r.replayed then
    raise exception 'replay of a timed-out hold must report expired: %', r;
  end if;

  -- A late settlement records the real cost, which here exceeds the balance.
  select * into c from public.commit_ai_budget(
    (select id from t_ids where name = 'crash-1'), shop, 8.00);
  if not c.settled or c.status <> 'committed' or c.actual_usd <> 8 then
    raise exception 'a late commit of a timed-out hold must be recorded: %', c;
  end if;
  s := public.get_ai_budget_status(shop);
  if (s->>'overdraftUsd')::numeric <> 3 or (s->>'reservedUsd')::numeric <> 0
     or (s->>'overdueUnsettledUsd')::numeric <> 0 then
    raise exception 'real spend beyond the balance must show as overdraft: %', s;
  end if;
end
$$;

-- Reconciliation: an operator releases holds that never reached the provider.
reset role;
insert into public.shops (id, name) values ('aaaaaaaa-0000-0000-0000-000000000004', 'budget-d');
set local role service_role;

do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  r record;
  rel record;
  caught boolean := false;
begin
  perform public.set_ai_budget_enforcement(shop, 'enforce');
  perform public.grant_ai_budget(shop, 5.00, 'grant', 'manual', 'test', 'grant-d');
  perform public.reserve_ai_budget(shop, 'copilot', 'f', 5.00, 'stale-1', null, 30);
  perform public.reserve_ai_budget(shop, 'copilot', 'f', 0.00, 'fresh-1', null, 3600);
end
$$;

reset role;
update private.ai_budget_reservations
set expires_at = clock_timestamp() - interval '2 hours'
where idempotency_key = 'stale-1';
set local role service_role;

do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  r record;
  rel record;
begin
  begin
    perform public.release_stale_ai_budget_holds(shop, 60);
    raise exception 'reconciling holds younger than an hour must be rejected';
  exception when sqlstate '22023' then null;
  end;

  select * into rel from public.release_stale_ai_budget_holds(shop, 3600);
  if rel.released_count <> 1 or rel.released_usd <> 5 then
    raise exception 'exactly the stale hold should be released: %', rel;
  end if;
  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 5.00, 'after-reconcile');
  if r.decision <> 'allowed' then
    raise exception 'reconciled funds must be spendable again: %', r;
  end if;
  select * into rel from public.release_stale_ai_budget_holds(shop, 3600);
  if rel.released_count <> 0 then
    raise exception 'reconciliation must be idempotent: %', rel;
  end if;
end
$$;

-- 7. Shadow reservations never count after switching to enforce -------------
do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  r record;
begin
  perform public.reserve_ai_budget(shop, 'copilot', 'f', 50.00, 'shadow-big');
  perform public.grant_ai_budget(shop, 10.00, 'grant', 'manual', 'test', 'grant-b');
  perform public.set_ai_budget_enforcement(shop, 'enforce');
  select * into r from public.reserve_ai_budget(shop, 'copilot', 'f', 10.00, 'first-real');
  if r.decision <> 'allowed' then
    raise exception 'shadow history must not drain funding at enforcement: %', r;
  end if;
end
$$;

-- 8. Invalid input is rejected ------------------------------------------------
do $$
declare
  shop uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  caught integer := 0;
begin
  begin perform public.reserve_ai_budget(shop, 'Bad Pool', 'f', 1, 'k'); exception when sqlstate '22023' then caught := caught + 1; end;
  begin perform public.reserve_ai_budget(shop, 'copilot', 'f', -1, 'k'); exception when sqlstate '22023' then caught := caught + 1; end;
  begin perform public.reserve_ai_budget(shop, 'copilot', 'f', 1, ''); exception when sqlstate '22023' then caught := caught + 1; end;
  begin perform public.reserve_ai_budget(shop, 'copilot', 'f', 1, 'k', null, 1); exception when sqlstate '22023' then caught := caught + 1; end;
  begin perform public.grant_ai_budget(shop, -5, 'grant', 'm', null, 'bad-grant'); exception when sqlstate '22023' then caught := caught + 1; end;
  begin perform public.reserve_ai_budget('99999999-0000-0000-0000-000000000000', 'copilot', 'f', 1, 'k'); exception when sqlstate '42501' then caught := caught + 1; end;
  if caught <> 6 then raise exception 'expected 6 rejections, saw %', caught; end if;
end
$$;

-- 9. The running balance always equals a full recompute ----------------------
reset role;
do $$
declare
  bad record;
begin
  select b.shop_id, b.funded_usd, b.held_usd, b.committed_usd,
         coalesce((select sum(e.amount_usd) from private.ai_budget_entries e where e.shop_id = b.shop_id), 0) as funded_calc,
         coalesce((select sum(r.reserved_usd) from private.ai_budget_reservations r
                   where r.shop_id = b.shop_id and r.enforcement = 'enforce'
                     and r.status in ('reserved', 'expired')), 0) as held_calc,
         coalesce((select sum(r.actual_usd) from private.ai_budget_reservations r
                   where r.shop_id = b.shop_id and r.enforcement = 'enforce'
                     and r.status = 'committed'), 0) as committed_calc
  into bad
  from private.ai_shop_budgets b
  where b.funded_usd <> coalesce((select sum(e.amount_usd) from private.ai_budget_entries e where e.shop_id = b.shop_id), 0)
     or b.held_usd <> coalesce((select sum(r.reserved_usd) from private.ai_budget_reservations r
                                where r.shop_id = b.shop_id and r.enforcement = 'enforce'
                                  and r.status in ('reserved', 'expired')), 0)
     or b.committed_usd <> coalesce((select sum(r.actual_usd) from private.ai_budget_reservations r
                                     where r.shop_id = b.shop_id and r.enforcement = 'enforce'
                                       and r.status = 'committed'), 0)
  limit 1;
  if found then
    raise exception 'running balance drifted from a full recompute: %', bad;
  end if;
end
$$;

rollback;
