begin;

-- -------------------------------------------------------------------------
-- Canonical shop membership is owned by the profile lifecycle, not by one API.
-- -------------------------------------------------------------------------
create or replace function public.canonical_shop_membership_role(p_role text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(trim(coalesce(p_role, '')))
    when 'tech' then 'mechanic'
    when 'technician' then 'mechanic'
    when 'service_advisor' then 'service'
    when 'service advisor' then 'service'
    when 'leadhand' then 'lead_hand'
    when 'lead hand' then 'lead_hand'
    when 'lead' then 'lead_hand'
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'manager' then 'manager'
    when 'foreman' then 'foreman'
    when 'lead_hand' then 'lead_hand'
    when 'advisor' then 'advisor'
    when 'service' then 'service'
    when 'dispatcher' then 'dispatcher'
    when 'parts' then 'parts'
    when 'mechanic' then 'mechanic'
    when 'fleet_manager' then 'fleet_manager'
    when 'driver' then 'driver'
    when 'viewer' then 'viewer'
    else null
  end;
$$;

alter table public.shop_members drop constraint if exists shop_members_role_check;
alter table public.shop_members add constraint shop_members_role_check check (
  role = any (array[
    'owner','admin','manager','foreman','lead_hand','advisor','service',
    'dispatcher','parts','mechanic','fleet_manager','driver','viewer'
  ]::text[])
);

create or replace function public.sync_profile_shop_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.canonical_shop_membership_role(new.role::text);
  v_created_by uuid;
begin
  if tg_op = 'UPDATE' and old.shop_id is not null and old.shop_id is distinct from new.shop_id then
    delete from public.shop_members
    where shop_id = old.shop_id and user_id = old.id;
  end if;

  if new.shop_id is null or v_role is null then
    delete from public.shop_members where user_id = new.id;
    return new;
  end if;

  select new.created_by
    into v_created_by
  where new.created_by is not null
    and exists (select 1 from public.profiles creator where creator.id = new.created_by);

  insert into public.shop_members(shop_id,user_id,role,created_by)
  values (new.shop_id,new.id,v_role,v_created_by)
  on conflict (shop_id,user_id)
  do update set role = excluded.role;
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_shop_membership on public.profiles;
create trigger trg_profiles_sync_shop_membership
after insert or update of shop_id, role on public.profiles
for each row execute function public.sync_profile_shop_membership();

insert into public.shop_members(shop_id,user_id,role,created_by)
select
  profile.shop_id,
  profile.id,
  public.canonical_shop_membership_role(profile.role::text),
  case when exists (
    select 1 from public.profiles creator where creator.id = profile.created_by
  ) then profile.created_by else null end
from public.profiles profile
where profile.shop_id is not null
  and public.canonical_shop_membership_role(profile.role::text) is not null
on conflict (shop_id,user_id)
do update set role = excluded.role;

-- -------------------------------------------------------------------------
-- Service-role booking writes retain lifecycle checks. Slot eligibility is
-- validated by the trusted start route before this trigger is reached.
-- -------------------------------------------------------------------------
create or replace function public.guard_customer_booking_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_user_id uuid;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'INSERT' then
      if coalesce(new.status, 'pending') <> 'pending' then
        raise exception 'Portal bookings must begin as pending';
      end if;
      return new;
    end if;
    if old.status in ('cancelled','completed')
       and new.status is distinct from old.status then
      raise exception 'Completed or cancelled bookings cannot be changed';
    end if;
    if old.status = 'confirmed' and new.status = 'pending' then
      raise exception 'Confirmed bookings cannot return to pending';
    end if;
    return new;
  end if;

  if public.is_staff_for_shop(new.shop_id) then return new; end if;

  select customer.user_id into v_customer_user_id
  from public.customers customer where customer.id = new.customer_id;
  if v_customer_user_id is distinct from auth.uid() then
    raise exception 'Booking does not belong to the current customer';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending') <> 'pending' then
      raise exception 'Customer bookings must begin as pending';
    end if;
    return new;
  end if;
  if old.status in ('cancelled','completed') and new.status is distinct from old.status then
    raise exception 'Completed or cancelled bookings cannot be changed';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('pending','confirmed') and new.status = 'cancelled') then
    raise exception 'Customers may only cancel an active booking';
  end if;
  if new.shop_id is distinct from old.shop_id
     or new.customer_id is distinct from old.customer_id
     or new.vehicle_id is distinct from old.vehicle_id
     or new.work_order_id is distinct from old.work_order_id
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.notes is distinct from old.notes then
    raise exception 'Customers cannot edit protected booking fields';
  end if;
  return new;
