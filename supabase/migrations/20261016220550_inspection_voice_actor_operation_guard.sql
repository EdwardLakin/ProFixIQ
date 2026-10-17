begin;

-- The closure payload identifies a session by actor + operation UUID even
-- after a shop move. Claim that credential atomically before provider creation,
-- without changing shared shop-budget idempotency or the client payload.
alter table private.inspection_voice_issuance_rates
  add column actor_id uuid,
  add column usage_key text;

update private.inspection_voice_issuance_rates rate
set actor_id = reservation.actor_id,
    usage_key = pg_catalog.split_part(reservation.idempotency_key, ':', 3)
from private.ai_budget_reservations reservation
where reservation.id = rate.reservation_id
  and reservation.shop_id = rate.shop_id
  and reservation.pool = 'voice'
  and reservation.feature = 'openai_realtime_token'
  and reservation.idempotency_key ~ ('^inspection_voice:' || reservation.shop_id::text ||
    ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$');

-- Fail rather than silently choosing between any historical ambiguous claims.
-- The NOT NULL and unique index validate the deterministic reservation backfill.
alter table private.inspection_voice_issuance_rates
  alter column actor_id set not null,
  alter column usage_key set not null;
create unique index inspection_voice_issuance_rates_actor_key_idx
  on private.inspection_voice_issuance_rates (actor_id, usage_key);

create or replace function public.record_inspection_voice_issuance_rate(
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
    (reservation_id, shop_id, actor_id, usage_key, rate_card_version, reserved_usd)
  values (v_reservation.id, p_shop_id, p_actor_id, pg_catalog.split_part(v_reservation.idempotency_key, ':', 3),
    pg_catalog.btrim(p_rate_card_version), v_reservation.reserved_usd)
  on conflict do nothing;
  return exists (
    select 1 from private.inspection_voice_issuance_rates rate
    where rate.reservation_id = v_reservation.id
      and rate.shop_id = p_shop_id
      and rate.actor_id = p_actor_id
      and rate.usage_key = pg_catalog.split_part(v_reservation.idempotency_key, ':', 3)
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

create or replace function public.get_inspection_voice_session_receipt_for_actor(
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
  -- Receiptless pre-provider failures can have stale fallback rows without a
  -- provider ID. They must not shadow the single credential-claimed call.
  order by (ledger.provider_request_id is not null) desc, ledger.id
  limit 1;
  if v_row.id is null then
    -- A lost POST response can conceal a definitive no-call outcome. Its
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
      and rejected.error_code in (
        'inspection_voice_rejected', 'inspection_voice_pre_provider_failure'
      )
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

commit;
