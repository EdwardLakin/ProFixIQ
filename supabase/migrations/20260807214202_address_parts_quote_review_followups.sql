begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Keep request-item and PO-line receipt quantities on the same two-decimal
-- ledger precision. Patch the deployed function body without duplicating its
-- lock-order and idempotency implementation in a second migration.
do $migration$
declare
  v_definition text;
  v_updated text;
  v_anchor constant text := $anchor$  if nullif(trim(p_idempotency_key), '') is null then$anchor$;
  v_replacement constant text := $replacement$  if p_qty <> round(p_qty, 2) then
    raise exception using
      errcode = '22023',
      message = 'PARTS_RECEIPT_QUANTITY_PRECISION';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then$replacement$;
begin
  select pg_get_functiondef(
    'public.parts_receive_free_text_po_line(uuid, uuid, numeric, text)'::regprocedure
  )
    into v_definition;

  if v_definition is null then
    raise exception 'parts_receive_free_text_po_line is missing';
  end if;
  if position('PARTS_RECEIPT_QUANTITY_PRECISION' in v_definition) > 0 then
    return;
  end if;
  if position(v_anchor in v_definition) = 0 then
    raise exception 'parts_receive_free_text_po_line precision patch anchor is missing';
  end if;
  if (
    length(v_definition) - length(replace(v_definition, v_anchor, ''))
  ) / length(v_anchor) <> 1 then
    raise exception 'parts_receive_free_text_po_line precision patch anchor is ambiguous';
  end if;

  v_updated := replace(v_definition, v_anchor, v_replacement);
  if v_updated = v_definition then
    raise exception 'parts_receive_free_text_po_line precision patch did not apply';
  end if;
  execute v_updated;
end;
$migration$;

comment on function public.parts_receive_free_text_po_line(
  uuid, uuid, numeric, text
) is
  'Atomically receives a free-text PO line with two-decimal quantity precision, tenant authorization, idempotency, and PO/request reconciliation.';

