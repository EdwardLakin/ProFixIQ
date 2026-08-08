begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Supplier sourcing is intentionally separate from customer approval and PO
-- ordering. A quote request can cover many request items for one supplier
-- without creating inventory or a purchase order.
create table if not exists public.parts_supplier_quote_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  parts_request_id uuid not null references public.part_requests(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  channel text not null,
  status text not null default 'requested',
  subject text,
  message text,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null,
  response_notes text,
  response_idempotency_key text,
  draft_po_id uuid,
  po_ready_at timestamptz,
  po_generation_error text,
  po_contact_channel text,
  po_contacted_at timestamptz,
  po_contacted_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  idempotency_key text not null,
  constraint parts_supplier_quote_requests_channel_chk
    check (channel in ('email', 'phone')),
  constraint parts_supplier_quote_requests_status_chk
    check (status in ('requested', 'received', 'cancelled')),
  constraint parts_supplier_quote_requests_idempotency_key_chk
    check (length(trim(idempotency_key)) between 1 and 300),
  constraint parts_supplier_quote_requests_response_key_chk
    check (
      response_idempotency_key is null
      or length(trim(response_idempotency_key)) between 1 and 300
    ),
  constraint parts_supplier_quote_requests_po_channel_chk
    check (po_contact_channel is null or po_contact_channel in ('email', 'phone')),
  constraint parts_supplier_quote_requests_shop_key
    unique (shop_id, idempotency_key)
);

create table if not exists public.parts_supplier_quote_request_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null
    references public.parts_supplier_quote_requests(id) on delete cascade,
  part_request_item_id uuid not null
    references public.part_request_items(id) on delete cascade,
  description_snapshot text not null,
  requested_part_number_snapshot text,
  requested_manufacturer_snapshot text,
  qty_requested numeric(12,2) not null,
  supplier_part_number text,
  quoted_unit_cost numeric(12,2),
  quoted_sell_price numeric(12,2),
  availability text,
  expected_at date,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parts_supplier_quote_request_items_qty_chk
    check (qty_requested > 0),
  constraint parts_supplier_quote_request_items_cost_chk
    check (quoted_unit_cost is null or quoted_unit_cost >= 0),
  constraint parts_supplier_quote_request_items_sell_chk
    check (quoted_sell_price is null or quoted_sell_price >= 0),
  constraint parts_supplier_quote_request_items_status_chk
    check (status in ('requested', 'quoted', 'unavailable', 'cancelled')),
  constraint parts_supplier_quote_request_items_batch_item_key
    unique (quote_request_id, part_request_item_id)
);

