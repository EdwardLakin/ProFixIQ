begin;

-- Re-apply the advisor draft materializer so databases that already ran the
-- original migration accept the canonical legacy `lead` role alias.
create or replace function public.materialize_offline_work_order_draft_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.offline_mutation_receipts%rowtype;
  v_work_order public.work_orders%rowtype;
  v_line jsonb;
  v_line_id uuid;
  v_temp_id text;
  v_role text;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_hash text := encode(digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex');
  v_line_map jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Authenticated actor does not match the draft actor.';
  end if;
  if nullif(trim(p_operation_key), '') is null or length(p_operation_key) > 240 then
    raise exception using errcode = 'P0001', message = 'A stable idempotency key is required.';
  end if;

  select * into v_existing
  from public.offline_mutation_receipts r
  where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
  if found then
    if v_existing.action_type <> 'materialize_work_order_draft' or v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different draft data.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent', true);
  end if;

  select lower(coalesce(p.role::text, '')) into v_role
  from public.profiles p
  where p.id = p_actor_user_id and p.shop_id = p_shop_id;
  if not found or v_role not in ('owner','admin','manager','advisor','service','lead_hand','lead hand','leadhand','lead','foreman') then
    raise exception using errcode = 'P0001', message = 'Actor is not allowed to create work orders for this shop.';
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.shop_id = p_shop_id) then
    raise exception using errcode = 'P0001', message = 'Customer not found for this shop.';
  end if;
  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id and v.shop_id = p_shop_id and v.customer_id = p_customer_id
  ) then
    raise exception using errcode = 'P0001', message = 'Vehicle not found for this customer and shop.';
  end if;
  if jsonb_typeof(v_payload->'lines') <> 'array'
     or jsonb_array_length(v_payload->'lines') < 1
     or jsonb_array_length(v_payload->'lines') > 50 then
    raise exception using errcode = 'P0001', message = 'Draft requires between 1 and 50 job lines.';
  end if;

  select * into v_work_order
  from public.create_work_order_with_custom_id(
    p_shop_id => p_shop_id,
    p_customer_id => p_customer_id,
    p_vehicle_id => p_vehicle_id,
    p_notes => coalesce(v_payload->>'notes', ''),
    p_priority => greatest(1, least(5, coalesce((v_payload->>'priority')::integer, 3))),
    p_is_waiter => coalesce((v_payload->>'isWaiter')::boolean, false),
    p_advisor_id => p_actor_user_id
  );
  if v_work_order.id is null then
    raise exception using errcode = 'P0001', message = 'Work order could not be created.';
  end if;

  for v_line in select value from jsonb_array_elements(v_payload->'lines')
  loop
    v_temp_id := nullif(trim(v_line->>'tempId'), '');
    if v_temp_id is null or v_line_map ? v_temp_id then
      raise exception using errcode = 'P0001', message = 'Every draft line requires a unique temporary ID.';
    end if;
    if coalesce(v_line->>'lineType', 'job') not in ('job', 'info') then
      raise exception using errcode = 'P0001', message = 'Unsupported draft line type.';
    end if;
    if nullif(trim(v_line->>'complaint'), '') is null then
      raise exception using errcode = 'P0001', message = 'Every draft line requires a description.';
    end if;
    if nullif(v_line->>'laborTime', '') is not null
       and ((v_line->>'laborTime')::numeric < 0 or (v_line->>'laborTime')::numeric > 1000) then
      raise exception using errcode = 'P0001', message = 'Draft line labor time is outside the allowed range.';
    end if;

    v_line_id := gen_random_uuid();
    insert into public.work_order_lines(
      id, work_order_id, vehicle_id, user_id, shop_id, line_no,
      line_type, complaint, description, notes, job_type, labor_time, status
    ) values (
      v_line_id, v_work_order.id, p_vehicle_id, p_actor_user_id, p_shop_id,
      jsonb_object_length(v_line_map) + 1,
      coalesce(v_line->>'lineType', 'job'),
      nullif(trim(v_line->>'complaint'), ''),
      case when coalesce(v_line->>'lineType', 'job') = 'info' then nullif(trim(v_line->>'complaint'), '') else null end,
      nullif(trim(v_line->>'notes'), ''),
      case
        when coalesce(v_line->>'lineType', 'job') = 'info' then null
        when v_line->>'jobType' in ('diagnosis','inspection','maintenance','repair') then v_line->>'jobType'
        else 'diagnosis'
      end,
      nullif(v_line->>'laborTime', '')::numeric,
      'awaiting'
    );
    v_line_map := v_line_map || jsonb_build_object(v_temp_id, v_line_id);
  end loop;

  v_result := jsonb_build_object(
    'workOrderId', v_work_order.id,
    'customId', v_work_order.custom_id,
    'lineIdMap', v_line_map,
    'idempotent', false
  );
  insert into public.offline_mutation_receipts(
    shop_id, actor_user_id, operation_key, action_type, payload_hash,
    entity_type, entity_id, result
  ) values (
    p_shop_id, p_actor_user_id, p_operation_key,
    'materialize_work_order_draft', v_payload_hash,
    'work_order', v_work_order.id, v_result
  );
  return v_result;
exception
  when unique_violation then
    select * into v_existing
    from public.offline_mutation_receipts r
    where r.shop_id = p_shop_id and r.operation_key = p_operation_key;
    if found and v_existing.action_type = 'materialize_work_order_draft' and v_existing.payload_hash = v_payload_hash then
      return v_existing.result || jsonb_build_object('idempotent', true);
    end if;
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSE: operation key belongs to different draft data.';
end;
$$;

revoke all on function public.materialize_offline_work_order_draft_atomic(uuid,uuid,text,uuid,uuid,jsonb) from public, anon;
grant execute on function public.materialize_offline_work_order_draft_atomic(uuid,uuid,text,uuid,uuid,jsonb) to authenticated, service_role;

commit;