-- Trusted server remediation for protected quote pricing. The public route
-- performs the user-facing owner/admin check; this service-role-only function
-- repeats that check from canonical profiles, validates exact customer sell
-- detail against the durable finalized parts total, and records both an
-- operation receipt and an operational audit event.
create or replace function public.remediate_quote_line_pricing_quarantine(
  p_shop_id uuid,
  p_quote_line_id uuid,
  p_actor_user_id uuid,
  p_items jsonb,
  p_operation_key text,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_actor_role text;
  v_existing jsonb;
  v_item jsonb;
  v_description text;
  v_qty numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_parts_total numeric := 0;
  v_item_count integer := 0;
  v_canonical_items jsonb := '[]'::jsonb;
  v_safe_snapshots jsonb := '[]'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_parts_quote jsonb := '{}'::jsonb;
  v_sanitization jsonb := '{}'::jsonb;
  v_request_payload jsonb;
  v_result jsonb;
  v_correction public.work_order_correction_sessions%rowtype;
  v_opened_correction boolean := false;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception using
      errcode = '42501',
      message = 'QUOTE_PRICING_REMEDIATION_SERVICE_ROLE_REQUIRED';
  end if;
  if p_shop_id is null or p_quote_line_id is null or p_actor_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'Quote line, shop, and actor are required.';
  end if;
  if nullif(btrim(coalesce(p_operation_key, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'A stable remediation operation key is required.';
  end if;
  if length(p_operation_key) > 300 then
    raise exception using
      errcode = '22023',
      message = 'Remediation operation key is too long.';
  end if;
  if length(coalesce(p_note, '')) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Remediation note is too long.';
  end if;

  select public.canonical_shop_membership_role(profile.role::text)
    into v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (
      profile.id = p_actor_user_id
      or profile.user_id = p_actor_user_id
    )
  order by case when profile.user_id = p_actor_user_id then 0 else 1 end
  limit 1;

  if coalesce(v_actor_role, '') not in ('owner', 'admin') then
    raise exception using
      errcode = '42501',
      message = 'QUOTE_PRICING_REMEDIATION_ROLE_REQUIRED';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception using
      errcode = '22023',
      message = 'At least one corrected customer part is required.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using
        errcode = '22023',
        message = 'Every corrected customer part must be an object.';
    end if;

    v_description := nullif(btrim(v_item ->> 'description'), '');
    if v_description is null or length(v_description) > 500 then
      raise exception using
        errcode = '22023',
        message = 'Every corrected customer part needs a description of 500 characters or fewer.';
    end if;
    if coalesce(v_item ->> 'qty', '') !~ '^[0-9]+([.][0-9]+)?$'
       or coalesce(v_item ->> 'unit_price', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception using
        errcode = '22023',
        message = 'Corrected quantity and sell price must be finite non-negative numbers.';
    end if;

    v_qty := (v_item ->> 'qty')::numeric;
    v_unit_price := (v_item ->> 'unit_price')::numeric;
    if v_qty <= 0 or v_qty <> round(v_qty, 2) then
      raise exception using
        errcode = '22023',
        message = 'Corrected quantity must be positive with at most two decimal places.';
    end if;
    if v_unit_price < 0 or v_unit_price <> round(v_unit_price, 2) then
      raise exception using
        errcode = '22023',
        message = 'Corrected sell price must be non-negative with at most two decimal places.';
    end if;

    v_line_total := round(v_qty * v_unit_price, 2);
    v_parts_total := round(v_parts_total + v_line_total, 2);
    v_item_count := v_item_count + 1;
    v_canonical_items := v_canonical_items || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', nullif(btrim(v_item ->> 'id'), ''),
        'request_id', nullif(btrim(v_item ->> 'request_id'), ''),
        'description', v_description,
        'qty', v_qty,
        'unit_price', v_unit_price,
        'line_total', v_line_total,
        'quote_ready', true,
        'sell_price_source', 'manual_quarantine_remediation',
        'part_number', nullif(btrim(v_item ->> 'part_number'), ''),
        'manufacturer', nullif(btrim(v_item ->> 'manufacturer'), '')
      ))
    );
    v_safe_snapshots := v_safe_snapshots || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', nullif(btrim(v_item ->> 'id'), ''),
        'request_id', nullif(btrim(v_item ->> 'request_id'), ''),
        'description', v_description,
        'qty', v_qty,
        'part_number', nullif(btrim(v_item ->> 'part_number'), ''),
        'manufacturer', nullif(btrim(v_item ->> 'manufacturer'), '')
      ))
    );
  end loop;

  v_request_payload := jsonb_build_object(
    'quote_line_id', p_quote_line_id,
    'items', v_canonical_items,
    'note', nullif(btrim(coalesce(p_note, '')), '')
  );

  select operation.result
    into v_existing
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'quote_pricing_quarantine_remediation'
    and operation.operation_key = p_operation_key;
  if found then
    if v_existing -> '_request' is distinct from v_request_payload then
      raise exception using
        errcode = '22023',
        message = 'QUOTE_PRICING_REMEDIATION_IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select quote_line.*
    into v_line
  from public.work_order_quote_lines quote_line
  where quote_line.id = p_quote_line_id
    and quote_line.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Quote line not found for shop.';
  end if;

  select operation.result
    into v_existing
  from public.quote_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'quote_pricing_quarantine_remediation'
    and operation.operation_key = p_operation_key
  for update;
  if found then
    if v_existing -> '_request' is distinct from v_request_payload then
      raise exception using
        errcode = '22023',
        message = 'QUOTE_PRICING_REMEDIATION_IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  v_metadata := case
    when jsonb_typeof(v_line.metadata) = 'object' then v_line.metadata
    else '{}'::jsonb
  end;
  v_parts_quote := case
    when jsonb_typeof(v_metadata -> 'parts_quote') = 'object'
      then v_metadata -> 'parts_quote'
    else '{}'::jsonb
  end;
  v_sanitization := case
    when jsonb_typeof(v_parts_quote -> 'pricing_sanitization') = 'object'
      then v_parts_quote -> 'pricing_sanitization'
    else '{}'::jsonb
  end;

  if coalesce(
    (v_sanitization ->> 'customer_pricing_quarantined')::boolean,
    false
  ) is false then
    raise exception using
      errcode = '55000',
      message = 'QUOTE_PRICING_NOT_QUARANTINED';
  end if;
  if not public.quote_line_pricing_is_protected(
    v_line.status::text,
    v_line.stage::text,
    v_line.sent_to_customer_at,
    v_line.sent_at,
    v_line.approved_at,
    v_line.declined_at,
    v_line.deferred_at,
    v_line.converted_at,
    v_line.work_order_line_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'QUOTE_PRICING_REMEDIATION_REQUIRES_PROTECTED_LINE';
  end if;
  if v_line.parts_total is null
     or round(v_line.parts_total, 2) is distinct from v_parts_total then
    raise exception using
      errcode = '23514',
      message = 'QUOTE_PRICING_REMEDIATION_TOTAL_MISMATCH',
      detail = format(
        'Corrected customer part detail totals %s; finalized parts total is %s.',
        v_parts_total,
        v_line.parts_total
      );
  end if;

  if public.work_order_is_financially_locked(p_shop_id, v_line.work_order_id) then
    select *
      into v_correction
    from public.open_work_order_correction_session(
      p_shop_id,
      v_line.work_order_id,
      p_actor_user_id,
      'Resolve protected customer quote pricing quarantine',
      'data_repair',
      'quote-pricing-remediation:' || p_operation_key,
      jsonb_build_object(
        'quote_line_id', p_quote_line_id,
        'source', 'quote_pricing_quarantine_remediation'
      )
    );
    v_opened_correction := true;
  end if;

  v_sanitization := v_sanitization || jsonb_strip_nulls(jsonb_build_object(
    'customer_pricing_quarantined', false,
    'manual_review_required', false,
    'customer_pricing_remediated', true,
    'customer_pricing_remediated_at', now(),
    'customer_pricing_remediated_by', p_actor_user_id,
    'customer_pricing_remediation_note', nullif(btrim(coalesce(p_note, '')), ''),
    'decision_totals_preserved', true
  ));
  v_parts_quote := v_parts_quote || jsonb_build_object(
    'source', 'trusted_manual_pricing_remediation',
    'items', v_canonical_items,
    'required_count', v_item_count,
    'quoted_count', v_item_count,
    'pending_count', 0,
    'parts_total', v_parts_total,
    'synced_at', now(),
    'pricing_sanitization', v_sanitization
  );
  v_metadata := jsonb_set(v_metadata, '{parts_quote}', v_parts_quote, true);
  v_metadata := jsonb_set(v_metadata, '{parts}', v_safe_snapshots, true);

  update public.work_order_quote_lines
  set metadata = v_metadata,
      updated_at = now()
  where id = p_quote_line_id
    and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'quote_line_id', p_quote_line_id,
    'work_order_id', v_line.work_order_id,
    'parts_total', v_parts_total,
    'item_count', v_item_count,
    'status', v_line.status,
    'stage', v_line.stage,
    'correction_session_id', v_correction.id,
    '_request', v_request_payload
  );

  insert into public.operational_events(
    shop_id,
    event_type,
    actor_user_id,
    actor_role,
    entity_type,
    entity_id,
    parent_entity_type,
    parent_entity_id,
    correlation_id,
    idempotency_key,
    source,
    severity,
    metadata
  ) values (
    p_shop_id,
    'quote.pricing_quarantine.remediated',
    p_actor_user_id,
    v_actor_role,
    'work_order_quote_line',
    p_quote_line_id,
    'work_order',
    v_line.work_order_id,
    v_line.work_order_id,
    'quote-pricing-remediation:' || p_operation_key,
    'api:quote_pricing_quarantine_remediation',
    'warning',
    jsonb_build_object(
      'quote_line_id', p_quote_line_id,
      'work_order_id', v_line.work_order_id,
      'parts_total', v_parts_total,
      'item_count', v_item_count,
      'decision_totals_preserved', true,
      'note', nullif(btrim(coalesce(p_note, '')), '')
    )
  );

  insert into public.quote_lifecycle_operation_keys(
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    result
  ) values (
    p_shop_id,
    'quote_pricing_quarantine_remediation',
    p_operation_key,
    p_actor_user_id,
    v_line.work_order_id,
    v_result
  );

  if v_opened_correction then
    perform public.close_work_order_correction_session(
      p_shop_id,
      v_line.work_order_id,
      v_correction.id,
      p_actor_user_id,
      jsonb_build_object(
        'quote_line_id', p_quote_line_id,
        'operation_key', p_operation_key,
        'result', 'pricing_quarantine_remediated'
      )
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.remediate_quote_line_pricing_quarantine(
  uuid, uuid, uuid, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.remediate_quote_line_pricing_quarantine(
  uuid, uuid, uuid, jsonb, text, text
) to service_role;

comment on function public.remediate_quote_line_pricing_quarantine(
  uuid, uuid, uuid, jsonb, text, text
) is
  'Service-role-only audited remediation for protected customer quote item pricing; preserves durable decision totals and workflow state.';

-- Reconcile historical mutable quote lines whose legacy customer item metadata
-- outlived every active canonical Parts Request item. The canonical sync moves
-- these unresolved lines back to pending_parts with zero item totals. Protected
-- and locked-estimate rows are excluded and remain governed by quarantine.
do $backfill$
declare
  v_quote record;
begin
  for v_quote in
    select quote_line.shop_id, quote_line.id
    from public.work_order_quote_lines quote_line
    join public.work_orders work_order
      on work_order.id = quote_line.work_order_id
     and work_order.shop_id = quote_line.shop_id
    where not public.quote_line_pricing_is_protected(
      quote_line.status::text,
      quote_line.stage::text,
      quote_line.sent_to_customer_at,
      quote_line.sent_at,
      quote_line.approved_at,
      quote_line.declined_at,
      quote_line.deferred_at,
      quote_line.converted_at,
      quote_line.work_order_line_id
    )
      and (
        work_order.estimate_number is null
        or coalesce(work_order.estimate_status, 'draft') in (
          'draft', 'waiting_for_parts'
        )
      )
      and (
        coalesce(quote_line.parts_total, 0) <> 0
        or lower(coalesce(quote_line.status::text, '')) in (
          'quoted', 'ready_to_send'
        )
        or lower(coalesce(quote_line.stage::text, '')) = 'ready_to_send'
        or coalesce(jsonb_array_length(
          case
            when jsonb_typeof(
              coalesce(quote_line.metadata, '{}'::jsonb)
                -> 'parts_quote' -> 'items'
            ) = 'array'
              then coalesce(quote_line.metadata, '{}'::jsonb)
                -> 'parts_quote' -> 'items'
            else '[]'::jsonb
          end
        ), 0) > 0
      )
      and not exists (
        select 1
        from public.part_requests request
        join public.part_request_items item
          on item.request_id = request.id
         and item.shop_id = request.shop_id
         and item.work_order_id = request.work_order_id
         and item.quote_line_id = request.quote_line_id
        where request.shop_id = quote_line.shop_id
          and request.work_order_id = quote_line.work_order_id
          and request.quote_line_id = quote_line.id
          and lower(coalesce(request.status::text, 'requested')) not in (
            'cancelled', 'canceled', 'rejected', 'declined', 'voided'
          )
          and lower(coalesce(item.status::text, 'requested')) not in (
            'cancelled', 'canceled', 'rejected', 'declined', 'voided'
          )
      )
    order by quote_line.shop_id, quote_line.id
  loop
    perform public.sync_quote_line_pricing_from_parts(
      v_quote.shop_id,
      v_quote.id
    );
  end loop;
end;
$backfill$;

notify pgrst, 'reload schema';

commit;
