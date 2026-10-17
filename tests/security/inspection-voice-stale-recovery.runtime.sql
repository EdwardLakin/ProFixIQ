\set ON_ERROR_STOP on

-- Runtime assertions for conservative recovery of abandoned inspection voice
-- sessions. Requires a disposable local Supabase database; fixture setup and
-- cron calls commit independently, and the fixture rows are removed at the end.
begin;

do $$
begin
  if pg_catalog.pg_get_expr((select indpred from pg_catalog.pg_index
      where indexrelid = 'private.ai_budget_reservations_stale_expiry_idx'::regclass),
      'private.ai_budget_reservations'::regclass) not like '%openai_realtime_token%' then
    raise exception 'cron expiry index includes unrelated stale AI holds';
  end if;
  if has_function_privilege(
       'service_role',
       'private.reconcile_stale_inspection_voice_holds()',
       'EXECUTE'
     ) then
    raise exception 'stale voice sweep must not be application-callable';
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname = 'inspection-voice-budget-reconciliation-minute'
      and schedule = '* * * * *'
      and command = 'select private.reconcile_stale_inspection_voice_holds();'
  ) then
    raise exception 'stale voice reconciliation schedule is missing';
  end if;
end
$$;

-- Committed fixtures must not race a real minute tick in the replay DB.
-- Restore the pre-test job state after the fixture cleanup.
create temp table stale_voice_cron_state as
select jobid, active from cron.job
where jobname = 'inspection-voice-budget-reconciliation-minute';
select cron.alter_job(jobid, active => false)
from stale_voice_cron_state where active;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'd1000000-0000-4000-8000-000000000001',
  'stale-voice-owner@example.com',
  '{"full_name":"Stale Voice Owner"}'::jsonb
), (
  'd1000000-0000-4000-8000-000000000002',
  'stale-voice-moved@example.com',
  '{"full_name":"Moved Voice Owner"}'::jsonb
), (
  'd1000000-0000-4000-8000-000000000003',
  'stale-voice-legacy@example.com',
  '{"full_name":"Legacy Voice Technician"}'::jsonb
), (
  'd1100000-0000-4000-8000-000000000003',
  'stale-voice-legacy-profile@example.com',
  '{"full_name":"Legacy Profile Identity"}'::jsonb
)
on conflict (id) do nothing;

-- Some environments create a profile for each auth user. Remove the legacy
-- actor's automatic profile so the canonical recorder must resolve user_id to
-- a distinct profile ID, as it does for historical accounts.
delete from public.profiles
where id = 'd1000000-0000-4000-8000-000000000003';

insert into public.profiles (id, user_id, role, full_name)
values (
  'd1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'owner',
  'Stale Voice Owner'
), (
  'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000002',
  'owner',
  'Moved Voice Owner'
), (
  'd1100000-0000-4000-8000-000000000003',
  'd1000000-0000-4000-8000-000000000003',
  'mechanic',
  'Legacy Voice Technician'
)
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name;

-- The profile insert trigger assigns user_id := id, so establish the legacy
-- mapping after the insert; both IDs have matching auth.users fixture rows.
update public.profiles
set user_id = 'd1000000-0000-4000-8000-000000000003'
where id = 'd1100000-0000-4000-8000-000000000003';

insert into public.shops (id, owner_id, business_name, name, user_limit)
values (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'Stale Voice Shop',
  'Stale Voice Shop',
  3
), (
  'd2000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000002',
  'Second Stale Voice Shop',
  'Second Stale Voice Shop',
  3
)
on conflict (id) do nothing;

update public.profiles
set shop_id = 'd2000000-0000-4000-8000-000000000001'
where id = 'd1000000-0000-4000-8000-000000000001';
update public.profiles
set shop_id = 'd2000000-0000-4000-8000-000000000002'
where id = 'd1000000-0000-4000-8000-000000000002';
update public.profiles
set shop_id = 'd2000000-0000-4000-8000-000000000001'
where id = 'd1100000-0000-4000-8000-000000000003';

do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = 'd1100000-0000-4000-8000-000000000003'
      and user_id = 'd1000000-0000-4000-8000-000000000003'
      and shop_id = 'd2000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'legacy actor profile mapping was not established';
  end if;
end
$$;

create temp table stale_voice_ids (name text primary key, id uuid not null);
grant select, insert on stale_voice_ids to service_role;
-- Fixture setup also writes simulated interrupted closure evidence.
reset role;