end;
$$;

-- Fleet request conversion is legal only from an open request. This trigger
-- rolls back the entire conversion RPC, including any work-order insert.
create or replace function public.guard_fleet_request_conversion_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.work_order_id is null and new.work_order_id is not null and old.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'FLEET_REQUEST_NOT_CONVERTIBLE';
  end if;
  if old.status::text in ('completed','closed','cancelled','declined','rejected')
     and new.status is distinct from old.status then
    raise exception using errcode = 'P0001', message = 'FLEET_REQUEST_TERMINAL';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fleet_request_conversion_state on public.fleet_service_requests;
create trigger trg_fleet_request_conversion_state
before update of status, work_order_id on public.fleet_service_requests
for each row execute function public.guard_fleet_request_conversion_state();

-- -------------------------------------------------------------------------
-- Inventory snapshots: direct ledger writers still update legacy caches,
-- while the canonical apply_stock_move core is not counted twice.
-- -------------------------------------------------------------------------
create or replace function public.apply_stock_move_to_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.metadata->>'operation', '') = 'apply_stock_move' then
    return new;
  end if;
  insert into public.part_stock(part_id,location_id,qty_on_hand,qty_reserved)
  values (new.part_id,new.location_id,new.qty_change,0)
  on conflict (part_id,location_id)
  do update set qty_on_hand = public.part_stock.qty_on_hand + excluded.qty_on_hand;
  return new;
end;
$$;

drop trigger if exists trg_stock_moves_apply_snapshot on public.stock_moves;
create trigger trg_stock_moves_apply_snapshot
after insert on public.stock_moves
for each row execute function public.apply_stock_move_to_snapshot();

create index if not exists stock_moves_shop_reference_idx
on public.stock_moves(shop_id,reference_kind,reference_id,part_id);

create table if not exists public.inventory_reconciliation_exceptions(
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  part_id uuid references public.parts(id) on delete set null,
  missing_quantity numeric(12,2) not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(shop_id,purchase_order_id,part_id,reason)
);

alter table public.inventory_reconciliation_exceptions enable row level security;
revoke all on table public.inventory_reconciliation_exceptions
  from public, anon, authenticated;
grant all on table public.inventory_reconciliation_exceptions to service_role;

