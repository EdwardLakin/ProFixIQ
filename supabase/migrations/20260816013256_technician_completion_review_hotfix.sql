-- Forward repair for the completion-integrity review findings that arrived
-- after PR #1445 merged. Keep receipt recovery line-bound, serialize repair
-- learning, normalize legacy receipt ownership, and use canonical inspections.

begin;

create or replace function copilot.technician_has_bound_completion_receipt(
  p_auth_user_id uuid,
  p_session_id uuid,
  p_turn_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, copilot, pg_temp
as $$
  select exists (
    select 1
    from copilot.repair_sessions rs
    join public.profiles p
      on p.id = rs.technician_id
     and (p.id = p_auth_user_id or p.user_id = p_auth_user_id)
    join copilot.repair_session_events e
      on e.repair_session_id = rs.id
     and e.event_type = 'action.pending'
    join copilot.repair_session_event_context c
      on c.event_id = e.id
    join public.workforce_operation_keys wok
      on wok.shop_id = rs.shop_id
     and wok.operation_name = 'job_punch:finish'
     and wok.operation_key = 'technician-copilot:' || (c.details ->> 'key')
     and wok.actor_user_id = p_auth_user_id
     and wok.work_order_id = rs.work_order_id
     and wok.work_order_line_id = case
       when c.details ->> 'workOrderLineId'
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       then (c.details ->> 'workOrderLineId')::uuid
       else null
     end
    where rs.id = p_session_id
      -- A completion receipt is recovery authority only while the session is
      -- still anchored to that exact line. Re-anchoring makes every older
      -- receipt historical and removes its authorization effect.
      and rs.active_work_order_line_id = wok.work_order_line_id
      and c.details ->> 'action' = 'job.complete'
      and c.details ->> 'key'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and c.details ->> 'workOrderLineId'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (p_turn_id is null or c.details ->> 'turnId' = p_turn_id)
  )
$$;

revoke all on function copilot.technician_has_bound_completion_receipt(
  uuid,uuid,text
) from public, anon, authenticated, service_role;

create table if not exists copilot.completed_repair_learning_receipts (
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id)
    on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation_key text not null,
  source_line_updated_at timestamptz not null,
  state text not null,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 1,
  result jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, work_order_line_id),
  constraint completed_repair_learning_state_chk
    check (state in ('running', 'retryable', 'completed')),
  constraint completed_repair_learning_operation_key_chk
    check (char_length(btrim(operation_key)) between 1 and 512),
  constraint completed_repair_learning_attempt_count_chk
    check (attempt_count > 0),
  constraint completed_repair_learning_result_chk
    check (jsonb_typeof(result) = 'object')
);

alter table copilot.completed_repair_learning_receipts enable row level security;
revoke all on copilot.completed_repair_learning_receipts
  from public, anon, authenticated, service_role;

create index if not exists completed_repair_learning_receipts_line_idx
  on copilot.completed_repair_learning_receipts (work_order_line_id);
create index if not exists completed_repair_learning_receipts_actor_idx
  on copilot.completed_repair_learning_receipts (actor_user_id);

drop policy if exists completed_repair_learning_receipts_deny_direct_access
  on copilot.completed_repair_learning_receipts;
create policy completed_repair_learning_receipts_deny_direct_access
  on copilot.completed_repair_learning_receipts
  for all
  to public
  using (false)
  with check (false);

create or replace function public.claim_completed_repair_learning_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_lease_token uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_actor_auth_user_id uuid;
  v_line_updated_at public.work_order_lines.updated_at%type;
  v_line_status text;
  v_receipt copilot.completed_repair_learning_receipts%rowtype;
  v_now timestamptz := coalesce(p_at, now());
  v_inserted integer := 0;
