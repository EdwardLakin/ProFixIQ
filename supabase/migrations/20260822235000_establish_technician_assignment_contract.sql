begin;

-- PFX-004 assignment contract
--
-- * work_order_line_technicians is the canonical multi-technician set.
-- * work_order_lines.assigned_tech_id is the explicit primary/operational owner.
-- * work_order_lines.assigned_to is a legacy read-compatibility field only.
--
-- Existing ambiguous rows are deliberately reported below and are not
-- backfilled. That keeps a deploy from silently choosing a technician when two
-- persisted sources disagree.

-- Optimistic assignment edits need a version on every line. This backfill does
-- not choose or change any technician; it only initializes the version field
-- that the atomic assignment command compares.
update public.work_order_lines
set updated_at = coalesce(updated_at, created_at, clock_timestamp())
where updated_at is null;

alter table public.work_order_lines
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.report_work_order_line_assignment_ambiguities(
  p_shop_id uuid default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with assignment_sets as (
  select
    wol.id as work_order_line_id,
    wol.work_order_id,
    wol.shop_id,
    wol.assigned_tech_id as primary_technician_id,
    wol.assigned_to as legacy_assigned_to,
    coalesce(
      array_agg(wolt.technician_id order by wolt.technician_id)
        filter (where wolt.technician_id is not null),
      array[]::uuid[]
    ) as technician_ids
  from public.work_order_lines wol
  left join public.work_order_line_technicians wolt
    on wolt.work_order_line_id = wol.id
  group by wol.id, wol.work_order_id, wol.shop_id,
    wol.assigned_tech_id, wol.assigned_to
), assignment_drift as (
  select
    assignment_sets.*,
  array_remove(array[
    case
      when primary_technician_id is not null
        and not (primary_technician_id = any(technician_ids))
      then 'primary_missing_from_canonical_set'
    end,
    case
      when primary_technician_id is null
        and cardinality(technician_ids) > 0
      then 'canonical_set_without_primary'
    end,
    case
      when legacy_assigned_to is not null
        and primary_technician_id is not null
        and legacy_assigned_to <> primary_technician_id
      then 'legacy_primary_conflict'
    end,
    case
      when legacy_assigned_to is not null
        and cardinality(technician_ids) > 0
        and not (legacy_assigned_to = any(technician_ids))
      then 'legacy_set_conflict'
    end,
    case
      when legacy_assigned_to is not null
        and primary_technician_id is null
        and cardinality(technician_ids) = 0
      then 'legacy_only_assignment'
    end
  ], null)::text[] as issue_codes
  from assignment_sets
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'work_order_line_id', work_order_line_id,
      'work_order_id', work_order_id,
      'shop_id', shop_id,
      'primary_technician_id', primary_technician_id,
      'legacy_assigned_to', legacy_assigned_to,
      'technician_ids', technician_ids,
      'issue_codes', issue_codes
    )
    order by work_order_id, work_order_line_id
  ),
  '[]'::jsonb
)
from assignment_drift
where cardinality(issue_codes) > 0
  and (p_shop_id is null or shop_id = p_shop_id);
$$;

comment on function public.report_work_order_line_assignment_ambiguities(uuid) is
  'Read-only PFX-004 report of legacy/canonical technician assignment drift. No row in this report is automatically backfilled.';

revoke all on function public.report_work_order_line_assignment_ambiguities(uuid)
  from public, anon, authenticated;
grant execute on function public.report_work_order_line_assignment_ambiguities(uuid)
  to service_role;

create or replace function public.mutate_work_order_line_assignment_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_operation_key text,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_role text;
  v_employment_status text;
  v_existing jsonb;
  v_result jsonb;
  v_next_updated_at timestamptz;
