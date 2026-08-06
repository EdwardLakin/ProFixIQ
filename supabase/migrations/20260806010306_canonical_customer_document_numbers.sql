-- Give every live work order and invoice a stable, shop-scoped customer-facing
-- document number. The counters live outside the exposed Data API schema and
-- are advanced atomically so concurrent portal/staff creation cannot collide.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

create table if not exists private.document_number_counters (
  shop_id uuid not null references public.shops(id) on delete cascade,
  document_kind text not null check (document_kind in ('work_order', 'invoice')),
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (shop_id, document_kind)
);

revoke all on table private.document_number_counters
  from public, anon, authenticated;

-- Preserve the numeric sequence already used by legacy staff-created work
-- orders (for example EL000008). Imported invoice numbers are intentionally
-- excluded because they belong to the source system's numbering sequence.
insert into private.document_number_counters (
  shop_id,
  document_kind,
  last_value
)
select
  wo.shop_id,
  'work_order',
  pg_catalog.max(
    pg_catalog.substring(wo.custom_id, '([0-9]+)$')::bigint
  )
from public.work_orders wo
where wo.shop_id is not null
  and (
    wo.custom_id ~ '^[A-Za-z]{1,4}[0-9]{6}$'
    or wo.custom_id ~ '^WO-[0-9]{6,}$'
  )
group by wo.shop_id
on conflict (shop_id, document_kind) do update
set last_value = greatest(
      private.document_number_counters.last_value,
      excluded.last_value
    ),
    updated_at = pg_catalog.now();

insert into private.document_number_counters (
  shop_id,
  document_kind,
  last_value
)
select
  i.shop_id,
  'invoice',
  pg_catalog.max(
    pg_catalog.substring(i.invoice_number, '^INV-([0-9]+)$')::bigint
  )
from public.invoices i
where i.shop_id is not null
  and i.invoice_number ~ '^INV-[0-9]{6,}$'
  and not public.invoice_is_historical_import(
    coalesce(i.metadata, '{}'::jsonb)
  )
group by i.shop_id
on conflict (shop_id, document_kind) do update
set last_value = greatest(
      private.document_number_counters.last_value,
      excluded.last_value
    ),
    updated_at = pg_catalog.now();

