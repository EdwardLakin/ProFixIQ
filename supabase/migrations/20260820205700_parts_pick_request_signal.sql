begin;

alter table public.part_requests
  add column if not exists pick_requested_at timestamptz,
  add column if not exists pick_requested_by uuid,
  add column if not exists pick_request_source text;

comment on column public.part_requests.pick_requested_at is
  'Latest operational request for Parts to pick/stage the approved parts for this repair line.';
comment on column public.part_requests.pick_requested_by is
  'Profile that most recently requested Parts to pick/stage this request.';
comment on column public.part_requests.pick_request_source is
  'Operational source of the latest pick request, such as manual or job_start.';

create index if not exists idx_part_requests_shop_pick_requested
  on public.part_requests (shop_id, pick_requested_at desc)
  where pick_requested_at is not null;

-- Preview branches may have observed an earlier draft of this feature. Remove
-- only the obsolete runtime signature and trigger bindings before installing
-- the final forward-compatible contract.
drop trigger if exists trg_parts_request_pick_on_job_start
  on public.work_order_line_labor_segments;
drop trigger if exists trg_parts_resolve_pick_request_when_ready
  on public.part_request_items;
drop trigger if exists trg_parts_reconcile_pick_request_from_item
  on public.part_request_items;
drop trigger if exists trg_parts_reconcile_pick_request_from_request
  on public.part_requests;

drop function if exists public.trg_parts_resolve_pick_request_when_ready();
drop function if exists public.parts_upsert_pick_request_notification(
  uuid, uuid, text, uuid, uuid, uuid, text, numeric, numeric, numeric
);
drop function if exists public.parts_request_pick_for_line_atomic(uuid, uuid, text);

