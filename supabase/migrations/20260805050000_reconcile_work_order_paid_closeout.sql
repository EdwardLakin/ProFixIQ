begin;

-- A completed line used to be unable to advance a work order whose stale
-- header still said awaiting_approval. Reconcile the header from durable line
-- and quote state instead of treating the old header as an immutable gate.
create or replace function private.reconcile_work_order_state(
  p_work_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_work_order public.work_orders%rowtype;
  v_actionable_count integer := 0;
  v_nonterminal_count integer := 0;
  v_pending_line_count integer := 0;
  v_pending_quote_count integer := 0;
  v_approved_count integer := 0;
  v_declined_count integer := 0;
  v_any_in_progress boolean := false;
  v_any_on_hold boolean := false;
  v_next_status text;
  v_next_approval text;
begin
  select wo.*
  into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
  for update;

  if not found
     or lower(coalesce(v_work_order.status, '')) in ('invoiced', 'cancelled')
     or public.work_order_is_financially_locked(v_work_order.shop_id, v_work_order.id) then
    return;
  end if;

  select
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
    ),
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and lower(coalesce(wol.status::text, '')) not in (
          'completed', 'ready_to_invoice', 'invoiced'
        )
        and lower(coalesce(wol.line_status::text, '')) not in (
          'declined', 'deferred', 'voided', 'cancelled', 'canceled'
        )
    ),
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and (
          lower(coalesce(wol.approval_state::text, '')) in (
            'pending', 'awaiting_approval', 'sent'
          )
          or lower(coalesce(wol.status::text, '')) = 'awaiting_approval'
          or lower(coalesce(wol.line_status::text, '')) = 'pending'
        )
        and lower(coalesce(wol.status::text, '')) not in (
          'completed', 'ready_to_invoice', 'invoiced'
        )
        and lower(coalesce(wol.line_status::text, '')) not in (
          'declined', 'deferred', 'voided', 'cancelled', 'canceled'
        )
    ),
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and (
          lower(coalesce(wol.approval_state::text, '')) = 'approved'
          or lower(coalesce(wol.line_status::text, '')) = 'authorized'
          or lower(coalesce(wol.status::text, '')) in (
            'completed', 'ready_to_invoice', 'invoiced'
          )
        )
    ),
    count(*) filter (
      where wol.voided_at is null
        and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
        and (
          lower(coalesce(wol.approval_state::text, '')) = 'declined'
          or lower(coalesce(wol.line_status::text, '')) in ('declined', 'deferred')
        )
    ),
    coalesce(bool_or(
      wol.voided_at is null
      and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
      and (
        lower(coalesce(wol.status::text, '')) in ('in_progress', 'active')
        or (wol.punched_in_at is not null and wol.punched_out_at is null)
      )
    ), false),
    coalesce(bool_or(
      wol.voided_at is null
      and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
      and lower(coalesce(wol.line_status::text, '')) not in (
        'declined', 'deferred', 'voided', 'cancelled', 'canceled'
      )
      and lower(coalesce(wol.status::text, '')) in (
        'on_hold', 'waiting_parts', 'paused'
      )
    ), false)
  into
    v_actionable_count,
    v_nonterminal_count,
    v_pending_line_count,
    v_approved_count,
    v_declined_count,
    v_any_in_progress,
    v_any_on_hold
  from public.work_order_lines wol
  where wol.work_order_id = p_work_order_id;

  select count(*)
  into v_pending_quote_count
  from public.work_order_quote_lines q
  where q.work_order_id = p_work_order_id
    and q.shop_id = v_work_order.shop_id
    and (
      q.sent_to_customer_at is not null
      or lower(coalesce(q.status::text, '')) in ('sent', 'ready_to_send', 'quoted')
    )
    and not (
      lower(coalesce(q.status::text, '')) in (
        'approved', 'converted', 'declined', 'deferred', 'rejected',
        'cancelled', 'canceled'
      )
      or q.stage::text in (
        'customer_approved', 'customer_declined', 'customer_deferred'
      )
      or q.approved_at is not null
      or q.declined_at is not null
      or q.work_order_line_id is not null
    );

  v_next_approval := case
    when v_pending_quote_count + v_pending_line_count > 0
         and v_approved_count > 0 then 'partial'
    when v_pending_quote_count + v_pending_line_count > 0 then 'pending'
    when v_approved_count > 0 and v_declined_count > 0 then 'partial'
    when v_approved_count > 0 then 'approved'
    when v_declined_count > 0 then 'declined'
    else v_work_order.approval_state
  end;

  v_next_status := case
    when v_actionable_count = 0 then 'queued'
    when v_pending_quote_count + v_pending_line_count > 0 then 'awaiting_approval'
    when v_nonterminal_count = 0 then 'ready_to_invoice'
    when v_any_in_progress then 'in_progress'
    when v_any_on_hold then 'on_hold'
    else 'queued'
  end;

  if v_work_order.status is distinct from v_next_status
     or v_work_order.approval_state is distinct from v_next_approval then
    update public.work_orders
    set status = v_next_status,
        approval_state = v_next_approval,
        updated_at = pg_catalog.now()
    where id = p_work_order_id;
  end if;
