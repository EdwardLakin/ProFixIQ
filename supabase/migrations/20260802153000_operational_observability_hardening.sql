begin;

-- Keep failure durability independent from assistant-notification health. A notification
-- constraint or availability problem must never roll back the failure record itself.
create or replace function private.resolve_operational_event_failure(
  p_shop_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_source_table text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint text;
begin
  if p_shop_id is null then
    return;
  end if;

  v_fingerprint := md5(concat_ws(
    '|',
    p_shop_id::text,
    coalesce(p_event_type, ''),
    coalesce(p_entity_type, ''),
    coalesce(p_entity_id::text, ''),
    coalesce(p_source_table, '')
  ));

  update public.operational_event_failures
  set resolved_at = now(),
      updated_at = now()
  where shop_id = p_shop_id
    and fingerprint = v_fingerprint
    and resolved_at is null;

  begin
    if not exists (
      select 1
      from public.operational_event_failures f
      where f.shop_id = p_shop_id
        and f.resolved_at is null
    ) then
      update public.assistant_notifications
      set status = 'resolved',
          resolved_at = now(),
          updated_at = now()
      where shop_id = p_shop_id
        and code = 'operational_event_write_failure'
        and status <> 'resolved';
    end if;
  exception
    when others then
      null;
  end;
end;
$$;

create or replace function private.record_operational_event_failure(
  p_shop_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_source_table text,
  p_sqlstate text,
  p_error_message text,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint text;
  v_failure_count integer;
begin
  v_fingerprint := md5(concat_ws(
    '|',
    coalesce(p_shop_id::text, ''),
    coalesce(p_event_type, ''),
    coalesce(p_entity_type, ''),
    coalesce(p_entity_id::text, ''),
    coalesce(p_source_table, '')
  ));

  insert into public.operational_event_failures (
    shop_id,
    fingerprint,
    event_type,
    entity_type,
    entity_id,
    source_table,
    sqlstate,
    error_message,
    context
  )
  values (
    p_shop_id,
    v_fingerprint,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_source_table,
    p_sqlstate,
    left(coalesce(p_error_message, 'Unknown operational event failure'), 1000),
    coalesce(p_context, '{}'::jsonb)
  )
  on conflict (shop_id, fingerprint)
  do update
  set sqlstate = excluded.sqlstate,
      error_message = excluded.error_message,
      context = excluded.context,
      attempt_count = public.operational_event_failures.attempt_count + 1,
      last_seen_at = now(),
      resolved_at = null,
      updated_at = now();

  if p_shop_id is null then
    return;
  end if;

  select count(*)::integer
    into v_failure_count
  from public.operational_event_failures f
  where f.shop_id = p_shop_id
    and f.resolved_at is null;

  begin
    insert into public.assistant_notifications (
      shop_id,
      user_id,
      role,
      source,
      fingerprint,
      code,
      level,
      title,
      message,
      href,
      entity_type,
      entity_id,
      status,
      metadata,
      first_seen_at,
      last_seen_at,
      resolved_at,
      created_at,
      updated_at
    )
    values (
      p_shop_id,
      null,
      'owner',
      'observability',
      'observability::operational_event_write_failure',
      'operational_event_write_failure',
      'critical',
      'Operational event logging needs attention',
      format(
        'ProFixIQ preserved the business action, but %s operational event failure%s require review.',
        v_failure_count,
        case when v_failure_count = 1 then '' else 's' end
      ),
      '/dashboard/operations/observability',
      coalesce(nullif(p_entity_type, ''), 'shop'),
      coalesce(p_entity_id, p_shop_id),
      'active',
      jsonb_build_object(
        'failure_count', v_failure_count,
        'event_type', p_event_type,
        'source_table', p_source_table,
        'sqlstate', p_sqlstate
      ),
      now(),
      now(),
      null,
      now(),
      now()
    )
    on conflict (shop_id, fingerprint)
    do update
    set level = excluded.level,
        title = excluded.title,
        message = excluded.message,
        href = excluded.href,
        entity_type = excluded.entity_type,
        entity_id = excluded.entity_id,
        status = case
          when public.assistant_notifications.status = 'acknowledged'
            then 'acknowledged'
          else 'active'
        end,
        metadata = excluded.metadata,
        last_seen_at = now(),
        resolved_at = null,
        updated_at = now();
  exception
    when others then
      null;
  end;
end;
$$;

-- Service-role-only read model used by the scheduled health monitor. It performs
-- no mutation and runs with the caller's privileges.
create or replace function public.get_operational_observability_health(
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
  health_status text
)
language sql
security invoker
set search_path = ''
as $$
  with business_writes as (
    select writes.shop_id, count(*)::bigint as recent_business_writes
    from (
      select wo.shop_id
      from public.work_orders wo
      where wo.updated_at >= p_now - interval '6 hours'

      union all

      select wol.shop_id
      from public.work_order_lines wol
      where wol.updated_at >= p_now - interval '6 hours'
    ) writes
    where writes.shop_id is not null
    group by writes.shop_id
  ),
  event_stats as (
    select
      e.shop_id,
      max(e.occurred_at) as last_event_at,
      count(*) filter (
        where e.occurred_at >= p_now - interval '6 hours'
      )::bigint as events_last_6h,
      count(*) filter (
        where e.occurred_at >= p_now - interval '24 hours'
      )::bigint as events_last_24h,
      count(*) filter (
        where e.occurred_at >= p_now - interval '48 hours'
          and e.occurred_at < p_now - interval '24 hours'
      )::bigint as events_previous_24h
    from public.operational_events e
    where e.occurred_at >= p_now - interval '48 hours'
    group by e.shop_id
  ),
  failure_stats as (
    select
      f.shop_id,
      count(*)::bigint as unresolved_failure_count
    from public.operational_event_failures f
    where f.shop_id is not null
      and f.resolved_at is null
    group by f.shop_id
  )
  select
    s.id as shop_id,
    coalesce(bw.recent_business_writes, 0)::bigint,
    coalesce(es.events_last_6h, 0)::bigint,
    coalesce(es.events_last_24h, 0)::bigint,
    coalesce(es.events_previous_24h, 0)::bigint,
    es.last_event_at,
    coalesce(fs.unresolved_failure_count, 0)::bigint,
    case
      when coalesce(fs.unresolved_failure_count, 0) > 0 then 'needs_attention'
      when coalesce(bw.recent_business_writes, 0) > 0
        and (
          coalesce(es.events_last_6h, 0) = 0
          or es.last_event_at is null
          or es.last_event_at < p_now - interval '6 hours'
        )
        then 'stalled'
      when coalesce(es.events_previous_24h, 0) >= 20
        and coalesce(es.events_last_24h, 0) <= greatest(
          2::bigint,
          floor(coalesce(es.events_previous_24h, 0)::numeric * 0.20)::bigint
        )
        then 'volume_drop'
      when coalesce(bw.recent_business_writes, 0) = 0
        and coalesce(es.events_last_24h, 0) = 0
        then 'idle'
      else 'healthy'
    end as health_status
  from public.shops s
  left join business_writes bw on bw.shop_id = s.id
  left join event_stats es on es.shop_id = s.id
  left join failure_stats fs on fs.shop_id = s.id;
$$;

revoke all on function public.get_operational_observability_health(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_operational_observability_health(timestamptz)
  to service_role;

comment on function public.get_operational_observability_health(timestamptz) is
  'Service-role-only, read-only health projection for scheduled operational event monitoring.';

commit;