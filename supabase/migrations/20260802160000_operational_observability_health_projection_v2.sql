begin;

drop function if exists public.get_operational_observability_health(timestamptz);

create function public.get_operational_observability_health(
  p_now timestamptz default now()
)
returns table (
  shop_id uuid,
  recent_business_writes bigint,
  events_last_6h bigint,
  events_last_24h bigint,
  events_previous_24h bigint,
  last_event_at timestamptz,
  unresolved_failure_count bigint,
  health_status text,
  ai_active_recommendation_count bigint,
  ai_stale_recommendation_count bigint,
  ai_pending_approval_count bigint,
  ai_last_expiration_event_at timestamptz,
  ai_cron_probably_running boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recent_writes as (
    select activity.shop_id, count(*)::bigint as count
    from (
      select wo.shop_id
      from public.work_orders wo
      where wo.updated_at >= p_now - interval '24 hours'
      union all
      select wol.shop_id
      from public.work_order_lines wol
      where wol.updated_at >= p_now - interval '24 hours'
    ) activity
    group by activity.shop_id
  ),
  recent_events as (
    select
      e.shop_id,
      count(*) filter (
        where e.occurred_at >= p_now - interval '6 hours'
      )::bigint as count_6h,
      count(*) filter (
        where e.occurred_at >= p_now - interval '24 hours'
      )::bigint as count_24h,
      count(*) filter (
        where e.occurred_at >= p_now - interval '48 hours'
          and e.occurred_at < p_now - interval '24 hours'
      )::bigint as count_previous_24h
    from public.operational_events e
    where e.occurred_at >= p_now - interval '48 hours'
    group by e.shop_id
  ),
  latest_events as (
    select distinct on (e.shop_id)
      e.shop_id,
      e.occurred_at
    from public.operational_events e
    order by e.shop_id, e.occurred_at desc
  ),
  unresolved_failures as (
    select
      f.shop_id,
      count(*)::bigint as count
    from public.operational_event_failures f
    where f.resolved_at is null
      and f.shop_id is not null
    group by f.shop_id
  ),
  recommendation_health as (
    select
      r.shop_id,
      count(*) filter (
        where r.status in ('open', 'acknowledged')
      )::bigint as active_count,
      count(*) filter (
        where r.status in ('open', 'acknowledged')
          and r.expires_at is not null
          and r.expires_at <= p_now
      )::bigint as stale_count
    from public.ai_recommendations r
    group by r.shop_id
  ),
  approval_health as (
    select
      a.shop_id,
      count(*) filter (where a.status = 'pending')::bigint as pending_count
    from public.ai_action_approvals a
    group by a.shop_id
  ),
  latest_ai_expiration as (
    select distinct on (e.shop_id)
      e.shop_id,
      e.created_at
    from public.ai_action_events e
    where e.event_type in (
      'recommendation.expired',
      'action_preview.expired',
      'action_approval.expired'
    )
    order by e.shop_id, e.created_at desc
  ),
  health as (
    select
      s.id as shop_id,
      coalesce(w.count, 0)::bigint as recent_business_writes,
      coalesce(re.count_6h, 0)::bigint as events_last_6h,
      coalesce(re.count_24h, 0)::bigint as events_last_24h,
      coalesce(re.count_previous_24h, 0)::bigint as events_previous_24h,
      le.occurred_at as last_event_at,
      coalesce(f.count, 0)::bigint as unresolved_failure_count,
      coalesce(rh.active_count, 0)::bigint as ai_active_recommendation_count,
      coalesce(rh.stale_count, 0)::bigint as ai_stale_recommendation_count,
      coalesce(ah.pending_count, 0)::bigint as ai_pending_approval_count,
      ae.created_at as ai_last_expiration_event_at
    from public.shops s
    left join recent_writes w on w.shop_id = s.id
    left join recent_events re on re.shop_id = s.id
    left join latest_events le on le.shop_id = s.id
    left join unresolved_failures f on f.shop_id = s.id
    left join recommendation_health rh on rh.shop_id = s.id
    left join approval_health ah on ah.shop_id = s.id
    left join latest_ai_expiration ae on ae.shop_id = s.id
  )
  select
    h.shop_id,
    h.recent_business_writes,
    h.events_last_6h,
    h.events_last_24h,
    h.events_previous_24h,
    h.last_event_at,
    h.unresolved_failure_count,
    case
      when h.unresolved_failure_count > 0 then 'needs_attention'
      when h.recent_business_writes > 0
        and (h.last_event_at is null or h.events_last_6h = 0)
        then 'stalled'
      when h.recent_business_writes > 0
        and h.events_previous_24h >= 20
        and h.events_last_24h <= floor(h.events_previous_24h * 0.25)
        then 'volume_drop'
      when h.recent_business_writes = 0 and h.last_event_at is null
        then 'idle'
      else 'healthy'
    end as health_status,
    h.ai_active_recommendation_count,
    h.ai_stale_recommendation_count,
    h.ai_pending_approval_count,
    h.ai_last_expiration_event_at,
    case
      when h.ai_last_expiration_event_at is not null
        then h.ai_last_expiration_event_at >= p_now - interval '36 hours'
      when h.ai_stale_recommendation_count > 0
        or h.ai_pending_approval_count > 0
        then false
      else null
    end as ai_cron_probably_running
  from health h;
$$;

revoke all on function public.get_operational_observability_health(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_operational_observability_health(timestamptz)
  to service_role;

comment on function public.get_operational_observability_health(timestamptz) is
  'Service-role-only combined operational and AI health projection for scheduled observability monitoring.';

commit;