alter table public.part_request_items
  add column if not exists supplier_quote_status text not null default 'not_requested',
  add column if not exists supplier_quote_requested_at timestamptz,
  add column if not exists supplier_quote_received_at timestamptz,
  add column if not exists latest_supplier_quote_request_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'part_request_items_supplier_quote_status_chk'
      and conrelid = 'public.part_request_items'::regclass
  ) then
    alter table public.part_request_items
      add constraint part_request_items_supplier_quote_status_chk
      check (
        supplier_quote_status in (
          'not_requested', 'requested', 'received', 'cancelled'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'part_request_items_latest_supplier_quote_request_id_fkey'
      and conrelid = 'public.part_request_items'::regclass
  ) then
    alter table public.part_request_items
      add constraint part_request_items_latest_supplier_quote_request_id_fkey
      foreign key (latest_supplier_quote_request_id)
      references public.parts_supplier_quote_requests(id)
      on delete set null;
  end if;
end
$$;

create index if not exists parts_supplier_quote_requests_work_order_idx
  on public.parts_supplier_quote_requests(shop_id, work_order_id, created_at desc);
create index if not exists parts_supplier_quote_requests_request_idx
  on public.parts_supplier_quote_requests(parts_request_id, created_at desc);
create index if not exists parts_supplier_quote_requests_supplier_idx
  on public.parts_supplier_quote_requests(shop_id, supplier_id, status, created_at desc);
create index if not exists parts_supplier_quote_request_items_item_idx
  on public.parts_supplier_quote_request_items(part_request_item_id, created_at desc);
create index if not exists part_request_items_supplier_quote_status_idx
  on public.part_request_items(shop_id, supplier_quote_status, updated_at desc);

alter table public.parts_supplier_quote_requests enable row level security;
alter table public.parts_supplier_quote_request_items enable row level security;

drop policy if exists parts_supplier_quote_requests_shop_select
  on public.parts_supplier_quote_requests;
create policy parts_supplier_quote_requests_shop_select
on public.parts_supplier_quote_requests
for select
to authenticated
using (public.is_shop_member(shop_id));

drop policy if exists parts_supplier_quote_request_items_shop_select
  on public.parts_supplier_quote_request_items;
create policy parts_supplier_quote_request_items_shop_select
on public.parts_supplier_quote_request_items
for select
to authenticated
using (
  exists (
    select 1
    from public.parts_supplier_quote_requests quote_request
    where quote_request.id = quote_request_id
      and public.is_shop_member(quote_request.shop_id)
  )
);

revoke all on table public.parts_supplier_quote_requests
  from public, anon, authenticated;
revoke all on table public.parts_supplier_quote_request_items
  from public, anon, authenticated;
grant select on table public.parts_supplier_quote_requests to authenticated;
grant select on table public.parts_supplier_quote_request_items to authenticated;
grant all on table public.parts_supplier_quote_requests to service_role;
grant all on table public.parts_supplier_quote_request_items to service_role;

create or replace function public.parts_create_supplier_quote_request(
  p_request_id uuid,
  p_supplier_id uuid,
  p_item_ids uuid[],
  p_channel text,
  p_subject text,
  p_message text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.part_requests%rowtype;
  v_supplier public.suppliers%rowtype;
  v_quote_request public.parts_supplier_quote_requests%rowtype;
  v_work_order_number text;
  v_item_count integer;
  v_distinct_item_count integer;
begin
  if p_request_id is null or p_supplier_id is null then
    raise exception using
      errcode = '22023',
      message = 'A parts request and supplier are required.';
  end if;
  if coalesce(array_length(p_item_ids, 1), 0) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Select at least one part to request a supplier quote.';
  end if;
  if lower(coalesce(trim(p_channel), '')) not in ('email', 'phone') then
    raise exception using
      errcode = '22023',
      message = 'Supplier quote channel must be email or phone.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null
     or length(p_idempotency_key) > 300 then
    raise exception using
      errcode = '22023',
      message = 'A stable idempotency key is required.';
  end if;
  if length(coalesce(p_subject, '')) > 300
     or length(coalesce(p_message, '')) > 10000 then
    raise exception using
      errcode = '22023',
      message = 'Supplier quote email content is too long.';
  end if;

  select request.*
    into v_request
  from public.part_requests request
  where request.id = p_request_id
  for update;

  if not found or v_request.shop_id is null or v_request.work_order_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'The parts request is not anchored to a work order.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_request.shop_id);
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_request.shop_id
         and (profile.id = auth.uid() or profile.user_id = auth.uid())
         and public.canonical_shop_membership_role(profile.role::text) in (
           'owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman'
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Parts sourcing actor is not authorized for this shop.';
  end if;

  if lower(v_request.status::text) in (
    'fulfilled', 'rejected', 'cancelled', 'deferred', 'returned'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Completed parts requests cannot be sent for supplier quotes.';
  end if;

  select supplier.*
    into v_supplier
  from public.suppliers supplier
  where supplier.id = p_supplier_id
    and supplier.shop_id = v_request.shop_id
    and coalesce(supplier.is_active, true)
  for share;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Supplier was not found in this shop.';
  end if;

  if lower(trim(p_channel)) = 'email'
     and nullif(trim(v_supplier.email), '') is null then
    raise exception using
      errcode = '22023',
      message = 'The selected supplier does not have an email address.';
  end if;
  if lower(trim(p_channel)) = 'phone'
     and nullif(trim(v_supplier.phone), '') is null then
    raise exception using
      errcode = '22023',
      message = 'The selected supplier does not have a phone number.';
  end if;

  select count(distinct item_id)
    into v_distinct_item_count
  from unnest(p_item_ids) item_id;
  if v_distinct_item_count <> array_length(p_item_ids, 1) then
    raise exception using
      errcode = '22023',
      message = 'Supplier quote item selection contains duplicates.';
  end if;

  perform 1
  from public.part_request_items item
  where item.id = any(p_item_ids)
  order by item.id
  for update;

  select count(*)
    into v_item_count
  from public.part_request_items item
  where item.id = any(p_item_ids)
    and item.request_id = v_request.id
    and item.shop_id = v_request.shop_id
    and item.work_order_id = v_request.work_order_id;

  if v_item_count <> v_distinct_item_count then
    raise exception using
      errcode = '42501',
      message = 'Every selected part must belong to this work order request.';
  end if;

  if exists (
    select 1
    from public.part_request_items item
    where item.id = any(p_item_ids)
      and (
        lower(item.status::text) in (
          'cancelled', 'rejected', 'declined', 'ordered',
          'partially_ordered', 'partially_received', 'received', 'consumed',
          'partially_consumed', 'returned', 'partially_returned'
        )
        or item.po_id is not null
        or coalesce(item.qty_ordered, 0) > 0
        or coalesce(item.qty_received, 0) > 0
        or coalesce(item.qty_consumed, 0) > 0
        or greatest(
          coalesce(item.qty_requested, 0), coalesce(item.qty, 0), 0
        ) <= 0
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Only unordered active parts can be sent for a supplier quote.';
  end if;

  select quote_request.*
    into v_quote_request
  from public.parts_supplier_quote_requests quote_request
  where quote_request.shop_id = v_request.shop_id
    and quote_request.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'idempotent', true,
      'quote_request_id', v_quote_request.id,
      'work_order_id', v_quote_request.work_order_id,
      'supplier_id', v_quote_request.supplier_id,
      'channel', v_quote_request.channel,
      'status', v_quote_request.status
    );
  end if;

  select nullif(trim(work_order.custom_id), '')
    into v_work_order_number
  from public.work_orders work_order
  where work_order.id = v_request.work_order_id
    and work_order.shop_id = v_request.shop_id;

  insert into public.parts_supplier_quote_requests (
    shop_id,
    work_order_id,
    parts_request_id,
    supplier_id,
    channel,
    subject,
    message,
    created_by,
    idempotency_key
  ) values (
    v_request.shop_id,
    v_request.work_order_id,
    v_request.id,
    v_supplier.id,
    lower(trim(p_channel)),
    nullif(trim(p_subject), ''),
    nullif(trim(p_message), ''),
    auth.uid(),
    p_idempotency_key
  )
  returning * into v_quote_request;

  insert into public.parts_supplier_quote_request_items (
    quote_request_id,
    part_request_item_id,
    description_snapshot,
    requested_part_number_snapshot,
    requested_manufacturer_snapshot,
    qty_requested
  )
  select
    v_quote_request.id,
    item.id,
    coalesce(nullif(trim(item.description), ''), 'Part'),
    nullif(trim(item.requested_part_number), ''),
    nullif(trim(item.requested_manufacturer), ''),
    greatest(coalesce(item.qty_requested, 0), coalesce(item.qty, 0), 0)
  from public.part_request_items item
  where item.id = any(p_item_ids)
  order by item.created_at, item.id;

  update public.part_request_items item
  set vendor_id = v_supplier.id,
      vendor = v_supplier.name,
      supplier_quote_status = 'requested',
      supplier_quote_requested_at = now(),
      supplier_quote_received_at = null,
      latest_supplier_quote_request_id = v_quote_request.id,
      updated_at = now()
  where item.id = any(p_item_ids);

  return jsonb_build_object(
    'idempotent', false,
    'quote_request_id', v_quote_request.id,
    'work_order_id', v_request.work_order_id,
    'work_order_number', coalesce(v_work_order_number, v_request.work_order_id::text),
    'supplier_id', v_supplier.id,
    'supplier_name', v_supplier.name,
    'supplier_email', v_supplier.email,
    'supplier_phone', v_supplier.phone,
    'channel', v_quote_request.channel,
    'status', v_quote_request.status,
    'item_count', v_item_count
  );
end;
$$;

revoke all on function public.parts_create_supplier_quote_request(
  uuid, uuid, uuid[], text, text, text, text
) from public, anon;
grant execute on function public.parts_create_supplier_quote_request(
  uuid, uuid, uuid[], text, text, text, text
) to authenticated, service_role;

-- Request-backed POs inherit the work order as their primary operational
-- identity. The PO number remains a secondary document reference.
alter table public.purchase_orders
  add column if not exists work_order_id uuid,
  add column if not exists po_number text,
  add column if not exists supplier_quote_request_id uuid,
  add column if not exists supplier_contact_channel text,
  add column if not exists supplier_contacted_at timestamptz,
  add column if not exists supplier_contacted_by uuid,
  add column if not exists supplier_contact_idempotency_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_orders_work_order_id_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_work_order_id_fkey
      foreign key (work_order_id)
      references public.work_orders(id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_orders_supplier_quote_request_id_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_supplier_quote_request_id_fkey
      foreign key (supplier_quote_request_id)
      references public.parts_supplier_quote_requests(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_orders_supplier_contacted_by_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_supplier_contacted_by_fkey
      foreign key (supplier_contacted_by)
      references auth.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_orders_supplier_contact_channel_chk'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_supplier_contact_channel_chk
      check (
        supplier_contact_channel is null
        or supplier_contact_channel in ('email', 'phone')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'parts_supplier_quote_requests_draft_po_id_fkey'
      and conrelid = 'public.parts_supplier_quote_requests'::regclass
  ) then
    alter table public.parts_supplier_quote_requests
      add constraint parts_supplier_quote_requests_draft_po_id_fkey
      foreign key (draft_po_id)
      references public.purchase_orders(id)
      on delete set null;
  end if;
end
$$;

update public.purchase_orders
set po_number = 'PO-' || upper(left(replace(id::text, '-', ''), 8))
where nullif(trim(po_number), '') is null;

with po_work_orders as (
  select
    line.po_id,
    min(item.work_order_id::text)::uuid as work_order_id
  from public.purchase_order_lines line
  join public.part_request_items item
    on item.id = line.part_request_item_id
  where item.work_order_id is not null
  group by line.po_id
  having count(distinct item.work_order_id) = 1
)
update public.purchase_orders purchase_order
set work_order_id = anchor.work_order_id
from po_work_orders anchor
where purchase_order.id = anchor.po_id
  and purchase_order.work_order_id is null;

create unique index if not exists purchase_orders_shop_po_number_key
  on public.purchase_orders(shop_id, po_number)
  where po_number is not null;
create index if not exists purchase_orders_shop_work_order_idx
  on public.purchase_orders(shop_id, work_order_id, created_at desc);
create index if not exists purchase_orders_supplier_quote_request_idx
  on public.purchase_orders(supplier_quote_request_id)
  where supplier_quote_request_id is not null;
create unique index if not exists purchase_orders_supplier_quote_request_key
  on public.purchase_orders(supplier_quote_request_id)
  where supplier_quote_request_id is not null;
create unique index if not exists purchase_orders_shop_contact_key
  on public.purchase_orders(shop_id, supplier_contact_idempotency_key)
  where supplier_contact_idempotency_key is not null;

create or replace function public.parts_assign_purchase_order_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;
  if nullif(trim(new.po_number), '') is null then
    new.po_number := 'PO-' || upper(left(replace(new.id::text, '-', ''), 8));
  end if;
  return new;
end;
$$;

revoke all on function public.parts_assign_purchase_order_identity()
  from public, anon, authenticated;

drop trigger if exists trg_parts_assign_purchase_order_identity
  on public.purchase_orders;
create trigger trg_parts_assign_purchase_order_identity
before insert on public.purchase_orders
for each row
execute function public.parts_assign_purchase_order_identity();

create or replace function public.parts_anchor_request_po_to_work_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item_work_order_id uuid;
  v_po_work_order_id uuid;
begin
  if new.part_request_item_id is null then
    return new;
  end if;

  select item.work_order_id
    into v_item_work_order_id
  from public.part_request_items item
  where item.id = new.part_request_item_id;

  if v_item_work_order_id is null then
    raise exception using
      errcode = '23503',
      message = 'Request-backed PO line is missing its work order anchor.';
  end if;

  select purchase_order.work_order_id
    into v_po_work_order_id
  from public.purchase_orders purchase_order
  where purchase_order.id = new.po_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Purchase order not found for request-backed line.';
  end if;

  if v_po_work_order_id is null then
    update public.purchase_orders
    set work_order_id = v_item_work_order_id
    where id = new.po_id;
  elsif v_po_work_order_id is distinct from v_item_work_order_id then
    raise exception using
      errcode = '23514',
      message = 'A purchase order cannot contain parts from different work orders.';
  end if;

  return new;
end;
$$;

revoke all on function public.parts_anchor_request_po_to_work_order()
  from public, anon, authenticated;

drop trigger if exists trg_parts_anchor_request_po_to_work_order
  on public.purchase_order_lines;
create trigger trg_parts_anchor_request_po_to_work_order
before insert or update of po_id, part_request_item_id
on public.purchase_order_lines
for each row
execute function public.parts_anchor_request_po_to_work_order();

create or replace function public.parts_record_supplier_quote_response(
  p_quote_request_id uuid,
  p_items jsonb,
  p_response_notes text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_request public.parts_supplier_quote_requests%rowtype;
  v_response_count integer;
  v_distinct_count integer;
  v_expected_count integer;
begin
  if p_quote_request_id is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception using
      errcode = '22023',
      message = 'A supplier quote request and response lines are required.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null
     or length(p_idempotency_key) > 300 then
    raise exception using
      errcode = '22023',
      message = 'A stable supplier response idempotency key is required.';
  end if;
  if length(coalesce(p_response_notes, '')) > 4000 then
    raise exception using
      errcode = '22023',
      message = 'Supplier response notes are too long.';
  end if;

  select quote_request.*
    into v_quote_request
  from public.parts_supplier_quote_requests quote_request
  where quote_request.id = p_quote_request_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Supplier quote request not found.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_quote_request.shop_id);
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_quote_request.shop_id
         and (profile.id = auth.uid() or profile.user_id = auth.uid())
         and public.canonical_shop_membership_role(profile.role::text) in (
           'owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman'
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Parts sourcing actor is not authorized for this shop.';
  end if;

  if v_quote_request.response_idempotency_key = p_idempotency_key then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'quote_request_id', v_quote_request.id,
      'status', v_quote_request.status,
      'responded_at', v_quote_request.responded_at
    );
  end if;
  if v_quote_request.status = 'cancelled' then
    raise exception using
      errcode = '55000',
      message = 'Cancelled supplier quote requests cannot receive a response.';
  end if;
  if v_quote_request.status = 'received'
     and v_quote_request.response_idempotency_key is distinct from p_idempotency_key then
    raise exception using
      errcode = '22023',
      message = 'This supplier quote response has already been recorded.';
  end if;

  select count(*), count(distinct response.part_request_item_id)
    into v_response_count, v_distinct_count
  from jsonb_to_recordset(p_items) as response(
    part_request_item_id uuid,
    status text,
    supplier_part_number text,
    quoted_unit_cost numeric,
    quoted_sell_price numeric,
    availability text,
    expected_at date
  );

  select count(*)
    into v_expected_count
  from public.parts_supplier_quote_request_items quote_item
  where quote_item.quote_request_id = v_quote_request.id;

  if v_response_count <> v_distinct_count
     or v_response_count <> v_expected_count then
    raise exception using
      errcode = '22023',
      message = 'Record one response for every part in this supplier quote request.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as response(
      part_request_item_id uuid,
      status text,
      supplier_part_number text,
      quoted_unit_cost numeric,
      quoted_sell_price numeric,
      availability text,
      expected_at date
    )
    left join public.parts_supplier_quote_request_items quote_item
      on quote_item.quote_request_id = v_quote_request.id
     and quote_item.part_request_item_id = response.part_request_item_id
    where quote_item.id is null
       or lower(coalesce(trim(response.status), '')) not in ('quoted', 'unavailable')
       or (
         lower(trim(response.status)) = 'quoted'
         and (
           response.quoted_unit_cost is null
           or response.quoted_sell_price is null
           or response.quoted_unit_cost < 0
           or response.quoted_sell_price < 0
         )
       )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Each quoted part needs a valid supplier cost and customer sell price.';
  end if;

  update public.parts_supplier_quote_request_items quote_item
  set supplier_part_number = nullif(trim(response.supplier_part_number), ''),
      quoted_unit_cost = case
        when lower(trim(response.status)) = 'quoted'
          then response.quoted_unit_cost
        else null
      end,
      quoted_sell_price = case
        when lower(trim(response.status)) = 'quoted'
          then response.quoted_sell_price
        else null
      end,
      availability = nullif(trim(response.availability), ''),
      expected_at = response.expected_at,
      status = lower(trim(response.status)),
      updated_at = now()
  from jsonb_to_recordset(p_items) as response(
    part_request_item_id uuid,
    status text,
    supplier_part_number text,
    quoted_unit_cost numeric,
    quoted_sell_price numeric,
    availability text,
    expected_at date
  )
  where quote_item.quote_request_id = v_quote_request.id
    and quote_item.part_request_item_id = response.part_request_item_id;

  update public.part_request_items item
  set supplier_quote_status = 'received',
      supplier_quote_received_at = now(),
      unit_cost = case
        when quote_item.status = 'quoted' then quote_item.quoted_unit_cost
        else item.unit_cost
      end,
      quoted_price = case
        when quote_item.status = 'quoted' then quote_item.quoted_sell_price
        else item.quoted_price
      end,
      unit_price = case
        when quote_item.status = 'quoted' then quote_item.quoted_sell_price
        else item.unit_price
      end,
      status = case
        when lower(item.status::text) in (
          'approved', 'reserved', 'picking', 'picked', 'ordered',
          'partially_ordered', 'partially_received', 'received', 'consumed',
          'partially_consumed', 'returned', 'partially_returned'
        ) then item.status
        when quote_item.status = 'quoted'
          and public.part_request_item_is_quote_ready(
            item.description,
            item.part_id,
            item.requested_part_number,
            item.requested_manufacturer,
            greatest(coalesce(item.qty_requested, 0), coalesce(item.qty, 0)),
            quote_item.quoted_sell_price
          ) then 'quoted'::public.part_request_item_status
        else 'requested'::public.part_request_item_status
      end,
      updated_at = now()
  from public.parts_supplier_quote_request_items quote_item
  where quote_item.quote_request_id = v_quote_request.id
    and quote_item.part_request_item_id = item.id
    and item.request_id = v_quote_request.parts_request_id
    and item.shop_id = v_quote_request.shop_id;

  update public.parts_supplier_quote_requests
  set status = 'received',
      responded_at = now(),
      responded_by = auth.uid(),
      response_notes = nullif(trim(p_response_notes), ''),
      response_idempotency_key = p_idempotency_key,
      updated_at = now()
  where id = v_quote_request.id
  returning * into v_quote_request;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'quote_request_id', v_quote_request.id,
    'status', v_quote_request.status,
    'responded_at', v_quote_request.responded_at,
    'item_count', v_response_count
  );
end;
$$;

revoke all on function public.parts_record_supplier_quote_response(
  uuid, jsonb, text, text
) from public, anon;
grant execute on function public.parts_record_supplier_quote_response(
  uuid, jsonb, text, text
) to authenticated, service_role;

create or replace function private.parts_materialize_supplier_quote_draft_po()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_request public.parts_supplier_quote_requests%rowtype;
  v_quote_item public.parts_supplier_quote_request_items%rowtype;
  v_po public.purchase_orders%rowtype;
  v_target numeric;
  v_total_ordered numeric;
  v_wop_id uuid;
  v_sku text;
  v_line_key text;
  v_original_jwt_role text := current_setting('request.jwt.claim.role', true);
begin
  if lower(new.status::text) <> 'approved'
     or new.supplier_quote_status <> 'received'
     or new.latest_supplier_quote_request_id is null
     or new.po_id is not null
     or coalesce(new.qty_ordered, 0) > 0
     or new.work_order_line_id is null then
    return new;
  end if;

  select quote_request.*
    into v_quote_request
  from public.parts_supplier_quote_requests quote_request
  where quote_request.id = new.latest_supplier_quote_request_id
    and quote_request.shop_id = new.shop_id
    and quote_request.parts_request_id = new.request_id
    and quote_request.work_order_id = new.work_order_id
    and quote_request.status = 'received'
  for update;

  if not found then
    return new;
  end if;

  select quote_item.*
    into v_quote_item
  from public.parts_supplier_quote_request_items quote_item
  where quote_item.quote_request_id = v_quote_request.id
    and quote_item.part_request_item_id = new.id
    and quote_item.status = 'quoted'
    and quote_item.quoted_unit_cost is not null
  for update;

  if not found then
    return new;
  end if;

  v_target := greatest(
    coalesce(new.qty_approved, 0),
    coalesce(new.qty_requested, 0),
    coalesce(new.qty, 0),
    0
  );
  if v_target <= 0 then
    raise exception 'Approved supplier quote quantity must be greater than zero.';
  end if;

  -- Customer approval is the trusted event that invokes this private trigger.
  -- Temporarily expose service context only to the existing request-backed PO
  -- materialization triggers, then restore the caller's JWT role.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into public.purchase_orders (
    shop_id,
    supplier_id,
    status,
    notes,
    work_order_id,
    supplier_quote_request_id,
    created_by
  ) values (
    v_quote_request.shop_id,
    v_quote_request.supplier_id,
    'draft',
    'Automatically prepared after customer approval.',
    v_quote_request.work_order_id,
    v_quote_request.id,
    auth.uid()
  )
  on conflict (supplier_quote_request_id)
    where supplier_quote_request_id is not null
  do update set
    work_order_id = excluded.work_order_id,
    supplier_id = excluded.supplier_id
  returning * into v_po;

  if new.part_id is not null then
    select nullif(trim(part.sku), '')
      into v_sku
    from public.parts part
    where part.id = new.part_id
      and part.shop_id = new.shop_id;
    v_wop_id := public.parts_ensure_work_order_part(new.id);
  else
    v_sku := nullif(trim(v_quote_item.supplier_part_number), '');
    v_wop_id := null;
  end if;

  v_line_key := 'supplier-quote-auto:' || v_quote_request.id::text || ':' || new.id::text;
  insert into public.purchase_order_lines (
    po_id,
    part_id,
    sku,
    description,
    qty,
    unit_cost,
    location_id,
    part_request_item_id,
    work_order_part_id,
    idempotency_key
  ) values (
    v_po.id,
    new.part_id,
    v_sku,
    coalesce(nullif(trim(new.description), ''), 'Vendor part'),
    v_target,
    v_quote_item.quoted_unit_cost,
    new.location_id,
    new.id,
    v_wop_id,
    v_line_key
  )
  on conflict (po_id, idempotency_key)
    where idempotency_key is not null
  do nothing;

  select line.work_order_part_id
    into v_wop_id
  from public.purchase_order_lines line
  where line.po_id = v_po.id
    and line.idempotency_key = v_line_key;

  select coalesce(sum(
    greatest(coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0)
  ), 0)
    into v_total_ordered
  from public.purchase_order_lines line
  where line.part_request_item_id = new.id;

  update public.part_request_items
  set po_id = v_po.id,
      qty_ordered = v_total_ordered,
      unit_cost = v_quote_item.quoted_unit_cost,
      status = case
        when v_total_ordered < v_target
          then 'partially_ordered'::public.part_request_item_status
        else 'ordered'::public.part_request_item_status
      end,
      updated_at = now()
  where id = new.id;

  if v_wop_id is not null then
    update public.work_order_parts
    set quantity_ordered = v_total_ordered,
        updated_at = now()
    where id = v_wop_id;
    perform public.parts_reconcile_work_order_part(v_wop_id);
  end if;

  update public.parts_supplier_quote_requests
  set draft_po_id = v_po.id,
      po_ready_at = coalesce(po_ready_at, now()),
      po_generation_error = null,
      updated_at = now()
  where id = v_quote_request.id;

  perform set_config(
    'request.jwt.claim.role',
    coalesce(v_original_jwt_role, ''),
    true
  );

  return new;
exception
  when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(v_original_jwt_role, ''),
      true
    );
    begin
      update public.parts_supplier_quote_requests
      set po_generation_error = left(sqlerrm, 1000),
          updated_at = now()
      where id = new.latest_supplier_quote_request_id;
    exception
      when others then null;
    end;
    return new;
end;
$$;

revoke all on function private.parts_materialize_supplier_quote_draft_po()
  from public, anon, authenticated;

drop trigger if exists trg_parts_materialize_supplier_quote_draft_po
  on public.part_request_items;
create trigger trg_parts_materialize_supplier_quote_draft_po
after update of status, supplier_quote_status, work_order_line_id
on public.part_request_items
for each row
execute function private.parts_materialize_supplier_quote_draft_po();

create or replace function public.parts_mark_purchase_order_contacted(
  p_po_id uuid,
  p_channel text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_supplier public.suppliers%rowtype;
  v_work_order_number text;
begin
  if p_po_id is null
     or lower(coalesce(trim(p_channel), '')) not in ('email', 'phone') then
    raise exception using
      errcode = '22023',
      message = 'A purchase order and contact channel are required.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null
     or length(p_idempotency_key) > 300 then
    raise exception using
      errcode = '22023',
      message = 'A stable PO contact idempotency key is required.';
  end if;

  select purchase_order.*
    into v_po
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id
  for update;

  if not found or v_po.shop_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase order not found.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_po.shop_id);
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_po.shop_id
         and (profile.id = auth.uid() or profile.user_id = auth.uid())
         and public.canonical_shop_membership_role(profile.role::text) in (
           'owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman'
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Parts ordering actor is not authorized for this shop.';
  end if;

  if v_po.supplier_contact_idempotency_key = p_idempotency_key then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'po_id', v_po.id,
      'po_number', v_po.po_number,
      'channel', v_po.supplier_contact_channel,
      'contacted_at', v_po.supplier_contacted_at
    );
  end if;
  if lower(coalesce(v_po.status, '')) not in ('draft', 'open') then
    raise exception using
      errcode = '55000',
      message = 'Only a draft or open purchase order can be sent to a supplier.';
  end if;
  if v_po.work_order_id is null or v_po.supplier_quote_request_id is null then
    raise exception using
      errcode = '23503',
      message = 'This purchase order is not anchored to a supplier quote and work order.';
  end if;

  select supplier.*
    into v_supplier
  from public.suppliers supplier
  where supplier.id = v_po.supplier_id
    and supplier.shop_id = v_po.shop_id
    and coalesce(supplier.is_active, true);

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase order supplier was not found in this shop.';
  end if;
  if lower(trim(p_channel)) = 'email'
     and nullif(trim(v_supplier.email), '') is null then
    raise exception using
      errcode = '22023',
      message = 'The selected supplier does not have an email address.';
  end if;
  if lower(trim(p_channel)) = 'phone'
     and nullif(trim(v_supplier.phone), '') is null then
    raise exception using
      errcode = '22023',
      message = 'The selected supplier does not have a phone number.';
  end if;

  select nullif(trim(work_order.custom_id), '')
    into v_work_order_number
  from public.work_orders work_order
  where work_order.id = v_po.work_order_id
    and work_order.shop_id = v_po.shop_id;

  update public.purchase_orders
  set status = 'open',
      ordered_at = coalesce(ordered_at, now()),
      supplier_contact_channel = lower(trim(p_channel)),
      supplier_contacted_at = now(),
      supplier_contacted_by = auth.uid(),
      supplier_contact_idempotency_key = p_idempotency_key
  where id = v_po.id
  returning * into v_po;

  update public.parts_supplier_quote_requests
  set po_contact_channel = v_po.supplier_contact_channel,
      po_contacted_at = v_po.supplier_contacted_at,
      po_contacted_by = auth.uid(),
      updated_at = now()
  where id = v_po.supplier_quote_request_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'po_id', v_po.id,
    'po_number', v_po.po_number,
    'work_order_id', v_po.work_order_id,
    'work_order_number', v_work_order_number,
    'supplier_id', v_supplier.id,
    'supplier_name', v_supplier.name,
    'channel', v_po.supplier_contact_channel,
    'contacted_at', v_po.supplier_contacted_at
  );
end;
$$;

revoke all on function public.parts_mark_purchase_order_contacted(
  uuid, text, text
) from public, anon;
grant execute on function public.parts_mark_purchase_order_contacted(
  uuid, text, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