end;
$function$;

revoke all on function private.reconcile_work_order_state(uuid)
  from public, anon, authenticated;

create or replace function public.refresh_work_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.work_order_id is not null then
    perform private.reconcile_work_order_state(new.work_order_id);
  end if;
  return new;
end;
$function$;

create or replace function public.refresh_work_order_status_del()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.work_order_id is not null then
    perform private.reconcile_work_order_state(old.work_order_id);
  end if;
  return old;
end;
$function$;

revoke all on function public.refresh_work_order_status()
  from public, anon, authenticated;
revoke all on function public.refresh_work_order_status_del()
  from public, anon, authenticated;

drop trigger if exists trg_wol_status_refresh on public.work_order_lines;
create trigger trg_wol_status_refresh
after insert or update of
  status,
  punched_in_at,
  punched_out_at,
  approval_state,
  line_status,
  voided_at
on public.work_order_lines
for each row execute function public.refresh_work_order_status();

drop trigger if exists trg_wol_status_refresh_del on public.work_order_lines;
create trigger trg_wol_status_refresh_del
after delete on public.work_order_lines
for each row execute function public.refresh_work_order_status_del();

-- Preserve a durable approval audit whenever a line first becomes approved.
create or replace function public.capture_work_order_line_approval_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_user_id uuid;
  v_method text := 'advisor';
  v_approved_at timestamptz := coalesce(new.approval_at, pg_catalog.now());
