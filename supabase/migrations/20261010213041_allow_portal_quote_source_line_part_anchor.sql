begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Approval intentionally reuses source_work_order_line_id when a quote came
-- from an existing pending repair line. The anchor guard already permits a
-- one-time null -> canonical materialized quote-line anchor, but did not permit
-- that equally canonical recorded source line. Allow only the source line tied
-- to the same quote, shop, and work order; all other reparenting stays blocked.
create or replace function public.prevent_part_request_item_anchor_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_line_id uuid;
begin
  if new.shop_id is distinct from old.shop_id then
    raise exception 'part_request_items.shop_id cannot be changed';
  end if;
  if new.request_id is distinct from old.request_id then
    raise exception 'part_request_items.request_id cannot be changed';
  end if;
  if new.work_order_id is distinct from old.work_order_id then
    raise exception 'part_request_items.work_order_id cannot be changed';
  end if;

  if new.quote_line_id is distinct from old.quote_line_id then
    if old.quote_line_id is not null
       or new.quote_line_id is null
       or not exists (
         select 1
         from public.part_requests pr
         join public.work_order_quote_lines q
           on q.id = new.quote_line_id
          and q.shop_id = new.shop_id
          and q.work_order_id = new.work_order_id
         where pr.id = new.request_id
           and pr.shop_id = new.shop_id
           and pr.work_order_id = new.work_order_id
           and pr.quote_line_id = new.quote_line_id
           and pr.job_id is not null
           and q.source_work_order_line_id = pr.job_id
       )
       or coalesce(old.qty_ordered, 0) > 0
       or coalesce(old.qty_received, 0) > 0
       or coalesce(old.qty_reserved, 0) > 0
       or coalesce(old.qty_consumed, 0) > 0
       or coalesce(old.qty_returned, 0) > 0
       or old.po_id is not null then
      raise exception 'part_request_items.quote_line_id cannot be changed';
    end if;
  end if;

  if new.work_order_line_id is distinct from old.work_order_line_id then
    select coalesce(new.quote_line_id, pr.quote_line_id)
      into v_quote_line_id
    from public.part_requests pr
    where pr.id = new.request_id;

    if old.work_order_line_id is not null
       or new.work_order_line_id is null
       or v_quote_line_id is null
       or not exists (
         select 1
         from public.work_order_lines wol
         where wol.id = new.work_order_line_id
           and wol.shop_id = new.shop_id
           and wol.work_order_id = new.work_order_id
           and (
             wol.source_row_id = v_quote_line_id
             or wol.external_id = 'quote_line:' || v_quote_line_id::text
             or exists (
               select 1
               from public.work_order_quote_lines q
               where q.id = v_quote_line_id
                 and q.shop_id = new.shop_id
                 and q.work_order_id = new.work_order_id
                 and q.source_work_order_line_id = wol.id
             )
           )
       ) then
      raise exception 'part_request_items.work_order_line_id cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.prevent_part_request_item_anchor_changes() is
  'Prevents part request item reparenting while allowing the one-time null-to-canonical work-order-line anchor for either a materialized quote line or that quote line''s recorded source work-order line.';

commit;