create or replace function private.next_customer_document_number(
  p_shop_id uuid,
  p_document_kind text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_next bigint;
  v_prefix text;
begin
  if p_shop_id is null then
    raise exception using
      errcode = '23502',
      message = 'A shop is required to allocate a document number.';
  end if;

  v_prefix := case p_document_kind
    when 'work_order' then 'WO-'
    when 'invoice' then 'INV-'
    else null
  end;

  if v_prefix is null then
    raise exception using
      errcode = '22023',
      message = 'Unsupported customer document kind.';
  end if;

  insert into private.document_number_counters (
    shop_id,
    document_kind,
    last_value,
    updated_at
  ) values (
    p_shop_id,
    p_document_kind,
    1,
    pg_catalog.now()
  )
  on conflict (shop_id, document_kind) do update
  set last_value = private.document_number_counters.last_value + 1,
      updated_at = pg_catalog.now()
  returning last_value into v_next;

  return v_prefix || pg_catalog.lpad(v_next::text, 6, '0');
end;
$function$;

revoke all on function private.next_customer_document_number(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.assign_work_order_customer_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.shop_id is not null
     and (
       nullif(pg_catalog.btrim(new.custom_id), '') is null
       or new.custom_id ~ '^WO-[0-9A-Fa-f]{12}$'
     ) then
    new.custom_id := private.next_customer_document_number(
      new.shop_id,
      'work_order'
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.assign_work_order_customer_number()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_assign_work_order_customer_number
  on public.work_orders;
create trigger trg_assign_work_order_customer_number
before insert or update of shop_id, custom_id
on public.work_orders
for each row
execute function private.assign_work_order_customer_number();

create or replace function private.assign_invoice_customer_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.invoice_is_historical_import(
       coalesce(new.metadata, '{}'::jsonb)
     )
     and (
       nullif(pg_catalog.btrim(new.invoice_number), '') is null
       or new.invoice_number ~ '^WO-[0-9A-Fa-f]{8}$'
     ) then
    new.invoice_number := private.next_customer_document_number(
      new.shop_id,
      'invoice'
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.assign_invoice_customer_number()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_assign_invoice_customer_number
  on public.invoices;
create trigger trg_assign_invoice_customer_number
before insert or update of shop_id, invoice_number, metadata
on public.invoices
for each row
execute function private.assign_invoice_customer_number();

-- Backfill live records deterministically. Existing legitimate custom/imported
-- identifiers remain unchanged; only missing numbers and the old WO-<uuid>
-- invoice fallback are replaced.
do $backfill_work_orders$
declare
  v_id uuid;
begin
  for v_id in
    select wo.id
    from public.work_orders wo
    where wo.shop_id is not null
      and (
        nullif(pg_catalog.btrim(wo.custom_id), '') is null
        or wo.custom_id ~ '^WO-[0-9A-Fa-f]{12}$'
      )
    order by wo.created_at nulls last, wo.id
  loop
    update public.work_orders
    set custom_id = null
    where id = v_id;
  end loop;
end;
$backfill_work_orders$;

do $backfill_invoices$
declare
  v_id uuid;
begin
  for v_id in
    select i.id
    from public.invoices i
    where not public.invoice_is_historical_import(
            coalesce(i.metadata, '{}'::jsonb)
          )
      and (
        nullif(pg_catalog.btrim(i.invoice_number), '') is null
        or i.invoice_number ~ '^WO-[0-9A-Fa-f]{8}$'
      )
    order by i.created_at nulls last, i.id
  loop
    update public.invoices
    set invoice_number = null
    where id = v_id;
  end loop;
end;
$backfill_invoices$;

-- Repair the paid-history projection. Complaint/cause/correction remain
-- separate fields, the summary no longer concatenates them with slashes, and
-- the recorded odometer follows work-order intake before vehicle fallback.
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
  v_symptoms text;
  v_causes text;
  v_corrections text;
  v_odometer numeric;
  v_labor_hours numeric := 0;
  v_advisor_name text;
  v_technician_name text;
  v_notes text;
begin
  if pg_catalog.lower(coalesce(new.payment_status, '')) <> 'paid'
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
      distinct coalesce(
        nullif(pg_catalog.btrim(wol.complaint), ''),
        nullif(pg_catalog.btrim(wol.description), '')
      ),
      E'\n'
    ),
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.cause), ''),
      E'\n'
    ),
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.correction), ''),
      E'\n'
    ),
    coalesce(pg_catalog.sum(wol.labor_time), 0)
  into v_symptoms, v_causes, v_corrections, v_labor_hours
  from public.work_order_lines wol
  where wol.work_order_id = new.id
    and wol.voided_at is null;

  v_description := coalesce(
    nullif(pg_catalog.btrim(v_symptoms), ''),
    nullif(pg_catalog.btrim(new.notes), ''),
    'Completed work order ' || coalesce(new.custom_id, new.id::text)
  );

  v_odometer := coalesce(
    new.vehicle_mileage,
    new.odometer_km
  );

  if v_odometer is null then
    select case
      when pg_catalog.btrim(v.mileage::text) ~ '^[0-9]+([.][0-9]+)?$'
        then pg_catalog.btrim(v.mileage::text)::numeric
      else null
    end
    into v_odometer
    from public.vehicles v
    where v.id = new.vehicle_id
      and v.shop_id = new.shop_id;
  end if;

  select nullif(pg_catalog.btrim(p.full_name), '')
  into v_advisor_name
  from public.profiles p
  where p.id = new.advisor_id;

  select pg_catalog.string_agg(
    distinct nullif(pg_catalog.btrim(p.full_name), ''),
    ', '
  )
  into v_technician_name
  from public.work_order_lines wol
  left join public.work_order_line_technicians wolt
    on wolt.work_order_line_id = wol.id
  left join public.profiles p
    on p.id = coalesce(
      wolt.technician_id,
      wol.assigned_tech_id,
      wol.assigned_to
    )
  where wol.work_order_id = new.id
    and wol.voided_at is null;

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
    insert into public.history (
      customer_id, vehicle_id, work_order_id, service_date, description,
      notes, source_system, source_external_id, work_order_number,
      invoice_number, opened_at, closed_at, historical_status, advisor_name,
      assigned_tech_name, priority, odometer, symptom, cause, correction,
      labor_hours, labor_sale, parts_sale, shop_supplies, discount, tax, total,
      approval_state, payment_state, source_payload
    ) values (
      new.customer_id, new.vehicle_id, new.id,
      coalesce(new.paid_at, pg_catalog.now()), v_description,
      v_notes, 'profixiq_live', new.id::text, new.custom_id,
      v_invoice.invoice_number, new.created_at,
      coalesce(new.paid_at, pg_catalog.now()), 'paid',
      v_advisor_name, v_technician_name, new.priority::text, v_odometer,
      v_symptoms, v_causes, v_corrections, v_labor_hours,
      coalesce(v_invoice.labor_cost, new.labor_total, 0),
      coalesce(v_invoice.parts_cost, new.parts_total, 0),
      coalesce(v_invoice.shop_supplies_total, 0),
      coalesce(v_invoice.discount_total, 0),
      coalesce(v_invoice.tax_total, 0),
      coalesce(v_invoice.total, new.invoice_total, 0),
      new.approval_state, new.payment_status,
      pg_catalog.jsonb_build_object(
        'work_order_id', new.id,
        'invoice_id', v_invoice.id,
        'closed_from', 'paid_invoice'
      )
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
        odometer = v_odometer,
        symptom = v_symptoms,
        cause = v_causes,
        correction = v_corrections,
        labor_hours = v_labor_hours,
        labor_sale = coalesce(
          v_invoice.labor_cost,
          new.labor_total,
          0
        ),
        parts_sale = coalesce(
          v_invoice.parts_cost,
          new.parts_total,
          0
        ),
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
        )
    where id = v_history_id;
  end if;

  -- Production has an optional history.shop_id column that is absent from the
  -- clean baseline. Keep both shapes valid while preserving production scope.
  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.history'::pg_catalog.regclass
      and attribute.attname = 'shop_id'
      and not attribute.attisdropped
  ) then
    execute 'update public.history set shop_id = $1 where id = $2'
    using new.shop_id, v_history_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_paid_work_order_history()
  from public, anon, authenticated, service_role;

