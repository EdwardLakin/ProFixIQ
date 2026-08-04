begin;

-- Shop supplies are part of the invoice subtotal and must survive the full
-- work-order -> invoice -> immutable-version lifecycle as their own amount.
alter table public.invoices
  add column if not exists shop_supplies_total numeric(14,2) not null default 0;

alter table public.invoices
  drop constraint if exists invoices_shop_supplies_total_nonnegative;

alter table public.invoices
  add constraint invoices_shop_supplies_total_nonnegative
  check (shop_supplies_total >= 0);

-- Preserve any supplies that older rows embedded in subtotal. Rows produced by
-- the legacy trigger generally backfill to zero and will be corrected from the
-- canonical work-order snapshot the next time they are finalized.
update public.invoices
set shop_supplies_total = greatest(
  coalesce(subtotal, 0) - coalesce(labor_cost, 0) - coalesce(parts_cost, 0),
  0
)
where shop_supplies_total = 0
  and coalesce(subtotal, 0) > coalesce(labor_cost, 0) + coalesce(parts_cost, 0);

create or replace function public.invoices_compute_totals_biu()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_labor numeric := greatest(coalesce(new.labor_cost, 0), 0);
  v_parts numeric := greatest(coalesce(new.parts_cost, 0), 0);
  v_supplies numeric := greatest(coalesce(new.shop_supplies_total, 0), 0);
  v_tax numeric := greatest(coalesce(new.tax_total, 0), 0);
  v_discount numeric := greatest(coalesce(new.discount_total, 0), 0);
begin
  new.labor_cost := v_labor;
  new.parts_cost := v_parts;
  new.shop_supplies_total := v_supplies;
  new.discount_total := v_discount;
  new.tax_total := v_tax;
  new.subtotal := greatest(v_labor + v_parts + v_supplies, 0);
  new.total := greatest(new.subtotal - v_discount + v_tax, 0);
  return new;
end;
$function$;

drop trigger if exists invoices_compute_totals_biu on public.invoices;
create trigger invoices_compute_totals_biu
before insert or update of
  labor_cost,
  parts_cost,
  shop_supplies_total,
  tax_total,
  discount_total,
  status,
  issued_at
on public.invoices
for each row execute function public.invoices_compute_totals_biu();

