begin;

create table if not exists private.public_ai_route_usage_receipts (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  feature text not null
    check (feature = 'public_marketing_chatbot'),
  status text not null default 'reserved'
    check (status in ('reserved', 'success', 'error')),
  reserved_cost_usd numeric(12, 6) not null
    check (reserved_cost_usd >= 0),
  actual_cost_usd numeric(12, 6)
    check (actual_cost_usd is null or actual_cost_usd >= 0),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create index if not exists public_ai_route_usage_client_window_idx
  on private.public_ai_route_usage_receipts (client_key, feature, created_at desc);

create index if not exists public_ai_route_usage_budget_idx
  on private.public_ai_route_usage_receipts (feature, created_at desc);

create index if not exists public_ai_route_usage_reserved_idx
  on private.public_ai_route_usage_receipts (feature, created_at)
  where status = 'reserved';

revoke all privileges on table private.public_ai_route_usage_receipts
  from public, anon, authenticated, service_role;

create or replace function rls_helpers.consume_public_ai_route_quota(
  p_client_key text,
  p_feature text,
  p_client_max integer,
  p_global_max integer,
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
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window interval;
  v_month_started_at timestamptz;
  v_client_count integer;
  v_global_count integer;
  v_oldest timestamptz;
  v_monthly_cost numeric(12, 6);
  v_receipt_id uuid;
begin
  if p_client_key is null
     or pg_catalog.length(pg_catalog.btrim(p_client_key)) < 16
     or pg_catalog.length(p_client_key) > 128
     or p_feature <> 'public_marketing_chatbot'
     or p_client_max is null or p_client_max < 1
     or p_global_max is null or p_global_max < p_client_max
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400
     or p_hard_budget_usd is null or p_hard_budget_usd <= 0
     or p_reservation_cost_usd is null or p_reservation_cost_usd <= 0 then
    raise exception using
      errcode = '22023',
      message = 'PUBLIC_AI_ROUTE_QUOTA_INPUT_INVALID';
  end if;

  v_window := pg_catalog.make_interval(secs => p_window_seconds);
  v_month_started_at := pg_catalog.date_trunc('month', v_now, 'UTC');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public-ai:' || p_feature, 0)
  );

  update private.public_ai_route_usage_receipts receipt
  set status = 'error',
      actual_cost_usd = receipt.reserved_cost_usd,
      completed_at = v_now
  where receipt.feature = p_feature
    and receipt.status = 'reserved'
    and receipt.created_at <= v_now - interval '30 minutes';

  select pg_catalog.count(*)::integer
  into v_client_count
  from private.public_ai_route_usage_receipts receipt
  where receipt.client_key = p_client_key
    and receipt.feature = p_feature
    and receipt.created_at > v_now - v_window;

  if v_client_count >= p_client_max then
    select pg_catalog.min(receipt.created_at)
    into v_oldest
    from private.public_ai_route_usage_receipts receipt
    where receipt.client_key = p_client_key
      and receipt.feature = p_feature
      and receipt.created_at > v_now - v_window;

    return query select
      false,
      'rate_limited'::text,
      pg_catalog.greatest(
        1,
        pg_catalog.ceil(
          pg_catalog.extract(epoch from (v_oldest + v_window - v_now))
        )::integer
      ),
      null::uuid;
    return;
  end if;

  select pg_catalog.count(*)::integer
  into v_global_count
  from private.public_ai_route_usage_receipts receipt
  where receipt.feature = p_feature
    and receipt.created_at > v_now - v_window;

  if v_global_count >= p_global_max then
    select pg_catalog.min(receipt.created_at)
    into v_oldest
    from private.public_ai_route_usage_receipts receipt
    where receipt.feature = p_feature
      and receipt.created_at > v_now - v_window;

    return query select
      false,
      'rate_limited'::text,
      pg_catalog.greatest(
        1,
        pg_catalog.ceil(
          pg_catalog.extract(epoch from (v_oldest + v_window - v_now))
        )::integer
      ),
      null::uuid;
    return;
  end if;

  select pg_catalog.coalesce(
    pg_catalog.sum(
      case
        when receipt.status = 'reserved' then receipt.reserved_cost_usd
        else pg_catalog.coalesce(receipt.actual_cost_usd, receipt.reserved_cost_usd)
      end
    ),
    0
  )::numeric(12, 6)
  into v_monthly_cost
  from private.public_ai_route_usage_receipts receipt
  where receipt.feature = p_feature
    and receipt.created_at >= v_month_started_at;

  if v_monthly_cost + p_reservation_cost_usd > p_hard_budget_usd then
    return query select
      false,
      'hard_budget_exceeded'::text,
      pg_catalog.greatest(
        1,
        pg_catalog.ceil(
          pg_catalog.extract(
            epoch from (v_month_started_at + interval '1 month' - v_now)
          )
        )::integer
      ),
      null::uuid;
    return;
  end if;

  insert into private.public_ai_route_usage_receipts (
    client_key,
    feature,
    reserved_cost_usd
  ) values (
    p_client_key,
    p_feature,
    p_reservation_cost_usd
  )
  returning id into v_receipt_id;

  return query select true, null::text, 0, v_receipt_id;
end
$function$;

create or replace function rls_helpers.complete_public_ai_route_quota(
  p_receipt_id uuid,
  p_client_key text,
  p_feature text,
  p_actual_cost_usd numeric,
  p_succeeded boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_receipt_id is null
     or p_client_key is null
     or p_feature <> 'public_marketing_chatbot'
     or p_actual_cost_usd is null
     or p_actual_cost_usd < 0
     or p_succeeded is null then
    raise exception using
      errcode = '22023',
      message = 'PUBLIC_AI_ROUTE_COMPLETION_INPUT_INVALID';
  end if;

  update private.public_ai_route_usage_receipts receipt
  set status = case when p_succeeded then 'success' else 'error' end,
      actual_cost_usd = p_actual_cost_usd,
      completed_at = pg_catalog.clock_timestamp()
  where receipt.id = p_receipt_id
    and receipt.client_key = p_client_key
    and receipt.feature = p_feature
    and receipt.status = 'reserved';

  return found;
end
$function$;

alter function rls_helpers.consume_public_ai_route_quota(
  text, text, integer, integer, integer, numeric, numeric
) owner to postgres;
alter function rls_helpers.complete_public_ai_route_quota(
  uuid, text, text, numeric, boolean
) owner to postgres;

revoke all on function rls_helpers.consume_public_ai_route_quota(
  text, text, integer, integer, integer, numeric, numeric
) from public, anon, authenticated, service_role;
revoke all on function rls_helpers.complete_public_ai_route_quota(
  uuid, text, text, numeric, boolean
) from public, anon, authenticated, service_role;

grant execute on function rls_helpers.consume_public_ai_route_quota(
  text, text, integer, integer, integer, numeric, numeric
) to service_role;
grant execute on function rls_helpers.complete_public_ai_route_quota(
  uuid, text, text, numeric, boolean
) to service_role;

create or replace function public.consume_public_ai_route_quota(
  p_client_key text,
  p_feature text,
  p_client_max integer,
  p_global_max integer,
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
language sql
security invoker
set search_path = ''
as $function$
  select *
  from rls_helpers.consume_public_ai_route_quota(
    p_client_key,
    p_feature,
    p_client_max,
    p_global_max,
    p_window_seconds,
    p_hard_budget_usd,
    p_reservation_cost_usd
  );
$function$;

create or replace function public.complete_public_ai_route_quota(
  p_receipt_id uuid,
  p_client_key text,
  p_feature text,
  p_actual_cost_usd numeric,
  p_succeeded boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select rls_helpers.complete_public_ai_route_quota(
    p_receipt_id,
    p_client_key,
    p_feature,
    p_actual_cost_usd,
    p_succeeded
  );
$function$;

alter function public.consume_public_ai_route_quota(
  text, text, integer, integer, integer, numeric, numeric
) owner to postgres;
alter function public.complete_public_ai_route_quota(
  uuid, text, text, numeric, boolean
) owner to postgres;

revoke all on function public.consume_public_ai_route_quota(
  text, text, integer, integer, integer, numeric, numeric
) from public, anon, authenticated, service_role;
revoke all on function public.complete_public_ai_route_quota(
  uuid, text, text, numeric, boolean
) from public, anon, authenticated, service_role;

grant execute on function public.consume_public_ai_route_quota(
  text, text, integer, integer, integer, numeric, numeric
) to service_role;
grant execute on function public.complete_public_ai_route_quota(
  uuid, text, text, numeric, boolean
) to service_role;

commit;
