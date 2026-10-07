begin;

-- Read the Ops acquisition funnel through one task-owned statement so exact
-- summary counts and the bounded detail rows share the same MVCC snapshot.
-- This intentionally leaves all existing marketing_events table privileges
-- unchanged.
create or replace function public.get_ops_marketing_funnel_snapshot(
  p_since timestamptz,
  p_breakdown_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with base as materialized (
    select
      me.id,
      me.event_name,
      me.source_path,
      me.package_key,
      me.checkout_mode,
      me.checkout_attempt_id,
      me.created_at
    from public.marketing_events as me
    where me.created_at >= p_since
  ),
  summary as (
    select
      count(*)::bigint as total_events,
      count(*) filter (where event_name = 'pricing_view')::bigint as pricing_views,
      count(*) filter (
        where event_name = 'marketing_trial_click'
          and checkout_attempt_id is not null
      )::bigint as trial_clicks,
      count(*) filter (
        where event_name = 'marketing_subscribe_click'
          and checkout_attempt_id is not null
      )::bigint as subscribe_clicks,
      count(*) filter (where event_name = 'marketing_demo_click')::bigint as demo_clicks,
      count(*) filter (where event_name = 'checkout_started')::bigint as checkout_started,
      count(*) filter (
        where event_name = 'checkout_started'
          and checkout_mode = 'trial'
      )::bigint as trial_checkouts,
      count(*) filter (
        where event_name = 'checkout_started'
          and checkout_mode = 'paid'
      )::bigint as paid_checkouts
    from base
  ),
  bounded as (
    select
      id,
      event_name,
      source_path,
      package_key,
      checkout_mode,
      checkout_attempt_id,
      created_at
    from base
    order by created_at desc, id desc
    limit least(greatest(coalesce(p_breakdown_limit, 20000), 0), 20000)
  ),
  row_payload as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'event_name', event_name,
            'source_path', source_path,
            'package_key', package_key,
            'checkout_mode', checkout_mode,
            'checkout_attempt_id', checkout_attempt_id,
            'created_at', created_at
          )
          order by created_at desc, id desc
        ),
        '[]'::jsonb
      ) as rows,
      count(*)::bigint as row_count
    from bounded
  )
  select jsonb_build_object(
    'generatedAt', pg_catalog.transaction_timestamp(),
    'since', p_since,
    'breakdownTruncated', s.total_events > r.row_count,
    'summary', jsonb_build_object(
      'totalEvents', s.total_events,
      'pricingViews', s.pricing_views,
      'trialClicks', s.trial_clicks,
      'subscribeClicks', s.subscribe_clicks,
      'demoClicks', s.demo_clicks,
      'checkoutStarted', s.checkout_started,
      'trialCheckouts', s.trial_checkouts,
      'paidCheckouts', s.paid_checkouts
    ),
    'rows', r.rows
  )
  from summary as s
  cross join row_payload as r;
$function$;

alter function public.get_ops_marketing_funnel_snapshot(timestamptz, integer)
  owner to postgres;
revoke all on function public.get_ops_marketing_funnel_snapshot(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_ops_marketing_funnel_snapshot(timestamptz, integer)
  to service_role;

commit;
