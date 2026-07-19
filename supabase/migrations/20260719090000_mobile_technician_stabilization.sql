begin;

-- pgcrypto is installed in the Supabase `extensions` schema. The offline
-- receipt functions intentionally pin their search path, so include that
-- schema instead of relying on the caller's session search path.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter function public.apply_offline_line_mutation_atomic(
  uuid, uuid, text, text, uuid, jsonb
) set search_path = public, extensions;

alter function public.record_offline_photo_receipt_atomic(
  uuid, uuid, text, uuid, jsonb
) set search_path = public, extensions;

alter function public.apply_offline_shift_punch_atomic(
  uuid, uuid, text, uuid, text, timestamptz, text
) set search_path = public, extensions;

-- Existing production databases do not consistently have a unique constraint
-- on inspection_sessions.work_order_line_id or inspections.work_order_line_id.
-- Serialize on the canonical work-order line and perform deterministic
-- select/update-or-insert operations rather than relying on ON CONFLICT.
create or replace function public.save_inspection_progress_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_session jsonb,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_existing jsonb;
  v_session_id uuid;
  v_inspection_id uuid;
  v_inspection_locked boolean := false;
  v_now timestamptz := coalesce(p_at, now());
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Authenticated actor does not match the inspection actor.';
  end if;

  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Inspection session payload must be a JSON object.';
  end if;

  select mok.result
    into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'save_inspection_progress'
    and mok.operation_key = p_operation_key;

  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select wol.id, wol.work_order_id, wol.shop_id
    into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id
    and wol.shop_id = p_shop_id
  for update;

  if not found or v_line.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_user_id
      and p.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Actor is not a member of this shop.';
  end if;

  -- A finalized duplicate must still protect the line from draft edits.
  if exists (
    select 1
    from public.inspections i
    where i.work_order_line_id = p_work_order_line_id
      and i.shop_id = p_shop_id
      and coalesce(i.locked, false) = true
  ) then
    raise exception using errcode = 'P0001', message = 'Inspection is finalized and locked. Reopen is required before editing.';
  end if;

  select s.id
    into v_session_id
  from public.inspection_sessions s
  where s.work_order_line_id = p_work_order_line_id
  order by s.updated_at desc nulls last, s.id desc
  limit 1
  for update;

  if found then
    update public.inspection_sessions
    set work_order_id = v_line.work_order_id,
        user_id = p_actor_user_id,
        state = p_session,
        updated_at = v_now
    where id = v_session_id;
  else
    insert into public.inspection_sessions(
      work_order_id,
      work_order_line_id,
      user_id,
      state,
      updated_at
    ) values (
      v_line.work_order_id,
      p_work_order_line_id,
      p_actor_user_id,
      p_session,
      v_now
    )
    returning id into v_session_id;
  end if;

  select i.id, coalesce(i.locked, false)
    into v_inspection_id, v_inspection_locked
  from public.inspections i
  where i.work_order_line_id = p_work_order_line_id
    and i.shop_id = p_shop_id
  order by i.updated_at desc nulls last, i.id desc
  limit 1
  for update;

  if found then
    if v_inspection_locked then
      raise exception using errcode = 'P0001', message = 'Inspection is finalized and locked. Reopen is required before editing.';
    end if;

    update public.inspections
    set work_order_id = v_line.work_order_id,
        work_order_line_id = p_work_order_line_id,
        shop_id = p_shop_id,
        user_id = p_actor_user_id,
        summary = p_session,
        is_draft = true,
        completed = false,
        locked = false,
        status = 'draft',
        updated_at = v_now
    where id = v_inspection_id
      and shop_id = p_shop_id
    returning id into v_inspection_id;
  else
    insert into public.inspections(
      work_order_id,
      work_order_line_id,
      shop_id,
      user_id,
      summary,
      is_draft,
      completed,
      locked,
      status,
      updated_at
    ) values (
      v_line.work_order_id,
      p_work_order_line_id,
      p_shop_id,
      p_actor_user_id,
      p_session,
      true,
      false,
      false,
      'draft',
      v_now
    )
    returning id into v_inspection_id;
  end if;

  if v_inspection_id is null then
    raise exception using errcode = 'P0001', message = 'Inspection progress could not be persisted.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'inspection_id', v_inspection_id,
    'inspection_session_id', v_session_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'saved_at', v_now,
    'idempotent', false
  );

  insert into public.mobile_operation_keys(
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    p_shop_id,
    'save_inspection_progress',
    p_operation_key,
    p_actor_user_id,
    v_line.work_order_id,
    p_work_order_line_id,
    v_result
  );

  return v_result;
exception
  when unique_violation then
    select mok.result
      into v_existing
    from public.mobile_operation_keys mok
    where mok.shop_id = p_shop_id
      and mok.operation_name = 'save_inspection_progress'
      and mok.operation_key = p_operation_key;

    if found then
      return v_existing || jsonb_build_object('idempotent', true);
    end if;

    raise;
end;
$$;

revoke all on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public;

grant execute on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