create or replace function public.receive_po_part_and_allocate(
  p_po_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_shop_id uuid;
  v_po_status text;
  v_operation_key text;
  v_move public.stock_moves%rowtype;
  v_result jsonb;
  v_po_remaining numeric;
  v_remaining numeric;
  v_po_closed boolean := false;
  v_item record;
  v_target numeric;
  v_received numeric;
  v_need numeric;
  v_take numeric;
  v_alloc jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='Not authenticated'; end if;
  if p_po_id is null or p_part_id is null or p_location_id is null or p_operation_id is null then
    raise exception using errcode='22023',message='PO, part, location, and operation id are required';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty::text in ('NaN','Infinity','-Infinity')
     or round(p_qty,2) is distinct from p_qty then
    raise exception using errcode='22023',message='Receipt quantity must be positive with at most two decimal places';
  end if;

  select purchase_order.shop_id,purchase_order.status::text
    into v_shop_id,v_po_status
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id
  for update;
  if v_shop_id is null then raise exception using errcode='P0002',message='Purchase order not found'; end if;

  if not exists (
    select 1 from public.profiles profile
    where (profile.id = v_uid or profile.user_id = v_uid)
      and profile.shop_id = v_shop_id
      and public.canonical_shop_membership_role(profile.role::text)
        in ('owner','admin','manager','lead_hand','foreman','parts')
  ) then
    raise exception using errcode='42501',message='Parts permission required';
  end if;
  if not exists (select 1 from public.parts part where part.id=p_part_id and part.shop_id=v_shop_id) then
    raise exception using errcode='42501',message='Part does not belong to purchase-order shop';
  end if;
  if not exists (select 1 from public.stock_locations location where location.id=p_location_id and location.shop_id=v_shop_id) then
    raise exception using errcode='42501',message='Location does not belong to purchase-order shop';
  end if;

  v_operation_key := v_shop_id::text || ':po-receive:' || p_operation_id::text;
  select move.* into v_move
  from public.stock_moves move
  where move.shop_id=v_shop_id and move.idempotency_key=v_operation_key
  for update;
  if found then
    if v_move.part_id is distinct from p_part_id
       or v_move.location_id is distinct from p_location_id
       or v_move.qty_change is distinct from p_qty
       or v_move.reference_kind is distinct from 'purchase_order'
       or v_move.reference_id is distinct from p_po_id then
      raise exception using errcode='22023',message='PO_RECEIVE_IDEMPOTENCY_CONFLICT';
    end if;
    return coalesce(v_move.metadata->'receipt_result','{}'::jsonb)
      || jsonb_build_object('ok',true,'replayed',true,'move_id',v_move.id);
  end if;

  perform 1 from public.purchase_order_lines line
  where line.po_id=p_po_id and line.part_id=p_part_id
  order by line.created_at,line.id for update;
  select coalesce(sum(greatest(coalesce(line.qty,0)-coalesce(line.received_qty,0),0)),0)
    into v_po_remaining
  from public.purchase_order_lines line
  where line.po_id=p_po_id and line.part_id=p_part_id;
  if v_po_remaining <= 0 then raise exception using errcode='22023',message='PO_PART_FULLY_RECEIVED'; end if;
  if p_qty > v_po_remaining then
    raise exception using errcode='22023',message=format('PO_RECEIVE_QUANTITY_EXCEEDS_REMAINING requested=%s remaining=%s',p_qty,v_po_remaining);
  end if;

  insert into public.stock_moves(
    shop_id,part_id,location_id,qty_change,reason,reference_kind,reference_id,
    created_by,idempotency_key,metadata,lifecycle_quantity
  ) values (
    v_shop_id,p_part_id,p_location_id,p_qty,'receive','purchase_order',p_po_id,
    v_uid,v_operation_key,
    jsonb_build_object('operation','purchase_order_receipt','operation_id',p_operation_id,'po_id',p_po_id),
    p_qty
  ) returning * into v_move;

  v_remaining := p_qty;
  for v_item in
    select line.id,line.qty,line.received_qty
    from public.purchase_order_lines line
    where line.po_id=p_po_id and line.part_id=p_part_id
    order by line.created_at,line.id for update
  loop
    exit when v_remaining <= 0;
    v_need := greatest(coalesce(v_item.qty,0)-coalesce(v_item.received_qty,0),0);
    v_take := least(v_remaining,v_need);
    if v_take > 0 then
      update public.purchase_order_lines set received_qty=coalesce(received_qty,0)+v_take where id=v_item.id;
      v_remaining := v_remaining-v_take;
    end if;
  end loop;
  if v_remaining <> 0 then raise exception using errcode='P0001',message='PO_RECEIVE_LINE_RECONCILIATION_FAILED'; end if;

  if exists (
    select 1 from public.purchase_order_lines line
    where line.po_id=p_po_id and coalesce(line.received_qty,0)<coalesce(line.qty,0)
  ) then
    v_po_closed := false;
  else
    update public.purchase_orders set status='received' where id=p_po_id;
    v_po_closed := true;
  end if;
  select status::text into v_po_status from public.purchase_orders where id=p_po_id;

  v_remaining := p_qty;
  for v_item in
    select item.id,item.qty,item.qty_requested,item.qty_approved,item.qty_received
    from public.part_request_items item
    where item.shop_id=v_shop_id and item.part_id=p_part_id
      and item.status in ('approved','reserved','ordered','picking','picked','partially_received')
      and greatest(coalesce(item.qty_approved,0),coalesce(item.qty_requested,0),coalesce(item.qty,0),0)
          > greatest(coalesce(item.qty_received,0),0)
    order by item.created_at,item.id for update
  loop
    exit when v_remaining <= 0;
    v_target := greatest(coalesce(v_item.qty_approved,0),coalesce(v_item.qty_requested,0),coalesce(v_item.qty,0),0);
    v_received := greatest(coalesce(v_item.qty_received,0),0);
    v_need := greatest(v_target-v_received,0);
    v_take := least(v_remaining,v_need);
    if v_take > 0 then
      update public.part_request_items
      set qty_received=v_received+v_take,
          status=case when v_received+v_take>=v_target then 'received'::public.part_request_item_status else 'partially_received'::public.part_request_item_status end
      where id=v_item.id;
      v_alloc := v_alloc || jsonb_build_object('request_item_id',v_item.id,'qty_allocated',v_take);
      v_remaining := v_remaining-v_take;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok',true,'replayed',false,'move_id',v_move.id,'po_id',p_po_id,
    'po_closed',v_po_closed,'po_status',v_po_status,'part_id',p_part_id,
    'qty_received_total',p_qty,'allocations',v_alloc,'unallocated_qty',greatest(v_remaining,0)
  );
  update public.stock_moves
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('receipt_result',v_result)
  where id=v_move.id;
  return v_result;