begin
  if v_action not in ('set_primary', 'add_supporting', 'remove_supporting', 'clear') then
    raise exception using errcode = 'P0001', message = 'Unsupported technician assignment action.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if v_action <> 'clear' and p_technician_id is null then
    raise exception using errcode = 'P0001', message = 'A technician is required for this assignment action.';
  end if;

  select *
    into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id
    and wol.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;

  select wok.result
    into v_existing
  from public.workforce_operation_keys wok
  where wok.shop_id = p_shop_id
    and wok.operation_name = 'line_assignment:' || v_action
    and wok.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  if p_expected_updated_at is not null
    and v_line.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_STALE: reload the job before changing its technician assignment.';
  end if;
  -- now() is fixed for the entire transaction, so two assignment commands in
  -- one transaction could otherwise reuse the same optimistic-lock version.
  -- Always advance the row version even when the wall clock has not ticked.
  v_next_updated_at := greatest(
    clock_timestamp(),
    coalesce(v_line.updated_at, '-infinity'::timestamptz)
      + interval '1 microsecond'
  );
  if coalesce(v_line.line_type::text, 'job') = 'info' then
    raise exception using errcode = 'P0001', message = 'Info lines cannot be technician-assigned.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, v_line.work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: assignment cannot change after invoice finalization.';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_actor_user_id
    and p.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Assigning user is not available for this shop.';
  end if;

  if p_technician_id is not null then
    select lower(coalesce(p.role::text, ''))
      into v_role
    from public.profiles p
    where p.id = p_technician_id
      and p.shop_id = p_shop_id
    for update;
    if not found or v_role not in (
      'mechanic', 'tech', 'technician', 'foreman',
      'lead_hand', 'lead hand', 'leadhand'
    ) then
      raise exception using errcode = 'P0001', message = 'Technician is not assignable for this shop.';
    end if;

    select lower(pwp.employment_status)
      into v_employment_status
    from public.people_workforce_profiles pwp
    where pwp.shop_id = p_shop_id
      and pwp.user_id = p_technician_id;
    if found and coalesce(v_employment_status, '') <> 'active' then
      raise exception using errcode = 'P0001', message = 'Technician is not active for this shop.';
    end if;
  end if;

  if v_action in ('clear', 'remove_supporting') and exists (
    select 1
    from public.work_order_line_labor_segments segment
    where segment.work_order_line_id = p_work_order_line_id
      and segment.ended_at is null
      and (v_action = 'clear' or segment.technician_id = p_technician_id)
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_LABOR: stop active job labor before clearing this assignment.';
  end if;

  if v_action = 'set_primary' then
    insert into public.work_order_line_technicians(
      work_order_line_id, technician_id, assigned_by
    ) values (
      p_work_order_line_id, p_technician_id, p_actor_user_id
    )
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by;

    update public.work_order_lines
    set assigned_tech_id = p_technician_id,
        assigned_to = null,
        updated_at = v_next_updated_at
    where id = p_work_order_line_id;
  elsif v_action = 'add_supporting' then
    if v_line.assigned_tech_id is null then
      raise exception using errcode = 'P0001', message = 'Set a primary technician before adding supporting technicians.';
    end if;
    insert into public.work_order_line_technicians(
      work_order_line_id, technician_id, assigned_by
    ) values (
      p_work_order_line_id, p_technician_id, p_actor_user_id
    )
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by;
    update public.work_order_lines
    set assigned_to = null,
        updated_at = v_next_updated_at
    where id = p_work_order_line_id;
  elsif v_action = 'remove_supporting' then
    if v_line.assigned_tech_id = p_technician_id then
      raise exception using errcode = 'P0001', message = 'Change or clear the primary technician instead of removing it as supporting.';
    end if;
    delete from public.work_order_line_technicians
    where work_order_line_id = p_work_order_line_id
      and technician_id = p_technician_id;
    update public.work_order_lines
    set assigned_to = null,
        updated_at = v_next_updated_at
    where id = p_work_order_line_id;
  else
    delete from public.work_order_line_technicians
    where work_order_line_id = p_work_order_line_id;
    update public.work_order_lines
    set assigned_tech_id = null,
        assigned_to = null,
        updated_at = v_next_updated_at
    where id = p_work_order_line_id;
  end if;

  select jsonb_build_object(
    'ok', true,
    'shop_id', p_shop_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'primary_technician_id', (
      select wol.assigned_tech_id
      from public.work_order_lines wol
      where wol.id = p_work_order_line_id
    ),
    'technician_ids', coalesce((
      select jsonb_agg(wolt.technician_id order by wolt.technician_id)
      from public.work_order_line_technicians wolt
      where wolt.work_order_line_id = p_work_order_line_id
    ), '[]'::jsonb),
    'assignment_mode', 'explicit_primary_with_supporting_technicians',
    'action', v_action,
    'idempotent', false
  ) into v_result;

  insert into public.workforce_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id,
    work_order_id, work_order_line_id, result
  ) values (
    p_shop_id, 'line_assignment:' || v_action, p_operation_key,
    p_actor_user_id, v_line.work_order_id, p_work_order_line_id, v_result
  );

  insert into public.activity_logs(
    action, user_id, timestamp, target_table, target_id, context
  ) values (
    'technician_assignment_' || v_action,
    p_actor_user_id,
    now(),
    'work_order_line',
    p_work_order_line_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'work_order_id', v_line.work_order_id,
      'technician_id', p_technician_id,
      'primary_technician_id', v_result -> 'primary_technician_id',
      'assignment_mode', 'explicit_primary_with_supporting_technicians'
    )
  );

  return v_result;
