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

create or replace function rls_helpers.record_private_ai_usage_ledger(
  p_shop_id uuid,
  p_user_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_profile_id uuid;
  v_profile_user_id uuid;
  v_event_key text;
  v_feature text;
  v_endpoint text;
  v_provider text;
  v_model text;
  v_modality text;
  v_rate_card_version text;
  v_prompt_tokens integer;
  v_cached_prompt_tokens integer;
  v_completion_tokens integer;
  v_total_tokens integer;
  v_audio_input_tokens integer;
  v_audio_output_tokens integer;
  v_speech_characters integer;
  v_duration_seconds numeric;
  v_estimated_cost_usd numeric;
  v_latency_ms integer;
  v_status text;
  v_error_code text;
  v_error_message text;
  v_provider_request_id text;
  v_quota_receipt_id uuid;
  v_occurred_at timestamptz;
  v_source_product text;
  v_agent_run_id text;
  v_external_request_id text;
  v_operation text;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI_USAGE_LEDGER_INPUT_INVALID';
  end if;

  v_event_key := nullif(pg_catalog.btrim(p_payload ->> 'event_key'), '');
  v_feature := nullif(pg_catalog.btrim(p_payload ->> 'feature'), '');
  v_endpoint := nullif(pg_catalog.btrim(p_payload ->> 'endpoint'), '');
  v_provider := coalesce(nullif(pg_catalog.btrim(p_payload ->> 'provider'), ''), 'openai');
  v_model := nullif(pg_catalog.btrim(p_payload ->> 'model'), '');
  v_modality := coalesce(nullif(pg_catalog.btrim(p_payload ->> 'modality'), ''), 'text');
  v_rate_card_version := nullif(pg_catalog.btrim(p_payload ->> 'rate_card_version'), '');
  v_prompt_tokens := nullif(p_payload ->> 'prompt_tokens', '')::integer;
  v_cached_prompt_tokens := nullif(p_payload ->> 'cached_prompt_tokens', '')::integer;
  v_completion_tokens := nullif(p_payload ->> 'completion_tokens', '')::integer;
  v_total_tokens := nullif(p_payload ->> 'total_tokens', '')::integer;
  v_audio_input_tokens := nullif(p_payload ->> 'audio_input_tokens', '')::integer;
  v_audio_output_tokens := nullif(p_payload ->> 'audio_output_tokens', '')::integer;
  v_speech_characters := nullif(p_payload ->> 'speech_characters', '')::integer;
  v_duration_seconds := nullif(p_payload ->> 'duration_seconds', '')::numeric;
  v_estimated_cost_usd := nullif(p_payload ->> 'estimated_cost_usd', '')::numeric;
  v_latency_ms := coalesce(nullif(p_payload ->> 'latency_ms', '')::integer, 0);
  v_status := nullif(pg_catalog.btrim(p_payload ->> 'status'), '');
  v_error_code := nullif(pg_catalog.btrim(p_payload ->> 'error_code'), '');
  v_error_message := nullif(pg_catalog.btrim(p_payload ->> 'error_message'), '');
  v_provider_request_id := nullif(pg_catalog.btrim(p_payload ->> 'provider_request_id'), '');
  v_quota_receipt_id := nullif(p_payload ->> 'quota_receipt_id', '')::uuid;
  v_occurred_at := coalesce(nullif(p_payload ->> 'occurred_at', '')::timestamptz, pg_catalog.clock_timestamp());
  v_source_product := coalesce(nullif(pg_catalog.btrim(p_payload ->> 'source_product'), ''), 'profixiq_app');
  v_agent_run_id := nullif(pg_catalog.btrim(p_payload ->> 'agent_run_id'), '');
  v_external_request_id := nullif(pg_catalog.btrim(p_payload ->> 'external_request_id'), '');
  v_operation := nullif(pg_catalog.btrim(p_payload ->> 'operation'), '');

  if v_event_key is null
     or pg_catalog.length(v_event_key) > 240
     or v_feature is null
     or pg_catalog.length(v_feature) > 120
     or v_endpoint is null
     or pg_catalog.length(v_endpoint) > 240
     or v_provider <> 'openai'
     or v_rate_card_version is null
     or pg_catalog.length(v_rate_card_version) > 80
     or v_modality not in ('text', 'realtime', 'speech', 'image', 'other')
     or v_status not in ('success', 'error')
     or v_source_product not in ('profixiq_app', 'engineering_agent')
     or v_latency_ms < 0
     or coalesce(v_prompt_tokens, 0) < 0
     or coalesce(v_cached_prompt_tokens, 0) < 0
     or coalesce(v_completion_tokens, 0) < 0
     or coalesce(v_total_tokens, 0) < 0
     or coalesce(v_audio_input_tokens, 0) < 0
     or coalesce(v_audio_output_tokens, 0) < 0
     or coalesce(v_speech_characters, 0) < 0
     or coalesce(v_duration_seconds, 0) < 0
     or coalesce(v_estimated_cost_usd, 0) < 0 then
    raise exception using errcode = '22023', message = 'AI_USAGE_LEDGER_INPUT_INVALID';
  end if;

  if p_shop_id is not null and not exists (select 1 from public.shops s where s.id = p_shop_id) then
    raise exception using errcode = '42501', message = 'AI_USAGE_LEDGER_SHOP_SCOPE_INVALID';
  end if;

  if p_user_id is not null then
    select profile.id, profile.user_id into v_profile_id, v_profile_user_id
    from public.profiles profile
    where profile.id = p_user_id or profile.user_id = p_user_id
    order by case when profile.id = p_user_id then 0 else 1 end
    limit 1;

    if v_profile_id is null then
      raise exception using errcode = '42501', message = 'AI_USAGE_LEDGER_USER_SCOPE_INVALID';
    end if;

    if p_shop_id is not null
       and not exists (
         select 1 from public.profiles profile
         where profile.id = v_profile_id and profile.shop_id = p_shop_id
       )
       and not exists (
         select 1
         from public.fleet_members member
         join public.fleets fleet on fleet.id = member.fleet_id and fleet.shop_id = p_shop_id
         where member.shop_id = p_shop_id
           and member.user_id in (v_profile_id, v_profile_user_id, p_user_id)
       ) then
      raise exception using errcode = '42501', message = 'AI_USAGE_LEDGER_USER_SCOPE_INVALID';
    end if;
  end if;

  insert into private.ai_usage_ledger (
    event_key, shop_id, user_id, feature, endpoint, provider, model, modality,
    rate_card_version, prompt_tokens, cached_prompt_tokens, completion_tokens,
    total_tokens, audio_input_tokens, audio_output_tokens, speech_characters,
    duration_seconds, estimated_cost_usd, latency_ms, status, error_code,
    error_message, provider_request_id, quota_receipt_id, occurred_at,
    source_product, agent_run_id, external_request_id, operation
  ) values (
    v_event_key, p_shop_id, v_profile_id, v_feature, v_endpoint, v_provider,
    v_model, v_modality, v_rate_card_version, v_prompt_tokens,
    v_cached_prompt_tokens, v_completion_tokens, v_total_tokens,
    v_audio_input_tokens, v_audio_output_tokens, v_speech_characters,
    v_duration_seconds, v_estimated_cost_usd, v_latency_ms, v_status,
    v_error_code, pg_catalog.left(v_error_message, 500), v_provider_request_id,
    v_quota_receipt_id, v_occurred_at, v_source_product, v_agent_run_id,
    v_external_request_id, v_operation
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select ledger.id into v_id
    from private.ai_usage_ledger ledger
    where ledger.event_key = v_event_key
       or (
         v_provider_request_id is not null
         and ledger.provider = v_provider
         and ledger.provider_request_id = v_provider_request_id
         and ledger.feature = v_feature
       )
    order by ledger.created_at asc
    limit 1;
  end if;

  return v_id;
end
$function$;

create or replace function rls_helpers.get_ops_ai_usage_snapshot(
  p_since timestamptz default (pg_catalog.now() - interval '30 days'),
  p_event_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
with base as (
  select l.*
  from private.ai_usage_ledger l
  where l.occurred_at >= p_since
),
summary as (
  select jsonb_build_object(
    'spendToday', coalesce(sum(estimated_cost_usd) filter (where occurred_at >= pg_catalog.date_trunc('day', pg_catalog.now())), 0),
    'spend7d', coalesce(sum(estimated_cost_usd) filter (where occurred_at >= pg_catalog.now() - interval '7 days'), 0),
    'spendMonth', coalesce(sum(estimated_cost_usd) filter (where occurred_at >= pg_catalog.date_trunc('month', pg_catalog.now())), 0),
    'promptTokens', coalesce(sum(prompt_tokens), 0),
    'cachedPromptTokens', coalesce(sum(cached_prompt_tokens), 0),
    'completionTokens', coalesce(sum(completion_tokens), 0),
    'totalTokens', coalesce(sum(total_tokens), 0),
    'requests', count(*),
    'avgTokensPerRequest', case when count(*) = 0 then 0 else round(coalesce(sum(total_tokens), 0)::numeric / count(*), 2) end,
    'failures', count(*) filter (where status = 'error'),
    'rateLimited', count(*) filter (
      where error_code in ('429', 'rate_limit_exceeded', 'insufficient_quota')
         or lower(coalesce(error_message, '')) like '%429%'
         or lower(coalesce(error_message, '')) like '%no credits%'
         or lower(coalesce(error_message, '')) like '%rate limit%'
    )
  ) value
  from base
),
product_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc), '[]'::jsonb) value
  from (
    select source_product as key, count(*) requests,
      coalesce(sum(total_tokens),0) tokens,
      coalesce(sum(estimated_cost_usd),0) cost
    from base group by source_product
  ) t
),
feature_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc, t.tokens desc), '[]'::jsonb) value
  from (
    select feature as key, endpoint, source_product, count(*) requests,
      coalesce(sum(total_tokens),0) tokens,
      coalesce(sum(estimated_cost_usd),0) cost
    from base group by feature, endpoint, source_product
    order by cost desc, tokens desc limit 25
  ) t
),
model_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc, t.tokens desc), '[]'::jsonb) value
  from (
    select coalesce(model,'unknown') as key, count(*) requests,
      coalesce(sum(total_tokens),0) tokens,
      coalesce(sum(estimated_cost_usd),0) cost
    from base group by model
  ) t
),
shop_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc, t.tokens desc), '[]'::jsonb) value
  from (
    select coalesce(s.business_name, s.shop_name, s.name, 'Unscoped / Agent') as key,
      b.shop_id as id, count(*) requests, coalesce(sum(b.total_tokens),0) tokens,
      coalesce(sum(b.estimated_cost_usd),0) cost
    from base b left join public.shops s on s.id = b.shop_id
    group by b.shop_id, s.business_name, s.shop_name, s.name
    order by cost desc, tokens desc limit 25
  ) t
),
user_breakdown as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc, t.tokens desc), '[]'::jsonb) value
  from (
    select coalesce(p.full_name, p.email, case when b.source_product='engineering_agent' then 'Engineering Agent' else 'System' end) as key,
      b.user_id as id, count(*) requests, coalesce(sum(b.total_tokens),0) tokens,
      coalesce(sum(b.estimated_cost_usd),0) cost
    from base b left join public.profiles p on p.id = b.user_id
    group by b.user_id, p.full_name, p.email, b.source_product
    order by cost desc, tokens desc limit 25
  ) t
),
expensive_events as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc nulls last, t.total_tokens desc), '[]'::jsonb) value
  from (
    select id, occurred_at, source_product, feature, endpoint, model, status,
      error_code, estimated_cost_usd as cost, prompt_tokens, cached_prompt_tokens,
      completion_tokens, total_tokens, agent_run_id, external_request_id, operation
    from base
    order by estimated_cost_usd desc nulls last, total_tokens desc nulls last
    limit greatest(1, least(p_event_limit, 100))
  ) t
),
trend as (
  select coalesce(jsonb_agg(row_to_json(t) order by t.bucket), '[]'::jsonb) value
  from (
    select pg_catalog.date_trunc('day', occurred_at) as bucket,
      count(*) requests, coalesce(sum(total_tokens),0) tokens,
      coalesce(sum(estimated_cost_usd),0) cost
    from base group by 1 order by 1
  ) t
),
warnings as (
  select coalesce(jsonb_agg(row_to_json(w) order by w.severity_order, w.metric desc), '[]'::jsonb) value
  from (
    select 1 severity_order, 'critical' severity, 'abnormal_prompt' kind,
      concat(feature, ' sent ', prompt_tokens, ' input tokens') title,
      concat(source_product, ' · ', endpoint) detail,
      prompt_tokens::numeric metric, id::text ref
    from base where prompt_tokens >= 100000
    union all
    select 1, 'critical', 'runaway_agent_run',
      concat('Agent run ', coalesce(agent_run_id, 'unknown'), ' exceeded safe usage'),
      concat(count(*), ' calls · ', coalesce(sum(total_tokens),0), ' tokens · $', round(coalesce(sum(estimated_cost_usd),0),2)),
      coalesce(sum(total_tokens),0)::numeric, coalesce(agent_run_id, external_request_id, 'unattributed')
    from base
    where source_product='engineering_agent'
    group by agent_run_id, external_request_id
    having count(*) >= 20 or coalesce(sum(total_tokens),0) >= 1000000 or coalesce(sum(estimated_cost_usd),0) >= 5
    union all
    select 2, 'warning', 'high_request_frequency',
      concat(feature, ' request frequency is high'),
      concat(count(*), ' requests in a 10-minute window · ', source_product),
      count(*)::numeric, concat(feature, ':', pg_catalog.date_trunc('hour', occurred_at)::text)
    from base
    where occurred_at >= pg_catalog.now() - interval '1 hour'
    group by feature, source_product, pg_catalog.date_bin(interval '10 minutes', occurred_at, timestamptz '2000-01-01')
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

alter function rls_helpers.get_ops_ai_usage_snapshot(timestamptz, integer) owner to postgres;
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

alter function public.get_ops_ai_usage_snapshot(timestamptz, integer) owner to postgres;
revoke all on function public.get_ops_ai_usage_snapshot(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_ops_ai_usage_snapshot(timestamptz, integer)
  to service_role;

commit;