end;
$$;

create or replace function public.receive_po_part_and_allocate(
  p_po_id uuid,p_part_id uuid,p_location_id uuid,p_qty numeric
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select public.receive_po_part_and_allocate(p_po_id,p_part_id,p_location_id,p_qty,gen_random_uuid());
$$;

revoke all on function public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric) from public,anon;
revoke all on function public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric,uuid) from public,anon;
grant execute on function public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric) to authenticated,service_role;
grant execute on function public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric,uuid) to authenticated,service_role;

-- Reconcile provable historical gaps where one PO/part has exactly one known
-- receipt location. Ambiguous rows are surfaced for explicit review.
with line_totals as (
  select po.shop_id,line.po_id,line.part_id,round(sum(coalesce(line.received_qty,0)),2) received_qty
  from public.purchase_order_lines line
  join public.purchase_orders po on po.id=line.po_id
  group by po.shop_id,line.po_id,line.part_id
), move_totals as (
  select move.shop_id,move.reference_id po_id,move.part_id,
         round(sum(move.qty_change),2) moved_qty,
         count(distinct move.location_id) location_count,
         (array_agg(move.location_id order by move.location_id))[1] location_id
  from public.stock_moves move
  where move.reference_kind='purchase_order' and move.reason='receive'
  group by move.shop_id,move.reference_id,move.part_id
), gaps as (
  select line.shop_id,line.po_id,line.part_id,
         round(line.received_qty-coalesce(move.moved_qty,0),2) missing_qty,
         coalesce(move.location_count,0) location_count,move.location_id
  from line_totals line
  left join move_totals move
    on move.shop_id=line.shop_id and move.po_id=line.po_id and move.part_id=line.part_id
  where line.received_qty>coalesce(move.moved_qty,0)
)
insert into public.stock_moves(
  shop_id,part_id,location_id,qty_change,reason,reference_kind,reference_id,
  idempotency_key,metadata,lifecycle_quantity
)
select gap.shop_id,gap.part_id,gap.location_id,gap.missing_qty,'receive','purchase_order',gap.po_id,
       gap.shop_id::text||':po-reconcile:'||gap.po_id::text||':'||gap.part_id::text,
       jsonb_build_object('operation','historical_po_receipt_reconciliation','missing_quantity',gap.missing_qty),
       gap.missing_qty
