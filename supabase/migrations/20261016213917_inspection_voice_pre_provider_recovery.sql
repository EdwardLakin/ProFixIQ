begin;

-- A durable pre-provider failure is the same terminal no-call proof as a
-- definitive provider rejection. Preserve the actor/reservation binding and
-- existing successful-call lookup; only widen the proven no-call outcomes.
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
