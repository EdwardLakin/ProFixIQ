begin;

create or replace function public.add_ai_suggested_quote_lines_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_items jsonb,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_at, now());
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_item jsonb;
  v_description text;
  v_job_type text;
  v_line_id uuid;
  v_ids uuid[] := array[]::uuid[];
  v_count integer := 0;
  v_suggested_labor numeric;
begin
  if p_actor_user_id is null or nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'Authenticated actor and stable operation key are required.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'At least one AI suggestion is required.';
  end if;

  select result into v_existing
  from public.system_lifecycle_operation_keys
  where shop_id = p_shop_id
    and operation_name = 'add_ai_suggested_quote_lines'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_user_id
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service',
        'mechanic', 'tech', 'technician', 'lead_hand', 'leadhand', 'lead', 'foreman'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'Actor is not authorized to add work-order suggestions.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: suggestions cannot change this work order.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := nullif(trim(coalesce(v_item ->> 'description', '')), '');
    if v_description is null then
      continue;
    end if;

    v_job_type := lower(trim(coalesce(v_item ->> 'jobType', 'tech-suggested')));
    if v_job_type not in ('diagnosis', 'repair', 'maintenance', 'inspection', 'tech-suggested') then
      v_job_type := 'tech-suggested';
    end if;

    begin
      v_suggested_labor := nullif(trim(coalesce(v_item ->> 'laborHours', '')), '')::numeric;
    exception when invalid_text_representation then
      v_suggested_labor := null;
    end;

    insert into public.work_order_quote_lines(
      shop_id,
      work_order_id,
      work_order_line_id,
      vehicle_id,
      suggested_by,
      description,
      job_type,
      notes,
      status,
      stage,
      ai_complaint,
      ai_cause,
      ai_correction,
      est_labor_hours,
      labor_hours,
      parts_total,
      labor_total,
      subtotal,
      tax_total,
      grand_total,
      qty,
      metadata,
      created_at,
      updated_at
    ) values (
      p_shop_id,
      p_work_order_id,
      null,
      v_work_order.vehicle_id,
      p_actor_user_id,
      v_description,
      v_job_type,
      nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
      'pending_parts',
      'advisor_pending',
      nullif(trim(coalesce(v_item ->> 'aiComplaint', '')), ''),
      nullif(trim(coalesce(v_item ->> 'aiCause', '')), ''),
      nullif(trim(coalesce(v_item ->> 'aiCorrection', '')), ''),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      jsonb_build_object(
        'source', 'ai_suggestion',
        'selected_by', p_actor_user_id,
        'selected_at', v_now,
        'service_code', nullif(trim(coalesce(v_item ->> 'serviceCode', '')), ''),
        'ai_suggested_labor_hours', v_suggested_labor,
        'canonical_labor_hours_accepted', false,
        'canonical_pricing_accepted', false
      ),
      v_now,
      v_now
    ) returning id into v_line_id;

    v_ids := array_append(v_ids, v_line_id);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception using errcode = 'P0001', message = 'No valid AI suggestions were supplied.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'inserted', v_count,
    'quoteLineIds', to_jsonb(v_ids)
  );

  insert into public.system_lifecycle_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'add_ai_suggested_quote_lines', p_operation_key,
    p_actor_user_id, p_work_order_id, v_result
  );

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id,
    'ai_suggestions_added_to_quote_review',
    'work_orders',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'operation_key', p_operation_key,
      'quote_line_ids', to_jsonb(v_ids)
    )
  );

  return v_result;
end;
$$;

revoke all on function public.add_ai_suggested_quote_lines_atomic(uuid, uuid, uuid, jsonb, text, timestamptz)
  from public, anon;
grant execute on function public.add_ai_suggested_quote_lines_atomic(uuid, uuid, uuid, jsonb, text, timestamptz)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