from gaps gap
where gap.missing_qty>0 and gap.location_count=1 and gap.location_id is not null
on conflict (shop_id,idempotency_key) where idempotency_key is not null do nothing;

with line_totals as (
  select po.shop_id,line.po_id,line.part_id,round(sum(coalesce(line.received_qty,0)),2) received_qty
  from public.purchase_order_lines line join public.purchase_orders po on po.id=line.po_id
  group by po.shop_id,line.po_id,line.part_id
), move_totals as (
  select move.shop_id,move.reference_id po_id,move.part_id,round(sum(move.qty_change),2) moved_qty,
         count(distinct move.location_id) location_count
  from public.stock_moves move
  where move.reference_kind='purchase_order' and move.reason='receive'
  group by move.shop_id,move.reference_id,move.part_id
)
insert into public.inventory_reconciliation_exceptions(
  shop_id,purchase_order_id,part_id,missing_quantity,reason,details
)
select line.shop_id,line.po_id,line.part_id,
       round(line.received_qty-coalesce(move.moved_qty,0),2),
       'ambiguous_po_receipt_location',
       jsonb_build_object('received_qty',line.received_qty,'ledger_qty',coalesce(move.moved_qty,0),'location_count',coalesce(move.location_count,0))
from line_totals line
left join move_totals move
  on move.shop_id=line.shop_id and move.po_id=line.po_id and move.part_id=line.part_id
where line.received_qty>coalesce(move.moved_qty,0)
  and coalesce(move.location_count,0)<>1
on conflict (shop_id,purchase_order_id,part_id,reason)
do update set missing_quantity=excluded.missing_quantity,details=excluded.details;

