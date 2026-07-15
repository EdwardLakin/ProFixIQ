begin;

create or replace function public.import_inspection_quote_package_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_inspection_id uuid,
  p_requested_vehicle_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_items jsonb,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_inspection public.inspections%rowtype;
  v_source_line public.work_order_lines%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_now timestamptz := coalesce(p_at, now());
  v_item jsonb;
  v_part jsonb;
  v_quote_id uuid;
  v_requested_id uuid;
  v_request_id uuid;
  v_identity text;
  v_description text;
  v_part_description text;
  v_part_identity text;
  v_qty numeric;
  v_created boolean;
  v_quote_ids uuid[] := array[]::uuid[];
  v_created_quote_ids uuid[] := array[]::uuid[];
  v_created_request_ids uuid[] := array[]::uuid[];
  v_created_quote_count integer := 0;
  v_skipped_quote_count integer := 0;
  v_created_item_count integer := 0;
  v_skipped_item_count integer := 0;
  v_item_results jsonb := '[]'::jsonb;
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Inspection import items must be a JSON array.';
  end if;

  select result into v_existing
  from public.quote_lifecycle_operation_keys
  where shop_id = p_shop_id
    and operation_name = 'inspection_quote_import'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop.';
  end if;
  if lower(coalesce(v_work_order.status::text, '')) in ('cancelled', 'canceled', 'closed', 'invoiced') then
    raise exception using errcode = 'P0001', message = 'Cannot import into a cancelled, closed, or invoiced work order.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: inspection findings cannot be imported after invoice finalization.';
  end if;
  if p_requested_vehicle_id is not null and p_requested_vehicle_id is distinct from v_work_order.vehicle_id then
    raise exception using errcode = 'P0001', message = 'INSPECTION_VEHICLE_MISMATCH: caller vehicle does not match the work order.';
  end if;

  select * into v_inspection
  from public.inspections
  where id = p_inspection_id and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Inspection not found for shop.';
  end if;
  if v_inspection.work_order_id is null or v_inspection.work_order_line_id is null then
    raise exception using errcode = 'P0001', message = 'INSPECTION_UNANCHORED: inspection requires administrative reconciliation before import.';
  end if;
  if v_inspection.work_order_id <> p_work_order_id then
    raise exception using errcode = 'P0001', message = 'INSPECTION_WORK_ORDER_MISMATCH: inspection belongs to another work order.';
  end if;

  select * into v_source_line
  from public.work_order_lines
  where id = v_inspection.work_order_line_id
    and shop_id = p_shop_id
  for update;
  if not found or v_source_line.work_order_id <> p_work_order_id then
    raise exception using errcode = 'P0001', message = 'INSPECTION_SOURCE_LINE_MISMATCH: source line is not anchored to this work order.';
  end if;
  if v_source_line.vehicle_id is not null
     and v_work_order.vehicle_id is not null
     and v_source_line.vehicle_id <> v_work_order.vehicle_id then
    raise exception using errcode = 'P0001', message = 'INSPECTION_VEHICLE_MISMATCH: source line vehicle conflicts with the work order.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := coalesce(nullif(trim(v_item ->> 'description'), ''), nullif(trim(v_item ->> 'title'), ''));
    if v_description is null then
      continue;
    end if;

    v_identity := nullif(trim(v_item ->> 'findingIdentity'), '');
    v_requested_id := null;
    if coalesce(v_item ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_requested_id := (v_item ->> 'id')::uuid;
    end if;

    v_quote_id := null;
    if v_requested_id is not null then
      select id into v_quote_id
      from public.work_order_quote_lines
      where id = v_requested_id
        and shop_id = p_shop_id
        and work_order_id = p_work_order_id
      for update;
    end if;
    if v_quote_id is null and v_identity is not null then
      select id into v_quote_id
      from public.work_order_quote_lines
      where shop_id = p_shop_id
        and work_order_id = p_work_order_id
        and metadata ->> 'inspection_finding_identity' = v_identity
      order by created_at
      limit 1
      for update;
    end if;

    v_created := false;
    if v_quote_id is null then
      insert into public.work_order_quote_lines(
        id, work_order_id, work_order_line_id, shop_id, vehicle_id,
        suggested_by, description, job_type, est_labor_hours, notes,
        status, ai_complaint, ai_cause, ai_correction, stage, qty,
        labor_hours, parts_total, labor_total, subtotal, tax_total,
        grand_total, metadata, group_id, sent_to_customer_at,
        approved_at, declined_at
      ) values (
        coalesce(v_requested_id, gen_random_uuid()),
        p_work_order_id,
        null,
        p_shop_id,
        v_work_order.vehicle_id,
        p_actor_user_id,
        v_description,
        coalesce(nullif(trim(v_item ->> 'jobType'), ''), 'tech-suggested'),
        nullif(v_item ->> 'estLaborHours', '')::numeric,
        coalesce(nullif(trim(v_item ->> 'notes'), ''), nullif(trim(v_item ->> 'complaint'), '')),
        coalesce(nullif(trim(v_item ->> 'status'), ''), 'advisor_pending'),
        coalesce(nullif(trim(v_item ->> 'aiComplaint'), ''), nullif(trim(v_item ->> 'complaint'), '')),
        nullif(trim(v_item ->> 'aiCause'), ''),
        nullif(trim(v_item ->> 'aiCorrection'), ''),
        coalesce(nullif(trim(v_item ->> 'stage'), ''), 'advisor_pending'),
        1,
        nullif(v_item ->> 'laborHours', '')::numeric,
        coalesce(nullif(v_item ->> 'partsTotal', '')::numeric, 0),
        nullif(v_item ->> 'laborTotal', '')::numeric,
        coalesce(nullif(v_item ->> 'subtotal', '')::numeric, 0),
        nullif(v_item ->> 'taxTotal', '')::numeric,
        coalesce(nullif(v_item ->> 'grandTotal', '')::numeric, nullif(v_item ->> 'subtotal', '')::numeric, 0),
        coalesce(v_item -> 'metadata', '{}'::jsonb) || jsonb_build_object(
          'source', coalesce(nullif(v_item ->> 'source', ''), 'inspection'),
          'source_inspection_id', p_inspection_id,
          'source_work_order_line_id', v_inspection.work_order_line_id,
          'source_section_key', nullif(v_item ->> 'sourceSectionKey', ''),
          'source_section_title', nullif(v_item ->> 'sourceSectionTitle', ''),
          'source_item_key', nullif(v_item ->> 'sourceItemKey', ''),
          'source_finding_title', coalesce(nullif(v_item ->> 'sourceFindingTitle', ''), v_description),
          'source_finding_title_normalized', nullif(v_item ->> 'normalizedFindingTitle', ''),
          'inspection_finding_identity', v_identity,
          'photo_urls', coalesce(v_item -> 'photoUrls', '[]'::jsonb),
          'parts', coalesce(v_item -> 'parts', '[]'::jsonb)
        ),
        null,
        null,
        null,
        null
      ) returning id into v_quote_id;
      v_created := true;
      v_created_quote_count := v_created_quote_count + 1;
      v_created_quote_ids := array_append(v_created_quote_ids, v_quote_id);
    else
      v_skipped_quote_count := v_skipped_quote_count + 1;
    end if;

    v_quote_ids := array_append(v_quote_ids, v_quote_id);
    v_item_results := v_item_results || jsonb_build_array(jsonb_build_object(
      'requestedId', v_requested_id,
      'id', v_quote_id,
      'created', v_created,
      'findingIdentity', v_identity
    ));

    if jsonb_typeof(v_item -> 'parts') = 'array'
       and jsonb_array_length(v_item -> 'parts') > 0 then
      select id into v_request_id
      from public.part_requests
      where shop_id = p_shop_id
        and work_order_id = p_work_order_id
        and quote_line_id = v_quote_id
      order by created_at
      limit 1
      for update;

      if v_request_id is null then
        insert into public.part_requests(
          shop_id, work_order_id, quote_line_id, job_id,
          requested_by, notes, status
        ) values (
          p_shop_id,
          p_work_order_id,
          v_quote_id,
          null,
          p_actor_user_id,
          concat_ws(E'\n', nullif(v_item ->> 'notes', ''), 'Quote line: ' || v_quote_id::text, 'Inspection: ' || p_inspection_id::text),
          'requested'
        ) returning id into v_request_id;
        v_created_request_ids := array_append(v_created_request_ids, v_request_id);
      end if;

      for v_part in select value from jsonb_array_elements(v_item -> 'parts')
      loop
        v_part_description := coalesce(nullif(trim(v_part ->> 'description'), ''), nullif(trim(v_part ->> 'name'), ''));
        if v_part_description is null then
          continue;
        end if;
        v_part_identity := lower(regexp_replace(v_part_description, '\s+', ' ', 'g'));
        v_qty := greatest(1, coalesce(nullif(v_part ->> 'qty', '')::numeric, 1));

        if exists (
          select 1 from public.part_request_items
          where request_id = v_request_id
            and quote_line_id = v_quote_id
            and lower(regexp_replace(coalesce(description, ''), '\s+', ' ', 'g')) = v_part_identity
        ) then
          v_skipped_item_count := v_skipped_item_count + 1;
        else
          insert into public.part_request_items(
            request_id, shop_id, work_order_id, quote_line_id,
            work_order_line_id, description, qty, qty_requested,
            unit_cost, unit_price, status
          ) values (
            v_request_id,
            p_shop_id,
            p_work_order_id,
            v_quote_id,
            null,
            v_part_description,
            v_qty,
            v_qty,
            coalesce(nullif(v_part ->> 'unitCost', '')::numeric, nullif(v_part ->> 'cost', '')::numeric),
            nullif(v_part ->> 'unitPrice', '')::numeric,
            'requested'
          );
          v_created_item_count := v_created_item_count + 1;
        end if;
      end loop;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'ids', to_jsonb(v_quote_ids),
    'items', v_item_results,
    'createdCount', v_created_quote_count,
    'skippedDuplicateCount', v_skipped_quote_count,
    'createdPartRequestIds', to_jsonb(v_created_request_ids),
    'partRequestIds', (
      select coalesce(jsonb_agg(distinct id), '[]'::jsonb)
      from public.part_requests
      where shop_id = p_shop_id
        and work_order_id = p_work_order_id
        and quote_line_id = any(v_quote_ids)
    ),
    'createdPartRequestItemCount', v_created_item_count,
    'skippedPartRequestItemCount', v_skipped_item_count,
    'canonicalVehicleId', v_work_order.vehicle_id,
    'sourceWorkOrderLineId', v_inspection.work_order_line_id
  );

  insert into public.quote_lifecycle_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id,
    work_order_id, result
  ) values (
    p_shop_id, 'inspection_quote_import', p_operation_key,
    p_actor_user_id, p_work_order_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.import_inspection_quote_package_atomic(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz) from public, anon;
grant execute on function public.import_inspection_quote_package_atomic(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz) to authenticated, service_role;
notify pgrst, 'reload schema';

commit;
