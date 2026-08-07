begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Customer-visible quote pricing becomes immutable as soon as any durable
-- handoff marker exists. Keep this predicate aligned with portal visibility so
-- a timestamp-only or stage-only handoff cannot be silently repriced.
create or replace function public.quote_line_pricing_is_protected(
  p_status text,
  p_stage text,
  p_sent_to_customer_at timestamptz,
  p_sent_at timestamptz,
  p_approved_at timestamptz,
  p_declined_at timestamptz,
  p_deferred_at timestamptz,
  p_converted_at timestamptz,
  p_work_order_line_id uuid
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    lower(btrim(coalesce(p_status, ''))) in (
      'approved', 'customer_approved', 'declined', 'deferred', 'converted',
      'sent', 'rejected', 'cancelled', 'canceled', 'superseded', 'voided'
    )
    or lower(btrim(coalesce(p_stage, ''))) in ('sent', 'customer_review')
    or substring(lower(btrim(coalesce(p_stage, ''))) from 1 for 9) = 'customer_'
    or p_sent_to_customer_at is not null
    or p_sent_at is not null
    or p_approved_at is not null
    or p_declined_at is not null
    or p_deferred_at is not null
    or p_converted_at is not null
    or p_work_order_line_id is not null;
$$;

revoke all on function public.quote_line_pricing_is_protected(
  text, text, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.quote_line_pricing_is_protected(
  text, text, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, uuid
) to authenticated, service_role;

-- Quote Review is a customer-sell boundary. Acquisition cost remains on the
-- request/catalog records and must never be copied into customer-readable
-- quote metadata or used as a fallback sell price.
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

  select w.estimate_number, w.estimate_status
    into v_estimate_number, v_estimate_status
  from public.work_orders w
  where w.id = v_line.work_order_id
    and w.shop_id = p_shop_id;

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
  'Canonical Quote Review sell rollup across active request batches. Catalog sell is advisory until quoted_price/unit_price is explicit; acquisition cost is never copied to quote metadata.';

revoke all on function public.sync_quote_line_pricing_from_parts(uuid, uuid)
  from public, anon;
grant execute on function public.sync_quote_line_pricing_from_parts(uuid, uuid)
  to authenticated, service_role;

-- Legacy syncs could disguise unit_cost as parts_quote.items.unit_price. Keep
-- the transformation in a private, read-only helper so clean-replay runtime
-- tests can exercise exactly the same sanitizer used by this migration.
create or replace function private.sanitize_quote_line_pricing_metadata(
  p_shop_id uuid,
  p_quote_line_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_metadata jsonb;
  v_persisted_parts_total numeric;
  v_preserve_decision_totals boolean := false;
  v_quote_items_are_array boolean := false;
  v_has_quote_items boolean := false;
  v_has_malformed_quote_items boolean := false;
  v_has_snapshot_items boolean := false;
  v_snapshot_only boolean := false;
  v_items jsonb := '[]'::jsonb;
  v_required_count integer := 0;
  v_quoted_count integer := 0;
  v_pending_count integer := 0;
  v_has_unresolved_sell boolean := false;
  v_has_item_drift boolean := false;
  v_explicit_parts_total numeric := 0;
  v_manual_review_required boolean := false;
  v_quarantine_customer_pricing boolean := false;
  v_reason text;
begin
  select
    coalesce(q.metadata, '{}'::jsonb),
    q.parts_total,
    (
      public.quote_line_pricing_is_protected(
        q.status::text,
        q.stage::text,
        q.sent_to_customer_at,
        q.sent_at,
        q.approved_at,
        q.declined_at,
        q.deferred_at,
        q.converted_at,
        q.work_order_line_id
      )
      or (
        w.estimate_number is not null
        and coalesce(w.estimate_status, 'draft') not in (
          'draft', 'waiting_for_parts'
        )
      )
      or public.work_order_is_financially_locked(q.shop_id, q.work_order_id)
    )
  into v_metadata, v_persisted_parts_total, v_preserve_decision_totals
  from public.work_order_quote_lines q
  join public.work_orders w
    on w.id = q.work_order_id
   and w.shop_id = q.shop_id
  where q.id = p_quote_line_id
    and q.shop_id = p_shop_id;

  if not found then
    return v_metadata;
  end if;

  v_quote_items_are_array :=
    jsonb_typeof(v_metadata -> 'parts_quote' -> 'items')
      is not distinct from 'array';
  v_has_quote_items := v_quote_items_are_array
    and jsonb_array_length(v_metadata -> 'parts_quote' -> 'items') > 0;
  v_has_malformed_quote_items := (
      v_metadata ? 'parts_quote'
      and jsonb_typeof(v_metadata -> 'parts_quote') is distinct from 'object'
    ) or (
      jsonb_typeof(v_metadata -> 'parts_quote') is not distinct from 'object'
      and (v_metadata -> 'parts_quote') ? 'items'
      and not v_quote_items_are_array
    );
  v_has_snapshot_items := case
    when jsonb_typeof(v_metadata -> 'parts') = 'array'
      then jsonb_array_length(v_metadata -> 'parts') > 0
    else false
  end;
  v_snapshot_only := v_has_snapshot_items and not v_has_quote_items;

  if not v_has_quote_items
     and not v_has_snapshot_items
     and not v_has_malformed_quote_items then
    return v_metadata;
  end if;
  if v_snapshot_only and not v_preserve_decision_totals then
    return v_metadata;
  end if;

  if v_has_quote_items then
  select
    coalesce(jsonb_agg(
      (case
        when jsonb_typeof(item.value) = 'object' then
          item.value - array[
            'unitCost', 'unit_cost', 'cost', 'defaultCost', 'default_cost',
            'acquisitionCost', 'acquisition_cost'
          ]::text[]
        else jsonb_build_object('legacy_value', item.value)
      end)
      || jsonb_build_object(
        'unit_price', case
          when source.explicit_sell is not null and source.explicit_sell >= 0
            then source.explicit_sell
          else null
        end,
        'line_total', case
          when source.explicit_sell is null or source.explicit_sell < 0 then null
          else round(source.qty * source.explicit_sell, 2)
        end,
        'quote_ready', source.explicit_sell is not null and source.explicit_sell >= 0,
        'sell_price_source', source.sell_price_source
      )
      order by item.ordinality
    ), '[]'::jsonb),
    count(*)::integer,
    count(*) filter (
      where source.explicit_sell is not null and source.explicit_sell >= 0
    )::integer,
    count(*) filter (
      where source.explicit_sell is null or source.explicit_sell < 0
    )::integer,
    bool_or(
      source.item_id is null
      or source.explicit_sell is null
      or source.explicit_sell < 0
    ),
    bool_or(
      source.item_id is null
      or stored.item_id is distinct from source.item_id::text
      or stored.qty is distinct from source.qty
      or round(stored.unit_price, 2)
         is distinct from round(source.explicit_sell, 2)
      or round(stored.line_total, 2) is distinct from case
        when source.explicit_sell is null or source.explicit_sell < 0 then null
        else round(source.qty * source.explicit_sell, 2)
      end
    ),
    coalesce(round(sum(
      case
        when source.explicit_sell is not null and source.explicit_sell >= 0
          then source.qty * source.explicit_sell
        else 0
      end
    ), 2), 0)
  into
    v_items,
    v_required_count,
    v_quoted_count,
    v_pending_count,
    v_has_unresolved_sell,
    v_has_item_drift,
    v_explicit_parts_total
  from jsonb_array_elements(v_metadata -> 'parts_quote' -> 'items')
    with ordinality as item(value, ordinality)
  cross join lateral (
    select
      nullif(btrim(item.value ->> 'id'), '') as item_id,
      case
        when coalesce(item.value ->> 'qty', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (item.value ->> 'qty')::numeric
        else null
      end as qty,
      case
        when coalesce(
          item.value ->> 'unit_price',
          item.value ->> 'unitPrice',
          item.value ->> 'unit_sell_price',
          item.value ->> 'unitSellPrice',
          item.value ->> 'price',
          ''
        ) ~ '^-?[0-9]+([.][0-9]+)?$'
          then coalesce(
            item.value ->> 'unit_price',
            item.value ->> 'unitPrice',
            item.value ->> 'unit_sell_price',
            item.value ->> 'unitSellPrice',
            item.value ->> 'price'
          )::numeric
        else null
      end as unit_price,
      case
        when coalesce(
          item.value ->> 'line_total',
          item.value ->> 'lineTotal',
          ''
        ) ~ '^-?[0-9]+([.][0-9]+)?$'
          then coalesce(
            item.value ->> 'line_total',
            item.value ->> 'lineTotal'
          )::numeric
        else null
      end as line_total
  ) stored
  left join lateral (
    select
      pri.id as item_id,
      greatest(
        coalesce(pri.qty, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty_approved, 0),
        0
      ) as qty,
      coalesce(pri.quoted_price, pri.unit_price) as explicit_sell,
      case
        when pri.quoted_price >= 0 then 'quoted_price'
        when pri.quoted_price is null and pri.unit_price >= 0 then 'unit_price'
        else null
      end as sell_price_source
    from public.part_request_items pri
    join public.part_requests pr
      on pr.id = pri.request_id
     and pr.shop_id = pri.shop_id
    where pri.id::text = item.value ->> 'id'
      and pri.shop_id = p_shop_id
      and pri.quote_line_id = p_quote_line_id
      and lower(coalesce(pr.status::text, 'requested')) not in (
        'cancelled', 'canceled', 'rejected', 'declined', 'voided'
      )
      and lower(coalesce(pri.status::text, 'requested')) not in (
        'cancelled', 'canceled', 'rejected', 'declined', 'voided'
      )
    limit 1
  ) source on true;

  v_has_item_drift := coalesce(v_has_item_drift, false)
    or exists (
      select 1
      from public.part_request_items pri
      join public.part_requests pr
        on pr.id = pri.request_id
       and pr.shop_id = pri.shop_id
      where pri.shop_id = p_shop_id
        and pri.quote_line_id = p_quote_line_id
        and lower(coalesce(pr.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'voided'
        )
        and lower(coalesce(pri.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'voided'
        )
        and greatest(
          coalesce(pri.qty, 0),
          coalesce(pri.qty_requested, 0),
          coalesce(pri.qty_approved, 0),
          0
        ) > 0
        and not exists (
          select 1
          from jsonb_array_elements(v_metadata -> 'parts_quote' -> 'items')
            as stored_item(value)
          where stored_item.value ->> 'id' = pri.id::text
        )
    )
    or jsonb_array_length(v_metadata -> 'parts_quote' -> 'items')
       is distinct from (
         select count(distinct item.value ->> 'id')::integer
         from jsonb_array_elements(v_metadata -> 'parts_quote' -> 'items')
           as item(value)
       );
  else
    v_items := '[]'::jsonb;
    v_required_count := case
      when v_has_snapshot_items then jsonb_array_length(v_metadata -> 'parts')
      else 1
    end;
    v_quoted_count := 0;
    v_pending_count := v_required_count;
    v_has_unresolved_sell := true;
    v_has_item_drift := true;
    v_explicit_parts_total := 0;
  end if;

  v_manual_review_required :=
    v_preserve_decision_totals
    and (
      v_snapshot_only
      or v_has_malformed_quote_items
      or v_has_unresolved_sell
      or v_has_item_drift
      or v_persisted_parts_total is distinct from v_explicit_parts_total
    );
  v_quarantine_customer_pricing := v_manual_review_required;
  v_reason := case
    when v_preserve_decision_totals and v_has_malformed_quote_items
      then 'malformed_canonical_items'
    when v_preserve_decision_totals and v_snapshot_only
      then 'protected_snapshot_without_canonical_items'
    when v_preserve_decision_totals and v_has_unresolved_sell
      then 'missing_explicit_sell'
    when v_preserve_decision_totals
      and v_persisted_parts_total is distinct from v_explicit_parts_total
      then 'protected_decision_total_mismatch'
    when v_preserve_decision_totals and v_has_item_drift
      then 'protected_item_pricing_mismatch'
    else null
  end;

  if v_quarantine_customer_pricing then
    select coalesce(jsonb_agg(
      (item.value - array[
        'unit_price', 'unitPrice', 'unit_sell_price', 'unitSellPrice',
        'price', 'line_total', 'lineTotal', 'sell_price_source'
      ]::text[])
      || jsonb_build_object(
        'unit_price', null,
        'line_total', null,
        'quote_ready', false,
        'sell_price_source', null
      )
      order by item.ordinality
    ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(v_items)
      with ordinality as item(value, ordinality);

    v_quoted_count := 0;
    v_pending_count := v_required_count;
  end if;

  if jsonb_typeof(v_metadata -> 'parts') = 'array' then
    v_metadata := jsonb_set(
      v_metadata,
      '{parts}',
      coalesce((
        select jsonb_agg(
          case
            when jsonb_typeof(part.value) = 'object' then
              (part.value - array[
                'unitCost', 'unit_cost', 'cost', 'defaultCost', 'default_cost',
                'acquisitionCost', 'acquisition_cost'
              ]::text[])
              - case
                  when v_quarantine_customer_pricing then array[
                    'unitPrice', 'unit_price', 'unitSellPrice', 'unit_sell_price',
                    'price', 'lineTotal', 'line_total'
                  ]::text[]
                  else array[]::text[]
                end
            else part.value
          end
          order by part.ordinality
        )
        from jsonb_array_elements(v_metadata -> 'parts')
          with ordinality as part(value, ordinality)
      ), '[]'::jsonb),
      true
    );
  end if;

  return jsonb_set(
    v_metadata,
    '{parts_quote}',
    case
      when jsonb_typeof(v_metadata -> 'parts_quote') = 'object'
        then v_metadata -> 'parts_quote'
      else '{}'::jsonb
    end || jsonb_build_object(
      'items', v_items,
      'required_count', v_required_count,
      'quoted_count', v_quoted_count,
      'pending_count', v_pending_count,
      'parts_total', case
        when v_has_unresolved_sell or v_quarantine_customer_pricing then null
        else v_explicit_parts_total
      end,
      'pricing_sanitization', jsonb_build_object(
        'source', 'repair_quote_review_cost_sell',
        'sanitized_at', now(),
        'decision_totals_preserved', v_preserve_decision_totals,
        'manual_review_required', v_manual_review_required,
        'customer_pricing_quarantined', v_quarantine_customer_pricing,
        'reason', v_reason
      )
    ),
    true
  );
end;
$$;

revoke all on function private.sanitize_quote_line_pricing_metadata(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Financially finalized work orders normally reject every child update. This
-- migration performs only a bounded metadata privacy repair, under an
-- access-exclusive ALTER TABLE lock, and preserves all durable totals. Restore
-- the guard before any ordinary quote resync is attempted.
do $$
declare
  v_guard_state text;
begin
  select t.tgenabled::text
    into v_guard_state
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.work_order_quote_lines'::regclass
    and t.tgname = 'trg_guard_financially_locked_work_order_quote_lines';

  perform set_config(
    'profixiq.quote_financial_guard_state',
    coalesce(v_guard_state, ''),
    true
  );
  if v_guard_state is not null and v_guard_state <> 'D' then
    execute 'alter table public.work_order_quote_lines disable trigger trg_guard_financially_locked_work_order_quote_lines';
  end if;
end;
$$;

with sanitized as materialized (
  select
    q.id,
    private.sanitize_quote_line_pricing_metadata(q.shop_id, q.id) as metadata
  from public.work_order_quote_lines q
  join public.work_orders w
    on w.id = q.work_order_id
   and w.shop_id = q.shop_id
  where (
    case
      when jsonb_typeof(q.metadata -> 'parts_quote' -> 'items') = 'array'
        then jsonb_array_length(q.metadata -> 'parts_quote' -> 'items') > 0
      else false
    end
    or (
      coalesce(q.metadata, '{}'::jsonb) ? 'parts_quote'
      and jsonb_typeof(q.metadata -> 'parts_quote') is distinct from 'object'
    )
    or (
      jsonb_typeof(q.metadata -> 'parts_quote') = 'object'
      and (q.metadata -> 'parts_quote') ? 'items'
      and jsonb_typeof(q.metadata -> 'parts_quote' -> 'items')
        is distinct from 'array'
    )
  ) or (
    case
      when jsonb_typeof(q.metadata -> 'parts') = 'array'
        then jsonb_array_length(q.metadata -> 'parts') > 0
      else false
    end
    and (
      public.quote_line_pricing_is_protected(
        q.status::text,
        q.stage::text,
        q.sent_to_customer_at,
        q.sent_at,
        q.approved_at,
        q.declined_at,
        q.deferred_at,
        q.converted_at,
        q.work_order_line_id
      )
      or (
        w.estimate_number is not null
        and coalesce(w.estimate_status, 'draft') not in (
          'draft', 'waiting_for_parts'
        )
      )
      or public.work_order_is_financially_locked(q.shop_id, q.work_order_id)
    )
  )
)
update public.work_order_quote_lines q
set metadata = sanitized.metadata
from sanitized
where q.id = sanitized.id
  and q.metadata is distinct from sanitized.metadata;

-- Remove acquisition-cost keys written by legacy producers from every stored
-- technician snapshot, including protected/final quote lines. This changes
-- metadata privacy only; it does not reopen or recalculate final decisions.
update public.work_order_quote_lines q
set metadata = jsonb_set(
  coalesce(q.metadata, '{}'::jsonb),
  '{parts}',
  coalesce((
    select jsonb_agg(
      case
        when jsonb_typeof(part.value) = 'object' then
          part.value - array[
            'unitCost', 'unit_cost', 'cost', 'defaultCost', 'default_cost',
            'acquisitionCost', 'acquisition_cost'
          ]::text[]
        else part.value
      end
      order by part.ordinality
    )
    from jsonb_array_elements(q.metadata -> 'parts')
      with ordinality as part(value, ordinality)
  ), '[]'::jsonb),
  true
)
where jsonb_typeof(q.metadata -> 'parts') = 'array'
  and (
    coalesce(q.metadata, '{}'::jsonb) @? '$.parts[*].unitCost'
    or coalesce(q.metadata, '{}'::jsonb) @? '$.parts[*].unit_cost'
    or coalesce(q.metadata, '{}'::jsonb) @? '$.parts[*].cost'
    or coalesce(q.metadata, '{}'::jsonb) @? '$.parts[*].defaultCost'
    or coalesce(q.metadata, '{}'::jsonb) @? '$.parts[*].default_cost'
    or coalesce(q.metadata, '{}'::jsonb) @? '$.parts[*].acquisitionCost'
    or coalesce(q.metadata, '{}'::jsonb) @? '$.parts[*].acquisition_cost'
  );

do $$
declare
  v_guard_state text := current_setting(
    'profixiq.quote_financial_guard_state', true
  );
begin
  if v_guard_state = 'O' then
    execute 'alter table public.work_order_quote_lines enable trigger trg_guard_financially_locked_work_order_quote_lines';
  elsif v_guard_state = 'A' then
    execute 'alter table public.work_order_quote_lines enable always trigger trg_guard_financially_locked_work_order_quote_lines';
  elsif v_guard_state = 'R' then
    execute 'alter table public.work_order_quote_lines enable replica trigger trg_guard_financially_locked_work_order_quote_lines';
  end if;
end;
$$;

-- Recompute mutable linked quotes so legacy unit_cost-derived totals stop being
-- customer-visible immediately after this forward migration is deployed.
do $$
declare
  v_link record;
begin
  for v_link in
    select distinct pri.shop_id, pri.quote_line_id
    from public.part_request_items pri
    join public.work_order_quote_lines q
      on q.id = pri.quote_line_id
     and q.shop_id = pri.shop_id
    join public.work_orders w
      on w.id = q.work_order_id
     and w.shop_id = q.shop_id
    where pri.shop_id is not null
      and pri.quote_line_id is not null
      and not public.quote_line_pricing_is_protected(
        q.status::text,
        q.stage::text,
        q.sent_to_customer_at,
        q.sent_at,
        q.approved_at,
        q.declined_at,
        q.deferred_at,
        q.converted_at,
        q.work_order_line_id
      )
      and not public.work_order_is_financially_locked(
        q.shop_id,
        q.work_order_id
      )
      and (
        w.estimate_number is null
        or coalesce(w.estimate_status, 'draft') in (
          'draft', 'waiting_for_parts'
        )
      )
  loop
    begin
      perform public.sync_quote_line_pricing_from_parts(
        v_link.shop_id,
        v_link.quote_line_id
      );
    exception
      when lock_not_available or query_canceled or sqlstate '55000' then
        raise warning 'Quote pricing resync skipped for %/%: %',
          v_link.shop_id, v_link.quote_line_id, sqlerrm;
    end;
  end loop;
end;
$$;

-- Quarantine is a database lifecycle boundary, not a presentation hint. These
-- guards make direct table writes and the existing decision/materialization
-- RPC engines fail atomically before a quarantined line can be handed off.
create or replace function public.block_quarantined_quote_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_quarantined boolean := coalesce(
    old.metadata -> 'parts_quote' -> 'pricing_sanitization'
      ->> 'customer_pricing_quarantined',
    'false'
  ) = 'true';
  v_new_quarantined boolean := coalesce(
    new.metadata -> 'parts_quote' -> 'pricing_sanitization'
      ->> 'customer_pricing_quarantined',
    'false'
  ) = 'true';
  v_new_status text := lower(btrim(coalesce(new.status::text, '')));
  v_new_stage text := lower(btrim(coalesce(new.stage::text, '')));
  v_trusted_remediation boolean :=
    (select auth.uid()) is null
    and (
      current_user = 'service_role'
      or (
        current_user = 'postgres'
        and session_user = 'postgres'
        and nullif(
          current_setting('request.jwt.claims', true),
          ''
        ) is null
        and nullif(
          current_setting('request.jwt.claim.role', true),
          ''
        ) is null
      )
    );
begin
  if not (v_old_quarantined or v_new_quarantined) then
    return new;
  end if;

  if v_old_quarantined
     and not v_new_quarantined
     and not v_trusted_remediation then
    raise exception using
      errcode = '42501',
      message = 'QUOTE_PRICING_QUARANTINED: only trusted remediation may clear the manual-review quarantine.';
  end if;

  if (
    new.sent_to_customer_at is distinct from old.sent_to_customer_at
      and new.sent_to_customer_at is not null
  ) or (
    new.sent_at is distinct from old.sent_at
      and new.sent_at is not null
  ) or (
    new.approved_at is distinct from old.approved_at
      and new.approved_at is not null
  ) or (
    new.declined_at is distinct from old.declined_at
      and new.declined_at is not null
  ) or (
    new.deferred_at is distinct from old.deferred_at
      and new.deferred_at is not null
  ) or (
    new.converted_at is distinct from old.converted_at
      and new.converted_at is not null
  ) or (
    new.work_order_line_id is distinct from old.work_order_line_id
      and new.work_order_line_id is not null
  ) or (
    new.status is distinct from old.status
      and v_new_status in (
        'sent', 'approved', 'customer_approved', 'converted', 'declined',
        'deferred', 'rejected', 'cancelled', 'canceled', 'superseded',
        'voided'
      )
  ) or (
    new.stage is distinct from old.stage
      and (
        v_new_stage in ('sent', 'customer_review')
        or substring(v_new_stage from 1 for 9) = 'customer_'
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'QUOTE_PRICING_QUARANTINED: manual pricing review is required before customer handoff or decision.';
  end if;

  return new;
end;
$$;

revoke all on function public.block_quarantined_quote_lifecycle()
  from public, anon, authenticated;

drop trigger if exists block_quarantined_quote_lifecycle
  on public.work_order_quote_lines;
create trigger block_quarantined_quote_lifecycle
before update of status, stage, sent_to_customer_at, sent_at, approved_at,
  declined_at, deferred_at, converted_at, work_order_line_id, metadata
on public.work_order_quote_lines
for each row
execute function public.block_quarantined_quote_lifecycle();

create or replace function public.block_quarantined_quote_materialization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_row_id is null
     and coalesce(new.external_id, '') not like 'quote_line:%' then
    return new;
  end if;

  if exists (
    select 1
    from public.work_order_quote_lines q
    where (
        q.id::text = new.source_row_id::text
        or new.external_id = 'quote_line:' || q.id::text
      )
      and q.shop_id = new.shop_id
      and q.work_order_id = new.work_order_id
      and coalesce(
        q.metadata -> 'parts_quote' -> 'pricing_sanitization'
          ->> 'customer_pricing_quarantined',
        'false'
      ) = 'true'
  ) then
    raise exception using
      errcode = '55000',
      message = 'QUOTE_PRICING_QUARANTINED: work cannot be materialized until manual pricing review is complete.';
  end if;

  return new;
end;
$$;

revoke all on function public.block_quarantined_quote_materialization()
  from public, anon, authenticated, service_role;

drop trigger if exists block_quarantined_quote_materialization
  on public.work_order_lines;
create trigger block_quarantined_quote_materialization
before insert or update of source_row_id, external_id, shop_id, work_order_id
on public.work_order_lines
for each row
execute function public.block_quarantined_quote_materialization();

create or replace function public.block_quarantined_estimate_send_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type <> 'send_reserved'
     or jsonb_typeof(new.snapshot -> 'quote_line_ids') is distinct from 'array' then
    return new;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(new.snapshot -> 'quote_line_ids') line_id(value)
    join public.work_order_quote_lines q
      on q.id::text = line_id.value
     and q.shop_id = new.shop_id
     and q.work_order_id = new.work_order_id
    where coalesce(
      q.metadata -> 'parts_quote' -> 'pricing_sanitization'
        ->> 'customer_pricing_quarantined',
      'false'
    ) = 'true'
  ) then
    raise exception using
      errcode = '55000',
      message = 'QUOTE_PRICING_QUARANTINED: estimate delivery cannot be reserved until manual pricing review is complete.';
  end if;

  return new;
end;
$$;

revoke all on function public.block_quarantined_estimate_send_reservation()
  from public, anon, authenticated, service_role;

drop trigger if exists block_quarantined_estimate_send_reservation
  on public.estimate_events;
create trigger block_quarantined_estimate_send_reservation
before insert or update of event_type, snapshot
on public.estimate_events
for each row
execute function public.block_quarantined_estimate_send_reservation();

notify pgrst, 'reload schema';

commit;