-- Atomic, idempotent inventory creation + initial stock + request linkage.
create or replace function public.parts_create_and_attach_inventory_atomic(
  p_item_id uuid,
  p_name text,
  p_part_number text,
  p_manufacturer text,
  p_supplier text,
  p_sku text,
  p_category text,
  p_cost numeric,
  p_sell_price numeric,
  p_initial_qty numeric,
  p_location_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.part_request_items%rowtype;
  v_existing public.parts_operation_keys%rowtype;
  v_operation_id uuid := gen_random_uuid();
  v_part public.parts%rowtype;
  v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='Not authenticated'; end if;
  if nullif(trim(p_operation_key),'') is null then raise exception using errcode='22023',message='Stable operation key required'; end if;
  if nullif(trim(p_name),'') is null then raise exception using errcode='22023',message='Part name required'; end if;
  if (p_cost is not null and (p_cost<0 or p_cost::text in ('NaN','Infinity','-Infinity')))
     or (p_sell_price is not null and (p_sell_price<0 or p_sell_price::text in ('NaN','Infinity','-Infinity')))
     or p_initial_qty<0 or p_initial_qty::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023',message='Invalid inventory numeric value';
  end if;
  if p_initial_qty>0 and p_location_id is null then raise exception using errcode='22023',message='Location required for initial stock'; end if;

  select * into v_item from public.part_request_items item where item.id=p_item_id for update;
  if not found then raise exception using errcode='P0002',message='Request item not found'; end if;
  if not exists (
    select 1 from public.profiles profile
    where (profile.id=v_uid or profile.user_id=v_uid)
      and profile.shop_id=v_item.shop_id
      and public.canonical_shop_membership_role(profile.role::text)
        in ('owner','admin','manager','lead_hand','foreman','parts')
  ) then raise exception using errcode='42501',message='Parts permission required'; end if;

  select * into v_existing from public.parts_operation_keys operation
  where operation.shop_id=v_item.shop_id and operation.operation_key=p_operation_key for update;
  if found then
    if v_existing.operation_type<>'create_attach_inventory' or v_existing.aggregate_id<>p_item_id then
      raise exception using errcode='22023',message='PARTS_OPERATION_KEY_CONFLICT';
    end if;
    if v_existing.result is not null then return v_existing.result||jsonb_build_object('idempotent',true); end if;
    raise exception using errcode='P0001',message='PARTS_OPERATION_IN_PROGRESS';
  end if;

  insert into public.parts_operation_keys(
    id,shop_id,operation_key,operation_type,aggregate_type,aggregate_id,created_by
  ) values (
    v_operation_id,v_item.shop_id,p_operation_key,'create_attach_inventory','part_request_item',p_item_id,v_uid
  );

  insert into public.parts(
    shop_id,name,part_number,sku,category,cost,default_cost,price,default_price,manufacturer,supplier
  ) values (
    v_item.shop_id,trim(p_name),nullif(trim(p_part_number),''),nullif(trim(p_sku),''),
    nullif(trim(p_category),''),p_cost,p_cost,p_sell_price,p_sell_price,
    nullif(trim(p_manufacturer),''),nullif(trim(p_supplier),'')
  ) returning * into v_part;

  if p_initial_qty>0 then
    perform public.apply_stock_move(
      v_part.id,p_location_id,p_initial_qty,'receive'::text,
      'parts_request_initial_stock',v_operation_id
    );
  end if;

  update public.part_request_items
  set part_id=v_part.id,updated_at=now()
  where id=p_item_id and shop_id=v_item.shop_id;

  v_result := jsonb_build_object(
    'ok',true,'idempotent',false,'part_id',v_part.id,
    'part',to_jsonb(v_part),
    'item',(select to_jsonb(item) from public.part_request_items item where item.id=p_item_id)
  );
  update public.parts_operation_keys
  set result=v_result,completed_at=now()
  where id=v_operation_id;
  return v_result;
end;
$$;

revoke all on function public.parts_create_and_attach_inventory_atomic(
  uuid,text,text,text,text,text,text,numeric,numeric,numeric,uuid,text
) from public,anon;
grant execute on function public.parts_create_and_attach_inventory_atomic(
  uuid,text,text,text,text,text,text,numeric,numeric,numeric,uuid,text
) to authenticated,service_role;

-- -------------------------------------------------------------------------
-- Technician execution notes are separate from commercial approval content.
-- -------------------------------------------------------------------------
alter table public.work_order_lines add column if not exists technician_notes text;

create or replace function public.apply_offline_line_mutation_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_action_type text,
  p_work_order_line_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_role text;
  v_existing public.offline_mutation_receipts%rowtype;
  v_receipt_id uuid;
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_payload_hash text := encode(digest(coalesce(p_payload,'{}'::jsonb)::text,'sha256'),'hex');
  v_base_updated_at timestamptz;
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid()<>p_actor_user_id then raise exception using errcode='P0001',message='Authenticated actor does not match the mutation actor.'; end if;
  if nullif(trim(p_operation_key),'') is null or length(p_operation_key)>240 then raise exception using errcode='P0001',message='A stable operation key is required.'; end if;
  if p_action_type not in ('update_work_order_line_notes','save_story_draft') then raise exception using errcode='P0001',message='Unsupported offline line mutation.'; end if;

  select * into v_existing from public.offline_mutation_receipts receipt
  where receipt.shop_id=p_shop_id and receipt.operation_key=p_operation_key;
  if found then
    if v_existing.action_type<>p_action_type or v_existing.payload_hash<>v_payload_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.'; end if;
    return v_existing.result||jsonb_build_object('idempotent',true,'receipt_id',v_existing.id);
  end if;

  select lower(coalesce(profile.role::text,'')) into v_role
  from public.profiles profile where profile.id=p_actor_user_id and profile.shop_id=p_shop_id;
  if not found then raise exception using errcode='P0001',message='Actor is not available for this shop.'; end if;

  select * into v_line from public.work_order_lines line
  where line.id=p_work_order_line_id and line.shop_id=p_shop_id for update;
  if not found then raise exception using errcode='P0001',message='Work-order line not found for shop.'; end if;
  if v_line.voided_at is not null
     or lower(coalesce(v_line.status::text,'')) not in (
       'awaiting','assigned','queued','approved','in_progress','on_hold','paused','waiting_parts'
     ) then
    raise exception using errcode='P0001',message='Work-order line is not active.';
  end if;
  if v_role not in ('owner','admin','manager','advisor','service','lead_hand','lead hand','leadhand','foreman')
     and v_line.assigned_tech_id is distinct from p_actor_user_id
     and not exists (
       select 1 from public.work_order_line_technicians assignment
       where assignment.work_order_line_id=p_work_order_line_id and assignment.technician_id=p_actor_user_id
     ) then raise exception using errcode='P0001',message='Actor is not assigned to this work-order line.'; end if;

  if nullif(trim(v_payload->>'baseUpdatedAt'),'') is not null then
    begin v_base_updated_at := (v_payload->>'baseUpdatedAt')::timestamptz;
    exception when invalid_datetime_format then raise exception using errcode='P0001',message='Invalid offline base version.'; end;
    if v_line.updated_at is distinct from v_base_updated_at then raise exception using errcode='P0001',message='OFFLINE_VERSION_CONFLICT: this job changed on another device. Review the server state before retrying.'; end if;
  end if;

  if p_action_type='update_work_order_line_notes' then
    update public.work_order_lines set technician_notes=coalesce(v_payload->>'notes',''),updated_at=now()
    where id=p_work_order_line_id and shop_id=p_shop_id;
  else
    update public.work_order_lines
    set cause=coalesce(v_payload->>'cause',''),correction=coalesce(v_payload->>'correction',''),updated_at=now()
    where id=p_work_order_line_id and shop_id=p_shop_id;
  end if;

  v_result := jsonb_build_object('ok',true,'idempotent',false,'action_type',p_action_type,'work_order_id',v_line.work_order_id,'work_order_line_id',p_work_order_line_id,'completed_at',now());
  insert into public.offline_mutation_receipts(
    shop_id,actor_user_id,operation_key,action_type,payload_hash,entity_type,entity_id,result
  ) values (
    p_shop_id,p_actor_user_id,p_operation_key,p_action_type,v_payload_hash,'work_order_line',p_work_order_line_id,v_result
  ) returning id into v_receipt_id;
  return v_result||jsonb_build_object('receipt_id',v_receipt_id);
exception when unique_violation then
  select * into v_existing from public.offline_mutation_receipts receipt
  where receipt.shop_id=p_shop_id and receipt.operation_key=p_operation_key;
  if found and v_existing.action_type=p_action_type and v_existing.payload_hash=v_payload_hash then
    return v_existing.result||jsonb_build_object('idempotent',true,'receipt_id',v_existing.id);
  end if;
  raise exception using errcode='P0001',message='IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
end;
$$;

revoke all on function public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb) from public,anon;
grant execute on function public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb) to authenticated,service_role;

-- Shared-line completion cannot strand another technician's active segment.
-- Awaiting lines without a segment must not retain half of a legacy mirror pair.
create or replace function public.guard_work_order_line_punch_mirrors()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status::text='completed' and exists (
    select 1 from public.work_order_line_labor_segments segment
    where segment.work_order_line_id=new.id and segment.ended_at is null
  ) then
    raise exception using errcode='P0001',message='OTHER_TECHNICIANS_STILL_PUNCHED_IN';
  end if;
  if new.status::text in ('awaiting','assigned','queued') and not exists (
    select 1 from public.work_order_line_labor_segments segment
    where segment.work_order_line_id=new.id and segment.ended_at is null
  ) then
    new.punched_in_at := null;
    new.punched_out_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_order_line_punch_mirrors on public.work_order_lines;
create trigger trg_work_order_line_punch_mirrors
before update of status,punched_in_at,punched_out_at on public.work_order_lines
for each row execute function public.guard_work_order_line_punch_mirrors();

notify pgrst,'reload schema';
commit;
