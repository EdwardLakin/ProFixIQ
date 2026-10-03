begin;

create or replace function rls_helpers.settle_live_ai_usage_ledger(
  p_shop_id uuid,
  p_user_id uuid,
  p_session_id text,
  p_duration_seconds numeric,
  p_actual_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row private.ai_usage_ledger%rowtype;
  v_duration numeric;
  v_actual_cost numeric;
  v_previous_cost numeric;
begin
  p_session_id := nullif(pg_catalog.btrim(p_session_id), '');
  v_duration := greatest(0, least(coalesce(p_duration_seconds, 0), 600));
  v_actual_cost := greatest(0, coalesce(p_actual_cost_usd, 0));

  if p_shop_id is null
     or p_user_id is null
     or p_session_id is null
     or pg_catalog.length(p_session_id) > 240
     or p_duration_seconds is null
     or p_duration_seconds < 0
     or p_actual_cost_usd is null
     or p_actual_cost_usd < 0 then
    raise exception using errcode = '22023', message = 'LIVE_USAGE_SETTLEMENT_INPUT_INVALID';
  end if;

  select *
    into v_row
  from private.ai_usage_ledger ledger
  where ledger.event_key = p_session_id
    and ledger.shop_id = p_shop_id
    and ledger.user_id = p_user_id
    and ledger.provider = 'openai'
    and ledger.feature = 'openai_realtime_token'
    and ledger.modality = 'realtime'
  for update;

  if v_row.id is null then
    raise exception using errcode = '42501', message = 'LIVE_USAGE_RESERVATION_NOT_FOUND';
  end if;

  if v_row.operation = 'live_session_settled' then
    return pg_catalog.jsonb_build_object(
      'settled', true,
      'alreadySettled', true,
      'previousCostUsd', v_row.estimated_cost_usd,
      'actualCostUsd', v_row.estimated_cost_usd,
      'durationSeconds', v_row.duration_seconds
    );
  end if;

  v_previous_cost := coalesce(v_row.estimated_cost_usd, 0);
  v_actual_cost := least(v_previous_cost, v_actual_cost);

  update private.ai_usage_ledger
  set duration_seconds = v_duration,
      estimated_cost_usd = v_actual_cost,
      operation = 'live_session_settled'
  where id = v_row.id;

  return pg_catalog.jsonb_build_object(
    'settled', true,
    'alreadySettled', false,
    'previousCostUsd', v_previous_cost,
    'actualCostUsd', v_actual_cost,
    'durationSeconds', v_duration
  );
end
$function$;

alter function rls_helpers.settle_live_ai_usage_ledger(uuid, uuid, text, numeric, numeric)
  owner to postgres;
revoke all on function rls_helpers.settle_live_ai_usage_ledger(uuid, uuid, text, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function rls_helpers.settle_live_ai_usage_ledger(uuid, uuid, text, numeric, numeric)
  to service_role;

create or replace function public.settle_live_ai_usage_ledger(
  p_shop_id uuid,
  p_user_id uuid,
  p_session_id text,
  p_duration_seconds numeric,
  p_actual_cost_usd numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select rls_helpers.settle_live_ai_usage_ledger(
    p_shop_id, p_user_id, p_session_id, p_duration_seconds, p_actual_cost_usd
  );
$function$;

alter function public.settle_live_ai_usage_ledger(uuid, uuid, text, numeric, numeric)
  owner to postgres;
revoke all on function public.settle_live_ai_usage_ledger(uuid, uuid, text, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_live_ai_usage_ledger(uuid, uuid, text, numeric, numeric)
  to service_role;

commit;
