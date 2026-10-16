\set ON_ERROR_STOP on

-- Runtime assertions for the additive inspection voice settlement RPCs.
-- Requires the local Supabase migration chain; the outer transaction rolls back.
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('c1000000-0000-4000-8000-000000000001', 'voice-owner@example.com', '{"full_name":"Voice Owner"}'::jsonb),
  ('c1000000-0000-4000-8000-000000000002', 'voice-other@example.com', '{"full_name":"Other Owner"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'owner', 'Voice Owner'),
  ('c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'owner', 'Other Owner')
on conflict (id) do nothing;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Voice Shop', 'Voice Shop', 3),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'Other Shop', 'Other Shop', 3)
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when 'c1000000-0000-4000-8000-000000000001'::uuid then 'c2000000-0000-4000-8000-000000000001'::uuid
  when 'c1000000-0000-4000-8000-000000000002'::uuid then 'c2000000-0000-4000-8000-000000000002'::uuid
end
where id in (
  'c1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000002'
);

create temp table voice_test_ids (name text primary key, id uuid not null);
grant select, insert on voice_test_ids to service_role;
set local role service_role;

do $$
declare
  v_shop uuid := 'c2000000-0000-4000-8000-000000000001';
  v_other_shop uuid := 'c2000000-0000-4000-8000-000000000002';
  v_actor uuid := 'c1000000-0000-4000-8000-000000000001';
  v_other_actor uuid := 'c1000000-0000-4000-8000-000000000002';
  v_usage_key text := 'c3000000-0000-4000-8000-000000000001';
  v_event_key text := 'inspection_voice:c2000000-0000-4000-8000-000000000001:c3000000-0000-4000-8000-000000000001';
  v_reservation uuid;
  v_result jsonb;
  v_caught boolean;
begin
  perform public.set_ai_budget_enforcement(v_shop, 'enforce');
  perform public.grant_ai_budget(v_shop, 10, 'grant', 'manual', 'test', 'voice-grant');

  select reservation_id into v_reservation
  from public.reserve_ai_budget(
    v_shop, 'voice', 'openai_realtime_token', 1.02, v_event_key, v_actor, 3600
  );
  if v_reservation is null then raise exception 'voice reservation was not created'; end if;
  insert into voice_test_ids values ('reservation', v_reservation);

  perform public.record_ai_usage_ledger(
    v_shop,
    v_actor,
    pg_catalog.jsonb_build_object(
      'event_key', v_event_key,
      'feature', 'openai_realtime_token',
      'endpoint', '/api/openai/inspection-transcription-token',
      'provider', 'openai',
      'provider_request_id', 'rtc_test_first',
      'occurred_at', '2026-10-16T00:00:00Z',
      'model', 'gpt-live-transcribe',
      'modality', 'realtime',
      'duration_seconds', 3600,
      'estimated_cost_usd', 1.02,
      'latency_ms', 1,
      'status', 'success',
      'operation', 'inspection_transcription_reservation',
      'quota_receipt_id', v_reservation,
      'rate_card_version', 'openai-2026-10-06-v3'
    )
  );
  -- A second shop can issue the identical client UUID without colliding with
  -- the globally unique canonical ledger event_key.
  perform public.set_ai_budget_enforcement(v_other_shop, 'enforce');
  perform public.grant_ai_budget(v_other_shop, 10, 'grant', 'manual', 'test', 'other-voice-grant');
  select reservation_id into v_reservation from public.reserve_ai_budget(
    v_other_shop, 'voice', 'openai_realtime_token', 1.02,
    'inspection_voice:' || v_other_shop::text || ':' || v_usage_key,
    v_other_actor, 3600
  );
  perform public.record_ai_usage_ledger(v_other_shop, v_other_actor,
    pg_catalog.jsonb_build_object(
      'event_key', 'inspection_voice:' || v_other_shop::text || ':' || v_usage_key,
      'feature', 'openai_realtime_token',
      'endpoint', '/api/openai/inspection-transcription-token',
      'provider', 'openai', 'provider_request_id', 'rtc_other_shop',
      'model', 'gpt-live-transcribe', 'modality', 'realtime',
      'duration_seconds', 3600, 'estimated_cost_usd', 1.02,
      'latency_ms', 1, 'status', 'success',
      'operation', 'inspection_transcription_reservation',
      'quota_receipt_id', v_reservation,
      'rate_card_version', 'openai-2026-10-06-v3'
    )
  );
  if public.get_inspection_voice_session_receipt(v_other_shop, v_other_actor, v_usage_key)->>'callId'
     <> 'rtc_other_shop' then raise exception 'same UUID collided across tenants'; end if;

  if public.get_inspection_voice_session_receipt(v_shop, v_actor, v_usage_key)->>'model'
     <> 'gpt-live-transcribe' then
    raise exception 'model lookup did not return the issued model';
  end if;
  if public.get_inspection_voice_session_receipt_for_actor(v_actor, v_usage_key)->>'shopId'
     <> v_shop::text then
    raise exception 'actor lookup did not retain the issuing shop';
  end if;
  v_caught := false;
  begin
    perform public.get_inspection_voice_session_receipt_for_actor(v_other_actor,
      'c3000000-0000-4000-8000-000000000002');
  exception when sqlstate '42501' then v_caught := true;
  end;
  if not v_caught then raise exception 'actor lookup admitted another session'; end if;

  v_caught := false;
  begin
    perform public.get_inspection_voice_session_receipt(v_other_shop, v_actor, v_usage_key);
  exception when sqlstate '42501' then v_caught := true;
  end;
  if not v_caught then raise exception 'cross-tenant lookup was accepted'; end if;

  v_caught := false;
  begin
    perform public.settle_inspection_voice_usage(
      v_shop, v_actor, v_usage_key, 'different-model', 12, 0.0034
    );
  exception when sqlstate '42501' then v_caught := true;
  end;
  if not v_caught then raise exception 'model substitution was accepted'; end if;

  v_caught := false;
  begin
    perform public.settle_inspection_voice_usage(
      v_shop, v_actor, v_usage_key, 'gpt-live-transcribe', 0, 0
    );
  exception when sqlstate '42501' then v_caught := true;
  end;
  if not v_caught then raise exception 'unconfirmed closure settled the hold'; end if;

  if public.confirm_inspection_voice_closure(
    v_shop, v_actor, v_usage_key, 'rtc_test_first', '2026-10-16T00:00:12Z'
  ) <> 12 then raise exception 'server closure did not derive twelve seconds'; end if;

  v_caught := false;
  begin
    perform public.settle_inspection_voice_usage(
      v_shop, v_actor, v_usage_key, 'gpt-live-transcribe', 12, 1.03
    );
  exception when sqlstate '22023' then v_caught := true;
  end;
  if not v_caught then raise exception 'settlement above the held maximum was accepted'; end if;

  v_result := public.settle_inspection_voice_usage(
    v_shop, v_actor, v_usage_key, 'gpt-live-transcribe', 12, 0.0034
  );
  if v_result->>'settled' <> 'true' or v_result->>'alreadySettled' <> 'false' then
    raise exception 'first settlement did not commit: %', v_result;
  end if;

  v_result := public.settle_inspection_voice_usage(
    v_shop, v_actor, v_usage_key, 'gpt-live-transcribe', 30, 0.01
  );
  if v_result->>'settled' <> 'true' or v_result->>'alreadySettled' <> 'true'
     or (v_result->>'actualCostUsd')::numeric <> 0.0034 then
    raise exception 'duplicate settlement changed the first result: %', v_result;
  end if;

  v_usage_key := 'c3000000-0000-4000-8000-000000000002';
  v_event_key := 'inspection_voice:' || v_shop::text || ':' || v_usage_key;
  select reservation_id into v_reservation
  from public.reserve_ai_budget(
    v_shop, 'voice', 'openai_realtime_token', 1.02, v_event_key, v_actor, 3600
  );
  insert into voice_test_ids values ('abandoned', v_reservation);

  perform public.record_ai_usage_ledger(
    v_shop,
    v_actor,
    pg_catalog.jsonb_build_object(
      'event_key', v_event_key,
      'feature', 'openai_realtime_token',
      'endpoint', '/api/openai/inspection-transcription-token',
      'provider', 'openai',
      'provider_request_id', 'rtc_test_abandoned',
      'occurred_at', '2026-10-16T00:00:00Z',
      'model', 'gpt-live-transcribe',
      'modality', 'realtime',
      'duration_seconds', 3600,
      'estimated_cost_usd', 1.02,
      'latency_ms', 1,
      'status', 'success',
      'operation', 'inspection_transcription_reservation',
      'quota_receipt_id', v_reservation,
      'rate_card_version', 'openai-2026-10-06-v3'
    )
  );
end
$$;

reset role;
update private.ai_budget_reservations
set expires_at = pg_catalog.clock_timestamp() - interval '2 hours'
where id = (select id from voice_test_ids where name = 'abandoned');
set local role service_role;

do $$
declare
  v_shop uuid := 'c2000000-0000-4000-8000-000000000001';
  v_actor uuid := 'c1000000-0000-4000-8000-000000000001';
  v_usage_key text := 'c3000000-0000-4000-8000-000000000002';
  v_released record;
  v_result jsonb;
begin
  select * into v_released
  from public.release_stale_ai_budget_holds(v_shop, 3600);
  if v_released.released_count <> 0 or v_released.released_usd <> 0 then
    raise exception 'abandoned provider session must not be released: %', v_released;
  end if;

  if public.get_inspection_voice_session_receipt(v_shop, v_actor, v_usage_key)->>'model'
     <> 'gpt-live-transcribe' then
    raise exception 'fallback-settled model lookup failed';
  end if;

  v_result := public.settle_inspection_voice_usage(
    v_shop, v_actor, v_usage_key, 'gpt-live-transcribe', 30, 0.01
  );
  if v_result->>'settled' <> 'true'
     or v_result->>'alreadySettled' <> 'true'
     or (v_result->>'actualCostUsd')::numeric <> 1.02
     or (v_result->>'durationSeconds')::numeric <> 3600 then
    raise exception 'late report changed fallback settlement: %', v_result;
  end if;
end
$$;

reset role;
do $$
declare
  v_cost numeric;
  v_duration numeric;
  v_operation text;
  v_status text;
begin
  select estimated_cost_usd, duration_seconds, operation
    into v_cost, v_duration, v_operation
  from private.ai_usage_ledger
  where event_key = 'inspection_voice:c2000000-0000-4000-8000-000000000001:c3000000-0000-4000-8000-000000000001';
  if v_cost <> 0.0034 or v_duration <> 12
     or v_operation <> 'inspection_transcription_settled' then
    raise exception 'canonical ledger did not store the settled usage';
  end if;

  select status into v_status
  from private.ai_budget_reservations
  where id = (select id from voice_test_ids where name = 'reservation');
  if v_status <> 'committed' then
    raise exception 'budget hold was not committed: %', v_status;
  end if;

  select estimated_cost_usd, duration_seconds, operation
    into v_cost, v_duration, v_operation
  from private.ai_usage_ledger
  where event_key = 'inspection_voice:c2000000-0000-4000-8000-000000000001:c3000000-0000-4000-8000-000000000002';
  if v_cost <> 1.02 or v_duration <> 3600
     or v_operation <> 'inspection_transcription_settled_fallback' then
    raise exception 'late report overwrote fallback accounting';
  end if;
end
$$;

rollback;