do $$
declare
  v_shop uuid := 'd2000000-0000-4000-8000-000000000001';
  v_actor uuid := 'd1000000-0000-4000-8000-000000000001';
  v_event_key text := 'inspection_voice:d2000000-0000-4000-8000-000000000001:d3000000-0000-4000-8000-000000000001';
  v_voice_id uuid;
  v_regular_id uuid;
  v_uncertain_id uuid;
  v_rejected_id uuid;
  v_pre_provider_id uuid;
begin
  perform public.set_ai_budget_enforcement(v_shop, 'enforce');
  perform public.grant_ai_budget(
    v_shop, 5.5, 'grant', 'manual', 'test', 'stale-voice-grant'
  );

  select reservation_id into v_voice_id
  from public.reserve_ai_budget(
    v_shop,
    'voice',
    'openai_realtime_token',
    1.02,
    v_event_key,
    v_actor,
    3600
  );
  insert into stale_voice_ids values ('voice', v_voice_id);

  perform public.record_ai_usage_ledger(
    v_shop,
    v_actor,
    pg_catalog.jsonb_build_object(
      'event_key', v_event_key,
      'feature', 'openai_realtime_token',
      'endpoint', '/api/openai/inspection-transcription-token',
      'provider', 'openai',
      'model', 'gpt-live-transcribe',
      'modality', 'realtime',
      'duration_seconds', 3600,
      'estimated_cost_usd', 1.02,
      'provider_request_id', 'rtc_confirmed_closed',
      'latency_ms', 1,
      'status', 'success',
      'operation', 'inspection_transcription_reservation',
      'quota_receipt_id', v_voice_id,
      'rate_card_version', 'openai-2026-10-06-v3'
    )
  );
  -- Closure was confirmed by the server, but the budget commit was interrupted.
  update private.ai_usage_ledger
  set operation = 'inspection_transcription_closed', duration_seconds = 30
  where quota_receipt_id = v_voice_id;

  select reservation_id into v_regular_id
  from public.reserve_ai_budget(
    v_shop, 'copilot', 'test_feature', 0.50, 'ordinary-stale-hold', v_actor, 3600
  );
  insert into stale_voice_ids values ('regular', v_regular_id);

  select reservation_id into v_uncertain_id from public.reserve_ai_budget(
    v_shop, 'voice', 'openai_realtime_token', 1.02,
    'inspection_voice:' || v_shop::text || ':d3000000-0000-4000-8000-000000000002',
    v_actor, 3600
  );
  insert into stale_voice_ids values ('uncertain', v_uncertain_id);
  if not public.record_inspection_voice_issuance_rate(
    v_shop, v_actor, v_uncertain_id, 'rate-card-at-issuance-v1'
  ) then
    raise exception 'could not persist issuance rate before provider call';
  end if;
  select reservation_id into v_rejected_id from public.reserve_ai_budget(
    v_shop, 'voice', 'openai_realtime_token', 0.50,
    'inspection_voice:' || v_shop::text || ':d3000000-0000-4000-8000-000000000003',
    'd1000000-0000-4000-8000-000000000003', 3600
  );
  insert into stale_voice_ids values ('rejected', v_rejected_id);
  perform public.record_ai_usage_ledger(v_shop,
    'd1000000-0000-4000-8000-000000000003',
    pg_catalog.jsonb_build_object(
      'event_key', 'inspection_voice:' || v_shop::text || ':d3000000-0000-4000-8000-000000000003:error',
      'feature', 'openai_realtime_token',
      'endpoint', '/api/openai/inspection-transcription-token',
      'provider', 'openai', 'model', 'gpt-live-transcribe', 'modality', 'realtime',
      'duration_seconds', 0, 'estimated_cost_usd', 0,
      'latency_ms', 1, 'status', 'error',
      'error_code', 'inspection_voice_rejected',
      'quota_receipt_id', v_rejected_id,
      'rate_card_version', 'openai-2026-10-06-v3'
    )
  );
  select reservation_id into v_pre_provider_id from public.reserve_ai_budget(
    v_shop, 'voice', 'openai_realtime_token', 0.50,
    'inspection_voice:' || v_shop::text || ':d3000000-0000-4000-8000-000000000007',
    v_actor, 3600
  );
  insert into stale_voice_ids values ('pre_provider', v_pre_provider_id);
  perform public.record_ai_usage_ledger(v_shop, v_actor,
    pg_catalog.jsonb_build_object(
      'event_key', 'inspection_voice:' || v_shop::text || ':d3000000-0000-4000-8000-000000000007:error',
      'feature', 'openai_realtime_token',
      'endpoint', '/api/openai/inspection-transcription-token',
      'provider', 'openai', 'model', 'gpt-live-transcribe', 'modality', 'realtime',
      'duration_seconds', 0, 'estimated_cost_usd', 0,
      'latency_ms', 1, 'status', 'error',
      'error_code', 'inspection_voice_pre_provider_failure',
      'quota_receipt_id', v_pre_provider_id,
      'rate_card_version', 'openai-2026-10-06-v3'
    )
  );
  perform public.set_ai_budget_enforcement(
    'd2000000-0000-4000-8000-000000000002', 'enforce');
  perform public.grant_ai_budget(
    'd2000000-0000-4000-8000-000000000002', 2,
    'grant', 'manual', 'test', 'second-stale-voice-grant');
  select reservation_id into v_uncertain_id from public.reserve_ai_budget(
    'd2000000-0000-4000-8000-000000000002', 'voice', 'openai_realtime_token', 1.02,
    'inspection_voice:d2000000-0000-4000-8000-000000000002:d3000000-0000-4000-8000-000000000004',
    'd1000000-0000-4000-8000-000000000002', 3600
  );
  insert into stale_voice_ids values ('moved', v_uncertain_id);
