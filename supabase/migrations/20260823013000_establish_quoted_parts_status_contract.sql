begin;

-- Keep database aggregation aligned with the application contract: a quoted
-- manual/vendor part does not require a catalog part_id when it has identity,
-- quantity, and an explicit non-negative customer price.
create or replace function public.parts_request_operational_stage(
  p_request_id uuid
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_request public.part_requests%rowtype;
  v_item_count integer := 0;
  v_all_priced boolean := false;
  v_all_staged boolean := false;
  v_all_handed_off boolean := false;
  v_any_order_progress boolean := false;
begin
  select * into v_request
  from public.part_requests
  where id = p_request_id;

  if not found then
    return 'completed';
  end if;

  if lower(v_request.status::text) in (
    'fulfilled', 'rejected', 'cancelled', 'deferred', 'returned'
  ) or v_request.handoff_completed_at is not null then
    return 'completed';
  end if;

  select
    count(*),
    coalesce(bool_and(public.part_request_item_is_quote_ready(
      pri.description,
      pri.part_id,
      pri.requested_part_number,
      pri.requested_manufacturer,
      greatest(
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0),
        coalesce(pri.qty_approved, 0),
        0
      ),
      coalesce(pri.quoted_price, pri.unit_price)
    )), false),
    coalesce(bool_and(
      coalesce(pri.qty_reserved, 0)
        + greatest(
          coalesce(pri.qty_consumed, 0) - coalesce(pri.qty_returned, 0),
          0
        )
      >= greatest(
        coalesce(pri.qty_approved, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0),
        0
      )
    ), false),
    coalesce(bool_and(
      greatest(
        coalesce(pri.qty_consumed, 0) - coalesce(pri.qty_returned, 0),
        0
      ) >= greatest(
        coalesce(pri.qty_approved, 0),
        coalesce(pri.qty_requested, 0),
        coalesce(pri.qty, 0),
        0
      )
    ), false),
    coalesce(bool_or(
      coalesce(pri.qty_ordered, 0) > 0
      or coalesce(pri.qty_received, 0) > 0
      or coalesce(pri.qty_reserved, 0) > 0
      or coalesce(pri.qty_consumed, 0) > 0
      or lower(coalesce(pri.status::text, 'requested')) in (
        'approved', 'ordered', 'partially_ordered', 'partially_received',
        'received', 'reserved', 'picking', 'picked', 'fulfilled', 'consumed'
      )
    ), false)
  into
    v_item_count,
    v_all_priced,
    v_all_staged,
    v_all_handed_off,
    v_any_order_progress
  from public.part_request_items pri
  where pri.request_id = p_request_id
    and lower(coalesce(pri.status::text, 'requested')) <> 'cancelled';

  if v_item_count = 0 or not v_all_priced then
    return 'needs_quote';
  end if;
  if v_all_handed_off then
    return 'completed';
  end if;
  if v_all_staged then
    return 'ready_for_tech';
  end if;
  if v_any_order_progress then
    return 'order_receive';
  end if;
  if lower(v_request.status::text) in ('requested', 'quoted') then
    return 'awaiting_approval';
  end if;
  return 'order_receive';
end;
$$;

revoke all on function public.parts_request_operational_stage(uuid)
  from public, anon, authenticated;

