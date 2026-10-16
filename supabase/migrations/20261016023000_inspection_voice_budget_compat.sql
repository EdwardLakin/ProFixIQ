begin;

-- Compatible integration: preserve the service-role stale-release contract for
-- every ordinary hold. An expired inspection call can have an unknown outcome;
-- adjudicate it at its reserved ceiling and record that uncertainty in the
-- canonical ledger before removing the hold.
create or replace function public.release_stale_ai_budget_holds(
  p_shop_id uuid,
  p_older_than_seconds integer
)
returns table (released_count integer, released_usd numeric)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_fallback_usd numeric(14, 6) := 0;
  v_confirmed_reserved_usd numeric(14, 6) := 0;
  v_confirmed_actual_usd numeric(14, 6) := 0;
  v_rejected_usd numeric(14, 6) := 0;
  v_rejected_count integer := 0;
  v_reservation private.ai_budget_reservations%rowtype;
  v_actor_id uuid;
  v_ledger private.ai_usage_ledger%rowtype;
  v_actual_usd numeric(14, 6);
  v_count integer;
  v_usd numeric(14, 6);
begin
  if p_shop_id is null or p_older_than_seconds is null
     or p_older_than_seconds < 3600 then
    raise exception using errcode = '22023', message = 'AI_BUDGET_RECONCILE_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-budget:' || p_shop_id::text, 0)
  );

  for v_reservation in
    select reservation.*
    from private.ai_budget_reservations reservation
    where reservation.shop_id = p_shop_id
      and reservation.status in ('reserved', 'expired')
      and reservation.expires_at <= v_now - pg_catalog.make_interval(secs => p_older_than_seconds)
      and reservation.pool = 'voice'
      and reservation.feature = 'openai_realtime_token'
      and reservation.idempotency_key ~ ('^inspection_voice:' || p_shop_id::text ||
        ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
    order by reservation.id
    for update
  loop
    select ledger.* into v_ledger
    from private.ai_usage_ledger ledger
    where ledger.event_key = v_reservation.idempotency_key
      and ledger.quota_receipt_id = v_reservation.id
      and ledger.shop_id = p_shop_id
      and ledger.provider = 'openai'
      and ledger.feature = 'openai_realtime_token'
      and ledger.endpoint = '/api/openai/inspection-transcription-token'
      and ledger.modality = 'realtime'
      and ledger.status = 'success'
    for update;

    if v_ledger.id is null then
      if exists (
        select 1 from private.ai_usage_ledger rejected
        where rejected.event_key = v_reservation.idempotency_key || ':error'
          and rejected.quota_receipt_id = v_reservation.id
          and rejected.shop_id = p_shop_id
          and (rejected.user_id is not distinct from v_reservation.actor_id
            or exists (
              select 1 from public.profiles profile
              where profile.id = rejected.user_id
                and profile.user_id = v_reservation.actor_id
            ))
          and rejected.provider = 'openai'
          and rejected.feature = 'openai_realtime_token'
          and rejected.endpoint = '/api/openai/inspection-transcription-token'
          and rejected.modality = 'realtime'
          and rejected.status = 'error'
          and rejected.error_code in (
            'inspection_voice_rejected', 'inspection_voice_pre_provider_failure'
          )
      ) then
        -- The provider explicitly rejected creation. The receipt was written
        -- before the release RPC, which may have failed transiently.
        update private.ai_budget_reservations reservation
        set status = 'released', actual_usd = 0, settled_at = v_now
        where reservation.id = v_reservation.id;
        update private.ai_usage_ledger rejected
        set operation = 'inspection_transcription_rejected_reconciled'
        where rejected.event_key = v_reservation.idempotency_key || ':error'
          and rejected.quota_receipt_id = v_reservation.id
          and rejected.shop_id = p_shop_id;
        if v_reservation.enforcement = 'enforce' then
          v_rejected_usd := v_rejected_usd + v_reservation.reserved_usd;
        end if;
        v_rejected_count := v_rejected_count + 1;
        continue;
      end if;
      -- A provider request may have succeeded while the server lost its
      -- response. Keep one idempotent canonical receipt of that uncertainty.
      -- The canonical recorder only accepts actors currently attached to the
      -- issuing shop. A moved/deleted actor must not block budget recovery.
      select profile.id into v_actor_id
      from public.profiles profile
      where (profile.id = v_reservation.actor_id
        or profile.user_id = v_reservation.actor_id)
        and (profile.shop_id = p_shop_id or exists (
          select 1 from public.fleet_members member
          join public.fleets fleet on fleet.id = member.fleet_id
            and fleet.shop_id = p_shop_id
          where member.shop_id = p_shop_id
            and member.user_id in (profile.id, profile.user_id, v_reservation.actor_id)
        ))
      limit 1;
      v_ledger.id := public.record_ai_usage_ledger(
        p_shop_id, v_actor_id,
        pg_catalog.jsonb_build_object(
          'event_key', v_reservation.idempotency_key,
          'feature', 'openai_realtime_token',
          'endpoint', '/api/openai/inspection-transcription-token',
          'provider', 'openai', 'modality', 'realtime',
          'rate_card_version', 'inspection-issuance-rate-unknown',
          'duration_seconds', 3600,
          'estimated_cost_usd', v_reservation.reserved_usd,
          'latency_ms', 0, 'status', 'error',
          'error_code', 'inspection_voice_provider_outcome_unknown',
          'quota_receipt_id', v_reservation.id,
          'operation', 'inspection_transcription_settled_fallback'
        )
      );
    end if;

    -- The canonical recorder may return an existing row after a concurrent
    -- insert. Lock and inspect that exact result before changing evidence.
    select ledger.* into v_ledger from private.ai_usage_ledger ledger
    where ledger.id = v_ledger.id
      and ledger.event_key = v_reservation.idempotency_key
      and ledger.shop_id = p_shop_id
      and ledger.quota_receipt_id = v_reservation.id
      and ledger.provider = 'openai'
      and ledger.feature = 'openai_realtime_token'
      and ledger.endpoint = '/api/openai/inspection-transcription-token'
      and ledger.modality = 'realtime'
    for update;
    if v_ledger.id is null then continue; end if;

    if v_ledger.status = 'success' and v_ledger.operation = 'inspection_transcription_closed' then
      -- A server-confirmed provider hangup is durable evidence even when the
      -- request died before committing the budget. Keep its measured duration.
      if v_ledger.provider_request_id is null
         or v_ledger.duration_seconds is null
         or v_ledger.duration_seconds < 0
         or v_ledger.duration_seconds > 3600 then
        -- Keep only this hold intact; ordinary stale cleanup still proceeds.
        continue;
      end if;
      v_actual_usd := pg_catalog.round(
        v_reservation.reserved_usd * v_ledger.duration_seconds / 3600, 6
      );
      update private.ai_budget_reservations reservation
      set status = 'committed', actual_usd = v_actual_usd,
          cost_basis = 'actual', settled_at = v_now
      where reservation.id = v_reservation.id;
      update private.ai_usage_ledger ledger
      set operation = 'inspection_transcription_settled',
          estimated_cost_usd = v_actual_usd
      where ledger.id = v_ledger.id;
      if v_reservation.enforcement = 'enforce' then
        v_confirmed_reserved_usd := v_confirmed_reserved_usd + v_reservation.reserved_usd;
        v_confirmed_actual_usd := v_confirmed_actual_usd + v_actual_usd;
      end if;
      continue;
    end if;

    if not coalesce((
      (v_ledger.status = 'success' and
        (v_ledger.operation is null or v_ledger.operation = 'inspection_transcription_reservation'))
      or (v_ledger.status = 'error'
        and v_ledger.error_code = 'inspection_voice_provider_outcome_unknown'
        and v_ledger.duration_seconds = 3600
        and v_ledger.estimated_cost_usd = v_reservation.reserved_usd)
    ), false) then
      -- Conflicting evidence must not starve ordinary holds in this shop.
      continue;
    end if;

    update private.ai_usage_ledger ledger
    set operation = 'inspection_transcription_settled_fallback',
        estimated_cost_usd = v_reservation.reserved_usd,
        duration_seconds = 3600
    where ledger.id = v_ledger.id;

    update private.ai_budget_reservations reservation
    set status = 'committed', actual_usd = reservation.reserved_usd,
        cost_basis = 'reserved_fallback', settled_at = v_now
    where reservation.id = v_reservation.id;
    if v_reservation.enforcement = 'enforce' then
      v_fallback_usd := v_fallback_usd + v_reservation.reserved_usd;
    end if;
    v_ledger := null;
  end loop;

  with stale as (
    update private.ai_budget_reservations reservation
    set status = 'released',
        actual_usd = 0,
        settled_at = v_now
    where reservation.shop_id = p_shop_id
      and reservation.status in ('reserved', 'expired')
      and reservation.expires_at <= v_now - pg_catalog.make_interval(secs => p_older_than_seconds)
      and not (
        reservation.pool = 'voice'
        and
        reservation.feature = 'openai_realtime_token'
        and reservation.idempotency_key ~ ('^inspection_voice:' || p_shop_id::text ||
          ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
      )
    returning reservation.reserved_usd, reservation.enforcement
  )
  select pg_catalog.count(*)::integer,
         coalesce(pg_catalog.sum(stale.reserved_usd)
           filter (where stale.enforcement = 'enforce'), 0)::numeric(14, 6)
  into v_count, v_usd
  from stale;

  if v_fallback_usd > 0 or v_usd > 0 or v_rejected_usd > 0
     or v_confirmed_reserved_usd > 0 then
    update private.ai_shop_budgets budget
    set held_usd = greatest(0, budget.held_usd - v_fallback_usd - v_usd
      - v_rejected_usd - v_confirmed_reserved_usd),
        committed_usd = budget.committed_usd + v_fallback_usd + v_confirmed_actual_usd,
        updated_at = v_now
    where budget.shop_id = p_shop_id;
  end if;

  return query select v_count + v_rejected_count, v_usd + v_rejected_usd;
end
$function$;

alter function public.release_stale_ai_budget_holds(uuid, integer)
  owner to postgres;
revoke all privileges on function public.release_stale_ai_budget_holds(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.release_stale_ai_budget_holds(uuid, integer)
  to service_role;

commit;
