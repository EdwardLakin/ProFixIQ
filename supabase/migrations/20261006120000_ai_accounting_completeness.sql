-- PR 1 (AI cost accounting): read-only accounting completeness report.
--
-- Isolated addition. Adds two new functions only; no existing table, trigger,
-- policy, grant, constraint or function is changed. The existing
-- get_ops_ai_usage_snapshot keeps summing priced rows (null cost -> 0); this
-- report is what makes the rows that sum leaves out visible.
--
-- Row classes (mutually exclusive, over private.ai_usage_ledger):
--   priced          estimated_cost_usd is present.
--   unpriced_model  usage was captured but no rate exists for the model/modality.
--   usage_missing   the provider call was recorded but no billable usage was
--                   (timeouts, aborted streams, errors after billable work).
-- unattributed is orthogonal: profixiq_app rows with no shop.
begin;

create or replace function rls_helpers.get_ops_ai_accounting_completeness(
  p_since timestamptz default (pg_catalog.now() - interval '30 days')
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
with base as (
  select
    l.*,
    case
      when l.estimated_cost_usd is not null then 'priced'
      when l.prompt_tokens is null
        and l.completion_tokens is null
        and l.total_tokens is null
        and l.duration_seconds is null
        and l.speech_characters is null then 'usage_missing'
      else 'unpriced_model'
    end as accounting_class
  from private.ai_usage_ledger l
  where l.occurred_at >= p_since
    and l.occurred_at <= pg_catalog.now() + interval '5 minutes'
),
summary as (
  select pg_catalog.jsonb_build_object(
    'events', pg_catalog.count(*),
    'pricedEvents', pg_catalog.count(*) filter (where accounting_class = 'priced'),
    'unpricedModelEvents', pg_catalog.count(*) filter (where accounting_class = 'unpriced_model'),
    'usageMissingEvents', pg_catalog.count(*) filter (where accounting_class = 'usage_missing'),
    'unattributedEvents', pg_catalog.count(*) filter (
      where shop_id is null and source_product = 'profixiq_app'
    ),
    'pricedSpend', coalesce(pg_catalog.sum(estimated_cost_usd), 0),
    'unpricedTokens', coalesce(pg_catalog.sum(coalesce(total_tokens, 0)) filter (
      where accounting_class = 'unpriced_model'
    ), 0),
    'completenessPct', case
      when pg_catalog.count(*) = 0 then 100
      else pg_catalog.round(
        100.0 * pg_catalog.count(*) filter (where accounting_class = 'priced')
        / pg_catalog.count(*), 2
      )
    end
  ) as value
  from base
),
exposure as (
  select
    coalesce(model, 'unknown') as model,
    feature,
    accounting_class,
    pg_catalog.count(*) as events,
    coalesce(pg_catalog.sum(coalesce(total_tokens, 0)), 0) as tokens,
    pg_catalog.max(occurred_at) as last_seen
  from base
  where accounting_class <> 'priced'
  group by 1, 2, 3
)
select pg_catalog.jsonb_build_object(
  'generatedAt', pg_catalog.now(),
  'since', p_since,
  'summary', (select value from summary),
  'exposure', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'model', model,
        'feature', feature,
        'class', accounting_class,
        'events', events,
        'tokens', tokens,
        'lastSeen', last_seen
      )
      order by events desc, last_seen desc
    )
    from (select * from exposure order by events desc, last_seen desc limit 50) top
  ), '[]'::jsonb)
);
$function$;

alter function rls_helpers.get_ops_ai_accounting_completeness(timestamptz)
  owner to postgres;
revoke all on function rls_helpers.get_ops_ai_accounting_completeness(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function rls_helpers.get_ops_ai_accounting_completeness(timestamptz)
  to service_role;

create or replace function public.get_ops_ai_accounting_completeness(
  p_since timestamptz default (pg_catalog.now() - interval '30 days')
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select rls_helpers.get_ops_ai_accounting_completeness(p_since);
$function$;

alter function public.get_ops_ai_accounting_completeness(timestamptz)
  owner to postgres;
revoke all on function public.get_ops_ai_accounting_completeness(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.get_ops_ai_accounting_completeness(timestamptz)
  to service_role;

commit;
