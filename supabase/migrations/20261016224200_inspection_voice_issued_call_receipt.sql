-- An authorized inspection issuance may finish after its actor moves shops.
-- Adapt the immutable issuance claim to the existing canonical ledger writer;
-- do not change that writer's current-membership contract for other callers.
begin;

create or replace function public.record_inspection_voice_issued_call(
  p_shop_id uuid, p_actor_id uuid, p_reservation_id uuid,
  p_call_id text, p_model text, p_issued_at timestamptz, p_latency_ms integer
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare
  v_reservation private.ai_budget_reservations%rowtype;
  v_rate private.inspection_voice_issuance_rates%rowtype;
  v_id uuid;
begin
  if p_shop_id is null or p_actor_id is null or p_reservation_id is null
     or p_call_id is null or p_call_id !~ '^(rtc_[a-zA-Z0-9_-]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
     or p_model is null or pg_catalog.length(pg_catalog.btrim(p_model)) not between 1 and 160
     or p_issued_at is null or not pg_catalog.isfinite(p_issued_at)
     or p_latency_ms is null or p_latency_ms < 0 then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );
  select reservation.* into v_reservation
  from private.ai_budget_reservations reservation
  where reservation.id = p_reservation_id and reservation.shop_id = p_shop_id
    and reservation.actor_id = p_actor_id and reservation.pool = 'voice'
    and reservation.feature = 'openai_realtime_token'
  for update;
  select rate.* into v_rate
  from private.inspection_voice_issuance_rates rate
  where rate.reservation_id = p_reservation_id and rate.shop_id = p_shop_id
    and rate.actor_id = p_actor_id
    and v_reservation.idempotency_key = 'inspection_voice:' || p_shop_id::text || ':' || rate.usage_key;
  if v_reservation.id is null or v_rate.reservation_id is null then return false; end if;

  -- Exact replay is valid after closure/settlement, without changing evidence.
  if exists (
    select 1 from private.ai_usage_ledger ledger
    where ledger.event_key = v_reservation.idempotency_key
      and ledger.shop_id = p_shop_id and ledger.user_id = p_actor_id
      and ledger.quota_receipt_id = p_reservation_id
      and ledger.provider_request_id = p_call_id and ledger.model = p_model
      and ledger.provider = 'openai' and ledger.feature = 'openai_realtime_token'
      and ledger.endpoint = '/api/openai/inspection-transcription-token'
      and ledger.modality = 'realtime' and ledger.status = 'success'
  ) then return true; end if;
  if v_reservation.status <> 'reserved' then return false; end if;

  -- Historical actor authorization is supplied by the claim above. Delegate
  -- all accounting validation/insertion to the unchanged canonical writer,
  -- then attribute its exact row within this same atomic transaction.
  v_id := public.record_ai_usage_ledger(p_shop_id, null, pg_catalog.jsonb_build_object(
    'event_key', v_reservation.idempotency_key,
    'feature', 'openai_realtime_token', 'endpoint', '/api/openai/inspection-transcription-token',
    'provider', 'openai', 'provider_request_id', p_call_id,
    'model', pg_catalog.btrim(p_model), 'modality', 'realtime',
    'rate_card_version', v_rate.rate_card_version,
    'duration_seconds', 3600, 'estimated_cost_usd', v_rate.reserved_usd,
    'latency_ms', p_latency_ms, 'status', 'success',
    'quota_receipt_id', p_reservation_id, 'occurred_at', p_issued_at
  ));
  update private.ai_usage_ledger ledger
  set user_id = p_actor_id,
      operation = coalesce(ledger.operation, 'inspection_transcription_reservation')
  where ledger.id = v_id and ledger.event_key = v_reservation.idempotency_key
    and ledger.shop_id = p_shop_id and (ledger.user_id is null or ledger.user_id = p_actor_id)
    and ledger.quota_receipt_id = p_reservation_id
    and ledger.provider_request_id = p_call_id and ledger.model = pg_catalog.btrim(p_model)
    and ledger.provider = 'openai' and ledger.feature = 'openai_realtime_token'
    and ledger.endpoint = '/api/openai/inspection-transcription-token'
    and ledger.modality = 'realtime' and ledger.status = 'success';
  if not found then
    raise exception using errcode = '42501', message = 'INSPECTION_VOICE_ISSUANCE_RECEIPT_CONFLICT';
  end if;
  return true;
end
$function$;

alter function public.record_inspection_voice_issued_call(uuid, uuid, uuid, text, text, timestamptz, integer)
  owner to postgres;
revoke all on function public.record_inspection_voice_issued_call(uuid, uuid, uuid, text, text, timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.record_inspection_voice_issued_call(uuid, uuid, uuid, text, text, timestamptz, integer)
  to service_role;

commit;