end;
$$;

-- Preserve the existing Phase 4 RPC contract for older clients while routing
-- every new write through the canonical mutation implementation.
create or replace function public.assign_work_order_line_technician_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_technician_id uuid,
  p_assigned_by uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_authenticated_actor_matches boolean := false;
  v_actor_can_assign boolean := false;
begin
  select
    v_auth_user_id is not null
      and (profile.id = v_auth_user_id or profile.user_id = v_auth_user_id)
    into v_authenticated_actor_matches
  from public.profiles profile
  where profile.id = p_assigned_by
    and profile.shop_id = p_shop_id;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'Assigning user is not available for this shop.';
  end if;
  if v_auth_user_id is not null and not v_authenticated_actor_matches then
    raise exception using
      errcode = '42501',
      message = 'Authenticated actor does not match assigning user.';
  end if;
  if v_auth_user_id is null
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  select decision.granted
    into v_actor_can_assign
  from private.resolve_workspace_profile_capability(
    p_assigned_by,
    p_shop_id,
    'work_order.assignment.manage'
  ) decision;
  if not coalesce(v_actor_can_assign, false) then
    raise exception using
      errcode = '42501',
      message = 'Work-order assignment authority is required.';
  end if;

  return public.mutate_work_order_line_assignment_atomic(
    p_shop_id,
    p_work_order_line_id,
    p_technician_id,
    p_assigned_by,
    'set_primary',
    p_operation_key,
    null
  );
end;
$$;

create or replace function public.assign_work_order_line_technician_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_operation_key text,
  p_expected_updated_at timestamptz default null
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.mutate_work_order_line_assignment_atomic(
    p_shop_id,
    p_work_order_line_id,
    p_technician_id,
    p_actor_user_id,
    p_action,
    p_operation_key,
    p_expected_updated_at
  );
$$;

create or replace function public.assign_work_order_primary_technician_bulk_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_only_unassigned boolean,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_line record;
  v_existing jsonb;
  v_result jsonb;
  v_updated_count integer := 0;
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select * into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop.';
  end if;

  select wok.result into v_existing
  from public.workforce_operation_keys wok
  where wok.shop_id = p_shop_id
    and wok.operation_name = 'bulk_primary_assignment'
    and wok.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  for v_line in
    select wol.id
    from public.work_order_lines wol
    where wol.work_order_id = p_work_order_id
      and wol.shop_id = p_shop_id
      and coalesce(wol.line_type::text, 'job') <> 'info'
      and wol.voided_at is null
      and lower(replace(coalesce(wol.status::text, ''), ' ', '_')) not in (
        'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
        'void', 'voided', 'ready_to_invoice', 'invoiced'
      )
      and lower(replace(coalesce(wol.line_status::text, ''), ' ', '_')) not in (
        'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
        'void', 'voided', 'ready_to_invoice', 'invoiced'
      )
      and (
        not coalesce(p_only_unassigned, true)
        or (
          wol.assigned_tech_id is null
          and wol.assigned_to is null
          and not exists (
            select 1
            from public.work_order_line_technicians wolt
            where wolt.work_order_line_id = wol.id
          )
        )
      )
    order by wol.id
    for update
  loop
    perform public.mutate_work_order_line_assignment_atomic(
      p_shop_id,
      v_line.id,
      p_technician_id,
      p_actor_user_id,
      'set_primary',
      p_operation_key || ':' || v_line.id,
      null
    );
    v_updated_count := v_updated_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'shop_id', p_shop_id,
    'work_order_id', p_work_order_id,
    'primary_technician_id', p_technician_id,
    'updated_count', v_updated_count,
    'assignment_mode', 'explicit_primary_with_supporting_technicians',
    'idempotent', false
  );

  insert into public.workforce_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id,
    work_order_id, result
  ) values (
    p_shop_id, 'bulk_primary_assignment', p_operation_key,
    p_actor_user_id, p_work_order_id, v_result
  );

  return v_result;
