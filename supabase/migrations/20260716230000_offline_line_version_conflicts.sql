begin;

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
  v_base_updated_at timestamptz;
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

  if nullif(trim(v_payload->>'baseUpdatedAt'), '') is not null then
    begin
      v_base_updated_at := (v_payload->>'baseUpdatedAt')::timestamptz;
    exception when invalid_datetime_format then
      raise exception using errcode = 'P0001', message = 'Invalid offline base version.';
    end;
    if v_line.updated_at is distinct from v_base_updated_at then
      raise exception using
        errcode = 'P0001',
        message = 'OFFLINE_VERSION_CONFLICT: this job changed on another device. Review the server state before retrying.';
    end if;
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

revoke all on function public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb) from public, anon;
grant execute on function public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb) to authenticated, service_role;

commit;
