begin;

-- These records are security and audit boundaries. Hold writes while the
-- deployment verifies inherited data and installs the new invariants.
lock table public.ai_evidence_snapshots in share row exclusive mode;
lock table public.ai_recommendations in share row exclusive mode;
lock table public.ai_action_previews in share row exclusive mode;
lock table public.ai_action_approvals in share row exclusive mode;
lock table public.ai_action_events in share row exclusive mode;

do $preflight$
declare
  v_mismatch_count bigint;
  v_duplicate_count bigint;
begin
  select count(*)
    into v_mismatch_count
  from (
    select r.id
    from public.ai_recommendations r
    join public.ai_evidence_snapshots e on e.id = r.evidence_snapshot_id
    where r.evidence_snapshot_id is not null
      and r.shop_id <> e.shop_id

    union all

    select r.id
    from public.ai_recommendations r
    cross join lateral unnest(r.evidence_snapshot_ids) evidence_id
    left join public.ai_evidence_snapshots e on e.id = evidence_id
    where e.id is null
       or r.shop_id <> e.shop_id

    union all

    select p.id
    from public.ai_action_previews p
    join public.ai_recommendations r on r.id = p.recommendation_id
    where p.recommendation_id is not null
      and p.shop_id <> r.shop_id

    union all

    select p.id
    from public.ai_action_previews p
    join public.ai_evidence_snapshots e on e.id = p.evidence_snapshot_id
    where p.evidence_snapshot_id is not null
      and p.shop_id <> e.shop_id

    union all

    select a.id
    from public.ai_action_approvals a
    join public.ai_action_previews p on p.id = a.action_preview_id
    where a.shop_id <> p.shop_id

    union all

    select e.id
    from public.ai_action_events e
    join public.ai_recommendations r on r.id = e.recommendation_id
    where e.recommendation_id is not null
      and e.shop_id <> r.shop_id

    union all

    select e.id
    from public.ai_action_events e
    join public.ai_action_previews p on p.id = e.action_preview_id
    where e.action_preview_id is not null
      and e.shop_id <> p.shop_id

    union all

    select e.id
    from public.ai_action_events e
    join public.ai_action_approvals a on a.id = e.approval_id
    where e.approval_id is not null
      and e.shop_id <> a.shop_id
  ) mismatches;

  if v_mismatch_count > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'AI tenant-link hardening found %s cross-shop relationship(s); repair them before applying this migration',
        v_mismatch_count
      );
  end if;

  select count(*)
    into v_duplicate_count
  from (
    select action_preview_id
    from public.ai_action_approvals
    where status = 'pending'
    group by action_preview_id
    having count(*) > 1
  ) duplicate_pending;

  if v_duplicate_count > 0 then
    raise exception using
      errcode = '23505',
      message = format(
        'AI approval hardening found %s preview(s) with duplicate pending approvals; reconcile them before applying this migration',
        v_duplicate_count
      );
  end if;
end;
$preflight$;

create or replace function private.enforce_ai_record_tenant_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_shop_id uuid := nullif(v_row ->> 'shop_id', '')::uuid;
  v_reference_id uuid;
  v_reference_ids uuid[];