begin
  if p_shop_id is null
    or p_work_order_line_id is null
    or p_actor_user_id is null
    or p_lease_token is null
    or nullif(btrim(p_operation_key), '') is null
  then
    raise exception 'completed_repair_learning_claim_invalid'
      using errcode = '22023';
  end if;

  select coalesce(p.user_id, p.id)
    into v_actor_auth_user_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.user_id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found
    or not exists (
      select 1 from auth.users u where u.id = v_actor_auth_user_id
    )
    or (
      auth.uid() is not null
      and auth.uid() is distinct from v_actor_auth_user_id
    )
  then
    raise exception 'completed_repair_learning_actor_forbidden'
      using errcode = '42501';
  end if;

  select coalesce(wol.updated_at, v_now), lower(coalesce(wol.status::text, ''))
    into v_line_updated_at, v_line_status
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id
    and wol.shop_id = p_shop_id
  for share;

  if not found then
    raise exception 'completed_repair_learning_line_not_found'
      using errcode = 'P0001';
  end if;
  if v_line_status not in ('completed', 'invoiced') then
    raise exception 'completed_repair_learning_line_not_completed'
      using errcode = '55000';
  end if;

  insert into copilot.completed_repair_learning_receipts (
    shop_id,
    work_order_line_id,
    actor_user_id,
    operation_key,
    source_line_updated_at,
    state,
    lease_token,
    lease_expires_at,
    result,
    updated_at
  ) values (
    p_shop_id,
    p_work_order_line_id,
    v_actor_auth_user_id,
    btrim(p_operation_key),
    v_line_updated_at,
    'running',
    p_lease_token,
    v_now + interval '5 minutes',
    '{}'::jsonb,
    v_now
  )
  on conflict (shop_id, work_order_line_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return jsonb_build_object(
      'claimed', true,
      'completed', false,
      'inProgress', false,
      'replayed', false
    );
  end if;

  select receipt.*
    into v_receipt
  from copilot.completed_repair_learning_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.work_order_line_id = p_work_order_line_id
  for update;

  if v_receipt.state = 'completed'
    and v_receipt.source_line_updated_at >= v_line_updated_at
  then
    return jsonb_build_object(
      'claimed', false,
      'completed', true,
      'inProgress', false,
      'replayed', true
    );
  end if;

  if v_receipt.state = 'running'
    and v_receipt.source_line_updated_at = v_line_updated_at
    and v_receipt.lease_token = p_lease_token
  then
    return jsonb_build_object(
      'claimed', true,
      'completed', false,
      'inProgress', false,
      'replayed', true
    );
  end if;

  if v_receipt.source_line_updated_at < v_line_updated_at
    or v_receipt.state = 'retryable'
    or v_receipt.lease_expires_at is null
    or v_receipt.lease_expires_at <= v_now
  then
    update copilot.completed_repair_learning_receipts receipt
    set actor_user_id = v_actor_auth_user_id,
        operation_key = btrim(p_operation_key),
        source_line_updated_at = v_line_updated_at,
        state = 'running',
        lease_token = p_lease_token,
        lease_expires_at = v_now + interval '5 minutes',
        attempt_count = receipt.attempt_count + 1,
        result = '{}'::jsonb,
        completed_at = null,
        updated_at = v_now
    where receipt.shop_id = p_shop_id
      and receipt.work_order_line_id = p_work_order_line_id;

    return jsonb_build_object(
      'claimed', true,
      'completed', false,
      'inProgress', false,
      'replayed', true
    );
  end if;

  return jsonb_build_object(
    'claimed', false,
    'completed', false,
    'inProgress', true,
    'replayed', true
  );
end;
$$;

create or replace function public.finish_completed_repair_learning_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_result jsonb default '{}'::jsonb,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_actor_auth_user_id uuid;
  v_receipt copilot.completed_repair_learning_receipts%rowtype;
  v_now timestamptz := coalesce(p_at, now());
  v_result jsonb := case
    when jsonb_typeof(p_result) = 'object'
      and octet_length(p_result::text) <= 16384
    then p_result
    else '{}'::jsonb
  end;
begin
  if p_shop_id is null
    or p_work_order_line_id is null
    or p_actor_user_id is null
    or p_lease_token is null
    or p_succeeded is null
  then
    raise exception 'completed_repair_learning_finish_invalid'
      using errcode = '22023';
  end if;

  select coalesce(p.user_id, p.id)
    into v_actor_auth_user_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.user_id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found
    or (
      auth.uid() is not null
      and auth.uid() is distinct from v_actor_auth_user_id
    )
  then
    raise exception 'completed_repair_learning_actor_forbidden'
      using errcode = '42501';
  end if;

  select receipt.*
    into v_receipt
  from copilot.completed_repair_learning_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.work_order_line_id = p_work_order_line_id
  for update;

  if not found then
    raise exception 'completed_repair_learning_receipt_not_found'
      using errcode = 'P0001';
  end if;
  if v_receipt.state = 'completed' then
    return jsonb_build_object('completed', true, 'replayed', true);
  end if;
  if v_receipt.actor_user_id is distinct from v_actor_auth_user_id
    or v_receipt.lease_token is distinct from p_lease_token
  then
    raise exception 'completed_repair_learning_lease_conflict'
      using errcode = '23505';
  end if;

  update copilot.completed_repair_learning_receipts receipt
  set state = case when p_succeeded then 'completed' else 'retryable' end,
      lease_token = case when p_succeeded then null else receipt.lease_token end,
      lease_expires_at = case when p_succeeded then null else v_now end,
      result = v_result,
      completed_at = case when p_succeeded then v_now else null end,
      updated_at = v_now
  where receipt.shop_id = p_shop_id
    and receipt.work_order_line_id = p_work_order_line_id;

  return jsonb_build_object(
    'completed', p_succeeded,
    'retryable', not p_succeeded,
    'replayed', false
  );
end;
$$;

revoke all on function public.claim_completed_repair_learning_atomic(
  uuid,uuid,uuid,text,uuid,timestamptz
) from public, anon;
grant execute on function public.claim_completed_repair_learning_atomic(
  uuid,uuid,uuid,text,uuid,timestamptz
) to authenticated, service_role;

revoke all on function public.finish_completed_repair_learning_atomic(
  uuid,uuid,uuid,uuid,boolean,jsonb,timestamptz
) from public, anon;
grant execute on function public.finish_completed_repair_learning_atomic(
  uuid,uuid,uuid,uuid,boolean,jsonb,timestamptz
) to authenticated, service_role;

create or replace function copilot.normalize_completion_receipt_actor()
returns trigger
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_auth_user_id uuid;
begin
  if new.operation_name = 'job_punch:finish'
    and new.operation_key like 'technician-copilot:%'
  then
    select p.user_id
      into v_auth_user_id
    from public.profiles p
    join auth.users u on u.id = p.user_id
    where p.id = new.actor_user_id
      and p.shop_id = new.shop_id
      and p.user_id is not null
      and p.user_id is distinct from p.id
    limit 1;

    if found then
      new.actor_user_id := v_auth_user_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function copilot.normalize_completion_receipt_actor()
  from public, anon, authenticated, service_role;

drop trigger if exists normalize_technician_copilot_completion_receipt_actor
  on public.workforce_operation_keys;
create trigger normalize_technician_copilot_completion_receipt_actor
before insert or update of actor_user_id, operation_name, operation_key
on public.workforce_operation_keys
for each row execute function copilot.normalize_completion_receipt_actor();

do $legacy_completion_receipt_backfill$
declare
  v_backfilled integer := 0;
begin
  update public.workforce_operation_keys receipt
  set actor_user_id = profile.user_id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.user_id
  where receipt.actor_user_id = profile.id
    and receipt.shop_id = profile.shop_id
    and receipt.operation_name = 'job_punch:finish'
    and receipt.operation_key like 'technician-copilot:%'
    and profile.user_id is not null
    and profile.user_id is distinct from profile.id;
  get diagnostics v_backfilled = row_count;
  raise notice 'Normalized % legacy technician completion receipt actor(s)',
    v_backfilled;
end
$legacy_completion_receipt_backfill$;

-- The canonical job-punch function is replaced below so its inspection lock
-- and completion gate ignore retained non-canonical evidence rows.

create or replace function public.apply_job_punch_transition_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_action text,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_allow_concurrent boolean default false,
  p_at timestamptz default now(),
  p_start_source text default null,
  p_hold_reason text default null,
  p_notes text default null,
  p_preserve_line_status boolean default false,
  p_release_to_awaiting boolean default false,
  p_cause text default null,
  p_correction text default null,
  p_event text default null,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_shift public.tech_shifts%rowtype;
  v_status text;
  v_approval text;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_now timestamptz := coalesce(p_at, now());
  v_existing jsonb;
  v_result jsonb;
  v_final_cause text;
  v_final_correction text;
  v_segment_id uuid;
  v_earliest timestamptz;
  v_latest timestamptz;
  v_has_open boolean;
  v_closed_count integer := 0;
  v_technician_profile_id uuid;
  v_actor_profile_id uuid;
  v_actor_auth_user_id uuid;
  v_existing_actor_user_id uuid;
  v_existing_line_id uuid;
begin
  if v_action not in ('start','resume','pause','finish') then
    raise exception using errcode = 'P0001', message = 'Unsupported job punch action.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select p.id
    into v_technician_profile_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_technician_id or p.user_id = p_technician_id)
  order by case when p.id = p_technician_id then 0 else 1 end
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Technician is not available for this shop.';
  end if;

  select p.id, coalesce(p.user_id, p.id)
    into v_actor_profile_id, v_actor_auth_user_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;
  if not found
    or not exists (
      select 1 from auth.users u where u.id = v_actor_auth_user_id
    )
    or (
      auth.uid() is not null
      and auth.uid() is distinct from v_actor_auth_user_id
    )
  then
    raise exception using errcode = 'P0001', message = 'Actor is not available for this shop.';
  end if;

  select wok.result, wok.actor_user_id, wok.work_order_line_id
    into v_existing, v_existing_actor_user_id, v_existing_line_id
  from public.workforce_operation_keys wok
  where wok.shop_id = p_shop_id
    and wok.operation_name = 'job_punch:' || v_action
    and wok.operation_key = p_operation_key;
  if found then
    if v_existing_actor_user_id is distinct from v_actor_auth_user_id
      or v_existing_line_id is distinct from p_work_order_line_id
    then
      raise exception using errcode = '23505', message = 'JOB_PUNCH_OPERATION_CONFLICT';
    end if;
    return v_existing || jsonb_build_object('idempotent', true);
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
  if v_line.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'Work-order line is missing its work-order anchor.';
  end if;
  if coalesce(v_line.line_type::text, 'job') = 'info' then
    raise exception using errcode = 'P0001', message = 'Info lines are non-actionable.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, v_line.work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: job labor cannot change after invoice finalization.';
  end if;

  v_status := lower(coalesce(v_line.status::text, 'awaiting'));
  v_approval := lower(coalesce(v_line.approval_state::text, ''));

  perform 1
  from public.work_order_line_technicians wolt
  where wolt.work_order_line_id = p_work_order_line_id
  for update;

  perform 1
  from public.work_order_line_labor_segments seg
  where seg.shop_id = p_shop_id
    and (
      seg.work_order_line_id = p_work_order_line_id
      or (seg.technician_id = v_technician_profile_id and seg.ended_at is null)
    )
  for update;

  if v_action in ('start','resume') and p_release_to_awaiting then
    if v_status in ('completed','invoiced') then
      raise exception using errcode = 'P0001', message = 'Cannot release hold on a closed line.';
    end if;

    update public.work_order_lines
    set status = 'awaiting',
        hold_reason = null,
        updated_at = v_now
    where id = p_work_order_line_id;

  elsif v_action in ('start','resume') then
    if v_status in ('completed','invoiced') then
      raise exception using errcode = 'P0001', message = 'Cannot start or resume a closed line.';
    end if;
    if v_status = 'awaiting_approval'
       and v_approval <> 'approved'
       and not coalesce(v_line.punchable, false) then
      raise exception using errcode = 'P0001', message = 'Line is awaiting approval and cannot be started.';
    end if;

    select *
      into v_shift
    from public.tech_shifts ts
    where ts.user_id = v_technician_profile_id
      and ts.shop_id = p_shop_id
      and ts.status::text = 'active'
      and ts.end_time is null
    order by ts.start_time desc, ts.id desc
    limit 1
    for update;
    if not found then
      if exists (
        select 1
        from public.tech_shifts ts
        where ts.user_id = v_technician_profile_id
          and ts.end_time is null
          and (ts.shop_id is null or ts.shop_id <> p_shop_id)
      ) then
        raise exception using errcode = 'P0001', message = 'SHIFT_SHOP_MISMATCH: an open shift exists outside this shop and cannot authorize job labor.';
      end if;
      raise exception using errcode = 'P0001', message = 'You need an active shift in this shop before starting job labor.';
    end if;

    if exists (
      select 1
      from public.work_order_line_labor_segments seg
      where seg.shop_id = p_shop_id
        and seg.technician_id = v_technician_profile_id
        and seg.work_order_line_id = p_work_order_line_id
        and seg.ended_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'Technician already has active labor on this line.';
    end if;

    if not p_allow_concurrent and exists (
      select 1
      from public.work_order_line_labor_segments seg
      where seg.shop_id = p_shop_id
        and seg.technician_id = v_technician_profile_id
        and seg.work_order_line_id <> p_work_order_line_id
        and seg.ended_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'Technician already has an active job punch.';
    end if;

    insert into public.work_order_line_technicians(
      work_order_line_id, technician_id, assigned_by
    ) values (
      p_work_order_line_id, v_technician_profile_id, v_actor_profile_id
    )
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by;

    update public.work_order_lines
    set assigned_tech_id = coalesce(assigned_tech_id, v_technician_profile_id),
        status = 'in_progress',
        hold_reason = null,
        updated_at = v_now
    where id = p_work_order_line_id;

    insert into public.work_order_line_labor_segments(
      shop_id, work_order_id, work_order_line_id, technician_id,
      created_by, started_at, source
    ) values (
      p_shop_id, v_line.work_order_id, p_work_order_line_id, v_technician_profile_id,
      v_actor_profile_id, v_now,
      coalesce(nullif(trim(p_start_source), ''), case when v_action = 'start' then 'job_start' else 'job_resume' end)
    ) returning id into v_segment_id;

  elsif v_action = 'pause' then
    if v_status in ('completed','invoiced') then
      raise exception using errcode = 'P0001', message = 'Cannot pause a closed line.';
    end if;

    update public.work_order_line_labor_segments
    set ended_at = v_now,
        pause_reason = case
          when p_preserve_line_status then coalesce(nullif(trim(p_hold_reason), ''), 'labor_pause')
          when nullif(trim(p_hold_reason), '') is not null then 'hold:' || trim(p_hold_reason)
          else 'hold'
        end
    where shop_id = p_shop_id
      and work_order_line_id = p_work_order_line_id
      and technician_id = v_technician_profile_id
      and ended_at is null;
    get diagnostics v_closed_count = row_count;

    update public.work_order_lines
    set status = case when p_preserve_line_status then status else 'on_hold' end,
        hold_reason = case
          when p_preserve_line_status then hold_reason
          else coalesce(nullif(trim(p_hold_reason), ''), 'Paused by technician')
        end,
        notes = case when p_preserve_line_status then notes else coalesce(p_notes, notes) end,
        updated_at = v_now
    where id = p_work_order_line_id;

  else
    if v_status = 'invoiced' then
      raise exception using errcode = 'P0001', message = 'Cannot finish an invoiced line.';
    end if;

    v_final_cause := coalesce(nullif(trim(p_cause), ''), nullif(trim(v_line.cause), ''));
    v_final_correction := coalesce(nullif(trim(p_correction), ''), nullif(trim(v_line.correction), ''));
    if v_final_cause is null then
      raise exception using errcode = 'P0001', message = 'Cause is required before finishing this job.';
    end if;
    if v_final_correction is null then
      raise exception using errcode = 'P0001', message = 'Correction is required before finishing this job.';
    end if;
    if coalesce(v_line.labor_time, 0) <= 0 then
      raise exception using errcode = 'P0001', message = 'Labor time must be greater than 0 before finishing this job.';
    end if;

    perform 1
    from public.inspections i
    where i.work_order_line_id = p_work_order_line_id
      and i.is_canonical
    for update;

    if exists (
      select 1
      from public.inspections i
      where i.work_order_line_id = p_work_order_line_id
        and i.is_canonical
        and (
          not coalesce(i.completed, false)
          or coalesce(i.is_draft, true)
          or not coalesce(i.locked, false)
          or lower(coalesce(i.status, 'draft')) not in ('completed', 'finalized', 'signed')
          or i.finalized_at is null
          or i.finalized_by is null
          or not exists (
            select 1
            from public.inspection_signatures s
            where s.inspection_id = i.id
              and s.signing_cycle = coalesce(i.signing_cycle, 0)
          )
        )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'INSPECTION_COMPLETION_REQUIRED: complete and sign the inspection before finishing this job.';
    end if;

    update public.work_order_line_labor_segments
    set ended_at = v_now,
        pause_reason = 'completed'
    where shop_id = p_shop_id
      and work_order_line_id = p_work_order_line_id
      and technician_id = v_technician_profile_id
      and ended_at is null;
    get diagnostics v_closed_count = row_count;

    -- The completed-line constraint is immediate. Persist the punch timeline in
    -- the same row update that changes status so no invalid intermediate row
    -- can be observed by PostgreSQL.
    update public.work_order_lines
    set status = 'completed',
        cause = v_final_cause,
        correction = v_final_correction,
        hold_reason = null,
        punched_in_at = coalesce(
          (
            select min(seg.started_at)
            from public.work_order_line_labor_segments seg
            where seg.work_order_line_id = p_work_order_line_id
          ),
          v_line.punched_in_at
        ),
        punched_out_at = coalesce(
          (
            select max(seg.ended_at)
            from public.work_order_line_labor_segments seg
            where seg.work_order_line_id = p_work_order_line_id
              and seg.ended_at is not null
          ),
          v_line.punched_out_at,
          v_now
        ),
        updated_at = v_now
    where id = p_work_order_line_id;

  end if;

  select min(seg.started_at),
         max(seg.ended_at) filter (where seg.ended_at is not null),
         bool_or(seg.ended_at is null)
    into v_earliest, v_latest, v_has_open
  from public.work_order_line_labor_segments seg
  where seg.work_order_line_id = p_work_order_line_id;

  update public.work_order_lines
  set punched_in_at = coalesce(v_earliest, punched_in_at),
      punched_out_at = case
        when v_action = 'finish' then coalesce(v_latest, punched_out_at, v_now)
        when coalesce(v_has_open, false) then null
        else v_latest
      end,
      updated_at = v_now
  where id = p_work_order_line_id;

  select jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action', v_action,
    'shop_id', p_shop_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'technician_id', v_technician_profile_id,
    'shift_id', v_shift.id,
    'labor_segment_id', v_segment_id,
    'closed_segment_count', v_closed_count,
    'line', (
      select to_jsonb(wol)
      from public.work_order_lines wol
      where wol.id = p_work_order_line_id
    )
  ) into v_result;

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    coalesce(nullif(trim(p_event), ''), v_action),
    v_actor_auth_user_id,
    v_now,
    'work_order_line',
    p_work_order_line_id,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
      'shop_id', p_shop_id,
      'work_order_id', v_line.work_order_id,
      'technician_id', v_technician_profile_id,
      'shift_id', v_shift.id,
      'operation_key', p_operation_key
    )
  );

  insert into public.workforce_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id,
    work_order_id, work_order_line_id, result
  ) values (
    p_shop_id, 'job_punch:' || v_action, p_operation_key, v_actor_auth_user_id,
    v_line.work_order_id, p_work_order_line_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) from public, anon;