-- The column is an enum in production. Keep the existing RPC signature for
-- callers, but perform the explicit conversion at the database boundary.
create or replace function public.insert_ai_event(
  p_shop_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_entity_id uuid default null::uuid,
  p_entity_table text default null::text,
  p_user_id uuid default null::uuid,
  p_training_source text default null::text
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_event_id uuid;
begin
  insert into public.ai_events (
    shop_id,
    event_type,
    payload,
    entity_id,
    entity_table,
    user_id,
    training_source
  )
  values (
    p_shop_id,
    p_event_type,
    p_payload,
    p_entity_id,
    p_entity_table,
    p_user_id,
    p_training_source::public.ai_training_source
  )
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

-- Finalization now owns the mutable invoice upsert as well as the immutable
-- version insert. Locking the work order serializes retries and prevents two
-- callers from issuing competing versions.
create or replace function public.finalize_invoice_version(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_invoice_id uuid,
  p_snapshot jsonb,
  p_currency text,
  p_subtotal numeric,
  p_discount_total numeric,
  p_tax_total numeric,
  p_total numeric,
  p_actor_user_id uuid,
  p_operation_key text
)
returns public.invoice_versions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_work_order public.work_orders%rowtype;
  v_invoice public.invoices%rowtype;
  v_version public.invoice_versions%rowtype;
  v_snapshot jsonb;
  v_next_version integer;
  v_hash text;
  v_issued_at timestamptz := pg_catalog.now();
  v_labor numeric;
  v_parts numeric;
  v_supplies numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
begin
  if p_snapshot is null or pg_catalog.jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Invoice snapshot is required';
  end if;
  if pg_catalog.upper(p_currency) not in ('CAD', 'USD') then
    raise exception 'Unsupported currency';
  end if;
  if coalesce(pg_catalog.btrim(p_operation_key), '') = '' then
    raise exception 'Operation key is required';
  end if;
  if p_snapshot #>> '{workOrder,id}' is distinct from p_work_order_id::text
     or p_snapshot #>> '{workOrder,shop_id}' is distinct from p_shop_id::text then
    raise exception 'Invoice snapshot does not match the work order';
  end if;

  select wo.*
  into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Work order not found for shop';
  end if;

  select iv.*
  into v_version
  from public.invoice_versions iv
  where iv.shop_id = p_shop_id
    and iv.work_order_id = p_work_order_id
    and iv.lifecycle_status in ('issued', 'partially_paid', 'paid')
  order by iv.version_number desc
  limit 1;

  if found then
    return v_version;
  end if;

  v_labor := pg_catalog.round(coalesce((p_snapshot ->> 'laborCost')::numeric, 0), 2);
  v_parts := pg_catalog.round(coalesce((p_snapshot ->> 'partsCost')::numeric, 0), 2);
  v_supplies := pg_catalog.round(coalesce((p_snapshot ->> 'shopSuppliesTotal')::numeric, 0), 2);
  v_subtotal := pg_catalog.round(coalesce(p_subtotal, 0), 2);
  v_discount := pg_catalog.round(coalesce(p_discount_total, 0), 2);
  v_tax := pg_catalog.round(coalesce(p_tax_total, 0), 2);
  v_total := pg_catalog.round(coalesce(p_total, 0), 2);

  if least(v_labor, v_parts, v_supplies, v_subtotal, v_discount, v_tax, v_total) < 0 then
    raise exception 'Invoice amounts cannot be negative';
  end if;
  if pg_catalog.abs(v_subtotal - (v_labor + v_parts + v_supplies)) > 0.01 then
    raise exception 'Invoice subtotal does not match labor, parts, and shop supplies';
  end if;
  if pg_catalog.abs(v_total - greatest(v_subtotal - v_discount + v_tax, 0)) > 0.01 then
    raise exception 'Invoice total does not match subtotal, discount, and tax';
  end if;
  if v_total <= 0 then
    raise exception 'Invoice total must be greater than zero';
  end if;

  if p_invoice_id is not null then
    select i.*
    into v_invoice
    from public.invoices i
    where i.id = p_invoice_id
      and i.shop_id = p_shop_id
      and i.work_order_id = p_work_order_id
    for update;

    if not found then
      raise exception 'Invoice not found for work order and shop';
    end if;
  else
    select i.*
    into v_invoice
    from public.invoices i
    where i.shop_id = p_shop_id
      and i.work_order_id = p_work_order_id
      and i.status = 'draft'
    order by i.created_at desc
    limit 1
    for update;

    if not found then
      insert into public.invoices (
        shop_id,
        work_order_id,
        customer_id,
        currency,
        labor_cost,
        parts_cost,
        shop_supplies_total,
        subtotal,
        discount_total,
        tax_total,
        total,
        status,
        issued_at,
        created_by
      )
      values (
        p_shop_id,
        p_work_order_id,
        v_work_order.customer_id,
        pg_catalog.upper(p_currency),
        v_labor,
        v_parts,
        v_supplies,
        v_subtotal,
        v_discount,
        v_tax,
        v_total,
        'draft',
        null,
        p_actor_user_id
      )
      returning * into v_invoice;
    end if;
  end if;

  update public.invoices
  set customer_id = v_work_order.customer_id,
      currency = pg_catalog.upper(p_currency),
      labor_cost = v_labor,
      parts_cost = v_parts,
      shop_supplies_total = v_supplies,
      subtotal = v_subtotal,
      discount_total = v_discount,
      tax_total = v_tax,
      total = v_total,
      status = 'issued',
      issued_at = coalesce(issued_at, v_issued_at)
  where id = v_invoice.id
    and shop_id = p_shop_id
  returning * into v_invoice;

  v_snapshot := pg_catalog.jsonb_set(
    p_snapshot,
    '{invoice}',
    pg_catalog.jsonb_build_object(
      'id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'status', v_invoice.status,
      'currency', v_invoice.currency,
      'subtotal', v_invoice.subtotal,
      'parts_cost', v_invoice.parts_cost,
      'labor_cost', v_invoice.labor_cost,
      'shop_supplies_total', v_invoice.shop_supplies_total,
      'discount_total', v_invoice.discount_total,
      'tax_total', v_invoice.tax_total,
      'total', v_invoice.total,
      'issued_at', v_invoice.issued_at,
      'created_at', v_invoice.created_at,
      'notes', v_invoice.notes
    ),
    true
  );

  v_hash := pg_catalog.encode(
    extensions.digest(p_operation_key || ':' || v_snapshot::text, 'sha256'::text),
    'hex'
  );

  select coalesce(pg_catalog.max(iv.version_number), 0) + 1
  into v_next_version
  from public.invoice_versions iv
  where iv.work_order_id = p_work_order_id;

  insert into public.invoice_versions (
    shop_id,
    work_order_id,
    invoice_id,
    version_number,
    lifecycle_status,
    currency,
    subtotal,
    discount_total,
    tax_total,
    total,
    snapshot,
    snapshot_hash,
    issued_at,
    issued_by
  )
  values (
    p_shop_id,
    p_work_order_id,
    v_invoice.id,
    v_next_version,
    'issued',
    pg_catalog.upper(p_currency),
    v_invoice.subtotal,
    v_invoice.discount_total,
    v_invoice.tax_total,
    v_invoice.total,
    v_snapshot,
    v_hash,
    v_invoice.issued_at,
    p_actor_user_id
  )
  returning * into v_version;

  update public.invoices
  set active_invoice_version_id = v_version.id
  where id = v_invoice.id
    and shop_id = p_shop_id;

  update public.work_orders
  set labor_total = v_invoice.labor_cost,
      parts_total = v_invoice.parts_cost,
      invoice_total = v_invoice.total,
      status = 'invoiced'
  where id = p_work_order_id
    and shop_id = p_shop_id;

  insert into public.financial_domain_outbox (
    shop_id,
    aggregate_type,
    aggregate_id,
    event_type,
    dedupe_key,
    payload
  )
  values (
    p_shop_id,
    'invoice_version',
    v_version.id,
    'invoice.issued',
    'invoice.issued:' || v_version.id::text,
    pg_catalog.jsonb_build_object(
      'invoice_version_id', v_version.id,
      'work_order_id', p_work_order_id,
      'invoice_id', v_invoice.id,
      'total', v_version.total,
      'currency', v_version.currency,
      'labor_total', v_invoice.labor_cost,
      'parts_total', v_invoice.parts_cost,
      'shop_supplies_total', v_invoice.shop_supplies_total
    )
  )
  on conflict do nothing;

  return v_version;
end;
$function$;

revoke all on function public.finalize_invoice_version(uuid,uuid,uuid,jsonb,text,numeric,numeric,numeric,numeric,uuid,text)
  from public, anon, authenticated;
grant execute on function public.finalize_invoice_version(uuid,uuid,uuid,jsonb,text,numeric,numeric,numeric,numeric,uuid,text)
  to service_role;

revoke all on function public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text)
  from public, anon;
grant execute on function public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text)
  to authenticated, service_role;

commit;