-- Refresh existing live paid-history projections without altering immutable
-- invoice versions or payment events.
with paid_rows as (
  select
    wo.id as work_order_id,
    wo.shop_id,
    wo.customer_id,
    wo.vehicle_id,
    wo.custom_id,
    wo.created_at,
    wo.paid_at,
    wo.priority,
    wo.approval_state,
    wo.payment_status,
    wo.vehicle_mileage,
    wo.odometer_km,
    case
      when pg_catalog.btrim(v.mileage::text) ~ '^[0-9]+([.][0-9]+)?$'
        then pg_catalog.btrim(v.mileage::text)::numeric
      else null
    end as vehicle_odometer,
    i.id as invoice_id,
    i.invoice_number,
    coalesce(i.labor_cost, wo.labor_total, 0) as labor_sale,
    coalesce(i.parts_cost, wo.parts_total, 0) as parts_sale,
    coalesce(i.shop_supplies_total, 0) as shop_supplies,
    coalesce(i.discount_total, 0) as discount,
    coalesce(i.tax_total, 0) as tax,
    coalesce(i.total, wo.invoice_total, 0) as total
  from public.work_orders wo
  left join public.vehicles v
    on v.id = wo.vehicle_id
   and v.shop_id = wo.shop_id
  left join lateral (
    select invoice.*
    from public.invoices invoice
    where invoice.work_order_id = wo.id
      and invoice.shop_id = wo.shop_id
    order by
      (invoice.active_invoice_version_id is not null) desc,
      invoice.issued_at desc nulls last,
      invoice.created_at desc
    limit 1
  ) i on true
  where wo.payment_status = 'paid'
),
line_rollup as (
  select
    wol.work_order_id,
    pg_catalog.string_agg(
      distinct coalesce(
        nullif(pg_catalog.btrim(wol.complaint), ''),
        nullif(pg_catalog.btrim(wol.description), '')
      ),
      E'\n'
    ) as symptom,
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.cause), ''),
      E'\n'
    ) as cause,
    pg_catalog.string_agg(
      distinct nullif(pg_catalog.btrim(wol.correction), ''),
      E'\n'
    ) as correction,
    coalesce(pg_catalog.sum(wol.labor_time), 0) as labor_hours
  from public.work_order_lines wol
  join paid_rows paid on paid.work_order_id = wol.work_order_id
  where wol.voided_at is null
  group by wol.work_order_id
)
update public.history h
set work_order_number = paid.custom_id,
    invoice_number = paid.invoice_number,
    description = coalesce(
      nullif(pg_catalog.btrim(lines.symptom), ''),
      h.description
    ),
    symptom = lines.symptom,
    cause = lines.cause,
    correction = lines.correction,
    odometer = coalesce(
      paid.vehicle_mileage,
      paid.odometer_km,
      paid.vehicle_odometer,
      h.odometer
    ),
    labor_hours = lines.labor_hours,
    labor_sale = paid.labor_sale,
    parts_sale = paid.parts_sale,
    shop_supplies = paid.shop_supplies,
    discount = paid.discount,
    tax = paid.tax,
    total = paid.total,
    historical_status = 'paid',
    payment_state = 'paid',
    source_payload = coalesce(h.source_payload, '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'work_order_id', paid.work_order_id,
        'invoice_id', paid.invoice_id,
        'closed_from', 'paid_invoice'
      )
from paid_rows paid
join line_rollup lines on lines.work_order_id = paid.work_order_id
where h.work_order_id = paid.work_order_id;

do $optional_history_shop_scope$
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.history'::pg_catalog.regclass
      and attribute.attname = 'shop_id'
      and not attribute.attisdropped
  ) then
    execute $sql$
      update public.history history_row
      set shop_id = work_order.shop_id
      from public.work_orders work_order
      where history_row.work_order_id = work_order.id
        and history_row.shop_id is distinct from work_order.shop_id
    $sql$;
  end if;
end
$optional_history_shop_scope$;

commit;
