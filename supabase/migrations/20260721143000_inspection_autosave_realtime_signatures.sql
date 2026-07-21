begin;

-- Reinstall the canonical draft writer as a forward migration so every
-- environment receives the anchor-safe draft state, even when an older
-- function definition was cached during a previous deploy.
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
  v_now timestamptz := coalesce(p_at, now());
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using errcode = 'P0001',
      message = 'Authenticated actor does not match the inspection actor.';
  end if;

  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001',
      message = 'A stable operation key is required.';
  end if;

  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception using errcode = 'P0001',
      message = 'Inspection session payload must be a JSON object.';
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

  select wol.id, wol.work_order_id
    into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id
    and wol.shop_id = p_shop_id
  for update;

  if not found or v_line.work_order_id is null then
    raise exception using errcode = 'P0001',
      message = 'Work-order line not found for shop.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_user_id
      and p.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001',
      message = 'Actor is not a member of this shop.';
  end if;

  if exists (
    select 1
    from public.inspections i
    where i.work_order_line_id = p_work_order_line_id
      and i.shop_id = p_shop_id
      and coalesce(i.locked, false)
  ) then
    raise exception using errcode = 'P0001',
      message = 'Inspection is finalized and locked. Reopen is required before editing.';
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

  select i.id
    into v_inspection_id
  from public.inspections i
  where i.work_order_line_id = p_work_order_line_id
    and i.shop_id = p_shop_id
  order by i.updated_at desc nulls last, i.id desc
  limit 1
  for update;

  if found then
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
        finalized_at = null,
        finalized_by = null,
        updated_at = v_now
    where id = v_inspection_id
      and shop_id = p_shop_id
      and not coalesce(locked, false)
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
    raise exception using errcode = 'P0001',
      message = 'Inspection progress could not be persisted.';
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

-- Do not depend on an ON CONFLICT target that older production databases do
-- not have. Serialize one inspection/role pair and update the newest existing
-- signature, or insert the first one.
create or replace function public.sign_inspection(
  p_inspection_id uuid,
  p_role text,
  p_signed_name text,
  p_signature_image_path text default null,
  p_signature_hash text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_shop_id uuid;
  v_signature_id uuid;
  v_signed_name text := nullif(trim(p_signed_name), '');
  v_signature_image_path text := nullif(trim(p_signature_image_path), '');
  v_signature_hash text := nullif(trim(p_signature_hash), '');
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if p_role not in ('technician', 'customer', 'advisor') then
    raise exception using errcode = '22023', message = 'Unsupported signature role.';
  end if;

  select i.shop_id
    into v_shop_id
  from public.inspections i
  where i.id = p_inspection_id
  for update;

  if v_shop_id is null then
    raise exception using errcode = 'P0001', message = 'Inspection not found.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.shop_id = v_shop_id
  ) then
    raise exception using errcode = '42501',
      message = 'Inspection does not belong to your shop.';
  end if;

  if p_role = 'technician' then
    select
      coalesce(
        nullif(trim(p.full_name), ''),
        nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
      ),
      nullif(trim(p.tech_signature_path), ''),
      nullif(trim(p.tech_signature_hash), '')
      into v_signed_name, v_signature_image_path, v_signature_hash
    from public.profiles p
    where p.id = v_actor;

    if v_signed_name is null then
      raise exception using errcode = 'P0001',
        message = 'Add your full name to your profile before signing.';
    end if;

    if v_signature_image_path is null then
      raise exception using errcode = 'P0001',
        message = 'No saved technician signature. Add one in Tech Settings.';
    end if;
  elsif v_signed_name is null then
    raise exception using errcode = 'P0001', message = 'Signed name is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_inspection_id::text || ':' || p_role, 0)
  );

  select s.id
    into v_signature_id
  from public.inspection_signatures s
  where s.inspection_id = p_inspection_id
    and s.role = p_role
  order by s.signed_at desc, s.id desc
  limit 1
  for update;

  if found then
    update public.inspection_signatures
    set signed_by = v_actor,
        signed_name = v_signed_name,
        signature_image_path = v_signature_image_path,
        signature_hash = v_signature_hash,
        signed_at = now()
    where id = v_signature_id;
  else
    insert into public.inspection_signatures(
      inspection_id,
      role,
      signed_by,
      signed_name,
      signature_image_path,
      signature_hash,
      signed_at
    ) values (
      p_inspection_id,
      p_role,
      v_actor,
      v_signed_name,
      v_signature_image_path,
      v_signature_hash,
      now()
    );
  end if;

  update public.inspections
  set is_draft = false,
      completed = true,
      locked = true,
      status = 'completed',
      finalized_at = coalesce(finalized_at, now()),
      finalized_by = coalesce(finalized_by, v_actor),
      updated_at = now()
  where id = p_inspection_id;
end;
$$;

revoke all on function public.sign_inspection(uuid, text, text, text, text)
  from public;
grant execute on function public.sign_inspection(uuid, text, text, text, text)
  to authenticated, service_role;

-- Realtime is needed for another signed-in device to receive progress and lock
-- changes without polling. Add tables only when they are not already members.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inspection_sessions'
  ) then
    alter publication supabase_realtime add table public.inspection_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inspections'
  ) then
    alter publication supabase_realtime add table public.inspections;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
