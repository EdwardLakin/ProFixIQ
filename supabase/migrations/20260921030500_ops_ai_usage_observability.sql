begin;

alter table private.ai_usage_ledger
  add column if not exists source_product text not null default 'profixiq_app',
  add column if not exists agent_run_id text,
  add column if not exists external_request_id text,
  add column if not exists operation text;

alter table private.ai_usage_ledger
  drop constraint if exists ai_usage_ledger_source_product_chk;
alter table private.ai_usage_ledger
  add constraint ai_usage_ledger_source_product_chk
  check (source_product in ('profixiq_app', 'engineering_agent'));

create index if not exists ai_usage_ledger_source_product_month_idx
  on private.ai_usage_ledger (source_product, occurred_at desc);
create index if not exists ai_usage_ledger_agent_run_idx
  on private.ai_usage_ledger (agent_run_id, occurred_at desc)
  where agent_run_id is not null;
create index if not exists ai_usage_ledger_external_request_idx
  on private.ai_usage_ledger (external_request_id, occurred_at desc)
  where external_request_id is not null;

-- Keep the existing canonical app mutation untouched. The Engineering Agent
-- gets a dedicated additive adapter which delegates the canonical validation
-- and insert, then applies Agent-only attribution to the inserted ledger row.
create or replace function rls_helpers.record_engineering_agent_ai_usage_ledger(
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_agent_run_id text;
  v_external_request_id text;
  v_operation text;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI_USAGE_LEDGER_INPUT_INVALID';
  end if;

  v_agent_run_id := nullif(pg_catalog.btrim(p_payload ->> 'agent_run_id'), '');
  v_external_request_id := nullif(pg_catalog.btrim(p_payload ->> 'external_request_id'), '');
  v_operation := nullif(pg_catalog.btrim(p_payload ->> 'operation'), '');

  if pg_catalog.length(coalesce(v_agent_run_id, '')) > 240
     or pg_catalog.length(coalesce(v_external_request_id, '')) > 240
     or pg_catalog.length(coalesce(v_operation, '')) > 160 then
    raise exception using errcode = '22023', message = 'AI_USAGE_LEDGER_INPUT_INVALID';
  end if;

  v_id := rls_helpers.record_private_ai_usage_ledger(null, null, p_payload);

  update private.ai_usage_ledger
  set source_product = 'engineering_agent',
      agent_run_id = v_agent_run_id,
      external_request_id = v_external_request_id,
      operation = v_operation
  where id = v_id;

  return v_id;
end
$function$;

alter function rls_helpers.record_engineering_agent_ai_usage_ledger(jsonb)
  owner to postgres;
revoke all on function rls_helpers.record_engineering_agent_ai_usage_ledger(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function rls_helpers.record_engineering_agent_ai_usage_ledger(jsonb)
  to service_role;

create or replace function public.record_engineering_agent_ai_usage_ledger(
  p_payload jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select rls_helpers.record_engineering_agent_ai_usage_ledger(p_payload);
$function$;

alter function public.record_engineering_agent_ai_usage_ledger(jsonb)
  owner to postgres;
revoke all on function public.record_engineering_agent_ai_usage_ledger(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_engineering_agent_ai_usage_ledger(jsonb)
  to service_role;

create or replace function rls_helpers.get_ops_ai_usage_snapshot(
  p_since timestamptz default (pg_catalog.now() - interval '30 days'),
  p_event_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
with bounded as (
  select l.*
  from private.ai_usage_ledger l
  where l.occurred_at <= pg_catalog.now() + interval '5 minutes'
),
base as (
  select *
  from bounded
  where occurred_at >= p_since
),
summary as (
  select jsonb_build_object(
    'spendToday', coalesce(sum(estimated_cost_usd) filter (
      where occurred_at >= pg_catalog.date_trunc('day', pg_catalog.now())
    ), 0),
    'spend7d', coalesce(sum(estimated_cost_usd) filter (
      where occurred_at >= pg_catalog.now() - interval '7 days'
    ), 0),
    'spendMonth', coalesce(sum(estimated_cost_usd) filter (
      where occurred_at >= pg_catalog.date_trunc('month', pg_catalog.now())
    ), 0),
    'promptTokens', coalesce(sum(prompt_tokens) filter (where occurred_at >= p_since), 0),
    'cachedPromptTokens', coalesce(sum(cached_prompt_tokens) filter (where occurred_at >= p_since), 0),
    'completionTokens', coalesce(sum(completion_tokens) filter (where occurred_at >= p_since), 0),
    'totalTokens', coalesce(sum(total_tokens) filter (where occurred_at >= p_since), 0),
    'requests', count(*) filter (where occurred_at >= p_since),
    'avgTokensPerRequest',
      case
        when count(*) filter (where occurred_at >= p_since) = 0 then 0
        else round(
          coalesce(sum(total_tokens) filter (where occurred_at >= p_since), 0)::numeric
          / (count(*) filter (where occurred_at >= p_since)),
          2
        )
      end,
    'failures', count(*) filter (
      where occurred_at >= p_since and status = 'error'
    ),
    'rateLimited', count(*) filter (
      where occurred_at >= p_since
        and (
          error_code in ('429', 'rate_limit_exceeded', 'insufficient_quota')
          or lower(coalesce(error_message, '')) like '%429%'
          or lower(coalesce(error_message, '')) like '%no credits%'
          or lower(coalesce(error_message, '')) like '%rate limit%'
        )
    )
  ) value
  from bounded
),
product_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc), '[]'::jsonb) value
  from (
    select source_product as key,
      count(*) requests,
      coalesce(sum(total_tokens), 0) tokens,
      coalesce(sum(estimated_cost_usd), 0) cost
    from base
    group by source_product
  ) t
),
feature_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc, t.tokens desc), '[]'::jsonb) value
  from (
    select feature as key,
      endpoint,
      source_product,
      count(*) requests,
      coalesce(sum(total_tokens), 0) tokens,
      coalesce(sum(estimated_cost_usd), 0) cost
    from base
    group by feature, endpoint, source_product
    order by cost desc, tokens desc
    limit 25
  ) t
),
model_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc, t.tokens desc), '[]'::jsonb) value
  from (
    select coalesce(model, 'unknown') as key,
      count(*) requests,
      coalesce(sum(total_tokens), 0) tokens,
      coalesce(sum(estimated_cost_usd), 0) cost
    from base
    group by model
  ) t
),
shop_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc, t.tokens desc), '[]'::jsonb) value
  from (
    select coalesce(s.business_name, s.shop_name, s.name, 'Unscoped / Agent') as key,
      b.shop_id as id,
      count(*) requests,
      coalesce(sum(b.total_tokens), 0) tokens,
      coalesce(sum(b.estimated_cost_usd), 0) cost
    from base b
    left join public.shops s on s.id = b.shop_id
    group by b.shop_id, s.business_name, s.shop_name, s.name
    order by cost desc, tokens desc
    limit 25
  ) t
),
user_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc, t.tokens desc), '[]'::jsonb) value
  from (
    select coalesce(
        p.full_name,
        p.email,
        case when b.source_product = 'engineering_agent' then 'Engineering Agent' else 'System' end
      ) as key,
      b.user_id as id,
      count(*) requests,
      coalesce(sum(b.total_tokens), 0) tokens,
      coalesce(sum(b.estimated_cost_usd), 0) cost
    from base b
    left join public.profiles p on p.id = b.user_id
    group by b.user_id, p.full_name, p.email, b.source_product
    order by cost desc, tokens desc
    limit 25
  ) t
),
expensive_events as (
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.cost desc nulls last, t.total_tokens desc),
    '[]'::jsonb
  ) value
  from (
    select id, occurred_at, source_product, feature, endpoint, model, status,
      error_code, estimated_cost_usd as cost, prompt_tokens, cached_prompt_tokens,
      completion_tokens, total_tokens, agent_run_id, external_request_id, operation
    from base
    order by estimated_cost_usd desc nulls last, total_tokens desc nulls last
    limit greatest(1, least(p_event_limit, 100))
  ) t
),
trend_days as (
  select generate_series(
    pg_catalog.date_trunc('day', p_since),
    pg_catalog.date_trunc('day', pg_catalog.now()),
    interval '1 day'
  ) as bucket
),
trend_usage as (
  select pg_catalog.date_trunc('day', occurred_at) as bucket,
    count(*) requests,
    coalesce(sum(total_tokens), 0) tokens,
    coalesce(sum(estimated_cost_usd), 0) cost
  from base
  group by 1
),
trend as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.bucket), '[]'::jsonb) value
  from (
    select d.bucket,
      coalesce(u.requests, 0) requests,
      coalesce(u.tokens, 0) tokens,
      coalesce(u.cost, 0) cost
    from trend_days d
    left join trend_usage u on u.bucket = d.bucket
    order by d.bucket
  ) t
),
runaway_groups as (
  select
    coalesce(agent_run_id, external_request_id) attribution_key,
    count(*) calls,
    coalesce(sum(total_tokens), 0) tokens,
    coalesce(sum(estimated_cost_usd), 0) cost
  from base
  where source_product = 'engineering_agent'
    and coalesce(agent_run_id, external_request_id) is not null
  group by coalesce(agent_run_id, external_request_id)
),
warnings as (
  select coalesce(jsonb_agg(row_to_json(w) order by w.severity_order, w.metric desc), '[]'::jsonb) value
  from (
    select 1 severity_order,
      'critical' severity,
      'abnormal_prompt' kind,
      concat(feature, ' sent ', prompt_tokens, ' input tokens') title,
      concat(source_product, ' · ', endpoint) detail,
      prompt_tokens::numeric metric,
      id::text ref
    from base
    where prompt_tokens >= 100000

    union all

    select 1,
      'critical',
      'runaway_agent_run',
      concat('Agent run ', attribution_key, ' exceeded safe usage'),
      concat(calls, ' calls · ', tokens, ' tokens · $', round(cost, 2)),
      tokens::numeric,
      attribution_key
    from runaway_groups
    where calls >= 20 or tokens >= 1000000 or cost >= 5

    union all

    select 2,
      'warning',
      'high_request_frequency',
      concat(feature, ' request frequency is high'),
      concat(count(*), ' requests in a 10-minute window · ', source_product),
      count(*)::numeric,
      concat(
        feature,
        ':',
        pg_catalog.date_bin(
          interval '10 minutes',
          occurred_at,
          timestamptz '2000-01-01'
        )::text
      )
    from base
    where occurred_at >= pg_catalog.now() - interval '1 hour'
    group by
      feature,
      source_product,
      pg_catalog.date_bin(
        interval '10 minutes',
        occurred_at,
        timestamptz '2000-01-01'
      )
    having count(*) >= 20
  ) w
)
select jsonb_build_object(
  'generatedAt', pg_catalog.clock_timestamp(),
  'since', p_since,
  'summary', (select value from summary),
  'products', (select value from product_breakdown),
  'features', (select value from feature_breakdown),
  'models', (select value from model_breakdown),
  'shops', (select value from shop_breakdown),
  'users', (select value from user_breakdown),
  'expensiveEvents', (select value from expensive_events),
  'trend', (select value from trend),
  'warnings', (select value from warnings)
);
$function$;

alter function rls_helpers.get_ops_ai_usage_snapshot(timestamptz, integer)
  owner to postgres;
revoke all on function rls_helpers.get_ops_ai_usage_snapshot(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function rls_helpers.get_ops_ai_usage_snapshot(timestamptz, integer)
  to service_role;

create or replace function public.get_ops_ai_usage_snapshot(
  p_since timestamptz default (pg_catalog.now() - interval '30 days'),
  p_event_limit integer default 50
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select rls_helpers.get_ops_ai_usage_snapshot(p_since, p_event_limit);
$function$;

alter function public.get_ops_ai_usage_snapshot(timestamptz, integer)
  owner to postgres;
revoke all on function public.get_ops_ai_usage_snapshot(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_ops_ai_usage_snapshot(timestamptz, integer)
  to service_role;

commit;