-- Service-only publish guard. Quote delivery is not allowed to continue when
-- live request items, the canonical metadata snapshot, and quote-line totals
-- disagree. Empty legacy lines remain compatible, but are not labeled as
-- labor-only unless their metadata says so explicitly.
create or replace function public.assert_quote_parts_publishable(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected_count integer;
  v_line_count integer;
  v_line public.work_order_quote_lines%rowtype;
  v_parts_quote jsonb;
  v_snapshot_items jsonb;
  v_snapshot_count integer;
  v_required_count integer;
  v_quoted_count integer;
  v_pending_count integer;
  v_snapshot_total numeric;
  v_live_count integer;
  v_live_total numeric;
  v_all_live_ready boolean;
begin
  if p_shop_id is null or p_work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_PARTS_SCOPE_INVALID';
  end if;

  select count(*) into v_expected_count
  from (select distinct unnest(coalesce(p_quote_line_ids, '{}'::uuid[]))) ids;
  if v_expected_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_PARTS_SCOPE_INVALID';
  end if;

  select count(*) into v_line_count
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(p_quote_line_ids);
  if v_line_count <> v_expected_count then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_PARTS_SCOPE_INVALID';
  end if;

  for v_line in
    select *
    from public.work_order_quote_lines q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and q.id = any(p_quote_line_ids)
    order by q.id
    for update
  loop
    v_parts_quote := case
      when jsonb_typeof(coalesce(v_line.metadata, '{}'::jsonb) -> 'parts_quote') = 'object'
        then coalesce(v_line.metadata, '{}'::jsonb) -> 'parts_quote'
      else '{}'::jsonb
    end;
    v_snapshot_items := case
      when jsonb_typeof(v_parts_quote -> 'items') = 'array'
        then v_parts_quote -> 'items'
      else '[]'::jsonb
    end;
    v_snapshot_count := jsonb_array_length(v_snapshot_items);
    v_required_count := coalesce((v_parts_quote ->> 'required_count')::integer, v_snapshot_count);
    v_quoted_count := coalesce((v_parts_quote ->> 'quoted_count')::integer, 0);
    v_pending_count := coalesce(
      (v_parts_quote ->> 'pending_count')::integer,
      greatest(v_required_count - v_quoted_count, 0)
    );
    v_snapshot_total := coalesce((v_parts_quote ->> 'parts_total')::numeric, 0);

    if coalesce(
      (v_parts_quote -> 'pricing_sanitization' ->> 'customer_pricing_quarantined')::boolean,
      false
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'QUOTE_PARTS_PRICING_UNAVAILABLE';
    end if;

    with active_requests as (
      select pr.id
      from public.part_requests pr
      where pr.shop_id = p_shop_id
        and pr.work_order_id = p_work_order_id
        and pr.quote_line_id = v_line.id
        and lower(coalesce(pr.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'voided'
        )
    ), live_items as (
      select
        pri.*,
        greatest(
          coalesce(pri.qty, 0),
          coalesce(pri.qty_requested, 0),
          coalesce(pri.qty_approved, 0),
          0
        ) as canonical_qty,
        coalesce(pri.quoted_price, pri.unit_price) as canonical_unit_price
      from active_requests ar
      join public.part_request_items pri on pri.request_id = ar.id
      where pri.shop_id = p_shop_id
        and pri.work_order_id = p_work_order_id
        and pri.quote_line_id = v_line.id
        and lower(coalesce(pri.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'voided'
        )
    )
    select
      count(*)::integer,
      coalesce(bool_and(public.part_request_item_is_quote_ready(
        description,
        part_id,
        requested_part_number,
        requested_manufacturer,
        canonical_qty,
        canonical_unit_price
      )), false),
      coalesce(round(sum(
        case when public.part_request_item_is_quote_ready(
          description,
          part_id,
          requested_part_number,
          requested_manufacturer,
          canonical_qty,
          canonical_unit_price
        ) then canonical_qty * canonical_unit_price else 0 end
      ), 2), 0)
    into v_live_count, v_all_live_ready, v_live_total
    from live_items;

    if v_live_count > 0 then
      if not v_all_live_ready then
        raise exception using
          errcode = 'P0001',
          message = 'QUOTE_PARTS_INCOMPLETE';
      end if;
      if v_required_count <> v_live_count
         or v_quoted_count <> v_live_count
         or v_pending_count <> 0
         or v_snapshot_count <> v_live_count
         or abs(v_snapshot_total - v_live_total) > 0.009
         or abs(coalesce(v_line.parts_total, 0) - v_live_total) > 0.009 then
        raise exception using
          errcode = 'P0001',
          message = 'QUOTE_PARTS_CONTRACT_MISMATCH';
      end if;

      if exists (
        with active_requests as (
          select pr.id
          from public.part_requests pr
          where pr.shop_id = p_shop_id
            and pr.work_order_id = p_work_order_id
            and pr.quote_line_id = v_line.id
            and lower(coalesce(pr.status::text, 'requested')) not in (
              'cancelled', 'canceled', 'rejected', 'declined', 'voided'
            )
        )
        select 1
        from active_requests ar
        join public.part_request_items pri on pri.request_id = ar.id
        where pri.shop_id = p_shop_id
          and pri.work_order_id = p_work_order_id
          and pri.quote_line_id = v_line.id
          and lower(coalesce(pri.status::text, 'requested')) not in (
            'cancelled', 'canceled', 'rejected', 'declined', 'voided'
          )
          and not exists (
            select 1
            from jsonb_array_elements(v_snapshot_items) snapshot(item)
            where snapshot.item ->> 'id' = pri.id::text
              and abs(
                (snapshot.item ->> 'qty')::numeric
                - greatest(
                    coalesce(pri.qty, 0),
                    coalesce(pri.qty_requested, 0),
                    coalesce(pri.qty_approved, 0),
                    0
                  )
              ) < 0.009
              and abs(
                (snapshot.item ->> 'unit_price')::numeric
                - coalesce(pri.quoted_price, pri.unit_price)
              ) < 0.009
              and abs(
                (snapshot.item ->> 'line_total')::numeric
                - round(
                    greatest(
                      coalesce(pri.qty, 0),
                      coalesce(pri.qty_requested, 0),
                      coalesce(pri.qty_approved, 0),
                      0
                    ) * coalesce(pri.quoted_price, pri.unit_price),
                    2
                  )
              ) < 0.009
          )
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'QUOTE_PARTS_CONTRACT_MISMATCH';
      end if;
    elsif v_snapshot_count > 0 then
      if v_required_count <> v_snapshot_count
         or v_quoted_count <> v_snapshot_count
         or v_pending_count <> 0
         or exists (
           select 1
           from jsonb_array_elements(v_snapshot_items) snapshot(item)
           where nullif(trim(snapshot.item ->> 'description'), '') is null
              or coalesce((snapshot.item ->> 'qty')::numeric, 0) <= 0
              or (snapshot.item ->> 'unit_price')::numeric < 0
              or abs(
                (snapshot.item ->> 'line_total')::numeric
                - round(
                    (snapshot.item ->> 'qty')::numeric
                    * (snapshot.item ->> 'unit_price')::numeric,
                    2
                  )
              ) > 0.009
         )
         or abs(
           v_snapshot_total - coalesce((
             select round(sum((snapshot.item ->> 'line_total')::numeric), 2)
             from jsonb_array_elements(v_snapshot_items) snapshot(item)
           ), 0)
         ) > 0.009
         or abs(coalesce(v_line.parts_total, 0) - v_snapshot_total) > 0.009 then
        raise exception using
          errcode = 'P0001',
          message = 'QUOTE_PARTS_CONTRACT_MISMATCH';
      end if;
    elsif (
      coalesce(v_line.parts_total, 0) <> 0
      or coalesce(v_line.metadata, '{}'::jsonb) ->> 'parts_required' = 'true'
      or jsonb_array_length(
        case
          when jsonb_typeof(coalesce(v_line.metadata, '{}'::jsonb) -> 'parts') = 'array'
            then coalesce(v_line.metadata, '{}'::jsonb) -> 'parts'
          else '[]'::jsonb
        end
      ) > 0
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'QUOTE_PARTS_CONTRACT_MISMATCH';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'quote_line_count', v_line_count
  );
end;
$$;

revoke all on function public.assert_quote_parts_publishable(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.assert_quote_parts_publishable(uuid, uuid, uuid[])
  to service_role;

comment on function public.assert_quote_parts_publishable(uuid, uuid, uuid[]) is
  'Service-only quote publish guard for canonical parts quantities, customer prices, snapshots, and totals.';

commit;