begin
  if lower(coalesce(new.approval_state::text, '')) <> 'approved'
     or lower(coalesce(old.approval_state::text, '')) = 'approved'
     or new.approval_by is null then
    return new;
  end if;

  select c.user_id
  into v_customer_user_id
  from public.work_orders wo
  join public.customers c on c.id = wo.customer_id
  where wo.id = new.work_order_id;

  if v_customer_user_id is not distinct from new.approval_by then
    v_method := 'customer';
  end if;

  if not exists (
    select 1
    from public.work_order_approvals a
    where a.work_order_id = new.work_order_id
      and a.approved_by is not distinct from new.approval_by
      and a.approved_at is not distinct from v_approved_at
      and a.method is not distinct from v_method
  ) then
    insert into public.work_order_approvals(
      work_order_id, approved_by, approved_at, method
    ) values (
      new.work_order_id, new.approval_by, v_approved_at, v_method
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.capture_work_order_line_approval_audit()
  from public, anon, authenticated;

drop trigger if exists trg_work_order_line_approval_audit
  on public.work_order_lines;
create trigger trg_work_order_line_approval_audit
after update of approval_state on public.work_order_lines
for each row execute function public.capture_work_order_line_approval_audit();

insert into public.work_order_approvals(
  work_order_id, approved_by, approved_at, method
)
select
  wol.work_order_id,
  wol.approval_by,
  wol.approval_at,
  case when c.user_id is not distinct from wol.approval_by then 'customer' else 'advisor' end
from public.work_order_lines wol
join public.work_orders wo on wo.id = wol.work_order_id
left join public.customers c on c.id = wo.customer_id
where lower(coalesce(wol.approval_state::text, '')) = 'approved'
  and lower(coalesce(wo.status, '')) = 'awaiting_approval'
  and lower(coalesce(wol.status::text, '')) in (
    'completed', 'ready_to_invoice', 'invoiced'
  )
  and wol.approval_by is not null
  and wol.approval_at is not null
  and not exists (
    select 1
    from public.work_order_approvals a
    where a.work_order_id = wol.work_order_id
      and a.approved_by is not distinct from wol.approval_by
      and a.approved_at is not distinct from wol.approval_at
  );

-- Payment is the closeout boundary. Once the immutable invoice is paid, copy
-- the completed visit to customer history in the same database transaction.
create or replace function public.sync_paid_work_order_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_history_id uuid;
  v_description text;
  v_causes text;
  v_corrections text;
  v_labor_hours numeric := 0;
  v_advisor_name text;
  v_technician_name text;
  v_notes text;
begin
  if lower(coalesce(new.payment_status, '')) <> 'paid'
     or new.customer_id is null then
    return new;
  end if;

  select i.*
  into v_invoice
  from public.invoices i
  where i.work_order_id = new.id
    and i.shop_id = new.shop_id
  order by
    (i.active_invoice_version_id is not null) desc,
    i.issued_at desc nulls last,
    i.created_at desc
  limit 1;

  select
    pg_catalog.string_agg(
      nullif(pg_catalog.concat_ws(
        ' / ',
        nullif(pg_catalog.btrim(wol.description), ''),
        nullif(pg_catalog.btrim(wol.complaint), ''),
        nullif(pg_catalog.btrim(wol.cause), ''),
        nullif(pg_catalog.btrim(wol.correction), '')
      ), ''),
      E'\n' order by wol.created_at, wol.id
    ),
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.cause), ''), E'\n'
    ),
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.correction), ''), E'\n'
    ),
    coalesce(pg_catalog.sum(wol.labor_time), 0)
  into v_description, v_causes, v_corrections, v_labor_hours
  from public.work_order_lines wol
  where wol.work_order_id = new.id
    and wol.voided_at is null;

  select nullif(pg_catalog.btrim(p.full_name), '')
  into v_advisor_name
  from public.profiles p
  where p.id = new.advisor_id;

  select pg_catalog.string_agg(distinct nullif(pg_catalog.btrim(p.full_name), ''), ', ')
  into v_technician_name
  from public.work_order_lines wol
  left join public.work_order_line_technicians wolt
    on wolt.work_order_line_id = wol.id
  left join public.profiles p
    on p.id = coalesce(wolt.technician_id, wol.assigned_tech_id, wol.assigned_to)
  where wol.work_order_id = new.id
    and wol.voided_at is null;

  v_description := coalesce(
    nullif(pg_catalog.btrim(v_description), ''),
    nullif(pg_catalog.btrim(new.notes), ''),
    'Completed work order ' || coalesce(new.custom_id, new.id::text)
  );

  v_notes := pg_catalog.concat_ws(
    E'\n',
    'Work order: ' || coalesce(new.custom_id, new.id::text),
    case when v_invoice.invoice_number is not null
      then 'Invoice: ' || v_invoice.invoice_number else null end,
    'Payment: paid',
    nullif(pg_catalog.btrim(new.notes), '')
  );

  select h.id
  into v_history_id
  from public.history h
  where h.work_order_id = new.id
  order by h.created_at asc nulls last, h.id
  limit 1
  for update;

  if v_history_id is null then
    insert into public.history(
      customer_id,
      vehicle_id,
      work_order_id,
      service_date,
      description,
      notes,
      source_system,
      source_external_id,
      work_order_number,
      invoice_number,
      opened_at,
      closed_at,
      historical_status,
      advisor_name,
      assigned_tech_name,
      priority,
      cause,
      correction,
      labor_hours,
      labor_sale,
      parts_sale,
      shop_supplies,
      discount,
      tax,
      total,
      approval_state,
      payment_state,
      source_payload,
      shop_id
    ) values (
      new.customer_id,
      new.vehicle_id,
      new.id,
      coalesce(new.paid_at, pg_catalog.now()),
      v_description,
      v_notes,
      'profixiq_live',
      new.id::text,
      new.custom_id,
      v_invoice.invoice_number,
      new.created_at,
      coalesce(new.paid_at, pg_catalog.now()),
      'paid',
      v_advisor_name,
      v_technician_name,
      new.priority::text,
      v_causes,
      v_corrections,
      v_labor_hours,
      coalesce(v_invoice.labor_cost, new.labor_total, 0),
      coalesce(v_invoice.parts_cost, new.parts_total, 0),
      coalesce(v_invoice.shop_supplies_total, 0),
      coalesce(v_invoice.discount_total, 0),
      coalesce(v_invoice.tax_total, 0),
      coalesce(v_invoice.total, new.invoice_total, 0),
      new.approval_state,
      new.payment_status,
      pg_catalog.jsonb_build_object(
        'work_order_id', new.id,
        'invoice_id', v_invoice.id,
        'closed_from', 'paid_invoice'
      ),
      new.shop_id
    )
    returning id into v_history_id;
  else
    update public.history
    set customer_id = new.customer_id,
        vehicle_id = new.vehicle_id,
        service_date = coalesce(new.paid_at, pg_catalog.now()),
        description = v_description,
        notes = v_notes,
        source_system = 'profixiq_live',
        source_external_id = new.id::text,
        work_order_number = new.custom_id,
        invoice_number = v_invoice.invoice_number,
        opened_at = new.created_at,
        closed_at = coalesce(new.paid_at, pg_catalog.now()),
        historical_status = 'paid',
        advisor_name = v_advisor_name,
        assigned_tech_name = v_technician_name,
        priority = new.priority::text,
        cause = v_causes,
        correction = v_corrections,
        labor_hours = v_labor_hours,
        labor_sale = coalesce(v_invoice.labor_cost, new.labor_total, 0),
        parts_sale = coalesce(v_invoice.parts_cost, new.parts_total, 0),
        shop_supplies = coalesce(v_invoice.shop_supplies_total, 0),
        discount = coalesce(v_invoice.discount_total, 0),
        tax = coalesce(v_invoice.tax_total, 0),
        total = coalesce(v_invoice.total, new.invoice_total, 0),
        approval_state = new.approval_state,
        payment_state = new.payment_status,
        source_payload = pg_catalog.jsonb_build_object(
          'work_order_id', new.id,
          'invoice_id', v_invoice.id,
          'closed_from', 'paid_invoice'
        ),
        shop_id = new.shop_id
    where id = v_history_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_paid_work_order_history()
  from public, anon, authenticated;

