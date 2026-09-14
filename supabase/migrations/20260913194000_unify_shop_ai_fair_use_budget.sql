begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- The original durable quota enforced the monthly hard budget independently
-- for each AI feature. A shop could therefore consume the full CoPilot budget,
-- then another full DTC budget, then another inspection budget. Fair usage is
-- an economic tenant boundary, so the monthly spend decision must be shared
-- across every durable AI feature while short-window rate limits remain
-- feature-specific.
--
-- This is a NEW function (consume_ai_route_quota_v2), not a `create or
-- replace` of the existing consume_ai_route_quota. The p_hard_budget_usd
-- parameter's meaning changes from a feature-local ceiling to a shared one;
-- reusing the old name under the old signature would mean whichever of the
-- app or this migration deploys first mixes old-shaped calls with new-shaped
-- enforcement (or vice versa) for as long as a rolling deploy takes, and a
-- CoPilot call's old $600 feature-local figure would then read as a $600
-- shop-wide ceiling. Versioning the function makes that impossible: an
-- old app instance keeps calling the untouched original with its original
-- semantics, and a new app instance calling this one before the migration
-- lands gets Postgres's "function does not exist" (42883 / PGRST202), which
-- claimDurableAIRouteQuota (features/shared/lib/server/durable-ai-guard.ts)
-- already treats as a deterministic, fail-closed error rather than silently
-- misapplying either budget model. Retire consume_ai_route_quota once every
-- caller is confirmed on _v2.
create or replace function public.consume_ai_route_quota_v2(
  p_shop_id uuid,
  p_actor_id uuid,
  p_feature text,
  p_actor_max integer,
  p_shop_max integer,
  p_window_seconds integer,
  p_hard_budget_usd numeric,
  p_reservation_cost_usd numeric
)
returns table (
  allowed boolean,
  denial_reason text,
  retry_after_seconds integer,
  receipt_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_month_started_at timestamptz;
  v_actor_count integer;
  v_shop_count integer;
  v_oldest timestamptz;
  v_monthly_cost numeric(12, 6);
  v_receipt_id uuid;
begin
  if p_shop_id is null
     or p_actor_id is null
     or p_feature not in ('dtc_suggest', 'inspection_interpret', 'technician_copilot_text')
     or p_actor_max is null or p_actor_max < 1
     or p_shop_max is null or p_shop_max < p_actor_max
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400
     or p_hard_budget_usd is null or p_hard_budget_usd <= 0
     or p_reservation_cost_usd is null or p_reservation_cost_usd < 0 then
    raise exception using
      errcode = '22023',
      message = 'AI_ROUTE_QUOTA_INPUT_INVALID';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_id
      and profile.shop_id = p_shop_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'AI_ROUTE_QUOTA_SCOPE_DENIED';
  end if;

  v_window := make_interval(secs => p_window_seconds);
  v_month_started_at := date_trunc('month', v_now, 'UTC');

  -- Serialize the monthly economic decision at shop scope. Rate counters below
  -- remain feature-scoped, but no two features can race through the same total
  -- fair-use ceiling on different serverless instances.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_shop_id::text || ':ai-fair-use-budget', 0)
  );

  -- A crashed provider call must not reserve the shared monthly budget forever.
  update private.ai_route_usage_receipts receipt
  set status = 'error',
      actual_cost_usd = 0,
      completed_at = v_now
  where receipt.shop_id = p_shop_id
    and receipt.status = 'reserved'
    and receipt.created_at <= v_now - interval '30 minutes';

  select count(*)::integer
  into v_actor_count
  from private.ai_route_usage_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.actor_id = p_actor_id
    and receipt.feature = p_feature
    and receipt.created_at > v_now - v_window;

  if v_actor_count >= p_actor_max then
    select min(receipt.created_at)
    into v_oldest
    from private.ai_route_usage_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.actor_id = p_actor_id
      and receipt.feature = p_feature
      and receipt.created_at > v_now - v_window;

    return query select
      false,
      'rate_limited'::text,
      greatest(1, ceil(extract(epoch from (v_oldest + v_window - v_now)))::integer),
      null::uuid;
    return;
  end if;

  select count(*)::integer
  into v_shop_count
  from private.ai_route_usage_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.feature = p_feature
    and receipt.created_at > v_now - v_window;

  if v_shop_count >= p_shop_max then
    select min(receipt.created_at)
    into v_oldest
    from private.ai_route_usage_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.feature = p_feature
      and receipt.created_at > v_now - v_window;

    return query select
      false,
      'rate_limited'::text,
      greatest(1, ceil(extract(epoch from (v_oldest + v_window - v_now)))::integer),
      null::uuid;
    return;
  end if;

  -- Shop-wide: every durable feature's spend counts against the one ceiling.
  -- No `and receipt.feature = p_feature` here — that is the entire point of
  -- this migration. See the new (shop_id, created_at) indexes below: this
  -- scan can no longer use the feature-prefixed indexes the rate-limit
  -- queries above still do.
  select coalesce(
    sum(
      case
        when receipt.status = 'reserved' then receipt.reserved_cost_usd
        else coalesce(receipt.actual_cost_usd, 0)
      end
    ),
    0
  )::numeric(12, 6)
  into v_monthly_cost
  from private.ai_route_usage_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.created_at >= v_month_started_at;

  if v_monthly_cost + p_reservation_cost_usd > p_hard_budget_usd then
    return query select
      false,
      'hard_budget_exceeded'::text,
      greatest(
        1,
        ceil(
          extract(
            epoch from (
              v_month_started_at + interval '1 month' - v_now
            )
          )
        )::integer
      ),
      null::uuid;
    return;
  end if;

  insert into private.ai_route_usage_receipts (
    shop_id,
    actor_id,
    feature,
    reserved_cost_usd
  ) values (
    p_shop_id,
    p_actor_id,
    p_feature,
    p_reservation_cost_usd
  )
  returning id into v_receipt_id;

  return query select true, null::text, 0, v_receipt_id;
end
$function$;

alter function public.consume_ai_route_quota_v2(
  uuid, uuid, text, integer, integer, integer, numeric, numeric
) owner to postgres;

revoke all privileges on function public.consume_ai_route_quota_v2(
  uuid, uuid, text, integer, integer, integer, numeric, numeric
) from public, anon, authenticated, service_role;

grant execute on function public.consume_ai_route_quota_v2(
  uuid, uuid, text, integer, integer, integer, numeric, numeric
) to service_role;

-- The shared monthly scan above reads (shop_id, created_at) with feature
-- unconstrained. The existing indexes are all (shop_id, feature, created_at),
-- so that scan could only use the shop_id prefix and would walk every
-- receipt the shop has ever had, growing slower over time while holding the
-- shop-wide advisory lock. Add the matching shapes, including the reserved
-- partial form the stale-reservation cleanup and this scan both want.
create index if not exists ai_route_usage_receipts_shop_month_idx
  on private.ai_route_usage_receipts (shop_id, created_at);

create index if not exists ai_route_usage_receipts_shop_reserved_idx
  on private.ai_route_usage_receipts (shop_id, created_at)
  where status = 'reserved';

commit;
