begin;

create table if not exists public.offline_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  operation_key text not null,
  action_type text not null,
  payload_hash text not null,
  entity_type text,
  entity_id uuid,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (shop_id, operation_key)
);

create index if not exists offline_mutation_receipts_actor_idx
  on public.offline_mutation_receipts(actor_user_id, shop_id, completed_at desc);

alter table public.offline_mutation_receipts enable row level security;

drop policy if exists offline_mutation_receipts_actor_select
  on public.offline_mutation_receipts;
create policy offline_mutation_receipts_actor_select
  on public.offline_mutation_receipts
  for select
  to authenticated
  using (
    actor_user_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = offline_mutation_receipts.shop_id
    )
  );

create or replace function public.apply_offline_line_mutation_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_action_type text,
  p_work_order_line_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_role text;
  v_existing public.offline_mutation_receipts%rowtype;
  v_receipt_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_hash text := encode(digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex');
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Authenticated actor does not match the mutation actor.';
  end if;
  if nullif(trim(p_operation_key), '') is null or length(p_operation_key) > 240 then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if p_action_type not in ('update_work_order_line_notes', 'save_story_draft') then
    raise exception using errcode = 'P0001', message = 'Unsupported offline line mutation.';
  end if;

  select * into v_existing
  from public.offline_mutation_receipts r
  where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
  if found then
    if v_existing.action_type <> p_action_type or v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent', true, 'receipt_id', v_existing.id);
  end if;

  select lower(coalesce(p.role::text, '')) into v_role
  from public.profiles p
  where p.id = p_actor_user_id and p.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Actor is not available for this shop.';
  end if;

  select * into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id and wol.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;
  if lower(coalesce(v_line.status::text, '')) = 'completed' then
    raise exception using errcode = 'P0001', message = 'Work-order line is already completed.';
  end if;
  if v_role not in ('owner','admin','manager','advisor','service','lead_hand','lead hand','leadhand','foreman')
     and v_line.assigned_tech_id is distinct from p_actor_user_id
     and not exists (
       select 1 from public.work_order_line_technicians wolt
       where wolt.work_order_line_id = p_work_order_line_id
         and wolt.technician_id = p_actor_user_id
     ) then
    raise exception using errcode = 'P0001', message = 'Actor is not assigned to this work-order line.';
  end if;

  if p_action_type = 'update_work_order_line_notes' then
    if lower(coalesce(v_line.approval_state::text, '')) = 'approved' then
      raise exception using errcode = 'P0001', message = 'Approved job notes require review before editing.';
    end if;
    update public.work_order_lines
    set notes = coalesce(v_payload->>'notes', ''), updated_at = now()
    where id = p_work_order_line_id and shop_id = p_shop_id;
  else
    update public.work_order_lines
    set cause = coalesce(v_payload->>'cause', ''),
        correction = coalesce(v_payload->>'correction', ''),
        updated_at = now()
    where id = p_work_order_line_id and shop_id = p_shop_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action_type', p_action_type,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'completed_at', now()
  );

  insert into public.offline_mutation_receipts(
    shop_id, actor_user_id, operation_key, action_type, payload_hash,
    entity_type, entity_id, result
  ) values (
    p_shop_id, p_actor_user_id, p_operation_key, p_action_type, v_payload_hash,
    'work_order_line', p_work_order_line_id, v_result
  ) returning id into v_receipt_id;

  return v_result || jsonb_build_object('receipt_id', v_receipt_id);
exception
  when unique_violation then
    select * into v_existing
    from public.offline_mutation_receipts r
    where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
    if found and v_existing.action_type = p_action_type and v_existing.payload_hash = v_payload_hash then
      return v_existing.result || jsonb_build_object('idempotent', true, 'receipt_id', v_existing.id);
    end if;
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
end;
$$;

create or replace function public.record_offline_photo_receipt_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_work_order_line_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_role text;
  v_existing public.offline_mutation_receipts%rowtype;
  v_receipt_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_hash text := encode(digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex');
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Authenticated actor does not match the mutation actor.';
  end if;
  if nullif(trim(p_operation_key), '') is null or length(p_operation_key) > 240 then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select * into v_existing
  from public.offline_mutation_receipts r
  where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
  if found then
    if v_existing.action_type <> 'upload_job_photo' or v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent', true, 'receipt_id', v_existing.id);
  end if;

  select lower(coalesce(p.role::text, '')) into v_role
  from public.profiles p
  where p.id = p_actor_user_id and p.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Actor is not available for this shop.';
  end if;

  select wol.work_order_id, wol.shop_id, wol.assigned_tech_id into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id and wol.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;
  if v_role not in ('owner','admin','manager','advisor','service','lead_hand','lead hand','leadhand','foreman')
     and v_line.assigned_tech_id is distinct from p_actor_user_id
     and not exists (
       select 1 from public.work_order_line_technicians wolt
       where wolt.work_order_line_id = p_work_order_line_id
         and wolt.technician_id = p_actor_user_id
     ) then
    raise exception using errcode = 'P0001', message = 'Actor is not assigned to this work-order line.';
  end if;
  if nullif(v_payload->>'path', '') is null
     or position('wo/' || v_line.work_order_id::text || '/lines/' || p_work_order_line_id::text || '/' in (v_payload->>'path')) <> 1 then
    raise exception using errcode = 'P0001', message = 'Photo storage path does not match the work-order line.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action_type', 'upload_job_photo',
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'path', v_payload->>'path',
    'completed_at', now()
  );

  insert into public.offline_mutation_receipts(
    shop_id, actor_user_id, operation_key, action_type, payload_hash,
    entity_type, entity_id, result
  ) values (
    p_shop_id, p_actor_user_id, p_operation_key, 'upload_job_photo', v_payload_hash,
    'work_order_line', p_work_order_line_id, v_result
  ) returning id into v_receipt_id;

  return v_result || jsonb_build_object('receipt_id', v_receipt_id);