create or replace function public.parts_upsert_pick_request_notification(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_work_order_line_id uuid,
  p_request_id uuid,
  p_source text,
  p_required numeric,
  p_staged numeric,
  p_remaining numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_order_label text;
  v_fingerprint text;
  v_now timestamptz := now();
begin
  if to_regclass('public.assistant_notifications') is null then
    return;
  end if;

  select coalesce(nullif(trim(work_order.custom_id), ''), 'Work order')
    into v_work_order_label
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id;

  v_fingerprint := 'parts-pick-request::' || p_request_id::text;

  execute $sql$
    insert into public.assistant_notifications (
      shop_id, user_id, role, source, fingerprint, code, level,
      title, message, href, entity_type, entity_id, status, metadata,
      first_seen_at, last_seen_at, resolved_at, updated_at
    ) values (
      $1, null, 'parts', 'parts_pick_workflow', $2,
      'parts_pick_requested', 'warning', 'Parts pick requested',
      format('%s needs %s approved part quantity picked/staged now.', $3, $8),
      '/parts/requests/' || $4::text,
      'part_request',
      $4,
      'active',
      jsonb_build_object(
        'workOrderId', $5,
        'workOrderLineId', $6,
        'requestId', $4,
        'source', $7,
        'requiredQty', $9,
        'stagedQty', $10,
        'remainingQty', $8
      ),
      $11, $11, null, $11
    )
    on conflict (shop_id, fingerprint)
    do update set
      user_id = excluded.user_id,
      role = excluded.role,
      source = excluded.source,
      code = excluded.code,
      level = excluded.level,
      title = excluded.title,
      message = excluded.message,
      href = excluded.href,
      metadata = excluded.metadata,
      status = 'active',
      last_seen_at = excluded.last_seen_at,
      resolved_at = null,
      updated_at = excluded.updated_at
  $sql$
  using
    p_shop_id,
    v_fingerprint,
    coalesce(v_work_order_label, 'Work order'),
    p_request_id,
    p_work_order_id,
    p_work_order_line_id,
    p_source,
    p_remaining,
    p_required,
    p_staged,
    v_now;
end;
$$;

revoke all on function public.parts_upsert_pick_request_notification(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.parts_upsert_pick_request_notification(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric
) to service_role;

create or replace function public.parts_reconcile_pick_request_notification(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.part_requests%rowtype;
  v_has_actionable boolean := false;
begin
  if p_request_id is null then
    return;
  end if;

  select request.* into v_request
  from public.part_requests request
  where request.id = p_request_id;

  if not found then
    return;
  end if;

  if lower(coalesce(v_request.status::text, 'requested')) not in (
    'fulfilled', 'returned', 'rejected', 'cancelled', 'canceled', 'deferred'
  ) and public.parts_request_is_operationally_released(v_request.id) then
    select exists (
      select 1
      from public.part_request_items item
      where item.request_id = v_request.id
        and item.shop_id = v_request.shop_id
        and lower(coalesce(item.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'returned'
        )
        and greatest(
          greatest(
            coalesce(item.qty_approved, 0),
            coalesce(item.qty_requested, 0),
            coalesce(item.qty, 0),
            0
          ) - (
            coalesce(item.qty_reserved, 0)
            + greatest(
              coalesce(item.qty_consumed, 0) - coalesce(item.qty_returned, 0),
              0
            )
          ),
          0
        ) > 0
    ) into v_has_actionable;
  end if;

  if not v_has_actionable
     and to_regclass('public.assistant_notifications') is not null then
    execute $sql$
      update public.assistant_notifications notification
      set status = 'resolved',
          resolved_at = coalesce(notification.resolved_at, now()),
          last_seen_at = now(),
          updated_at = now()
      where notification.shop_id = $1
        and notification.code = 'parts_pick_requested'
        and notification.entity_type = 'part_request'
        and notification.entity_id = $2
        and notification.source in ('parts_pick_workflow', 'parts_workflow')
        and lower(coalesce(notification.status, 'active')) in (
          'active', 'open', 'acknowledged'
        )
    $sql$ using v_request.shop_id, v_request.id;
  end if;
end;
$$;

revoke all on function public.parts_reconcile_pick_request_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.parts_reconcile_pick_request_notification(uuid)
  to service_role;

create or replace function public.parts_request_pick_for_line_atomic(
  p_work_order_line_id uuid,
  p_actor_user_id uuid default null,
  p_source text default 'manual',
  p_operation_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_request public.part_requests%rowtype;
  v_operation public.parts_operation_keys;
  v_actor_profile_id uuid;
  v_source text := lower(coalesce(nullif(trim(p_source), ''), 'manual'));
  v_profile_id uuid;
  v_role text;
  v_work_order_status text;
  v_required numeric := 0;
  v_staged numeric := 0;
  v_remaining numeric := 0;
  v_total_required numeric := 0;
  v_total_staged numeric := 0;
  v_total_remaining numeric := 0;
  v_active_count integer := 0;
  v_released_count integer := 0;
  v_requested_count integer := 0;
  v_request_ids jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_result jsonb;
begin
  if p_work_order_line_id is null then
    raise exception using errcode = '22023', message = 'PARTS_PICK_LINE_REQUIRED';
  end if;

  select line.* into v_line
  from public.work_order_lines line
  where line.id = p_work_order_line_id
  for update;

  if not found or v_line.shop_id is null or v_line.work_order_id is null then
    raise exception using errcode = 'P0002', message = 'PARTS_PICK_LINE_NOT_FOUND';
  end if;

  if auth.role() <> 'service_role' then
    if auth.uid() is null then
      raise exception using errcode = '42501', message = 'Authentication required.';
    end if;

    select
      profile.id,
      public.canonical_shop_membership_role(profile.role::text)
    into v_profile_id, v_role
    from public.profiles profile
    where profile.shop_id = v_line.shop_id
      and (profile.id = auth.uid() or profile.user_id = auth.uid())
    order by case when profile.id = auth.uid() then 0 else 1 end
    limit 1;

    if v_profile_id is null or v_role not in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
      'mechanic', 'lead_hand', 'foreman', 'dispatcher'
    ) then
      raise exception using errcode = '42501',
        message = 'Parts pick request is not allowed for this user.';
    end if;

    if p_actor_user_id is not null
       and p_actor_user_id is distinct from auth.uid()
       and p_actor_user_id is distinct from v_profile_id then
      raise exception using errcode = '42501', message = 'Parts pick actor mismatch.';
    end if;

    if v_role = 'mechanic'
       and not exists (
         select 1
         from public.work_order_line_technicians assignment
         where assignment.work_order_line_id = v_line.id
           and assignment.technician_id = v_profile_id
       )
       and v_line.assigned_tech_id is distinct from v_profile_id then
      raise exception using errcode = '42501',
        message = 'Technician is not assigned to this repair line.';
    end if;

    -- Keep this audit field in the profiles identity domain.
    v_actor_profile_id := v_profile_id;
  elsif p_actor_user_id is not null then
    select profile.id
      into v_actor_profile_id
    from public.profiles profile
    where profile.shop_id = v_line.shop_id
      and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
    order by case when profile.id = p_actor_user_id then 0 else 1 end
    limit 1;

    if v_actor_profile_id is null then
      raise exception using errcode = '42501',
        message = 'Parts pick actor is not a shop profile.';
    end if;
  end if;

  if coalesce(trim(p_operation_key), '') = '' then
    raise exception using errcode = '22023',
      message = 'A stable operation key is required.';
  end if;
  if length(p_operation_key) > 300 then
    raise exception using errcode = '22023',
      message = 'Parts pick operation key is too long.';
  end if;
  if position(v_line.shop_id::text || ':' in p_operation_key) <> 1 then
    raise exception using errcode = '22023',
      message = 'Parts pick operation key must be scoped to its shop.';
  end if;

  -- Read the durable receipt before lifecycle decisions so a replay returns the
  -- original result even when request or repair state has since changed.
  v_operation := public.parts_begin_operation(
    v_line.shop_id,
    p_operation_key,
    'request_parts_pick',
    'work_order_line',
    v_line.id,
    case when auth.role() = 'service_role' then null else auth.uid() end
  );
  if v_operation.completed_at is not null then
    return coalesce(v_operation.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  select lower(coalesce(work_order.status::text, ''))
    into v_work_order_status
  from public.work_orders work_order
  where work_order.id = v_line.work_order_id
    and work_order.shop_id = v_line.shop_id;

  if lower(coalesce(v_line.status::text, '')) in (
      'completed', 'ready_to_invoice', 'invoiced', 'voided',
      'cancelled', 'canceled', 'closed'
    )
    or coalesce(v_work_order_status, '') in (
      'completed', 'ready_to_invoice', 'invoiced', 'voided',
      'cancelled', 'canceled', 'closed'
    ) then
    raise exception using errcode = '55000',
      message = 'Parts pick request is not allowed for a terminal repair.';
  end if;

  for v_request in
    select request.*
    from public.part_requests request
    where request.shop_id = v_line.shop_id
      and request.work_order_id = v_line.work_order_id
      and request.job_id = v_line.id
      and lower(coalesce(request.status::text, 'requested')) not in (
        'fulfilled', 'returned', 'rejected', 'cancelled', 'canceled', 'deferred'
      )
    order by request.created_at, request.id
    for update
  loop
    v_active_count := v_active_count + 1;

    if not public.parts_request_is_operationally_released(v_request.id) then
      continue;
    end if;
    v_released_count := v_released_count + 1;

    select
      coalesce(sum(greatest(
        coalesce(item.qty_approved, 0),
        coalesce(item.qty_requested, 0),
        coalesce(item.qty, 0),
        0
      )), 0),
      coalesce(sum(greatest(
        greatest(
          coalesce(item.qty_approved, 0),
          coalesce(item.qty_requested, 0),
          coalesce(item.qty, 0),
          0
        ) - (
          coalesce(item.qty_reserved, 0)
          + greatest(
            coalesce(item.qty_consumed, 0) - coalesce(item.qty_returned, 0),
            0
          )
        ),
        0
      )), 0)
    into v_required, v_remaining
    from public.part_request_items item
    where item.request_id = v_request.id
      and item.shop_id = v_request.shop_id
      and lower(coalesce(item.status::text, 'requested')) not in (
        'cancelled', 'canceled', 'rejected', 'returned'
      );

    v_staged := greatest(v_required - v_remaining, 0);
    v_total_required := v_total_required + v_required;
    v_total_staged := v_total_staged + v_staged;
    v_total_remaining := v_total_remaining + v_remaining;

    if v_required <= 0 or v_remaining <= 0 then
      perform public.parts_reconcile_pick_request_notification(v_request.id);
      continue;
    end if;

    update public.part_requests request
    set pick_requested_at = v_now,
        pick_requested_by = v_actor_profile_id,
        pick_request_source = v_source
    where request.id = v_request.id;

    perform public.parts_upsert_pick_request_notification(
      v_line.shop_id,
      v_line.work_order_id,
      v_line.id,
      v_request.id,
      v_source,
      v_required,
      v_staged,
      v_remaining
    );

    v_requested_count := v_requested_count + 1;
    v_request_ids := v_request_ids || jsonb_build_array(v_request.id);
  end loop;

  if v_active_count = 0 then
    v_result := jsonb_build_object(
      'ok', true,
      'requested', false,
      'reason', 'no_active_parts_request'
    );
  elsif v_released_count = 0 then
    v_result := jsonb_build_object(
      'ok', true,
      'requested', false,
      'reason', 'parts_not_approved'
    );
  elsif v_requested_count = 0 then
    v_result := jsonb_build_object(
      'ok', true,
      'requested', false,
      'reason', 'already_staged',
      'required', v_total_required,
      'staged', v_total_staged,
      'remaining', v_total_remaining
    );
  else
    v_result := jsonb_build_object(
      'ok', true,
      'requested', true,
      'idempotent', false,
      'requestIds', v_request_ids,
      'requestCount', v_requested_count,
      'required', v_total_required,
      'staged', v_total_staged,
      'remaining', v_total_remaining,
      'source', v_source
    );
  end if;

  return public.parts_complete_operation(v_operation.id, v_result);
end;
$$;

revoke all on function public.parts_request_pick_for_line_atomic(
  uuid, uuid, text, text
) from public, anon;
grant execute on function public.parts_request_pick_for_line_atomic(
  uuid, uuid, text, text
) to authenticated, service_role;

create or replace function public.trg_parts_request_pick_on_job_start()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid;
begin
  -- Historical/backfill/correction rows are not live start/resume signals.
  if new.work_order_line_id is null
     or new.ended_at is not null
     or lower(coalesce(new.source::text, '')) in (
       'legacy_line_backfill', 'backfill', 'admin_correction', 'correction'
     ) then
    return new;
  end if;

  select line.shop_id into v_shop_id
  from public.work_order_lines line
  where line.id = new.work_order_line_id;

  if v_shop_id is null then
    return new;
  end if;

  perform public.parts_request_pick_for_line_atomic(
    new.work_order_line_id,
    new.technician_id,
    'job_start',
    v_shop_id::text || ':request-pick:job-start:' || new.id::text
  );

  return new;
exception when others then
  -- A notification-side problem must never strand a technician punch.
  raise warning 'parts pick signal failed for labor segment %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.trg_parts_request_pick_on_job_start()
  from public, anon, authenticated;
grant execute on function public.trg_parts_request_pick_on_job_start()
  to service_role;

create or replace function public.trg_parts_reconcile_pick_request_from_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.parts_reconcile_pick_request_notification(
    coalesce(new.request_id, old.request_id)
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.trg_parts_reconcile_pick_request_from_item()
  from public, anon, authenticated;
grant execute on function public.trg_parts_reconcile_pick_request_from_item()
  to service_role;

create or replace function public.trg_parts_reconcile_pick_request_from_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.parts_reconcile_pick_request_notification(new.id);
  return new;
end;
$$;

revoke all on function public.trg_parts_reconcile_pick_request_from_request()
  from public, anon, authenticated;
grant execute on function public.trg_parts_reconcile_pick_request_from_request()
  to service_role;

create trigger trg_parts_request_pick_on_job_start
after insert on public.work_order_line_labor_segments
for each row
execute function public.trg_parts_request_pick_on_job_start();

create trigger trg_parts_reconcile_pick_request_from_item
after insert or update of qty_reserved, qty_consumed, qty_returned, qty_approved,
  qty_requested, qty, status or delete
on public.part_request_items
for each row
execute function public.trg_parts_reconcile_pick_request_from_item();

create trigger trg_parts_reconcile_pick_request_from_request
after update of status on public.part_requests
for each row
execute function public.trg_parts_reconcile_pick_request_from_request();

-- Converge any notification rows created by preview-only drafts without making
-- the optional projection a clean-replay dependency.
do $do$
begin
  if to_regclass('public.assistant_notifications') is not null then
    execute $sql$
      update public.assistant_notifications notification
      set source = 'parts_pick_workflow',
          status = case
            when notification.fingerprint like 'parts-pick-request::%::%'
              then 'resolved'
            else notification.status
          end,
          resolved_at = case
            when notification.fingerprint like 'parts-pick-request::%::%'
              then coalesce(notification.resolved_at, now())
            else notification.resolved_at
          end,
          updated_at = now()
      where notification.code = 'parts_pick_requested'
        and notification.source in ('parts_workflow', 'parts_pick_workflow')
    $sql$;
  end if;
end;
$do$;

commit;
