begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- This legacy trigger ignores the caller's explicit NULL anchor and attaches
-- every new request item to the oldest line on the work order. Quote-origin
-- parts must remain unanchored until the atomic approval command materializes
-- (or deliberately reuses) their canonical work-order line.
drop trigger if exists trg_link_part_request_item
  on public.part_request_items;
drop function if exists public.link_part_request_item_to_line();

do $$
begin
  if to_regprocedure(
    'public.prevent_part_request_item_anchor_changes()'
  ) is null then
    raise exception
      'Canonical part-request item anchor guard is missing';
  end if;
end;
$$;

-- The canonical guard correctly prevents ordinary non-null -> NULL reparenting.
-- Suspend it only for this deterministic repair, then restore it before commit.
drop trigger if exists trg_prevent_part_request_item_anchor_changes
  on public.part_request_items;

update public.part_request_items pri
set work_order_line_id = null,
    updated_at = now()
from public.part_requests pr,
     public.work_order_quote_lines q
where pr.id = pri.request_id
  and pr.shop_id = pri.shop_id
  and pr.work_order_id = pri.work_order_id
  and pr.quote_line_id = pri.quote_line_id
  and q.id = pri.quote_line_id
  and q.shop_id = pri.shop_id
  and q.work_order_id = pri.work_order_id
  and pri.work_order_line_id is not null
  and pr.job_id is null
  and q.source_work_order_line_id is null
  and q.work_order_line_id is null
  and q.approved_at is null
  and lower(coalesce(q.status::text, '')) not in (
    'approved', 'converted', 'declined', 'deferred', 'rejected', 'cancelled'
  )
  and lower(coalesce(pr.status::text, 'requested')) in ('requested', 'quoted')
  and lower(coalesce(pri.status::text, 'requested')) in (
    'requested', 'quoted', 'awaiting_customer_approval'
  )
  and coalesce(pri.qty_ordered, 0) = 0
  and coalesce(pri.qty_received, 0) = 0
  and coalesce(pri.qty_reserved, 0) = 0
  and coalesce(pri.qty_consumed, 0) = 0
  and coalesce(pri.qty_returned, 0) = 0
  and pri.po_id is null
  and not public.work_order_is_financially_locked(
    pri.shop_id,
    pri.work_order_id
  )
  and not exists (
    select 1
    from public.purchase_order_lines pol
    where pol.part_request_item_id = pri.id
  )
  and not exists (
    select 1
    from public.work_order_parts wop
    where wop.source_parts_request_item_id = pri.id
  );

create trigger trg_prevent_part_request_item_anchor_changes
before update on public.part_request_items
for each row
execute function public.prevent_part_request_item_anchor_changes();

do $$
begin
  if exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.part_request_items'::regclass
      and t.tgname = 'trg_link_part_request_item'
      and not t.tgisinternal
  ) then
    raise exception 'Legacy part-request auto-anchor trigger still exists';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.part_request_items'::regclass
      and t.tgname = 'trg_prevent_part_request_item_anchor_changes'
      and not t.tgisinternal
  ) then
    raise exception 'Canonical part-request anchor guard was not restored';
  end if;

  if exists (
    select 1
    from public.part_request_items pri
    join public.part_requests pr
      on pr.id = pri.request_id
     and pr.shop_id = pri.shop_id
     and pr.work_order_id = pri.work_order_id
     and pr.quote_line_id = pri.quote_line_id
    join public.work_order_quote_lines q
      on q.id = pri.quote_line_id
     and q.shop_id = pri.shop_id
     and q.work_order_id = pri.work_order_id
    where pri.work_order_line_id is not null
      and pr.job_id is null
      and q.source_work_order_line_id is null
      and q.work_order_line_id is null
      and q.approved_at is null
      and lower(coalesce(q.status::text, '')) not in (
        'approved', 'converted', 'declined', 'deferred', 'rejected', 'cancelled'
      )
      and lower(coalesce(pr.status::text, 'requested')) in (
        'requested', 'quoted'
      )
      and lower(coalesce(pri.status::text, 'requested')) in (
        'requested', 'quoted', 'awaiting_customer_approval'
      )
      and coalesce(pri.qty_ordered, 0) = 0
      and coalesce(pri.qty_received, 0) = 0
      and coalesce(pri.qty_reserved, 0) = 0
      and coalesce(pri.qty_consumed, 0) = 0
      and coalesce(pri.qty_returned, 0) = 0
      and pri.po_id is null
      and not public.work_order_is_financially_locked(
        pri.shop_id,
        pri.work_order_id
      )
      and not exists (
        select 1
        from public.purchase_order_lines pol
        where pol.part_request_item_id = pri.id
      )
      and not exists (
        select 1
        from public.work_order_parts wop
        where wop.source_parts_request_item_id = pri.id
      )
  ) then
    raise exception
      'Safe unreleased quote-part auto-anchors remain after repair';
  end if;
end;
$$;

commit;