drop trigger if exists trg_sync_paid_work_order_history
  on public.work_orders;
create trigger trg_sync_paid_work_order_history
after insert or update of payment_status, paid_at
on public.work_orders
for each row
when (new.payment_status = 'paid')
execute function public.sync_paid_work_order_history();

-- Receiving the last outstanding line closes the PO header automatically.
create or replace function public.receive_part_request_item(
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_po_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line_id uuid;
  v_po_id uuid;
  v_remaining numeric;
  v_existing public.stock_moves%rowtype;
  v_result jsonb;
begin
  if coalesce(pg_catalog.btrim(p_idempotency_key), '') = '' then
    raise exception 'A stable idempotency key is required.';
  end if;

  select
    pol.id,
    pol.po_id,
    greatest(
      coalesce(pol.qty, 0) - coalesce(pol.cancelled_qty, 0)
        - coalesce(pol.received_qty, 0),
      0
    )
  into v_line_id, v_po_id, v_remaining
  from public.purchase_order_lines pol
  where pol.part_request_item_id = p_item_id
    and (p_po_id is null or pol.po_id = p_po_id)
    and coalesce(pol.received_qty, 0)
      < greatest(coalesce(pol.qty, 0) - coalesce(pol.cancelled_qty, 0), 0)
  order by pol.created_at asc, pol.id asc
  limit 1
  for update;

  if v_line_id is null and p_po_id is not null then
    select sm.*
    into v_existing
    from public.stock_moves sm
    where sm.idempotency_key = p_idempotency_key
    for update;

    if found then
      return coalesce(v_existing.metadata, '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'ok', true,
          'idempotent', true,
          'stock_move_id', v_existing.id,
          'purchase_order_id', p_po_id,
          'purchase_order_closed', true
        );
    end if;

    raise exception 'No outstanding purchase order line was found for this item.';
  end if;

  if v_line_id is not null and p_qty > v_remaining then
    raise exception 'Receipt quantity exceeds the remaining purchase order quantity.';
  end if;

  v_result := public.parts_receive_request_item(
    p_item_id,
    p_location_id,
    p_qty,
    v_line_id,
    null,
    p_idempotency_key
  );

  if v_po_id is not null
     and not exists (
       select 1
       from public.purchase_order_lines pol
       where pol.po_id = v_po_id
         and coalesce(pol.received_qty, 0)
           < greatest(coalesce(pol.qty, 0) - coalesce(pol.cancelled_qty, 0), 0)
     ) then
    update public.purchase_orders
    set status = 'received',
        received_at = coalesce(received_at, current_date)
    where id = v_po_id
      and lower(coalesce(status, '')) <> 'received';
  end if;

  return coalesce(v_result, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'purchase_order_id', v_po_id,
    'purchase_order_closed', v_po_id is not null and not exists (
      select 1
      from public.purchase_order_lines pol
      where pol.po_id = v_po_id
        and coalesce(pol.received_qty, 0)
          < greatest(coalesce(pol.qty, 0) - coalesce(pol.cancelled_qty, 0), 0)
    )
  );
end;
$function$;

revoke all on function public.receive_part_request_item(uuid, uuid, numeric, uuid, text)
  from public, anon;
grant execute on function public.receive_part_request_item(uuid, uuid, numeric, uuid, text)
  to authenticated, service_role;

-- Repair only rows that satisfy the same durable reconciliation rules. The
-- production preflight found exactly one candidate: the current QA work order.
do $block$
declare
  v_id uuid;
begin
  for v_id in
    select wo.id
    from public.work_orders wo
    where lower(coalesce(wo.status, '')) = 'awaiting_approval'
      and not public.work_order_is_financially_locked(wo.shop_id, wo.id)
      and exists (
        select 1
        from public.work_order_lines wol
        where wol.work_order_id = wo.id
          and wol.voided_at is null
          and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
          and (
            lower(coalesce(wol.approval_state::text, '')) = 'approved'
            or lower(coalesce(wol.line_status::text, '')) = 'authorized'
            or lower(coalesce(wol.status::text, '')) in (
              'completed', 'ready_to_invoice', 'invoiced'
            )
          )
      )
      and not exists (
        select 1
        from public.work_order_lines wol
        where wol.work_order_id = wo.id
          and wol.voided_at is null
          and lower(coalesce(wol.line_type::text, '')) not in ('info', 'note')
          and lower(coalesce(wol.status::text, '')) not in (
            'completed', 'ready_to_invoice', 'invoiced'
          )
          and lower(coalesce(wol.line_status::text, '')) not in (
            'declined', 'deferred', 'voided', 'cancelled', 'canceled'
          )
      )
      and not exists (
        select 1
        from public.work_order_quote_lines q
        where q.work_order_id = wo.id
          and q.shop_id = wo.shop_id
          and (
            q.sent_to_customer_at is not null
            or lower(coalesce(q.status::text, '')) in (
              'sent', 'ready_to_send', 'quoted'
            )
          )
          and not (
            lower(coalesce(q.status::text, '')) in (
              'approved', 'converted', 'declined', 'deferred', 'rejected',
              'cancelled', 'canceled'
            )
            or q.stage::text in (
              'customer_approved', 'customer_declined', 'customer_deferred'
            )
            or q.approved_at is not null
            or q.declined_at is not null
            or q.work_order_line_id is not null
          )
      )
  loop
    perform private.reconcile_work_order_state(v_id);
  end loop;
end
$block$;

-- Backfill the paid-history projection for any pre-existing paid work order
-- that does not already have a service-history record.
update public.work_orders wo
set payment_status = wo.payment_status
where wo.payment_status = 'paid'
  and not exists (
    select 1 from public.history h where h.work_order_id = wo.id
  );

notify pgrst, 'reload schema';

commit;
