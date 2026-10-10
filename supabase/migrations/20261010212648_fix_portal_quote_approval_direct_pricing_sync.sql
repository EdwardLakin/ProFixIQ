begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- The parts lifecycle reconciler calls the pricing sync directly after relinking
-- a Parts Request during portal approval. That direct call bypasses the trigger
-- guard added in 20261010205500. Resolve and lock the quote line first, then
-- return immediately for customer-protected pricing before enforcing the
-- staff-only guard. Mutable pricing remains staff-only.
create or replace function public.sync_quote_line_pricing_from_parts(
  p_shop_id uuid,
  p_quote_line_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line public.work_order_quote_lines%rowtype;
  v_estimate_number text;
  v_estimate_status text;
  v_request_ids uuid[] := array[]::uuid[];
  v_latest_request_id uuid;
  v_shop_labor_rate numeric := 0;
  v_labor_rate numeric := 0;
  v_labor_hours numeric := 0;
  v_labor_total numeric := 0;
  v_parts_total numeric := 0;
  v_required_count integer := 0;
  v_quoted_count integer := 0;
  v_pending_count integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_metadata_labor_rate numeric;
  v_next_status text;
  v_next_stage text;
begin
  select q.*
    into v_line
  from public.work_order_quote_lines q
  where q.id = p_quote_line_id
    and q.shop_id = p_shop_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'quoteLineId', p_quote_line_id,
      'shopId', p_shop_id,
      'error', 'Quote line not found for shop'
    );
  end if;

  if public.quote_line_pricing_is_protected(
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
    return jsonb_build_object(
      'ok', true,
      'quoteLineId', p_quote_line_id,
      'shopId', p_shop_id,
      'status', v_line.status,
      'stage', v_line.stage,
      'skipped', 'protected_quote_line_state'
    );
  end if;

  if (select auth.uid()) is not null
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = p_shop_id
         and (
           profile.id = (select auth.uid())
           or profile.user_id = (select auth.uid())
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Quote pricing sync is limited to the authenticated staff shop.';
  end if;

  select w.estimate_number, w.estimate_status
    into v_estimate_number, v_estimate_status
  from public.work_orders w
  where w.id = v_line.work_order_id
    and w.shop_id = p_shop_id;

  if v_estimate_number is not null
     and coalesce(v_estimate_status, 'draft') not in (
       'draft', 'waiting_for_parts'
     ) then
    return jsonb_build_object(
      'ok', true,
      'quoteLineId', p_quote_line_id,
      'shopId', p_shop_id,
      'status', v_line.status,
      'stage', v_line.stage,
      'skipped', 'locked_estimate_pricing'
    );
  end if;

  select
    coalesce(
      array_agg(pr.id order by pr.created_at, pr.id),
      array[]::uuid[]
    ),
    (array_agg(pr.id order by pr.created_at desc, pr.id desc))[1]
  into v_request_ids, v_latest_request_id
  from public.part_requests pr
  where pr.shop_id = p_shop_id
    and pr.work_order_id = v_line.work_order_id
    and pr.quote_line_id = p_quote_line_id
    and lower(coalesce(pr.status::text, 'requested')) not in (
      'cancelled', 'canceled', 'rejected', 'declined', 'voided'
    );

  select coalesce(s.labor_rate, 0)
    into v_shop_labor_rate
  from public.shops s
  where s.id = p_shop_id;

  v_metadata := coalesce(v_line.metadata, '{}'::jsonb);
  if nullif(v_metadata ->> 'labor_rate', '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_metadata_labor_rate := (v_metadata ->> 'labor_rate')::numeric;
  end if;
  v_labor_rate := coalesce(
    nullif(v_metadata_labor_rate, 0),
    nullif(v_shop_labor_rate, 0),
    0
  );
  v_labor_hours := greatest(
    coalesce(v_line.labor_hours, 0),
    coalesce(v_line.est_labor_hours, 0),
    0
  );
  v_labor_total := case
    when coalesce(v_line.labor_total, 0) > 0 then v_line.labor_total
    when v_labor_hours > 0 and v_labor_rate > 0
      then round(v_labor_hours * v_labor_rate, 2)
    else coalesce(v_line.labor_total, 0)
  end;

  with active_requests as (
    select pr.id, pr.created_at
    from public.part_requests pr
    where pr.shop_id = p_shop_id
      and pr.work_order_id = v_line.work_order_id
      and pr.quote_line_id = p_quote_line_id
      and lower(coalesce(pr.status::text, 'requested')) not in (
        'cancelled', 'canceled', 'rejected', 'declined', 'voided'
      )
  ), canonical_items as (
    select
      pri.id,
      pri.request_id,
      ar.created_at as request_created_at,
      pri.description,
      greatest(
        coalesce(pri.qty, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty_approved, 0),
        0
      ) as qty,
      coalesce(pri.quoted_price, pri.unit_price) as explicit_unit_price,
      case
        when coalesce(pri.quoted_price, pri.unit_price) >= 0
          then coalesce(pri.quoted_price, pri.unit_price)
        else null
      end as unit_price,
      case
        when pri.quoted_price >= 0 then 'quoted_price'
        when pri.quoted_price is null and pri.unit_price >= 0 then 'unit_price'
        else null
      end as sell_price_source,
      pri.status,
      pri.part_id,
      pri.vendor,
      pri.vendor_id,
      pri.requested_part_number,
      pri.requested_manufacturer,
      p.name as selected_name,
      p.sku as selected_sku,
      p.part_number as selected_part_number,
      p.manufacturer as manufacturer,
      p.supplier as supplier
    from active_requests ar
    join public.part_request_items pri
      on pri.request_id = ar.id
     and pri.shop_id = p_shop_id
     and pri.work_order_id = v_line.work_order_id
     and pri.quote_line_id = p_quote_line_id
    left join public.parts p
      on p.id = pri.part_id
     and p.shop_id = pri.shop_id
    where lower(coalesce(pri.status::text, 'requested')) not in (
      'cancelled', 'canceled', 'rejected', 'declined', 'voided'
    )
      and greatest(
        coalesce(pri.qty, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty_approved, 0),
        0
      ) > 0
  )
  select
    count(*)::integer,
    count(*) filter (
      where public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, explicit_unit_price
      )
    )::integer,
    count(*) filter (
      where not public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, explicit_unit_price
      )
    )::integer,
    coalesce(round(sum(
      case when public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, explicit_unit_price
      ) then qty * explicit_unit_price else 0 end
    ), 2), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'request_id', request_id,
      'description', description,
      'qty', qty,
      'unit_price', unit_price,
      'line_total', case
        when unit_price is null then null
        else round(qty * unit_price, 2)
      end,
      'quote_ready', public.part_request_item_is_quote_ready(
        description, part_id, requested_part_number,
        requested_manufacturer, qty, explicit_unit_price
      ),
      'sell_price_source', sell_price_source,
      'status', status,
      'part_id', part_id,
      'requested_part_number', requested_part_number,
      'requested_manufacturer', requested_manufacturer,
      'selected_name', selected_name,
      'selected_sku', selected_sku,
      'selected_part_number', selected_part_number,
      'manufacturer', coalesce(manufacturer, requested_manufacturer),
      'supplier', supplier,
      'vendor', vendor,
      'vendor_id', vendor_id
    ) order by request_created_at, request_id, id), '[]'::jsonb)
  into v_required_count, v_quoted_count, v_pending_count,
       v_parts_total, v_items
  from canonical_items;

  v_next_status := case
    when v_required_count > 0 and v_pending_count = 0 then 'quoted'
    else 'pending_parts'
  end;
  v_next_stage := case
    when v_required_count > 0
      and v_pending_count = 0
      and (v_labor_total + v_parts_total) > 0
      then 'ready_to_send'
    else 'advisor_pending'
  end;

  v_metadata := jsonb_set(v_metadata, '{labor_rate}', to_jsonb(v_labor_rate), true);
  v_metadata := jsonb_set(
    v_metadata,
    '{parts_quote}',
    jsonb_build_object(
      'source', 'canonical_active_part_requests',
      'request_id', v_latest_request_id,
      'request_ids', to_jsonb(v_request_ids),
      'batch_count', cardinality(v_request_ids),
      'synced_at', now(),
      'required_count', v_required_count,
      'quoted_count', v_quoted_count,
      'pending_count', v_pending_count,
      'parts_total', v_parts_total,
      'items', v_items
    ),
    true
  );

  update public.work_order_quote_lines
  set metadata = v_metadata,
      labor_total = v_labor_total,
      parts_total = v_parts_total,
      subtotal = round(v_labor_total + v_parts_total, 2),
      grand_total = round(
        v_labor_total + v_parts_total + coalesce(v_line.tax_total, 0),
        2
      ),
      status = v_next_status,
      stage = v_next_stage,
      updated_at = now()
  where id = p_quote_line_id
    and shop_id = p_shop_id;

  return jsonb_build_object(
    'ok', true,
    'quoteLineId', p_quote_line_id,
    'shopId', p_shop_id,
    'requestId', v_latest_request_id,
    'requestIds', to_jsonb(v_request_ids),
    'batchCount', cardinality(v_request_ids),
    'itemCount', v_required_count,
    'quotedCount', v_quoted_count,
    'pendingCount', v_pending_count,
    'partsTotal', v_parts_total,
    'laborRate', v_labor_rate,
    'laborTotal', v_labor_total,
    'status', v_next_status,
    'stage', v_next_stage
  );
end;
$$;

comment on function public.sync_quote_line_pricing_from_parts(uuid, uuid) is
  'Canonical Quote Review sell rollup across active request batches. Protected customer quote pricing returns before the authenticated-staff guard; mutable pricing remains staff-only.';

do $$
declare
  v_sql text;
  v_protected_pos integer;
  v_staff_guard_pos integer;
begin
  select lower(pg_get_functiondef(
    'public.sync_quote_line_pricing_from_parts(uuid,uuid)'::regprocedure
  )) into v_sql;

  v_protected_pos := position('quote_line_pricing_is_protected' in v_sql);
  v_staff_guard_pos := position('quote pricing sync is limited to the authenticated staff shop.' in v_sql);

  if v_protected_pos = 0
     or v_staff_guard_pos = 0
     or v_protected_pos >= v_staff_guard_pos then
    raise exception 'Portal quote approval direct pricing sync postcheck failed';
  end if;
end;
$$;

commit;