end;
$$;

-- The Assistant confirmation and execution path uses the same assignment
-- contract as the human controls. In particular, only-unassigned means no
-- primary, no legacy assignment, and no canonical supporting row.
create or replace function public.shop_assistant_assign_work_order_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_only_unassigned boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_actor_profile_id uuid;
  v_actor_can_assign boolean := false;
  v_technician_role text;
  v_technician_name text;
  v_expected text;
  v_expected_count integer;
  v_current_count integer;
  v_count integer := 0;
  v_assignment_result jsonb;
  v_label text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'assign_work_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_actor_profile_id := public.shop_assistant_profile_id(
    p_shop_id, p_actor_user_id
  );
  select decision.granted
    into v_actor_can_assign
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    p_shop_id,
    'work_order.assignment.manage'
  ) decision;
  if not coalesce(v_actor_can_assign, false) then
    raise exception using errcode = '42501', message = 'Your role cannot assign work.';
  end if;

  select
    public.shop_assistant_profile_role(p_shop_id, profile.id),
    profile.full_name
    into v_technician_role, v_technician_name
  from public.profiles profile
  where profile.id = p_technician_id
    and profile.shop_id = p_shop_id
  for update;
  if not found or v_technician_role not in ('mechanic', 'foreman', 'lead_hand') then
    raise exception using
      errcode = 'P0001',
      message = 'Technician is not assignable for this shop.';
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: assignment cannot change after invoice finalization.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  perform 1
  from public.work_order_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
  order by line.id
  for update;

  v_expected := v_action.target_versions ->> (
    'work_order_line_count:' || p_work_order_id::text
  );
  if v_expected is null or v_expected !~ '^[0-9]+$' then
    raise exception using
      errcode = 'P0001',
      message = 'The confirmed line snapshot is unavailable. Ask again to review the latest work order.';
  end if;
  v_expected_count := v_expected::integer;

  select count(*)::integer into v_current_count
  from public.work_order_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
    and line.voided_at is null
    and coalesce(line.line_type::text, 'job') = 'job'
    and (
      not coalesce(p_only_unassigned, true)
      or (
        line.assigned_tech_id is null
        and line.assigned_to is null
        and not exists (
          select 1
          from public.work_order_line_technicians assignment
          where assignment.work_order_line_id = line.id
        )
      )
    )
    and lower(replace(coalesce(line.status::text, ''), ' ', '_')) not in (
      'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
      'void', 'voided', 'ready_to_invoice', 'invoiced'
    )
    and lower(replace(coalesce(line.line_status::text, ''), ' ', '_')) not in (
      'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
      'void', 'voided', 'ready_to_invoice', 'invoiced'
    );

  if v_current_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'This work order has no eligible job lines to assign.';
  end if;
  if v_current_count <> v_expected_count then
    raise exception using
      errcode = 'P0001',
      message = 'The eligible work-order lines changed after confirmation. Ask again to review the latest state.';
  end if;

  if exists (
    select 1
    from public.work_order_lines line
    where line.shop_id = p_shop_id
      and line.work_order_id = p_work_order_id
      and line.voided_at is null
      and coalesce(line.line_type::text, 'job') = 'job'
      and (
        not coalesce(p_only_unassigned, true)
        or (
          line.assigned_tech_id is null
          and line.assigned_to is null
          and not exists (
            select 1
            from public.work_order_line_technicians assignment
            where assignment.work_order_line_id = line.id
          )
        )
      )
      and lower(replace(coalesce(line.status::text, ''), ' ', '_')) not in (
        'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
        'void', 'voided', 'ready_to_invoice', 'invoiced'
      )
      and lower(replace(coalesce(line.line_status::text, ''), ' ', '_')) not in (
        'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
        'void', 'voided', 'ready_to_invoice', 'invoiced'
      )
      and (
        v_action.target_versions ->> ('work_order_line:' || line.id::text) is null
        or (
          line.updated_at is null
          and v_action.target_versions ->> ('work_order_line:' || line.id::text) <> 'missing'
        )
        or (
          line.updated_at is not null
          and (
            v_action.target_versions ->> ('work_order_line:' || line.id::text) = 'missing'
            or line.updated_at is distinct from (
              v_action.target_versions ->> ('work_order_line:' || line.id::text)
            )::timestamptz
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'A work-order line changed after confirmation. Ask again to review the latest state.';
  end if;

  v_assignment_result := public.assign_work_order_primary_technician_bulk_atomic(
    p_shop_id,
    p_work_order_id,
    p_technician_id,
    v_actor_profile_id,
    p_only_unassigned,
    'shop-assistant:' || p_action_id::text
  );
  v_count := coalesce((v_assignment_result ->> 'updated_count')::integer, 0);
  if v_count <> v_expected_count then
    raise exception using
      errcode = '40001',
      message = 'The eligible work-order lines changed during assignment.';
  end if;

  update public.work_orders
  set updated_at = now()
  where id = p_work_order_id
    and shop_id = p_shop_id;

  v_label := case
    when nullif(trim(v_work_order.custom_id), '') is not null
      then 'WO #' || trim(v_work_order.custom_id)
    else 'WO ' || left(p_work_order_id::text, 8)
  end;
  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', p_work_order_id,
    'technicianId', p_technician_id,
    'technicianName', coalesce(nullif(trim(v_technician_name), ''), 'Technician'),
    'assignedLines', v_count,
    'summary', v_label || ' assigned ' || v_count::text || ' line(s) to '
      || coalesce(nullif(trim(v_technician_name), ''), 'the selected technician') || '.',
    'href', '/work-orders/' || p_work_order_id::text
  );

  insert into public.activity_logs(
    action, user_id, timestamp, target_table, target_id, context
  ) values (
    'shop_assistant_work_order_assigned',
    p_actor_user_id,
    now(),
    'work_order',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'profile_id', v_actor_profile_id,
      'action_id', p_action_id,
      'technician_id', p_technician_id,
      'assigned_lines', v_count,
      'only_unassigned', coalesce(p_only_unassigned, true),
      'assignment_mode', 'explicit_primary_with_supporting_technicians'
    )
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

revoke all on function public.shop_assistant_assign_work_order_atomic(
  uuid, uuid, uuid, uuid, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.shop_assistant_assign_work_order_atomic(
  uuid, uuid, uuid, uuid, uuid, boolean
) to service_role;

-- Primary ownership is ordered first. A legacy assigned_to value is read only
-- when neither canonical source has any assignment for that line.
create or replace function public.get_work_order_assignments(p_work_order_id uuid)
returns table(
  technician_id uuid,
  full_name text,
  role text,
  has_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible_lines as (
    select wol.*
    from public.work_order_lines wol
    where wol.work_order_id = p_work_order_id
      and (
        coalesce(auth.role(), '') = 'service_role'
        or exists (
          select 1
          from public.profiles actor
          where actor.shop_id = wol.shop_id
            and (
              actor.id = (select auth.uid())
              or actor.user_id = (select auth.uid())
            )
            and private.workspace_is_shop_staff_role(actor.role::text)
        )
      )
  ), canonical_assignments as (
    select
      wol.id as work_order_line_id,
      wol.assigned_tech_id as primary_technician_id,
      assignment.technician_id
    from visible_lines wol
    cross join lateral (
      select wolt.technician_id
      from public.work_order_line_technicians wolt
      where wolt.work_order_line_id = wol.id
      union
      select wol.assigned_tech_id
      where wol.assigned_tech_id is not null
      union
      select wol.assigned_to
      where wol.assigned_to is not null
        and wol.assigned_tech_id is null
        and not exists (
          select 1
          from public.work_order_line_technicians existing
          where existing.work_order_line_id = wol.id
        )
    ) assignment
  )
  select
    assignment.technician_id,
    p.full_name,
    p.role,
    bool_or(exists (
      select 1
      from public.work_order_line_labor_segments segment
      where segment.work_order_line_id = assignment.work_order_line_id
        and segment.technician_id = assignment.technician_id
        and segment.ended_at is null
    )) as has_active
  from canonical_assignments assignment
  left join public.profiles p on p.id = assignment.technician_id
  group by assignment.technician_id, p.full_name, p.role
  order by
    bool_or(
      assignment.primary_technician_id = assignment.technician_id
    ) desc,
    lower(coalesce(p.full_name, '')),
    assignment.technician_id;
$$;

create or replace function private.enforce_work_order_line_assignment_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line_id uuid;
  v_primary_technician_id uuid;
  v_legacy_assigned_to uuid;
  v_has_assignments boolean;
begin
  if tg_table_name = 'work_order_lines' then
    if tg_op = 'UPDATE'
      and new.assigned_tech_id is not distinct from old.assigned_tech_id
      and new.assigned_to is not distinct from old.assigned_to then
      return new;
    end if;
    v_line_id := new.id;
  else
    v_line_id := coalesce(new.work_order_line_id, old.work_order_line_id);
  end if;

  select wol.assigned_tech_id, wol.assigned_to
    into v_primary_technician_id, v_legacy_assigned_to
  from public.work_order_lines wol
  where wol.id = v_line_id;
  if not found then return coalesce(new, old); end if;

  select exists (
    select 1
    from public.work_order_line_technicians wolt
    where wolt.work_order_line_id = v_line_id
  ) into v_has_assignments;

  if v_primary_technician_id is not null and not exists (
    select 1
    from public.work_order_line_technicians wolt
    where wolt.work_order_line_id = v_line_id
      and wolt.technician_id = v_primary_technician_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Technician assignment contract requires the primary technician in the canonical set.';
  end if;

  if v_primary_technician_id is null and v_has_assignments then
    raise exception using
      errcode = '23514',
      message = 'Technician assignment contract requires an explicit primary for a non-empty canonical set.';
  end if;

  if v_legacy_assigned_to is not null
    and (v_primary_technician_id is not null or v_has_assignments) then
    raise exception using
      errcode = '23514',
      message = 'Legacy assigned_to cannot coexist with canonical technician assignment.';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.enforce_work_order_line_assignment_contract()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_work_order_line_assignment_contract
  on public.work_order_lines;
create constraint trigger enforce_work_order_line_assignment_contract
after insert or update on public.work_order_lines
deferrable initially deferred
for each row execute function private.enforce_work_order_line_assignment_contract();

drop trigger if exists enforce_work_order_line_technician_assignment_contract
  on public.work_order_line_technicians;
create constraint trigger enforce_work_order_line_technician_assignment_contract
after insert or update or delete on public.work_order_line_technicians
deferrable initially deferred
for each row execute function private.enforce_work_order_line_assignment_contract();

revoke all on function public.mutate_work_order_line_assignment_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.assign_work_order_primary_technician_bulk_atomic(
  uuid, uuid, uuid, uuid, boolean, text
) from public, anon, authenticated;
revoke all on function public.assign_work_order_line_technician_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.assign_work_order_line_technician_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.mutate_work_order_line_assignment_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) to service_role;
grant execute on function public.assign_work_order_primary_technician_bulk_atomic(
  uuid, uuid, uuid, uuid, boolean, text
) to service_role;
grant execute on function public.assign_work_order_line_technician_atomic(
  uuid, uuid, uuid, uuid, text
) to authenticated, service_role;
grant execute on function public.assign_work_order_line_technician_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) to service_role;

-- Browser clients can continue to read the scoped summary. New assignment
-- routes use the service role; the legacy five-argument wrapper remains
-- authenticated only because it rechecks actor identity and Workspace
-- assignment capability before reaching the canonical mutation.
revoke all on function public.get_work_order_assignments(uuid)
  from public, anon, authenticated;
grant execute on function public.get_work_order_assignments(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