grant execute on function public.apply_job_punch_transition_atomic(
  uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,
  boolean,boolean,text,text,text,jsonb
) to authenticated, service_role;

comment on table copilot.completed_repair_learning_receipts is
  'Private durable lease and completion receipt for exactly-once completed-repair learning.';
comment on function public.claim_completed_repair_learning_atomic(
  uuid,uuid,uuid,text,uuid,timestamptz
) is
  'Claims one serialized completed-repair learning attempt for the current line revision.';
comment on function public.finish_completed_repair_learning_atomic(
  uuid,uuid,uuid,uuid,boolean,jsonb,timestamptz
) is
  'Completes or releases a completed-repair learning lease without affecting job completion.';

do $technician_completion_review_postcheck$
declare
  v_receipt_definition text;
  v_finish_definition text;
begin
  select pg_get_functiondef(
    'copilot.technician_has_bound_completion_receipt(uuid,uuid,text)'::regprocedure
  ) into v_receipt_definition;
  select pg_get_functiondef(
    'public.apply_job_punch_transition_atomic(uuid,uuid,text,uuid,uuid,text,boolean,timestamp with time zone,text,text,text,boolean,boolean,text,text,text,jsonb)'::regprocedure
  ) into v_finish_definition;

  if position('active_work_order_line_id = wok.work_order_line_id'
      in v_receipt_definition) = 0
  then
    raise exception 'Completion review postcheck failed: receipt recovery is not line-bound';
  end if;
  if (
    length(v_finish_definition)
    - length(replace(v_finish_definition, 'i.is_canonical', ''))
  ) / length('i.is_canonical') < 2
  then
    raise exception 'Completion review postcheck failed: inspection completion is not canonical-only';
  end if;
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'copilot'
      and relation.relname = 'completed_repair_learning_receipts'
      and relation.relrowsecurity
  ) then
    raise exception 'Completion review postcheck failed: learning receipts are not private/RLS protected';
  end if;
  if has_table_privilege(
    'authenticated',
    'copilot.completed_repair_learning_receipts',
    'SELECT'
  ) then
    raise exception 'Completion review postcheck failed: learning receipts are directly readable';
  end if;
  if has_function_privilege(
    'anon',
    'public.claim_completed_repair_learning_atomic(uuid,uuid,uuid,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.finish_completed_repair_learning_atomic(uuid,uuid,uuid,uuid,boolean,jsonb,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'Completion review postcheck failed: anonymous repair-learning execution remains';
  end if;
  if not exists (
    select 1
    from pg_trigger trigger
    where trigger.tgrelid = 'public.workforce_operation_keys'::regclass
      and trigger.tgname =
        'normalize_technician_copilot_completion_receipt_actor'
      and not trigger.tgisinternal
  ) then
    raise exception 'Completion review postcheck failed: legacy receipt normalizer is missing';
  end if;
  if exists (
    select 1
    from public.workforce_operation_keys receipt
    join public.profiles profile on profile.id = receipt.actor_user_id
    where receipt.shop_id = profile.shop_id
      and receipt.operation_name = 'job_punch:finish'
      and receipt.operation_key like 'technician-copilot:%'
      and profile.user_id is not null
      and profile.user_id is distinct from profile.id
  ) then
    raise exception 'Completion review postcheck failed: legacy profile-owned receipt remains';
  end if;
end
$technician_completion_review_postcheck$;

notify pgrst, 'reload schema';

commit;
