begin;

-- Early finding submission is one durable transition: validate the exact
-- canonical inspection revision, create/reuse quote and parts records, and
-- freeze the selected findings in the same transaction.
create or replace function public.submit_inspection_findings_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_inspection_id uuid,
  p_requested_vehicle_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_expected_sync_revision bigint,
  p_selection jsonb,
  p_items jsonb,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inspection public.inspections%rowtype;
  v_existing jsonb;
  v_import_result jsonb;
  v_result jsonb;
  v_summary jsonb;
  v_summary_item jsonb;
  v_item jsonb;
  v_parts jsonb;
  v_quote_id text;
  v_source_item_key text;
  v_status text;
  v_note text;
  v_now timestamptz := coalesce(p_at, now());
  v_next_revision bigint;
  v_index integer;
  v_section_index integer;
  v_item_index integer;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'Authenticated actor does not match the inspection submission actor.';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_user_id
      and profile.shop_id = p_shop_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection submission actor is not a member of this shop.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if p_expected_sync_revision is null or p_expected_sync_revision < 1 then
    raise exception using errcode = 'P0001', message = 'A saved inspection revision is required.';
  end if;
  if jsonb_typeof(p_selection) <> 'array'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_selection) = 0
     or jsonb_array_length(p_selection) <> jsonb_array_length(p_items) then
    raise exception using
      errcode = 'P0001',
      message = 'Finding selection must match the submitted inspection items.';
  end if;

  select operation.result into v_existing
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'inspection_quote_import'
    and operation.operation_key = p_operation_key;
  if found and v_existing ? 'session' then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_inspection
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = p_shop_id
    and inspection.is_canonical
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Inspection not found for shop.';
  end if;
  if v_inspection.work_order_id is null or v_inspection.work_order_line_id is null then
    raise exception using errcode = 'P0001', message = 'INSPECTION_UNANCHORED: inspection requires administrative reconciliation before submission.';
  end if;
  if v_inspection.work_order_id <> p_work_order_id then
    raise exception using errcode = 'P0001', message = 'INSPECTION_WORK_ORDER_MISMATCH: inspection belongs to another work order.';
  end if;
  if coalesce(v_inspection.locked, false)
     or coalesce(v_inspection.completed, false)
     or not coalesce(v_inspection.is_draft, true)
     or v_inspection.finalized_at is not null
     or v_inspection.finalized_by is not null
     or lower(coalesce(v_inspection.status, 'draft')) in ('completed', 'finalized', 'signed') then
    raise exception using errcode = 'P0001', message = 'Inspection is finalized and locked. Reopen is required before submitting findings.';
  end if;
  if v_inspection.sync_revision <> p_expected_sync_revision then
    raise exception using errcode = 'P0001', message = 'INSPECTION_REVISION_CONFLICT: inspection changed before findings were submitted.';
  end if;

  v_summary := coalesce(v_inspection.summary, '{}'::jsonb);

  for v_index in 0..jsonb_array_length(p_selection) - 1 loop
    v_section_index := (p_selection -> v_index ->> 'sectionIndex')::integer;
    v_item_index := (p_selection -> v_index ->> 'itemIndex')::integer;
    if v_section_index < 0 or v_item_index < 0 then
      raise exception using errcode = 'P0001', message = 'Finding selection contains an invalid index.';
    end if;

    v_summary_item := v_summary #> array[
      'sections', v_section_index::text, 'items', v_item_index::text
    ];
    if v_summary_item is null or jsonb_typeof(v_summary_item) <> 'object' then
      raise exception using errcode = 'P0001', message = 'Selected finding does not exist in the saved inspection.';
    end if;
    v_status := lower(trim(coalesce(v_summary_item ->> 'status', '')));
    v_note := trim(coalesce(
      nullif(v_summary_item ->> 'notes', ''),
      nullif(v_summary_item ->> 'note', ''),
      ''
    ));
    if v_status not in ('fail', 'recommend') or v_note = '' then
      raise exception using errcode = 'P0001', message = 'Only saved failed or recommended findings with technician notes can be submitted.';
    end if;
    if coalesce(lower(v_summary_item ->> 'estimateSubmitted') = 'true', false) then
      raise exception using errcode = 'P0001', message = 'Selected finding is already in Quote Review.';
    end if;

    v_item := p_items -> v_index;
    v_source_item_key := nullif(trim(v_item ->> 'sourceItemKey'), '');
    if v_source_item_key is null then
      raise exception using errcode = 'P0001', message = 'Submitted finding is missing its durable source key.';
    end if;

    -- The technician's explicit checkbox wins over every stale draft part row.
    -- Otherwise accept only described rows with an explicitly positive quantity.
    if coalesce(lower(v_summary_item ->> 'noPartsRequired') = 'true', false) then
      v_parts := '[]'::jsonb;
    else
      select coalesce(jsonb_agg(part.value order by part.ordinality), '[]'::jsonb)
        into v_parts
      from jsonb_array_elements(coalesce(v_item -> 'parts', '[]'::jsonb))
        with ordinality as part(value, ordinality)
      where trim(coalesce(part.value ->> 'description', part.value ->> 'name', '')) <> ''
        and coalesce(part.value ->> 'qty', part.value ->> 'quantity', '')
          ~ '^([0-9]+([.][0-9]+)?|[.][0-9]+)$'
        and coalesce(part.value ->> 'qty', part.value ->> 'quantity')::numeric > 0;
    end if;
    v_item := jsonb_set(v_item, '{parts}', v_parts, true);

    -- Recover safely from an older partial attempt by reusing the quote tied
    -- to this immutable inspection item key, independent of edited note text.
    select quote.id::text into v_quote_id
    from public.work_order_quote_lines quote
    where quote.shop_id = p_shop_id
      and quote.work_order_id = p_work_order_id
      and quote.metadata ->> 'source_inspection_id' = p_inspection_id::text
      and quote.metadata ->> 'source_item_key' = v_source_item_key
    order by quote.created_at
    limit 1
    for update;
    if v_quote_id is not null then
      v_item := jsonb_set(v_item, '{id}', to_jsonb(v_quote_id), true);
    end if;
    p_items := jsonb_set(p_items, array[v_index::text], v_item, false);
  end loop;

  v_import_result := public.import_inspection_quote_package_atomic(
    p_shop_id,
    p_work_order_id,
    p_inspection_id,
    p_requested_vehicle_id,
    p_actor_user_id,
    p_operation_key,
    p_items,
    v_now
  );
  if jsonb_typeof(v_import_result -> 'ids') <> 'array'
     or jsonb_array_length(v_import_result -> 'ids') <> jsonb_array_length(p_selection) then
    raise exception using errcode = 'P0001', message = 'Atomic quote import did not return every selected finding.';
  end if;

  for v_index in 0..jsonb_array_length(p_selection) - 1 loop
    v_section_index := (p_selection -> v_index ->> 'sectionIndex')::integer;
    v_item_index := (p_selection -> v_index ->> 'itemIndex')::integer;
    v_quote_id := v_import_result -> 'ids' ->> v_index;
    v_summary_item := v_summary #> array[
      'sections', v_section_index::text, 'items', v_item_index::text
    ];
    v_summary_item := v_summary_item || jsonb_build_object(
      'estimateSubmitted', true,
      'estimateSubmittedAt', v_now,
      'estimateLastUpdatedAt', v_now,
      'estimateQuoteLineId', v_quote_id
    );
    v_summary := jsonb_set(
      v_summary,
      array['sections', v_section_index::text, 'items', v_item_index::text],
      v_summary_item,
      false
    );
  end loop;

  v_next_revision := v_inspection.sync_revision + 1;
  v_summary := v_summary || jsonb_build_object(
    'syncRevision', v_next_revision,
    'serverUpdatedAt', v_now,
    'lastUpdated', v_now
  );
  update public.inspections
  set summary = v_summary,
      sync_revision = v_next_revision,
      user_id = p_actor_user_id,
      updated_at = v_now
  where id = p_inspection_id
    and shop_id = p_shop_id
    and is_canonical
    and sync_revision = p_expected_sync_revision
    and not coalesce(locked, false)
    and not coalesce(completed, false)
    and coalesce(is_draft, true);
  if not found then
    raise exception using errcode = 'P0001', message = 'INSPECTION_REVISION_CONFLICT: inspection changed while findings were submitted.';
  end if;

  v_result := v_import_result || jsonb_build_object(
    'session', v_summary,
    'syncRevision', v_next_revision,
    'idempotent', false
  );
  update public.quote_lifecycle_operation_keys operation
  set result = v_result
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'inspection_quote_import'
    and operation.operation_key = p_operation_key;

  return v_result;
end;
$$;

revoke all on function public.submit_inspection_findings_atomic(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb,jsonb,timestamptz) from public, anon;
grant execute on function public.submit_inspection_findings_atomic(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb,jsonb,timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
