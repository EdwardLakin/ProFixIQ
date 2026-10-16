begin;

-- Record pricing before the provider request. A response-lost call can have
-- no issuance ledger row, but its reserved ceiling and rate version still
-- need durable provenance for conservative stale reconciliation.
create table if not exists private.inspection_voice_issuance_rates (
  reservation_id uuid primary key references private.ai_budget_reservations(id) on delete cascade,
  shop_id uuid not null,
  rate_card_version text not null,
  reserved_usd numeric(14, 6) not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp()
);
revoke all on private.inspection_voice_issuance_rates
  from public, anon, authenticated, service_role;

create function public.record_inspection_voice_issuance_rate(
  p_shop_id uuid, p_actor_id uuid, p_reservation_id uuid, p_rate_card_version text
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare
  v_reservation private.ai_budget_reservations%rowtype;
begin
  if p_shop_id is null or p_actor_id is null or p_reservation_id is null
     or p_rate_card_version is null or pg_catalog.length(pg_catalog.btrim(p_rate_card_version)) not between 1 and 80 then
    return false;
  end if;
  select reservation.* into v_reservation
  from private.ai_budget_reservations reservation
  where reservation.id = p_reservation_id
    and reservation.shop_id = p_shop_id
    and reservation.actor_id = p_actor_id
    and reservation.status = 'reserved'
    and reservation.pool = 'voice'
    and reservation.feature = 'openai_realtime_token'
    and reservation.idempotency_key ~ ('^inspection_voice:' || p_shop_id::text ||
      ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
  for update;
  if v_reservation.id is null then return false; end if;
  insert into private.inspection_voice_issuance_rates
    (reservation_id, shop_id, rate_card_version, reserved_usd)
  values (v_reservation.id, p_shop_id, pg_catalog.btrim(p_rate_card_version), v_reservation.reserved_usd)
  on conflict (reservation_id) do nothing;
  return exists (
    select 1 from private.inspection_voice_issuance_rates rate
    where rate.reservation_id = v_reservation.id
      and rate.shop_id = p_shop_id
      and rate.rate_card_version = pg_catalog.btrim(p_rate_card_version)
      and rate.reserved_usd = v_reservation.reserved_usd
  );
end
$function$;
alter function public.record_inspection_voice_issuance_rate(uuid, uuid, uuid, text)
  owner to postgres;
revoke all on function public.record_inspection_voice_issuance_rate(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inspection_voice_issuance_rate(uuid, uuid, uuid, text)
  to service_role;

-- Teardown can locate the original actor's receipt even after a shop move.
-- Keep this lookup bounded to that actor's inspection issuance rows.
create index if not exists idx_ai_usage_inspection_actor_event
  on private.ai_usage_ledger (user_id, event_key)
  where provider = 'openai'
    and feature = 'openai_realtime_token'
    and endpoint = '/api/openai/inspection-transcription-token'
    and modality = 'realtime'
    and status = 'success';

-- Inspection transcription uses the existing shop AI budget reservation and
-- canonical AI usage ledger. The route-specific settlement is separate from
-- the premium Live Copilot settlement RPC and does not change its contract.
create or replace function public.get_inspection_voice_session_receipt(
  p_shop_id uuid,
  p_user_id uuid,
  p_usage_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row private.ai_usage_ledger%rowtype;
begin
  p_usage_key := nullif(pg_catalog.btrim(p_usage_key), '');
  if p_shop_id is null
     or p_user_id is null
     or p_usage_key is null
     or pg_catalog.length(p_usage_key) <> 36 then
    raise exception using
      errcode = '22023',
      message = 'INSPECTION_VOICE_SETTLEMENT_INPUT_INVALID';
  end if;

  select ledger.*
    into v_row
  from private.ai_usage_ledger ledger
  where ledger.event_key = 'inspection_voice:' || p_shop_id::text || ':' || p_usage_key
    and ledger.shop_id = p_shop_id
    and ledger.user_id = p_user_id
    and ledger.provider = 'openai'
    and ledger.feature = 'openai_realtime_token'
    and ledger.endpoint = '/api/openai/inspection-transcription-token'
    and ledger.modality = 'realtime'
    and ledger.status = 'success';

  if v_row.id is null then
    raise exception using
      errcode = '42501',
      message = 'INSPECTION_VOICE_RESERVATION_NOT_FOUND';
  end if;

  return pg_catalog.jsonb_build_object(
    'model', v_row.model,
    'callId', v_row.provider_request_id,
    'issuedAt', v_row.occurred_at,
    'rateCardVersion', v_row.rate_card_version,
    'reservedCostUsd', v_row.estimated_cost_usd,
    'durationSeconds', v_row.duration_seconds,
    'operation', v_row.operation
  );
end
$function$;

-- A session owner may close an already issued call after their shop or
-- inspection capability changes. Resolve only their own exact usage key;
-- the current profile shop must never select another tenant's receipt.
create function public.get_inspection_voice_session_receipt_for_actor(
  p_user_id uuid, p_usage_key text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_row private.ai_usage_ledger%rowtype;
begin
  if p_user_id is null or p_usage_key is null
     or p_usage_key !~ '^[0-9a-fA-F-]{36}$' then
    raise exception using errcode = '22023', message = 'INSPECTION_VOICE_SETTLEMENT_INPUT_INVALID';
  end if;
  select ledger.* into v_row
  from private.ai_usage_ledger ledger
  where ledger.user_id = p_user_id
    and ledger.event_key = 'inspection_voice:' || ledger.shop_id::text || ':' || p_usage_key
    and ledger.provider = 'openai' and ledger.feature = 'openai_realtime_token'
    and ledger.endpoint = '/api/openai/inspection-transcription-token'
    and ledger.modality = 'realtime' and ledger.status = 'success'
  limit 1;
  if v_row.id is null then
    -- A lost POST response can conceal a definitive provider rejection. Its
    -- actor-bound error receipt proves no call was created, so the client can
    -- discard the pending key without attempting a provider hangup.
    select rejected.* into v_row
    from private.ai_usage_ledger rejected
    join private.ai_budget_reservations reservation
      on reservation.id = rejected.quota_receipt_id
      and reservation.shop_id = rejected.shop_id
      and reservation.actor_id = p_user_id
      and reservation.pool = 'voice'
      and reservation.feature = 'openai_realtime_token'
      and reservation.idempotency_key = 'inspection_voice:' || rejected.shop_id::text || ':' || p_usage_key
    where rejected.user_id = p_user_id
      and rejected.event_key = reservation.idempotency_key || ':error'
      and rejected.provider = 'openai'
      and rejected.feature = 'openai_realtime_token'
      and rejected.endpoint = '/api/openai/inspection-transcription-token'
      and rejected.modality = 'realtime'
      and rejected.status = 'error'
      and rejected.error_code = 'inspection_voice_rejected'
    limit 1;
    if v_row.id is not null then
      return pg_catalog.jsonb_build_object(
        'shopId', v_row.shop_id,
        'operation', 'inspection_transcription_rejected'
      );
    end if;
    raise exception using errcode = '42501', message = 'INSPECTION_VOICE_RESERVATION_NOT_FOUND';
  end if;
  return pg_catalog.jsonb_build_object(
    'shopId', v_row.shop_id, 'model', v_row.model,
    'callId', v_row.provider_request_id,
    'issuedAt', v_row.occurred_at,
    'rateCardVersion', v_row.rate_card_version,
    'reservedCostUsd', v_row.estimated_cost_usd,
    'durationSeconds', v_row.duration_seconds,
    'operation', v_row.operation
  );
end
$function$;

alter function public.get_inspection_voice_session_receipt_for_actor(uuid, text)
  owner to postgres;
revoke all on function public.get_inspection_voice_session_receipt_for_actor(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_inspection_voice_session_receipt_for_actor(uuid, text)
  to service_role;

-- Only the server calls this after the provider authenticated hangup succeeds.
-- Persist closure evidence before committing the budget so a retry after an
-- interrupted settlement can finish without a second provider hangup.
create function public.confirm_inspection_voice_closure(
  p_shop_id uuid, p_user_id uuid, p_usage_key text,
  p_call_id text, p_closed_at timestamptz
)
returns numeric
language plpgsql security definer set search_path = ''
as $function$
declare
  v_row private.ai_usage_ledger%rowtype;
  v_duration numeric;
begin
  if p_shop_id is null or p_user_id is null or p_usage_key is null
     or pg_catalog.length(p_usage_key) <> 36 or p_call_id is null
     or p_closed_at is null then
    raise exception using errcode = '22023', message = 'INSPECTION_VOICE_CLOSURE_INPUT_INVALID';
  end if;
  -- Stale reconciliation takes the same shop lock before reading or creating
  -- a fallback receipt. Serialize provider-confirmed closure with that path.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );
  select * into v_row from private.ai_usage_ledger ledger
  where ledger.event_key = 'inspection_voice:' || p_shop_id::text || ':' || p_usage_key
    and ledger.shop_id = p_shop_id and ledger.user_id = p_user_id
    and ledger.provider = 'openai' and ledger.feature = 'openai_realtime_token'
    and ledger.endpoint = '/api/openai/inspection-transcription-token'
    and ledger.modality = 'realtime' and ledger.status = 'success'
    and ledger.provider_request_id = p_call_id
  for update;
  if v_row.id is null then
    raise exception using errcode = '42501', message = 'INSPECTION_VOICE_RESERVATION_NOT_FOUND';
  end if;
  if v_row.operation in ('inspection_transcription_closed',
    'inspection_transcription_settled', 'inspection_transcription_settled_fallback') then
    return v_row.duration_seconds;
  end if;
  v_duration := greatest(0, least(3600,
    extract(epoch from (p_closed_at - v_row.occurred_at))));
  update private.ai_usage_ledger set
    operation = 'inspection_transcription_closed', duration_seconds = v_duration
  where id = v_row.id;
  return v_duration;
end
$function$;

create or replace function public.settle_inspection_voice_usage(
  p_shop_id uuid,
  p_user_id uuid,
  p_usage_key text,
  p_model text,
  p_duration_seconds numeric,
  p_actual_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_key text;
  v_row private.ai_usage_ledger%rowtype;
  v_budget private.ai_budget_reservations%rowtype;
  v_duration numeric;
  v_actual_cost numeric;
  v_committed boolean;
begin
  p_usage_key := nullif(pg_catalog.btrim(p_usage_key), '');
  p_model := nullif(pg_catalog.btrim(p_model), '');
  v_duration := greatest(0, least(coalesce(p_duration_seconds, 0), 3600));
  v_actual_cost := greatest(0, coalesce(p_actual_cost_usd, 0));
  v_event_key := 'inspection_voice:' || p_shop_id::text || ':' || coalesce(p_usage_key, '');

  if p_shop_id is null
     or p_user_id is null
     or p_usage_key is null
     or pg_catalog.length(p_usage_key) <> 36
     or p_model is null
     or pg_catalog.length(p_model) > 120
     or p_duration_seconds is null
     or p_duration_seconds < 0
     or p_actual_cost_usd is null
     or p_actual_cost_usd < 0 then
    raise exception using
      errcode = '22023',
      message = 'INSPECTION_VOICE_SETTLEMENT_INPUT_INVALID';
  end if;

  -- Preserve the existing budget lock order: shop advisory lock, then rows.
  -- The budget commit takes this same transaction-scoped lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );

  select *
    into v_row
  from private.ai_usage_ledger ledger
  where ledger.event_key = v_event_key
    and ledger.shop_id = p_shop_id
    and ledger.user_id = p_user_id
    and ledger.provider = 'openai'
    and ledger.feature = 'openai_realtime_token'
    and ledger.endpoint = '/api/openai/inspection-transcription-token'
    and ledger.modality = 'realtime'
    and ledger.status = 'success'
  for update;

  if v_row.id is null then
    raise exception using
      errcode = '42501',
      message = 'INSPECTION_VOICE_RESERVATION_NOT_FOUND';
  end if;

  if v_row.model is distinct from p_model then
    raise exception using
      errcode = '42501',
      message = 'INSPECTION_VOICE_MODEL_MISMATCH';
  end if;

  if v_row.operation in (
    'inspection_transcription_settled',
    'inspection_transcription_settled_fallback'
  ) then
    return pg_catalog.jsonb_build_object(
      'settled', true,
      'alreadySettled', true,
      'actualCostUsd', v_row.estimated_cost_usd,
      'durationSeconds', v_row.duration_seconds
    );
  end if;

  if v_row.operation <> 'inspection_transcription_closed'
     or v_row.duration_seconds is distinct from v_duration
     or v_row.provider_request_id is null
     or v_row.quota_receipt_id is null then
    raise exception using errcode = '42501', message = 'INSPECTION_VOICE_CLOSURE_NOT_CONFIRMED';
  end if;

  if v_row.estimated_cost_usd is null
     or v_actual_cost > v_row.estimated_cost_usd then
    raise exception using
      errcode = '22023',
      message = 'INSPECTION_VOICE_SETTLEMENT_EXCEEDS_RESERVATION';
  end if;

  select *
      into v_budget
    from private.ai_budget_reservations reservation
    where reservation.id = v_row.quota_receipt_id
      and reservation.shop_id = p_shop_id
      and reservation.actor_id = p_user_id
      and reservation.pool = 'voice'
      and reservation.feature = 'openai_realtime_token'
      and reservation.idempotency_key = v_event_key
    for update;

    if v_budget.id is null or v_budget.status not in ('reserved', 'expired') then
      raise exception using
        errcode = '42501',
        message = 'INSPECTION_VOICE_BUDGET_RESERVATION_NOT_FOUND';
    end if;

    select result.settled
      into v_committed
    from public.commit_ai_budget(
      v_budget.id,
      p_shop_id,
      v_actual_cost
    ) result;

    if not coalesce(v_committed, false) then
      raise exception using
        errcode = '55000',
        message = 'INSPECTION_VOICE_BUDGET_SETTLEMENT_FAILED';
    end if;
  update private.ai_usage_ledger
  set duration_seconds = v_duration,
      estimated_cost_usd = v_actual_cost,
      operation = 'inspection_transcription_settled'
  where id = v_row.id;

  return pg_catalog.jsonb_build_object(
    'settled', true,
    'alreadySettled', false,
    'actualCostUsd', v_actual_cost,
    'durationSeconds', v_duration
  );
end
$function$;

alter function public.settle_inspection_voice_usage(uuid, uuid, text, text, numeric, numeric)
  owner to postgres;
alter function public.get_inspection_voice_session_receipt(uuid, uuid, text)
  owner to postgres;
alter function public.confirm_inspection_voice_closure(uuid, uuid, text, text, timestamptz)
  owner to postgres;
revoke all on function public.get_inspection_voice_session_receipt(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_inspection_voice_session_receipt(uuid, uuid, text)
  to service_role;
revoke all on function public.confirm_inspection_voice_closure(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_inspection_voice_closure(uuid, uuid, text, text, timestamptz)
  to service_role;
revoke all on function public.settle_inspection_voice_usage(uuid, uuid, text, text, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_inspection_voice_usage(uuid, uuid, text, text, numeric, numeric)
  to service_role;

commit;