exception
  when unique_violation then
    select * into v_existing
    from public.offline_mutation_receipts r
    where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
    if found and v_existing.action_type = 'upload_job_photo' and v_existing.payload_hash = v_payload_hash then
      return v_existing.result || jsonb_build_object('idempotent', true, 'receipt_id', v_existing.id);
    end if;
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
end;
$$;

create or replace function public.apply_offline_shift_punch_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_shift_id uuid,
  p_event_type text,
  p_timestamp timestamptz,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.tech_shifts%rowtype;
  v_role text;
  v_event text := lower(trim(coalesce(p_event_type, '')));
  v_payload jsonb;
  v_payload_hash text;
  v_existing public.offline_mutation_receipts%rowtype;
  v_receipt_id uuid;
  v_punch_id uuid;
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Authenticated actor does not match the mutation actor.';
  end if;
  if nullif(trim(p_operation_key), '') is null or length(p_operation_key) > 240 then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if v_event not in ('start_shift','end_shift','break_start','break_end','lunch_start','lunch_end') then
    raise exception using errcode = 'P0001', message = 'Invalid shift punch event type.';
  end if;

  v_payload := jsonb_build_object(
    'shift_id', p_shift_id,
    'event_type', v_event,
    'timestamp', p_timestamp,
    'note', nullif(trim(coalesce(p_note, '')), '')
  );
  v_payload_hash := encode(digest(v_payload::text, 'sha256'), 'hex');

  select * into v_existing
  from public.offline_mutation_receipts r
  where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
  if found then
    if v_existing.action_type <> 'shift:punch-event' or v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent', true, 'receipt_id', v_existing.id);
  end if;

  select lower(coalesce(p.role::text, '')) into v_role
  from public.profiles p
  where p.id = p_actor_user_id and p.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Actor is not available for this shop.';
  end if;

  select * into v_shift
  from public.tech_shifts ts
  where ts.id = p_shift_id and ts.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Shift not found for shop.';
  end if;
  if v_shift.user_id <> p_actor_user_id
     and v_role not in ('owner','admin','manager','advisor','lead_hand','lead hand','leadhand','foreman') then
    raise exception using errcode = 'P0001', message = 'Actor cannot add a punch for this shift.';
  end if;

  if v_event = 'end_shift' and v_shift.user_id is not null then
    perform public.pause_all_active_technician_labor_atomic(
      p_shop_id,
      v_shift.user_id,
      p_actor_user_id,
      p_shop_id::text || ':offline-shift:' || p_operation_key,
      p_timestamp,
      'shift_end',
      'job_stopped_at_end_day',
      null,
      jsonb_build_object('source', 'offline_shift_punch')
    );
  end if;

  insert into public.punch_events(
    shift_id, user_id, profile_id, event_type, timestamp, note
  ) values (
    p_shift_id,
    coalesce(v_shift.user_id, p_actor_user_id),
    coalesce(v_shift.user_id, p_actor_user_id),
    v_event::public.punch_event_type,
    p_timestamp,
    nullif(trim(coalesce(p_note, '')), '')
  ) returning id into v_punch_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action_type', 'shift:punch-event',
    'shift_id', p_shift_id,
    'punch_event_id', v_punch_id,
    'completed_at', now()
  );

  insert into public.offline_mutation_receipts(
    shop_id, actor_user_id, operation_key, action_type, payload_hash,
    entity_type, entity_id, result
  ) values (
    p_shop_id, p_actor_user_id, p_operation_key, 'shift:punch-event', v_payload_hash,
    'shift', p_shift_id, v_result
  ) returning id into v_receipt_id;

  return v_result || jsonb_build_object('receipt_id', v_receipt_id);
exception
  when unique_violation then
    select * into v_existing
    from public.offline_mutation_receipts r
    where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
    if found and v_existing.action_type = 'shift:punch-event' and v_existing.payload_hash = v_payload_hash then
      return v_existing.result || jsonb_build_object('idempotent', true, 'receipt_id', v_existing.id);
    end if;
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
end;
$$;

revoke all on function public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb) from public, anon;
revoke all on function public.record_offline_photo_receipt_atomic(uuid,uuid,text,uuid,jsonb) from public, anon;
revoke all on function public.apply_offline_shift_punch_atomic(uuid,uuid,text,uuid,text,timestamptz,text) from public, anon;
grant execute on function public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb) to authenticated, service_role;
grant execute on function public.record_offline_photo_receipt_atomic(uuid,uuid,text,uuid,jsonb) to authenticated, service_role;
grant execute on function public.apply_offline_shift_punch_atomic(uuid,uuid,text,uuid,text,timestamptz,text) to authenticated, service_role;

do $$
begin
  if to_regclass('public.offline_mutation_receipts') is null then
    raise exception 'offline_mutation_receipts table was not created';
  end if;
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'offline_mutation_receipts'
      and c.relrowsecurity
  ) then
    raise exception 'offline_mutation_receipts RLS was not enabled';
  end if;
  if to_regprocedure('public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb)') is null
     or to_regprocedure('public.record_offline_photo_receipt_atomic(uuid,uuid,text,uuid,jsonb)') is null
     or to_regprocedure('public.apply_offline_shift_punch_atomic(uuid,uuid,text,uuid,text,timestamptz,text)') is null then
    raise exception 'offline mutation receipt functions were not created';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