begin
  if tg_table_name = 'ai_recommendations' then
    v_reference_id := nullif(v_row ->> 'evidence_snapshot_id', '')::uuid;
    if v_reference_id is not null and not exists (
      select 1
      from public.ai_evidence_snapshots e
      where e.id = v_reference_id
        and e.shop_id = v_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'AI recommendation evidence must belong to the same shop';
    end if;

    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_reference_ids
    from jsonb_array_elements_text(coalesce(v_row -> 'evidence_snapshot_ids', '[]'::jsonb));

    if exists (
      select 1
      from unnest(v_reference_ids) evidence_id
      where not exists (
        select 1
        from public.ai_evidence_snapshots e
        where e.id = evidence_id
          and e.shop_id = v_shop_id
      )
    ) then
      raise exception using
        errcode = '23503',
        message = 'All AI recommendation evidence snapshots must belong to the same shop';
    end if;
  elsif tg_table_name = 'ai_action_previews' then
    v_reference_id := nullif(v_row ->> 'recommendation_id', '')::uuid;
    if v_reference_id is not null and not exists (
      select 1
      from public.ai_recommendations r
      where r.id = v_reference_id
        and r.shop_id = v_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'AI action preview recommendation must belong to the same shop';
    end if;

    v_reference_id := nullif(v_row ->> 'evidence_snapshot_id', '')::uuid;
    if v_reference_id is not null and not exists (
      select 1
      from public.ai_evidence_snapshots e
      where e.id = v_reference_id
        and e.shop_id = v_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'AI action preview evidence must belong to the same shop';
    end if;
  elsif tg_table_name = 'ai_action_approvals' then
    v_reference_id := nullif(v_row ->> 'action_preview_id', '')::uuid;
    if v_reference_id is not null and not exists (
      select 1
      from public.ai_action_previews p
      where p.id = v_reference_id
        and p.shop_id = v_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'AI action approval preview must belong to the same shop';
    end if;
  elsif tg_table_name = 'ai_action_events' then
    v_reference_id := nullif(v_row ->> 'recommendation_id', '')::uuid;
    if v_reference_id is not null and not exists (
      select 1
      from public.ai_recommendations r
      where r.id = v_reference_id
        and r.shop_id = v_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'AI action event recommendation must belong to the same shop';
    end if;

    v_reference_id := nullif(v_row ->> 'action_preview_id', '')::uuid;
    if v_reference_id is not null and not exists (
      select 1
      from public.ai_action_previews p
      where p.id = v_reference_id
        and p.shop_id = v_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'AI action event preview must belong to the same shop';
    end if;

    v_reference_id := nullif(v_row ->> 'approval_id', '')::uuid;
    if v_reference_id is not null and not exists (
      select 1
      from public.ai_action_approvals a
      where a.id = v_reference_id
        and a.shop_id = v_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'AI action event approval must belong to the same shop';
    end if;
  else
    raise exception 'Unsupported AI tenant-link trigger table: %', tg_table_name;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_ai_record_tenant_links()
  from public, anon, authenticated;

drop trigger if exists trg_ai_recommendations_tenant_links on public.ai_recommendations;
create trigger trg_ai_recommendations_tenant_links
before insert or update of shop_id, evidence_snapshot_id, evidence_snapshot_ids on public.ai_recommendations
for each row execute function private.enforce_ai_record_tenant_links();

drop trigger if exists trg_ai_action_previews_tenant_links on public.ai_action_previews;
create trigger trg_ai_action_previews_tenant_links
before insert or update of shop_id, recommendation_id, evidence_snapshot_id on public.ai_action_previews
for each row execute function private.enforce_ai_record_tenant_links();

drop trigger if exists trg_ai_action_approvals_tenant_links on public.ai_action_approvals;
create trigger trg_ai_action_approvals_tenant_links
before insert or update of shop_id, action_preview_id on public.ai_action_approvals
for each row execute function private.enforce_ai_record_tenant_links();

drop trigger if exists trg_ai_action_events_tenant_links on public.ai_action_events;
create trigger trg_ai_action_events_tenant_links
before insert or update of shop_id, recommendation_id, action_preview_id, approval_id on public.ai_action_events
for each row execute function private.enforce_ai_record_tenant_links();

create unique index if not exists idx_ai_action_approvals_one_pending_per_preview
  on public.ai_action_approvals(action_preview_id)
  where status = 'pending';

-- Approval decisions and audit events are server-owned mutations. Authenticated
-- users retain tenant-scoped reads, while the service role is limited to the
-- operations used by the canonical server workflow.
drop policy if exists ai_action_approvals_shop_insert on public.ai_action_approvals;
drop policy if exists ai_action_approvals_shop_update on public.ai_action_approvals;
drop policy if exists ai_action_events_shop_insert on public.ai_action_events;

revoke all on table public.ai_action_approvals from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.ai_action_approvals from authenticated;
grant select on table public.ai_action_approvals to authenticated;
revoke delete, truncate, references, trigger
  on table public.ai_action_approvals from service_role;
grant select, insert, update on table public.ai_action_approvals to service_role;

revoke all on table public.ai_action_events from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.ai_action_events from authenticated;
grant select on table public.ai_action_events to authenticated;
revoke update, delete, truncate, references, trigger
  on table public.ai_action_events from service_role;
grant select, insert on table public.ai_action_events to service_role;

-- The preceding semantics migration added updated_at as a fallback, but placed
-- it after sent_at. On UPDATE, the transition timestamp must win over the
-- immutable quote-send timestamp.
do $chronology$
declare
  v_sql text;
  v_old text := E'    nullif(v_row ->> ''sent_at'', '''')::timestamptz,\n    case\n      when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at'', '''')::timestamptz\n      else null\n    end,';
  v_new text := E'    case\n      when tg_op = ''UPDATE'' then nullif(v_row ->> ''updated_at'', '''')::timestamptz\n      else null\n    end,\n    nullif(v_row ->> ''sent_at'', '''')::timestamptz,';
begin
  select pg_get_functiondef('private.capture_operational_event()'::regprocedure)
    into v_sql;

  if position(v_new in v_sql) = 0 then
    if position(v_old in v_sql) = 0 then
      raise exception 'Operational event transition chronology patch point not found';
    end if;

    execute replace(v_sql, v_old, v_new);
  end if;

  select pg_get_functiondef('private.capture_operational_event()'::regprocedure)
    into v_sql;

  if position(v_new in v_sql) = 0 then
    raise exception 'Operational event transition chronology postcondition failed';
  end if;
end;
$chronology$;

commit;
