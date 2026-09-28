-- Follow-up to 20260928060000: the pickup-created history row was missing
-- `symptom`, unlike sync_paid_work_order_history, which already carries it
-- via the same complaint/description aggregation. Add the same computation
-- here so shop/vehicle history reads consistently regardless of which
-- closeout path (paid vs. pickup-without-payment) creates the row first.

begin;

create or replace function public.sync_picked_up_work_order_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_history_id uuid;
  v_description text;
  v_symptoms text;
  v_causes text;
  v_corrections text;
  v_labor_hours numeric := 0;
  v_advisor_name text;
  v_technician_name text;
  v_notes text;
  v_odometer numeric;
begin
  if new.picked_up_at is null or new.customer_id is null then
    return new;
  end if;

  select h.id
  into v_history_id
  from public.history h
  where h.work_order_id = new.id
  order by h.created_at asc nulls last, h.id
  limit 1
  for update;

  if v_history_id is not null then
    -- A row already exists (most likely from the paid-closeout trigger).
    -- Only touch the pickup-specific columns so we never clobber payment
    -- fields that trigger already set.
    update public.history
    set picked_up_at = new.picked_up_at,
        collected_by_type = new.collected_by_type,
        collected_by_name = new.collected_by_name,
        historical_status = case
          when coalesce(historical_status, '') = 'paid' then 'paid'
          else 'picked_up'
        end
    where id = v_history_id;

    return new;
  end if;

  -- No history row yet: this is a pickup that happened ahead of (or without)
  -- payment settlement. Build a full row the same way the paid trigger does,
  -- so shop/vehicle history reads consistently regardless of which event
  -- created the record first.
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
      distinct coalesce(
        nullif(pg_catalog.btrim(wol.complaint), ''),
        nullif(pg_catalog.btrim(wol.description), '')
      ),
      E'\n'
    ),
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.cause), ''), E'\n'
    ),
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.correction), ''), E'\n'
    ),
    coalesce(pg_catalog.sum(wol.labor_time), 0)
  into v_description, v_symptoms, v_causes, v_corrections, v_labor_hours
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

  begin
    select nullif(pg_catalog.regexp_replace(coalesce(v.mileage, ''), '[^0-9.]', '', 'g'), '')::numeric
    into v_odometer
    from public.vehicles v
    where v.id = new.vehicle_id;
  exception when others then
    v_odometer := null;
  end;

  v_description := coalesce(
    nullif(pg_catalog.btrim(v_description), ''),
    nullif(pg_catalog.btrim(new.notes), ''),
    'Completed work order ' || coalesce(new.custom_id, new.id::text)
  );

  -- The unpaid-release reason is an internal authorization record, not a
  -- customer-facing note - it stays only on work_orders.pickup_release_reason
  -- (audited separately in activity_logs), never copied into history.notes,
  -- which /portal/history renders close to verbatim.
  v_notes := pg_catalog.concat_ws(
    E'\n',
    'Work order: ' || coalesce(new.custom_id, new.id::text),
    case when v_invoice.invoice_number is not null
      then 'Invoice: ' || v_invoice.invoice_number else null end,
    nullif(pg_catalog.btrim(new.notes), '')
  );

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
    odometer,
    symptom,
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
    picked_up_at,
    collected_by_type,
    collected_by_name,
    source_payload,
    shop_id
  ) values (
    new.customer_id,
    new.vehicle_id,
    new.id,
    new.picked_up_at,
    v_description,
    v_notes,
    'profixiq_live',
    new.id::text,
    new.custom_id,
    v_invoice.invoice_number,
    new.created_at,
    new.picked_up_at,
    'picked_up',
    v_advisor_name,
    v_technician_name,
    new.priority::text,
    v_odometer,
    v_symptoms,
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
    new.picked_up_at,
    new.collected_by_type,
    new.collected_by_name,
    pg_catalog.jsonb_build_object(
      'work_order_id', new.id,
      'invoice_id', v_invoice.id,
      'closed_from', 'vehicle_pickup'
    ),
    new.shop_id
  );

  return new;
end;
$function$;

commit;
