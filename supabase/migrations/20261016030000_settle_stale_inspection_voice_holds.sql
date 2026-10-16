begin;

create index if not exists ai_budget_reservations_stale_expiry_idx
  on private.ai_budget_reservations (expires_at, shop_id)
  where status in ('reserved', 'expired')
    and pool = 'voice'
    and feature = 'openai_realtime_token'
    and idempotency_key ~ ('^inspection_voice:' || shop_id::text ||
      ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$');

-- A conflicting canonical event key cannot safely prove this reservation's
-- provider outcome. Keep its hold intact and make the conflict visible while
-- allowing the scheduled sweep to reach other shops.
create table if not exists private.inspection_voice_reconciliation_conflicts (
  reservation_id uuid primary key references private.ai_budget_reservations(id) on delete cascade,
  shop_id uuid not null,
  observed_ledger_id uuid,
  reason text not null,
  detected_at timestamptz not null default pg_catalog.clock_timestamp()
);
revoke all on private.inspection_voice_reconciliation_conflicts
  from public, anon, authenticated, service_role;

-- The scheduled job must not invoke the shared stale-hold release RPC: doing so
-- would automatically release unrelated AI holds. Only provider-issued
-- inspection voice reservations are eligible for this conservative sweep,
-- including provider outcomes whose issuance receipt never arrived.
create or replace function private.reconcile_stale_inspection_voice_holds()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_shop_id uuid;
  v_fallback_usd numeric(14, 6);
  v_confirmed_reserved_usd numeric(14, 6);
  v_confirmed_actual_usd numeric(14, 6);
  v_rejected_usd numeric(14, 6);
  v_reservation private.ai_budget_reservations%rowtype;
  v_ledger private.ai_usage_ledger%rowtype;
  v_actual_usd numeric(14, 6);
  v_attempt integer;
  v_actor_id uuid;
  v_rate_card_version text;
begin
  -- One shop per cron invocation means its budget lock is released when this
  -- statement ends, independently of every other tenant in the backlog.
  select reservation.shop_id into v_shop_id
  from private.ai_budget_reservations reservation
  where reservation.status in ('reserved', 'expired')
    and reservation.expires_at <= v_now - interval '1 hour'
    and reservation.pool = 'voice'
    and reservation.feature = 'openai_realtime_token'
    and reservation.idempotency_key ~ ('^inspection_voice:' || reservation.shop_id::text ||
      ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
    and not exists (
      select 1 from private.inspection_voice_reconciliation_conflicts quarantine
      where quarantine.reservation_id = reservation.id
    )
  order by reservation.expires_at, reservation.shop_id
  limit 1;
  if v_shop_id is null then return; end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ai-budget:' || v_shop_id::text, 0)
    );

    v_fallback_usd := 0;
    v_confirmed_reserved_usd := 0;
    v_confirmed_actual_usd := 0;
    v_rejected_usd := 0;
    for v_reservation in
      select reservation.* from private.ai_budget_reservations reservation
      where reservation.shop_id = v_shop_id
        and reservation.status in ('reserved', 'expired')
        and reservation.expires_at <= v_now - interval '1 hour'
        and reservation.pool = 'voice'
        and reservation.feature = 'openai_realtime_token'
        and reservation.idempotency_key ~ ('^inspection_voice:' || v_shop_id::text ||
          ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
        and not exists (
          select 1 from private.inspection_voice_reconciliation_conflicts quarantine
          where quarantine.reservation_id = reservation.id
        )
      order by reservation.id for update
    loop
      select ledger.* into v_ledger from private.ai_usage_ledger ledger
      where ledger.event_key = v_reservation.idempotency_key
        and ledger.quota_receipt_id = v_reservation.id
        and ledger.shop_id = v_shop_id
        and ledger.provider = 'openai'
        and ledger.feature = 'openai_realtime_token'
        and ledger.endpoint = '/api/openai/inspection-transcription-token'
        and ledger.modality = 'realtime' and ledger.status = 'success'
      for update;

      if v_ledger.id is not null and v_ledger.operation = 'inspection_transcription_closed' then
        if v_ledger.provider_request_id is null
           or v_ledger.duration_seconds is null
           or v_ledger.duration_seconds < 0
           or v_ledger.duration_seconds > 3600 then
          insert into private.inspection_voice_reconciliation_conflicts
            (reservation_id, shop_id, observed_ledger_id, reason)
          values (v_reservation.id, v_shop_id, v_ledger.id,
            'INSPECTION_VOICE_CLOSURE_EVIDENCE_INVALID')
          on conflict (reservation_id) do nothing;
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

      if v_ledger.id is null then
        if exists (
          select 1 from private.ai_usage_ledger rejected
          where rejected.event_key = v_reservation.idempotency_key || ':error'
            and rejected.quota_receipt_id = v_reservation.id
            and rejected.shop_id = v_shop_id
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
          update private.ai_budget_reservations reservation
          set status = 'released', actual_usd = 0, settled_at = v_now
          where reservation.id = v_reservation.id;
          update private.ai_usage_ledger rejected
          set operation = 'inspection_transcription_rejected_reconciled'
          where rejected.event_key = v_reservation.idempotency_key || ':error'
            and rejected.quota_receipt_id = v_reservation.id
            and rejected.shop_id = v_shop_id;
          if v_reservation.enforcement = 'enforce' then
            v_rejected_usd := v_rejected_usd + v_reservation.reserved_usd;
          end if;
          continue;
        end if;
        -- The canonical recorder requires current tenant membership. Preserve
        -- the actor when still valid, but do not strand a hold after a move.
        select profile.id into v_actor_id
        from public.profiles profile
        where (profile.id = v_reservation.actor_id
          or profile.user_id = v_reservation.actor_id)
          and (profile.shop_id = v_shop_id or exists (
            select 1 from public.fleet_members member
            join public.fleets fleet on fleet.id = member.fleet_id
              and fleet.shop_id = v_shop_id
            where member.shop_id = v_shop_id
              and member.user_id in (profile.id, profile.user_id, v_reservation.actor_id)
          ))
        limit 1;
        select rate.rate_card_version into v_rate_card_version
        from private.inspection_voice_issuance_rates rate
        where rate.reservation_id = v_reservation.id
          and rate.shop_id = v_shop_id
          and rate.reserved_usd = v_reservation.reserved_usd;
        for v_attempt in 1..2 loop
          begin
            v_ledger.id := public.record_ai_usage_ledger(
            v_shop_id, v_actor_id, pg_catalog.jsonb_build_object(
              'event_key', v_reservation.idempotency_key,
              'feature', 'openai_realtime_token',
              'endpoint', '/api/openai/inspection-transcription-token',
              'provider', 'openai', 'modality', 'realtime',
              'rate_card_version', coalesce(v_rate_card_version, 'inspection-issuance-rate-unknown'),
              'duration_seconds', 3600,
              'estimated_cost_usd', v_reservation.reserved_usd,
              'latency_ms', 0, 'status', 'error',
              'error_code', 'inspection_voice_provider_outcome_unknown',
              'quota_receipt_id', v_reservation.id
            )
            );
            exit;
          exception when insufficient_privilege then
            -- Membership may have changed after selecting this actor. Retry
            -- without the actor; other recorder failures remain retryable.
            if v_actor_id is null or v_attempt = 2 then raise; end if;
            v_actor_id := null;
          end;
        end loop;
        if not exists (
          select 1 from private.ai_usage_ledger ledger
          where ledger.id = v_ledger.id
            and ledger.event_key = v_reservation.idempotency_key
            and ledger.shop_id = v_shop_id
            and ledger.quota_receipt_id = v_reservation.id
            and ledger.provider = 'openai'
            and ledger.feature = 'openai_realtime_token'
            and ledger.endpoint = '/api/openai/inspection-transcription-token'
            and ledger.modality = 'realtime'
            and ledger.status = 'error'
            and ledger.error_code = 'inspection_voice_provider_outcome_unknown'
            and ledger.duration_seconds = 3600
            and ledger.estimated_cost_usd = v_reservation.reserved_usd
        ) then
          insert into private.inspection_voice_reconciliation_conflicts
            (reservation_id, shop_id, observed_ledger_id, reason)
          values (v_reservation.id, v_shop_id, v_ledger.id,
            'INSPECTION_VOICE_FALLBACK_LEDGER_CONFLICT')
          on conflict (reservation_id) do nothing;
          v_ledger := null;
          continue;
        end if;
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

    if v_fallback_usd > 0 or v_rejected_usd > 0 or v_confirmed_reserved_usd > 0 then
      update private.ai_shop_budgets budget
      set held_usd = greatest(0, budget.held_usd - v_fallback_usd - v_rejected_usd
        - v_confirmed_reserved_usd),
          committed_usd = budget.committed_usd + v_fallback_usd + v_confirmed_actual_usd,
          updated_at = v_now
      where budget.shop_id = v_shop_id;
    end if;
end
$function$;

alter function private.reconcile_stale_inspection_voice_holds()
  owner to postgres;
revoke all on function private.reconcile_stale_inspection_voice_holds()
  from public, anon, authenticated, service_role;

do $schedule$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in ('inspection-voice-budget-reconciliation-hourly',
      'inspection-voice-budget-reconciliation-minute')
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'inspection-voice-budget-reconciliation-minute',
    '* * * * *',
    $command$select private.reconcile_stale_inspection_voice_holds();$command$
  );
end;
$schedule$;

commit;
