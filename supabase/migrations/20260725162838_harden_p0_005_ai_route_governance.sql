begin;

create schema if not exists private authorization postgres;
revoke all privileges on schema private
  from public, anon, authenticated, service_role;

create table if not exists private.ai_route_usage_receipts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null check (feature in ('dtc_suggest', 'inspection_interpret')),
  status text not null default 'reserved'
    check (status in ('reserved', 'success', 'error')),
  reserved_cost_usd numeric(12, 6) not null
    check (reserved_cost_usd >= 0),
  actual_cost_usd numeric(12, 6)
    check (actual_cost_usd is null or actual_cost_usd >= 0),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create index if not exists ai_route_usage_receipts_actor_window_idx
  on private.ai_route_usage_receipts (shop_id, actor_id, feature, created_at desc);

create index if not exists ai_route_usage_receipts_shop_budget_idx
  on private.ai_route_usage_receipts (shop_id, feature, created_at desc);

create index if not exists ai_route_usage_receipts_actor_fk_idx
  on private.ai_route_usage_receipts (actor_id);

create index if not exists ai_route_usage_receipts_reserved_idx
  on private.ai_route_usage_receipts (shop_id, feature, created_at)
  where status = 'reserved';

revoke all privileges on table private.ai_route_usage_receipts
  from public, anon, authenticated, service_role;

create or replace function public.consume_ai_route_quota(
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
     or p_feature not in ('dtc_suggest', 'inspection_interpret')
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

  -- Serialize a shop/feature quota decision so parallel serverless instances
  -- cannot all pass the same count or monthly budget check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_shop_id::text || ':' || p_feature, 0)
  );

  -- A crashed provider call must not reserve monthly budget forever.
  update private.ai_route_usage_receipts receipt
  set status = 'error',
      actual_cost_usd = 0,
      completed_at = v_now
  where receipt.shop_id = p_shop_id
    and receipt.feature = p_feature
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
    and receipt.feature = p_feature
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

create or replace function public.complete_ai_route_quota(
  p_receipt_id uuid,
  p_shop_id uuid,
  p_actor_id uuid,
  p_feature text,
  p_actual_cost_usd numeric,
  p_succeeded boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if p_receipt_id is null
     or p_shop_id is null
     or p_actor_id is null
     or p_feature not in ('dtc_suggest', 'inspection_interpret')
     or p_actual_cost_usd is null
     or p_actual_cost_usd < 0
     or p_succeeded is null then
    raise exception using
      errcode = '22023',
      message = 'AI_ROUTE_COMPLETION_INPUT_INVALID';
  end if;

  update private.ai_route_usage_receipts receipt
  set status = case when p_succeeded then 'success' else 'error' end,
      actual_cost_usd = p_actual_cost_usd,
      completed_at = clock_timestamp()
  where receipt.id = p_receipt_id
    and receipt.shop_id = p_shop_id
    and receipt.actor_id = p_actor_id
    and receipt.feature = p_feature
    and receipt.status = 'reserved';

  return found;
end
$function$;

alter function public.consume_ai_route_quota(
  uuid, uuid, text, integer, integer, integer, numeric, numeric
) owner to postgres;
alter function public.complete_ai_route_quota(
  uuid, uuid, uuid, text, numeric, boolean
) owner to postgres;

revoke all privileges on function public.consume_ai_route_quota(
  uuid, uuid, text, integer, integer, integer, numeric, numeric
) from public, anon, authenticated, service_role;
revoke all privileges on function public.complete_ai_route_quota(
  uuid, uuid, uuid, text, numeric, boolean
) from public, anon, authenticated, service_role;

grant execute on function public.consume_ai_route_quota(
  uuid, uuid, text, integer, integer, integer, numeric, numeric
) to service_role;
grant execute on function public.complete_ai_route_quota(
  uuid, uuid, uuid, text, numeric, boolean
) to service_role;

commit;