end
$$;

reset role;
update private.ai_budget_reservations
set expires_at = pg_catalog.clock_timestamp() - interval '2 hours'
where id in (select id from stale_voice_ids);
update private.ai_budget_reservations
set expires_at = pg_catalog.clock_timestamp() - interval '90 minutes'
where id = (select id from stale_voice_ids where name = 'moved');
update public.profiles
set shop_id = 'd2000000-0000-4000-8000-000000000001'
where id = 'd1000000-0000-4000-8000-000000000002';

-- Exercise the scheduled entry point directly. It must commit only the
-- inspection holds, without invoking the ordinary stale-hold release path.
commit;
do $$
begin
  if exists (select 1 from pg_catalog.pg_locks
    where pid = pg_catalog.pg_backend_pid() and locktype = 'advisory') then
    raise exception 'previous cron transaction retained its shop lock';
  end if;
end $$;
-- In autocommit, the cron statement releases its shop lock on completion.
select private.reconcile_stale_inspection_voice_holds();
begin;

do $$
begin
  if (select status from private.ai_budget_reservations
      where id = (select id from stale_voice_ids where name = 'moved')) not in ('reserved', 'expired') then
    raise exception 'one scheduled sweep must not hold multiple shops at once';
  end if;
end
$$;

-- The next independently committed cron invocation handles the next shop.
commit;
do $$
begin
  if exists (select 1 from pg_catalog.pg_locks
    where pid = pg_catalog.pg_backend_pid() and locktype = 'advisory') then
    raise exception 'previous cron transaction retained its shop lock';
  end if;
end $$;
-- In autocommit, the cron statement releases its shop lock on completion.
select private.reconcile_stale_inspection_voice_holds();
begin;

do $$
declare
  v_shop uuid := 'd2000000-0000-4000-8000-000000000001';
  v_status jsonb;
  v_regular_status text;
  v_uncertain_status text;
begin
  select status into v_regular_status from private.ai_budget_reservations
  where id = (select id from stale_voice_ids where name = 'regular');
  select status into v_uncertain_status from private.ai_budget_reservations
  where id = (select id from stale_voice_ids where name = 'uncertain');
  if v_regular_status not in ('reserved', 'expired')
     or v_uncertain_status <> 'committed' then
    raise exception 'inspection cron released an unrelated hold or lost an uncertain call';
  end if;

  v_status := public.get_ai_budget_status(v_shop);
  if (v_status->>'committedUsd')::numeric <> 1.0285
     or (v_status->>'reservedUsd')::numeric <> 0.50
     or (v_status->>'availableUsd')::numeric <> 3.9715 then
    raise exception 'inspection cron changed unrelated budget balances: %', v_status;
  end if;
end
$$;

set local role service_role;

do $$
declare
  v_shop uuid := 'd2000000-0000-4000-8000-000000000001';
  v_result record;
  v_status jsonb;
begin
  select * into v_result
  from public.release_stale_ai_budget_holds(v_shop, 3600);

  if v_result.released_count <> 1 or v_result.released_usd <> 0.50 then
    raise exception 'only the unrelated hold should be released: %', v_result;
  end if;

  v_status := public.get_ai_budget_status(v_shop);
  if (v_status->>'committedUsd')::numeric <> 1.0285
     or (v_status->>'reservedUsd')::numeric <> 0
     or (v_status->>'availableUsd')::numeric <> 4.4715 then
    raise exception 'fallback settlement produced the wrong balance: %', v_status;
  end if;

  select * into v_result
  from public.release_stale_ai_budget_holds(v_shop, 3600);
  if v_result.released_count <> 0 or v_result.released_usd <> 0 then
    raise exception 'stale recovery must be idempotent: %', v_result;
  end if;
