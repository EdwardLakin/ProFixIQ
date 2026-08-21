begin;

-- Task-specific shared-contract approval for PR #1492 is recorded in the PR
-- conversation. This forward migration hardens the already-landed pick signal
-- without rewriting the preview-applied 20260820205700 migration.

create schema if not exists private;

-- Move the four-argument implementation behind a non-browser schema so callers
-- cannot choose the audit source or impersonate the actor identity.
do $do$
begin
  if to_regprocedure(
    'private.parts_request_pick_for_line_internal(uuid,uuid,text,text)'
  ) is null then
    if to_regprocedure(
      'public.parts_request_pick_for_line_atomic(uuid,uuid,text,text)'
    ) is null then
      raise exception 'Expected four-argument Parts pick implementation is missing.';
    end if;

    alter function public.parts_request_pick_for_line_atomic(
      uuid, uuid, text, text
    ) set schema private;

    alter function private.parts_request_pick_for_line_atomic(
      uuid, uuid, text, text
    ) rename to parts_request_pick_for_line_internal;
  end if;
end;
$do$;

revoke all on function private.parts_request_pick_for_line_internal(
  uuid, uuid, text, text
) from public, anon, authenticated, service_role;

-- Preserve the existing public call shape for compatibility, but make actor and
-- source compatibility-only inputs. Browser/manual callers cannot choose either
-- value: actor identity comes from auth.uid() and the source is always manual.
create or replace function public.parts_request_pick_for_line_atomic(
  p_work_order_line_id uuid,
  p_actor_user_id uuid default null,
  p_source text default 'manual',
  p_operation_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  -- p_actor_user_id and p_source are intentionally ignored. Keeping the legacy
  -- argument shape avoids breaking existing callers while removing their ability
  -- to forge the audit identity or label a manual request as job_start.
  return private.parts_request_pick_for_line_internal(
    p_work_order_line_id,
    auth.uid(),
    'manual',
    p_operation_key
  );
end;
$$;

revoke all on function public.parts_request_pick_for_line_atomic(
  uuid, uuid, text, text
) from public, anon;
grant execute on function public.parts_request_pick_for_line_atomic(
  uuid, uuid, text, text
) to authenticated;

-- Reconcile both directions. A previously resolved pick signal must become
-- active again when a return or approved-quantity increase creates new work.
-- Fulfilled/returned parent rows are intentionally re-evaluated from current
-- item quantities; only denied/cancelled/deferred work remains terminal here.
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
  v_required numeric := 0;
  v_remaining numeric := 0;
  v_staged numeric := 0;
  v_source text := 'manual';
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

  v_source := case
    when lower(coalesce(v_request.pick_request_source, '')) = 'job_start'
      then 'job_start'
    else 'manual'
  end;

  if v_request.pick_requested_at is not null
     and lower(coalesce(v_request.status::text, 'requested')) not in (
       'rejected', 'cancelled', 'canceled', 'deferred'
     )
     and public.parts_request_is_operationally_released(v_request.id) then
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
        'cancelled', 'canceled', 'rejected'
      );

    v_staged := greatest(v_required - v_remaining, 0);
    v_has_actionable :=
      v_request.work_order_id is not null
      and v_request.job_id is not null
      and v_required > 0
      and v_remaining > 0;
  end if;

  if v_has_actionable then
    -- Refresh the durable signal timestamp so a reactivated request is surfaced
    -- as current work even if the optional Agent projection is unavailable.
    update public.part_requests request
    set pick_requested_at = now(),
        pick_request_source = v_source
    where request.id = v_request.id;

    perform public.parts_upsert_pick_request_notification(
      v_request.shop_id,
      v_request.work_order_id,
      v_request.job_id,
      v_request.id,
      v_source,
      v_required,
      v_staged,
      v_remaining
    );
    return;
  end if;

  if to_regclass('public.assistant_notifications') is not null then
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

-- The labor-start path is the only trusted caller allowed to label a signal as
-- job_start. Historical/closed correction rows remain excluded.
create or replace function public.trg_parts_request_pick_on_job_start()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shop_id uuid;
begin
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

  perform private.parts_request_pick_for_line_internal(
    new.work_order_line_id,
    new.technician_id,
    'job_start',
    v_shop_id::text || ':request-pick:job-start:' || new.id::text
  );

  return new;
exception when others then
  -- Pick delivery must not strand the canonical punch path.
  raise warning 'parts pick signal failed for labor segment %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.trg_parts_request_pick_on_job_start()
  from public, anon, authenticated;
grant execute on function public.trg_parts_request_pick_on_job_start()
  to service_role;

commit;
