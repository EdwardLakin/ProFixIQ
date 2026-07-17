begin;

-- Re-apply the parts draft materializer so production databases that already
-- ran 20260717100000 accept the canonical legacy `lead` role alias.
create or replace function public.materialize_offline_parts_request_draft_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_work_order_id uuid,
  p_work_order_line_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.offline_mutation_receipts%rowtype;
  v_role text;
  v_request_id uuid;
  v_item jsonb;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_hash text := encode(digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex');
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Authenticated actor does not match the parts draft actor.';
  end if;
  if nullif(trim(p_operation_key), '') is null or length(p_operation_key) > 240 then
    raise exception using errcode = 'P0001', message = 'A stable idempotency key is required.';
  end if;

  select * into v_existing
  from public.offline_mutation_receipts r
  where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
  if found then
    if v_existing.action_type <> 'materialize_parts_request_draft' or v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different parts draft data.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent', true);
  end if;

  select lower(coalesce(p.role::text, '')) into v_role
  from public.profiles p
  where p.id = p_actor_user_id and p.shop_id = p_shop_id;
  if not found or v_role not in (
    'owner','admin','manager','advisor','service','parts','mechanic',
    'technician','tech','lead_hand','lead hand','leadhand','lead','foreman'
  ) then
    raise exception using errcode = 'P0001', message = 'Actor is not allowed to request parts for this shop.';
  end if;
  if not exists (
    select 1 from public.work_orders wo
    where wo.id = p_work_order_id and wo.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if not exists (
    select 1 from public.work_order_lines wol
    where wol.id = p_work_order_line_id
      and wol.work_order_id = p_work_order_id
      and wol.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for this work order and shop.';
  end if;
  if v_role in ('mechanic','technician','tech') and not exists (
    select 1 from public.work_order_lines wol
    where wol.id = p_work_order_line_id
      and (
        wol.assigned_tech_id = p_actor_user_id
        or wol.assigned_to = p_actor_user_id
        or exists (
          select 1 from public.work_order_line_technicians wolt
          where wolt.work_order_line_id = wol.id
            and wolt.technician_id = p_actor_user_id
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'Technician is not assigned to this work-order line.';
  end if;
  if jsonb_typeof(v_payload->'items') <> 'array'
     or jsonb_array_length(v_payload->'items') < 1
     or jsonb_array_length(v_payload->'items') > 100 then
    raise exception using errcode = 'P0001', message = 'Parts draft requires between 1 and 100 items.';
  end if;
  for v_item in select value from jsonb_array_elements(v_payload->'items')
  loop
    if nullif(trim(v_item->>'description'), '') is null then
      raise exception using errcode = 'P0001', message = 'Every requested part requires a description.';
    end if;
    if nullif(v_item->>'qty', '') is null
       or (v_item->>'qty') !~ '^[0-9]+([.][0-9]+)?$'
       or (v_item->>'qty')::numeric < 1
       or (v_item->>'qty')::numeric > 10000 then
      raise exception using errcode = 'P0001', message = 'Every requested part quantity must be from 1 to 10,000.';
    end if;
  end loop;

  v_request_id := public.create_part_request_with_items(
    p_work_order_id,
    v_payload->'items',
    p_work_order_line_id::text,
    nullif(trim(v_payload->>'notes'), '')
  );
  if v_request_id is null then
    raise exception using errcode = 'P0001', message = 'Parts request could not be created.';
  end if;
  update public.part_request_items
  set work_order_line_id = p_work_order_line_id
  where request_id = v_request_id
    and work_order_id = p_work_order_id
    and (shop_id is null or shop_id = p_shop_id);

  v_result := jsonb_build_object(
    'requestId', v_request_id,
    'workOrderId', p_work_order_id,
    'workOrderLineId', p_work_order_line_id,
    'idempotent', false
  );
  insert into public.offline_mutation_receipts(
    shop_id, actor_user_id, operation_key, action_type, payload_hash,
    entity_type, entity_id, result
  ) values (
    p_shop_id, p_actor_user_id, p_operation_key,
    'materialize_parts_request_draft', v_payload_hash,
    'parts_request', v_request_id, v_result
  );
  return v_result;
exception
  when unique_violation then
    select * into v_existing
    from public.offline_mutation_receipts r
    where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
    if found and v_existing.action_type = 'materialize_parts_request_draft' and v_existing.payload_hash = v_payload_hash then
      return v_existing.result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different parts draft data.';
end;
$$;

revoke all on function public.materialize_offline_parts_request_draft_atomic(uuid,uuid,text,uuid,uuid,jsonb) from public, anon;
grant execute on function public.materialize_offline_parts_request_draft_atomic(uuid,uuid,text,uuid,uuid,jsonb) to authenticated, service_role;

commit;
