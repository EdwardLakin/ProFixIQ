-- Allow authorized front-end staff to remove an unsent draft quote line safely.
-- The delete is intentionally blocked once the quote has customer/final/operational history.

create or replace function public.delete_work_order_quote_line_draft(
  p_quote_line_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.profiles%rowtype;
  v_line public.work_order_quote_lines%rowtype;
  v_request_ids uuid[] := array[]::uuid[];
  v_deleted_items integer := 0;
  v_cancelled_requests integer := 0;
begin
  select *
    into v_actor
  from public.profiles
  where id = auth.uid();

  if not found or v_actor.shop_id is null then
    raise exception using errcode = '42501', message = 'QUOTE_DELETE_FORBIDDEN';
  end if;

  if lower(coalesce(v_actor.role::text, '')) not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor', 'foreman'
  ) then
    raise exception using errcode = '42501', message = 'QUOTE_DELETE_FORBIDDEN';
  end if;

  select *
    into v_line
  from public.work_order_quote_lines
  where id = p_quote_line_id
    and shop_id = v_actor.shop_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_line.sent_to_customer_at is not null
     or v_line.approved_at is not null
     or v_line.declined_at is not null
     or v_line.deferred_at is not null
     or v_line.work_order_line_id is not null
     or lower(coalesce(v_line.status::text, '')) in (
       'sent', 'customer_pending', 'approved', 'customer_approved',
       'declined', 'deferred', 'converted', 'rejected', 'cancelled'
     ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'protected_state',
      'error', 'This quote line already has customer or finalized history and cannot be deleted.'
    );
  end if;

  select coalesce(array_agg(pr.id), array[]::uuid[])
    into v_request_ids
  from public.part_requests pr
  where pr.shop_id = v_line.shop_id
    and pr.work_order_id = v_line.work_order_id
    and pr.quote_line_id = v_line.id;

  if exists (
    select 1
    from public.part_request_items pri
    where pri.shop_id = v_line.shop_id
      and pri.work_order_id = v_line.work_order_id
      and pri.quote_line_id = v_line.id
      and (
        pri.po_id is not null
        or coalesce(pri.qty_ordered, 0) > 0
        or coalesce(pri.qty_received, 0) > 0
        or coalesce(pri.qty_reserved, 0) > 0
        or coalesce(pri.qty_consumed, 0) > 0
        or coalesce(pri.qty_returned, 0) > 0
      )
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'parts_operational_activity',
      'error', 'This quote line has ordering or inventory activity and cannot be deleted.'
    );
  end if;

  if cardinality(v_request_ids) > 0 and exists (
    select 1
    from public.parts_supplier_quote_requests psqr
    where psqr.parts_request_id = any(v_request_ids)
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'supplier_quote_activity',
      'error', 'This quote line has supplier quote activity and cannot be deleted.'
    );
  end if;

  delete from public.part_request_items
  where shop_id = v_line.shop_id
    and work_order_id = v_line.work_order_id
    and quote_line_id = v_line.id;
  get diagnostics v_deleted_items = row_count;

  if cardinality(v_request_ids) > 0 then
    update public.part_requests
    set status = 'cancelled',
        quote_line_id = null
    where id = any(v_request_ids)
      and shop_id = v_line.shop_id
      and work_order_id = v_line.work_order_id;
    get diagnostics v_cancelled_requests = row_count;
  end if;

  delete from public.work_order_quote_lines
  where id = v_line.id
    and shop_id = v_line.shop_id
    and work_order_id = v_line.work_order_id;

  return jsonb_build_object(
    'ok', true,
    'quoteLineId', v_line.id,
    'workOrderId', v_line.work_order_id,
    'deletedPartItems', v_deleted_items,
    'cancelledPartRequests', v_cancelled_requests
  );
end;
$$;

revoke all on function public.delete_work_order_quote_line_draft(uuid)
  from public, anon;
grant execute on function public.delete_work_order_quote_line_draft(uuid)
  to authenticated, service_role;

comment on function public.delete_work_order_quote_line_draft(uuid) is
  'Deletes only unsent/unfinalized quote lines for quote-authorizing shop staff. Linked pre-approval part items are removed and their empty requests are cancelled. Blocks supplier, PO, inventory, customer, and final-decision history.';