end
$$;

reset role;
do $$
declare
  v_voice private.ai_budget_reservations%rowtype;
  v_regular private.ai_budget_reservations%rowtype;
  v_uncertain private.ai_budget_reservations%rowtype;
  v_rejected private.ai_budget_reservations%rowtype;
  v_pre_provider private.ai_budget_reservations%rowtype;
  v_operation text;
begin
  select * into v_voice
  from private.ai_budget_reservations
  where id = (select id from stale_voice_ids where name = 'voice');
  if v_voice.status <> 'committed'
     or v_voice.actual_usd <> 0.0085
     or v_voice.cost_basis <> 'actual' then
    raise exception 'confirmed closure was not settled at measured duration: %', v_voice;
  end if;

  select * into v_regular
  from private.ai_budget_reservations
  where id = (select id from stale_voice_ids where name = 'regular');
  if v_regular.status <> 'released' or v_regular.actual_usd <> 0 then
    raise exception 'ordinary stale hold changed behavior: %', v_regular;
  end if;

  select * into v_uncertain from private.ai_budget_reservations
  where id = (select id from stale_voice_ids where name = 'uncertain');
  if v_uncertain.status <> 'committed' or v_uncertain.actual_usd <> 1.02 then
    raise exception 'uncertain provider call was not charged at ceiling: %', v_uncertain;
  end if;
  select * into v_rejected from private.ai_budget_reservations
  where id = (select id from stale_voice_ids where name = 'rejected');
  if v_rejected.status <> 'released' or v_rejected.actual_usd <> 0
     or not exists (select 1 from private.ai_usage_ledger ledger
       where ledger.quota_receipt_id = v_rejected.id
         and ledger.user_id = 'd1100000-0000-4000-8000-000000000003') then
    raise exception 'definitive provider rejection was charged: %', v_rejected;
  end if;
  select * into v_pre_provider from private.ai_budget_reservations
  where id = (select id from stale_voice_ids where name = 'pre_provider');
  if v_pre_provider.status <> 'released' or v_pre_provider.actual_usd <> 0 then
    raise exception 'pre-provider failure without a call was charged: %', v_pre_provider;
  end if;

  select operation into v_operation
  from private.ai_usage_ledger
  where quota_receipt_id = v_voice.id;
  if v_operation <> 'inspection_transcription_settled' then
    raise exception 'canonical ledger lost confirmed closure: %', v_operation;
  end if;
  if not exists (
    select 1 from private.ai_usage_ledger
    where quota_receipt_id = v_voice.id and duration_seconds = 30
      and estimated_cost_usd = 0.0085
      and provider_request_id = 'rtc_confirmed_closed'
  ) then
    raise exception 'server-confirmed provider duration was overwritten';
  end if;
  if not exists (
    select 1 from private.ai_usage_ledger
    where quota_receipt_id = v_uncertain.id
      and error_code = 'inspection_voice_provider_outcome_unknown'
      and estimated_cost_usd = 1.02
      and rate_card_version = 'rate-card-at-issuance-v1'
      and user_id = 'd1000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'receiptless call did not preserve its actor';
  end if;
  if not exists (
    select 1 from private.ai_usage_ledger
    where quota_receipt_id = (select id from stale_voice_ids where name = 'moved')
      and error_code = 'inspection_voice_provider_outcome_unknown'
      and user_id is null
  ) then
    raise exception 'moved actor prevented a second shop from reconciling';
  end if;
end
$$;

-- A reused canonical event key with a foreign receipt must be audited and
-- skipped. It must not monopolize cron while another shop has stale holds.
set local role service_role;
do $$
declare
  v_shop uuid := 'd2000000-0000-4000-8000-000000000001';
  v_other_shop uuid := 'd2000000-0000-4000-8000-000000000002';
  v_key text := 'inspection_voice:d2000000-0000-4000-8000-000000000001:d3000000-0000-4000-8000-000000000005';
  v_conflict_id uuid;
  v_other_id uuid;
begin
  select reservation_id into v_conflict_id from public.reserve_ai_budget(
    v_shop, 'voice', 'openai_realtime_token', 1.02, v_key,
    'd1000000-0000-4000-8000-000000000001', 3600
  );
  insert into stale_voice_ids values ('conflict', v_conflict_id);
  perform public.record_ai_usage_ledger(v_shop,
    'd1000000-0000-4000-8000-000000000001',
    pg_catalog.jsonb_build_object(
      'event_key', v_key, 'feature', 'openai_realtime_token',
      'endpoint', '/api/openai/unrelated-token',
      'provider', 'openai', 'model', 'gpt-live-transcribe',
      'modality', 'realtime', 'duration_seconds', 0,
      'estimated_cost_usd', 0, 'latency_ms', 1,
      'status', 'error', 'error_code', 'preexisting_unrelated_receipt',
      'quota_receipt_id', v_conflict_id,
      'rate_card_version', 'openai-2026-10-06-v3'
    )
  );
  perform public.grant_ai_budget(v_other_shop, 2, 'grant', 'manual',
    'test', 'second-conflict-stale-voice-grant');
  select reservation_id into v_other_id from public.reserve_ai_budget(
    v_other_shop, 'voice', 'openai_realtime_token', 1.02,
    'inspection_voice:' || v_other_shop::text || ':d3000000-0000-4000-8000-000000000006',
    'd1000000-0000-4000-8000-000000000002', 3600
  );
  insert into stale_voice_ids values ('other_after_conflict', v_other_id);
end
$$;
reset role;
update private.ai_budget_reservations
set expires_at = pg_catalog.clock_timestamp() - interval '2 hours'
where id = (select id from stale_voice_ids where name = 'conflict');
update private.ai_budget_reservations
set expires_at = pg_catalog.clock_timestamp() - interval '90 minutes'
where id = (select id from stale_voice_ids where name = 'other_after_conflict');

commit;
do $$
begin
  if exists (select 1 from pg_catalog.pg_locks
    where pid = pg_catalog.pg_backend_pid() and locktype = 'advisory') then
    raise exception 'previous cron transaction retained its shop lock';
  end if;
end $$;
-- In autocommit, the cron statement releases its shop lock on completion.
select private.reconcile_stale_inspection_voice_holds();
begin;
do $$
begin
  if not exists (
    select 1 from private.inspection_voice_reconciliation_conflicts quarantine
    join stale_voice_ids ids on ids.id = quarantine.reservation_id
    where ids.name = 'conflict'
      and quarantine.reason = 'INSPECTION_VOICE_FALLBACK_LEDGER_CONFLICT'
      and quarantine.observed_ledger_id is not null
  ) then
    raise exception 'conflicting ledger receipt was not durably audited';
  end if;
  if (select status from private.ai_budget_reservations
      where id = (select id from stale_voice_ids where name = 'conflict')) <> 'reserved' then
    raise exception 'ambiguous reservation was incorrectly settled or released';
  end if;
  if (select status from private.ai_budget_reservations
      where id = (select id from stale_voice_ids where name = 'other_after_conflict')) <> 'reserved' then
    raise exception 'one cron invocation crossed shop boundaries';
  end if;
end
$$;

commit;
do $$
begin
  if exists (select 1 from pg_catalog.pg_locks
    where pid = pg_catalog.pg_backend_pid() and locktype = 'advisory') then
    raise exception 'previous cron transaction retained its shop lock';
  end if;
end $$;
-- In autocommit, the cron statement releases its shop lock on completion.
select private.reconcile_stale_inspection_voice_holds();
begin;
do $$
begin
  if (select status from private.ai_budget_reservations
      where id = (select id from stale_voice_ids where name = 'other_after_conflict')) <> 'committed' then
    raise exception 'conflicting first shop blocked the next shop';
  end if;
  if (select status from private.ai_budget_reservations
      where id = (select id from stale_voice_ids where name = 'conflict')) <> 'reserved' then
    raise exception 'cron changed a quarantined hold';
  end if;
end
$$;

-- Existing reservation/shop cleanup can remove its audit child.
delete from private.ai_budget_reservations
where id = (select id from stale_voice_ids where name = 'conflict');
do $$
begin
  if exists (
    select 1 from private.inspection_voice_reconciliation_conflicts quarantine
    where quarantine.reservation_id = (select id from stale_voice_ids where name = 'conflict')
  ) then
    raise exception 'quarantine child blocked reservation deletion';
  end if;
end
$$;

commit;
-- Remove only this test's committed fixtures from the disposable replay DB.
begin;
delete from private.ai_usage_ledger where shop_id in (
  'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002');
delete from private.ai_budget_reservations where shop_id in (
  'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002');
-- Both shop -> owner and profile -> shop can be restrictive in a clean replay.
-- Detach only these fixture profiles before removing their shops.
update public.profiles set shop_id = null where user_id in (
  'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003');
delete from public.shops where id in (
  'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002');
delete from public.profiles where user_id in (
  'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003');
delete from auth.users where id in (
  'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003', 'd1100000-0000-4000-8000-000000000003');
select cron.alter_job(original.jobid, active => original.active)
from stale_voice_cron_state original;
commit;
