begin;

create or replace function public.part_request_item_is_quote_ready(
  p_description text,
  p_part_id uuid,
  p_requested_part_number text,
  p_requested_manufacturer text,
  p_qty numeric,
  p_unit_price numeric
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select (
    (
      nullif(trim(coalesce(p_description, '')), '') is not null
      or p_part_id is not null
      or nullif(trim(coalesce(p_requested_part_number, '')), '') is not null
      or nullif(trim(coalesce(p_requested_manufacturer, '')), '') is not null
    )
    and coalesce(p_qty, 0) > 0
    and p_unit_price is not null
    and p_unit_price >= 0
  );
$$;

comment on function public.part_request_item_is_quote_ready(text, uuid, text, text, numeric, numeric) is
  'Returns true when a parts request item has enough vendor/free-typed identity plus price/quantity to be customer-quoted before inventory is attached.';

do $$
declare
  v_sql text;
begin
  select pg_get_functiondef('public.sync_quote_line_pricing_from_parts(uuid, uuid)'::regprocedure)
    into v_sql;

  v_sql := replace(
    v_sql,
    'count(*) filter (where part_id is not null and unit_price is not null and unit_price >= 0)::integer,',
    'count(*) filter (where public.part_request_item_is_quote_ready(description, part_id, requested_part_number, requested_manufacturer, qty, unit_price))::integer,'
  );
  v_sql := replace(
    v_sql,
    'count(*) filter (where part_id is null or unit_price is null or unit_price < 0)::integer,',
    'count(*) filter (where not public.part_request_item_is_quote_ready(description, part_id, requested_part_number, requested_manufacturer, qty, unit_price))::integer,'
  );
  v_sql := replace(
    v_sql,
    'coalesce(round(sum(case when part_id is not null and unit_price is not null and unit_price >= 0 then qty * unit_price else 0 end), 2), 0),',
    'coalesce(round(sum(case when public.part_request_item_is_quote_ready(description, part_id, requested_part_number, requested_manufacturer, qty, unit_price) then qty * unit_price else 0 end), 2), 0),'
  );

  if v_sql not like '%public.part_request_item_is_quote_ready(description, part_id, requested_part_number, requested_manufacturer, qty, unit_price)%' then
    raise exception 'sync_quote_line_pricing_from_parts quote-ready replacement did not apply';
  end if;

  execute v_sql;
end;
$$;

do $$
declare
  v_old text := $old$
      nullif(trim(pri.description), '') is not null
      and pri.part_id is not null
      and greatest(
        coalesce(pri.qty_requested, 0), coalesce(pri.qty, 0), 0
      ) > 0
      and coalesce(pri.quoted_price, pri.unit_price) is not null
$old$;
  v_new text := $new$public.part_request_item_is_quote_ready(
      pri.description,
      pri.part_id,
      pri.requested_part_number,
      pri.requested_manufacturer,
      greatest(coalesce(pri.qty_requested, 0), coalesce(pri.qty, 0), 0),
      coalesce(pri.quoted_price, pri.unit_price)
    )$new$;
  v_sql text;
begin
  select pg_get_functiondef('public.parts_request_operational_stage(uuid)'::regprocedure)
    into v_sql;
  v_sql := replace(v_sql, v_old, v_new);
  if v_sql not like '%public.part_request_item_is_quote_ready%' then
    raise exception 'parts_request_operational_stage quote-ready replacement did not apply';
  end if;
  execute v_sql;

  select pg_get_functiondef('public.parts_reconcile_request_lifecycle(uuid)'::regprocedure)
    into v_sql;
  v_sql := replace(v_sql, v_old, v_new);
  if v_sql not like '%public.part_request_item_is_quote_ready%' then
    raise exception 'parts_reconcile_request_lifecycle quote-ready replacement did not apply';
  end if;
  execute v_sql;
end;
$$;

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

  for r in
    select id
    from public.part_requests
    where lower(coalesce(status::text, 'requested')) in ('requested', 'quoted')
  loop
    perform public.parts_reconcile_request_lifecycle(r.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
