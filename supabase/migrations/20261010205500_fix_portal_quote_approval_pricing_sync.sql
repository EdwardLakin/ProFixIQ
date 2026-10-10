begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Portal approval materializes a work-order line and relinks the associated
-- Parts Request. That relink runs the parts lifecycle reconciler, which can
-- update part-request item statuses and therefore fire this pricing trigger.
-- Once a quote has been handed to the customer its sell pricing is immutable,
-- so there is nothing for the pricing sync to do. Skip the sync before its
-- staff-only authorization guard instead of letting a valid customer approval
-- roll back while traversing the parts lifecycle.
create or replace function public.trg_sync_quote_line_pricing_from_parts()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_quote_line_id uuid;
  v_pricing_protected boolean := false;
begin
  v_shop_id := coalesce(new.shop_id, old.shop_id);
  v_quote_line_id := coalesce(new.quote_line_id, old.quote_line_id);

  if v_shop_id is not null and v_quote_line_id is not null then
    select public.quote_line_pricing_is_protected(
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
    into v_pricing_protected
    from public.work_order_quote_lines q
    where q.id = v_quote_line_id
      and q.shop_id = v_shop_id;

    if coalesce(v_pricing_protected, false) then
      return coalesce(new, old);
    end if;

    perform public.sync_quote_line_pricing_from_parts(
      v_shop_id,
      v_quote_line_id
    );
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.trg_sync_quote_line_pricing_from_parts() is
  'Keeps mutable quote pricing synchronized from Parts Requests, but skips already customer-protected quote lines so portal approval relinking cannot invoke the staff-only pricing sync.';

do $$
declare
  v_sql text;
  v_protected_pos integer;
  v_sync_pos integer;
begin
  select lower(pg_get_functiondef(
    'public.trg_sync_quote_line_pricing_from_parts()'::regprocedure
  )) into v_sql;

  v_protected_pos := position('quote_line_pricing_is_protected' in v_sql);
  v_sync_pos := position('perform public.sync_quote_line_pricing_from_parts' in v_sql);

  if v_protected_pos = 0 or v_sync_pos = 0 or v_protected_pos >= v_sync_pos then
    raise exception 'Portal quote approval pricing trigger postcheck failed';
  end if;
end;
$$;

commit;
