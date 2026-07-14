begin;

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
  v_request_id uuid;
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
  v_next_status text;
  v_next_stage text;
begin
  select *
    into v_line
  from public.work_order_quote_lines
  where id = p_quote_line_id
    and shop_id = p_shop_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'quoteLineId', p_quote_line_id,
      'shopId', p_shop_id,
      'error', 'Quote line not found for shop'
    );
  end if;

  if lower(coalesce(v_line.status, '')) = any(array[
    'approved','customer_approved','declined','deferred','converted','sent','rejected','cancelled'
  ]) or v_line.approved_at is not null or v_line.declined_at is not null or v_line.work_order_line_id is not null then
    return jsonb_build_object(
      'ok', true,
      'quoteLineId', p_quote_line_id,
      'shopId', p_shop_id,
      'status', v_line.status,
      'stage', v_line.stage,
      'skipped', 'protected_quote_line_state'
    );
  end if;

  select pr.id
    into v_request_id
  from public.part_requests pr
  where pr.shop_id = p_shop_id
    and pr.work_order_id = v_line.work_order_id
    and pr.quote_line_id = p_quote_line_id
    and lower(coalesce(pr.status, 'requested')) not in ('cancelled','canceled','rejected','declined','voided')
  order by pr.created_at desc nulls last, pr.id desc
  limit 1;

  select coalesce(s.labor_rate, 0)
    into v_shop_labor_rate
  from public.shops s
  where s.id = p_shop_id;

  v_metadata := coalesce(v_line.metadata, '{}'::jsonb);
  v_labor_rate := coalesce(nullif((v_metadata ->> 'labor_rate')::numeric, 0), nullif(v_shop_labor_rate, 0), 0);
  v_labor_hours := coalesce(v_line.labor_hours, v_line.est_labor_hours, 0);
  v_labor_total := case
    when coalesce(v_line.labor_total, 0) > 0 then v_line.labor_total
    when v_labor_hours > 0 and v_labor_rate > 0 then round(v_labor_hours * v_labor_rate, 2)
    else coalesce(v_line.labor_total, 0)
  end;

  if v_request_id is not null then
    with canonical_items as (
      select
        pri.id,
        pri.request_id,
        pri.description,
        greatest(coalesce(pri.qty, pri.qty_requested, pri.qty_approved, 0), 0) as qty,
        coalesce(pri.quoted_price, pri.unit_price, pri.unit_cost) as unit_price,
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
      from public.part_request_items pri
      left join public.parts p
        on p.id = pri.part_id
       and p.shop_id = pri.shop_id
      where pri.shop_id = p_shop_id
        and pri.work_order_id = v_line.work_order_id
        and pri.quote_line_id = p_quote_line_id
        and pri.request_id = v_request_id
        and lower(coalesce(pri.status, 'requested')) not in ('cancelled','canceled','rejected','declined','voided')
        and greatest(coalesce(pri.qty, pri.qty_requested, pri.qty_approved, 0), 0) > 0
    )
    select
      count(*)::integer,
      count(*) filter (where part_id is not null and unit_price is not null and unit_price >= 0)::integer,
      count(*) filter (where part_id is null or unit_price is null or unit_price < 0)::integer,
      coalesce(round(sum(case when part_id is not null and unit_price is not null and unit_price >= 0 then qty * unit_price else 0 end), 2), 0),
      coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'request_id', request_id,
        'description', description,
        'qty', qty,
        'unit_price', unit_price,
        'line_total', case when unit_price is null then null else round(qty * unit_price, 2) end,
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
      ) order by id), '[]'::jsonb)
    into v_required_count, v_quoted_count, v_pending_count, v_parts_total, v_items
    from canonical_items;
  end if;

  v_next_status := case when v_required_count = 0 or v_pending_count = 0 then 'quoted' else 'pending_parts' end;
  v_next_stage := case
    when v_required_count > 0 and v_pending_count = 0 and (v_labor_total + v_parts_total) > 0 then 'ready_to_send'
    else 'advisor_pending'
  end;

  v_metadata := jsonb_set(v_metadata, '{labor_rate}', to_jsonb(v_labor_rate), true);
  v_metadata := jsonb_set(
    v_metadata,
    '{parts_quote}',
    jsonb_build_object(
      'source', 'canonical_latest_part_request',
      'request_id', v_request_id,
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
  set
    metadata = v_metadata,
    labor_total = v_labor_total,
    parts_total = v_parts_total,
    subtotal = round(v_labor_total + v_parts_total, 2),
    grand_total = round(v_labor_total + v_parts_total + coalesce(v_line.tax_total, 0), 2),
    status = v_next_status,
    stage = v_next_stage,
    updated_at = now()
  where id = p_quote_line_id
    and shop_id = p_shop_id;

  return jsonb_build_object(
    'ok', true,
    'quoteLineId', p_quote_line_id,
    'shopId', p_shop_id,
    'requestId', v_request_id,
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
  'Canonical Quote Review rollup. Uses the newest active Parts Request for a quote line, preserves manufacturer/supplier identity, applies a positive shop labor-rate fallback, and updates quote readiness/totals.';

grant execute on function public.sync_quote_line_pricing_from_parts(uuid, uuid) to authenticated, service_role;

create or replace function public.trg_sync_quote_line_pricing_from_parts()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_quote_line_id uuid;
begin
  v_shop_id := coalesce(new.shop_id, old.shop_id);
  v_quote_line_id := coalesce(new.quote_line_id, old.quote_line_id);
  if v_shop_id is not null and v_quote_line_id is not null then
    perform public.sync_quote_line_pricing_from_parts(v_shop_id, v_quote_line_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_part_request_items_sync_quote_pricing on public.part_request_items;
create trigger trg_part_request_items_sync_quote_pricing
after insert or update of part_id, quoted_price, unit_price, unit_cost, qty, qty_requested, qty_approved, status, description, requested_part_number, requested_manufacturer, vendor, vendor_id, quote_line_id or delete
on public.part_request_items
for each row execute function public.trg_sync_quote_line_pricing_from_parts();

drop trigger if exists trg_part_requests_sync_quote_pricing on public.part_requests;
create trigger trg_part_requests_sync_quote_pricing
after insert or update of status, quote_line_id or delete
on public.part_requests
for each row execute function public.trg_sync_quote_line_pricing_from_parts();

do $$
declare
  r record;
begin
  for r in
    select distinct q.shop_id, q.id as quote_line_id
    from public.work_order_quote_lines q
    join public.part_requests pr
      on pr.shop_id = q.shop_id
     and pr.work_order_id = q.work_order_id
     and pr.quote_line_id = q.id
  loop
    perform public.sync_quote_line_pricing_from_parts(r.shop_id, r.quote_line_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
