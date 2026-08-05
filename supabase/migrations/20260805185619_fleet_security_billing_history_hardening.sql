-- Bind Fleet portal actors to their authenticated identity and connect every
-- Fleet request to the shop's canonical customer/work-order billing history.

alter table public.fleets
  add column if not exists customer_id uuid;

create or replace function public.ensure_fleet_customer_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
begin
  if new.customer_id is not null then
    if not exists (
      select 1
      from public.customers c
      where c.id = new.customer_id
        and c.shop_id = new.shop_id
    ) then
      raise exception 'Fleet customer account must belong to the same shop';
    end if;
    update public.customers
    set is_fleet = true,
        business_name = coalesce(nullif(business_name, ''), new.name),
        name = coalesce(nullif(name, ''), new.contact_name, new.name),
        email = coalesce(nullif(email, ''), new.contact_email),
        updated_at = now()
    where id = new.customer_id;
    return new;
  end if;

  if nullif(trim(coalesce(new.contact_email, '')), '') is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.shop_id = new.shop_id
      and lower(trim(c.email)) = lower(trim(new.contact_email))
    order by c.created_at, c.id
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      shop_id,
      name,
      business_name,
      email,
      is_fleet,
      notes,
      updated_at
    ) values (
      new.shop_id,
      coalesce(nullif(trim(coalesce(new.contact_name, '')), ''), new.name),
      new.name,
      nullif(trim(coalesce(new.contact_email, '')), ''),
      true,
      'Canonical customer account for Fleet portal billing and history.',
      now()
    )
    returning id into v_customer_id;
  else
    update public.customers
    set is_fleet = true,
        business_name = coalesce(nullif(business_name, ''), new.name),
        name = coalesce(nullif(name, ''), new.contact_name, new.name),
        updated_at = now()
    where id = v_customer_id;
  end if;

  new.customer_id := v_customer_id;
  return new;
end;
$$;

revoke all on function public.ensure_fleet_customer_account() from public, anon, authenticated;

drop trigger if exists ensure_fleet_customer_account_trigger on public.fleets;
create trigger ensure_fleet_customer_account_trigger
before insert or update of shop_id, name, contact_name, contact_email, customer_id
on public.fleets
for each row execute function public.ensure_fleet_customer_account();

update public.fleets
set customer_id = customer_id
where customer_id is null;

alter table public.fleets
  alter column customer_id set not null;

alter table public.fleets
  drop constraint if exists fleets_customer_id_fkey;
alter table public.fleets
  add constraint fleets_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete restrict;

create index if not exists fleets_shop_customer_idx
  on public.fleets (shop_id, customer_id);

revoke all on function public.accept_fleet_portal_invite_atomic(text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.accept_fleet_portal_invite_atomic(text, uuid, text, timestamptz)
  to service_role;

alter function public.apply_customer_quote_decision_atomic(uuid, uuid, uuid[], text, boolean, uuid, uuid, text, timestamptz)
  rename to apply_customer_quote_decision_engine_atomic;

revoke all on function public.apply_customer_quote_decision_engine_atomic(uuid, uuid, uuid[], text, boolean, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_customer_quote_decision_engine_atomic(uuid, uuid, uuid[], text, boolean, uuid, uuid, text, timestamptz)
  to service_role;

-- Preserve the old RPC name during rollout, but bind every non-service call to
-- auth.uid() and an authorized shop, customer, or Fleet relationship.
create function public.apply_customer_quote_decision_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[],
  p_decision text,
  p_decline_remaining boolean,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_authorized boolean := false;
begin
  if auth.role() <> 'service_role' then
    if auth.uid() is null or auth.uid() is distinct from p_actor_user_id then
      raise exception 'Authenticated actor does not match the quote decision actor';
    end if;

    select * into v_work_order
    from public.work_orders
    where id = p_work_order_id
      and shop_id = p_shop_id;

    if v_work_order.id is null then
      raise exception 'Work order not found for shop';
    end if;

    select exists (
      select 1
      from public.profiles p
      where p.id = p_actor_user_id
        and p.shop_id = p_shop_id
        and p.role in ('owner', 'admin', 'manager', 'advisor')
    ) or exists (
      select 1
      from public.customers c
      where c.id = v_work_order.customer_id
        and c.id = p_customer_id
        and c.shop_id = p_shop_id
        and c.user_id = p_actor_user_id
    ) or exists (
      select 1
      from public.fleets f
      join public.fleet_members fm
        on fm.fleet_id = f.id
       and fm.user_id = p_actor_user_id
       and fm.role in ('owner', 'admin', 'manager', 'fleet_manager')
      join public.fleet_vehicles fv
        on fv.fleet_id = f.id
       and fv.vehicle_id = v_work_order.vehicle_id
       and coalesce(fv.active, true)
      where f.shop_id = p_shop_id
        and f.customer_id = v_work_order.customer_id
        and f.customer_id = p_customer_id
        and (fv.shop_id is null or fv.shop_id = p_shop_id)
    ) into v_authorized;

    if not v_authorized then
      raise exception 'Actor is not authorized for this quote decision';
    end if;
  end if;

  return public.apply_customer_quote_decision_engine_atomic(
    p_shop_id,
    p_work_order_id,
    p_quote_line_ids,
    p_decision,
    p_decline_remaining,
    p_customer_id,
    p_actor_user_id,
    p_operation_key,
    p_at
  );
end;
$$;

revoke all on function public.apply_customer_quote_decision_atomic(uuid, uuid, uuid[], text, boolean, uuid, uuid, text, timestamptz)
  from public, anon;
grant execute on function public.apply_customer_quote_decision_atomic(uuid, uuid, uuid[], text, boolean, uuid, uuid, text, timestamptz)
  to authenticated, service_role;

create or replace function public.apply_portal_quote_decision_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[],
  p_decision text,
  p_decline_remaining boolean,
  p_operation_key text,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_work_order public.work_orders%rowtype;
  v_authorized boolean := false;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
    and shop_id = p_shop_id;

  if v_work_order.id is null or v_work_order.customer_id is null then
    raise exception 'Portal work order not found';
  end if;

  select exists (
    select 1
    from public.customers c
    where c.id = v_work_order.customer_id
      and c.shop_id = p_shop_id
      and c.user_id = v_actor_user_id
  ) or exists (
    select 1
    from public.fleets f
    join public.fleet_members fm
      on fm.fleet_id = f.id
     and fm.user_id = v_actor_user_id
     and fm.role in ('owner', 'admin', 'manager', 'fleet_manager')
    join public.fleet_vehicles fv
      on fv.fleet_id = f.id
     and fv.vehicle_id = v_work_order.vehicle_id
     and coalesce(fv.active, true)
    where f.shop_id = p_shop_id
      and f.customer_id = v_work_order.customer_id
      and (fv.shop_id is null or fv.shop_id = p_shop_id)
  ) into v_authorized;

  if not v_authorized then
    raise exception 'Portal actor is not authorized for this work order';
  end if;

  return public.apply_customer_quote_decision_engine_atomic(
    p_shop_id,
    p_work_order_id,
    p_quote_line_ids,
    p_decision,
    p_decline_remaining,
    v_work_order.customer_id,
    v_actor_user_id,
    p_operation_key,
    p_at
  );
end;
$$;

revoke all on function public.apply_portal_quote_decision_atomic(uuid, uuid, uuid[], text, boolean, text, timestamptz)
  from public, anon;
grant execute on function public.apply_portal_quote_decision_atomic(uuid, uuid, uuid[], text, boolean, text, timestamptz)
  to authenticated, service_role;

create or replace function public.convert_fleet_service_request_to_work_order_atomic(
  p_service_request_id uuid
)
returns table(work_order_id uuid, conversion_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.fleet_service_requests%rowtype;
  v_fleet public.fleets%rowtype;
  v_work_order_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request
  from public.fleet_service_requests
  where id = p_service_request_id
  for update;

  if v_request.id is null then
    raise exception 'Service request not found';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.shop_id = v_request.shop_id
      and p.role in ('owner', 'admin', 'manager', 'advisor')
  ) then
    raise exception 'Shop staff review is required';
  end if;

  select * into v_fleet
  from public.fleets f
  where f.id = v_request.fleet_id
    and f.shop_id = v_request.shop_id;

  if v_fleet.id is null or v_fleet.customer_id is null then
    raise exception 'Fleet billing account is unavailable';
  end if;

  if not exists (
    select 1 from public.fleet_vehicles fv
    where fv.fleet_id = v_request.fleet_id
      and fv.vehicle_id = v_request.vehicle_id
      and (fv.shop_id is null or fv.shop_id = v_request.shop_id)
      and coalesce(fv.active, true)
  ) then
    raise exception 'Vehicle is not actively enrolled in this Fleet';
  end if;

  if v_request.work_order_id is not null then
    return query select v_request.work_order_id, 'already_linked'::text;
    return;
  end if;

  if not exists (
    select 1 from public.fleet_service_request_lines l
    where l.service_request_id = v_request.id
  ) or exists (
    select 1 from public.fleet_service_request_lines l
    where l.service_request_id = v_request.id
      and (
        l.shop_id <> v_request.shop_id
        or l.fleet_id <> v_request.fleet_id
        or l.vehicle_id <> v_request.vehicle_id
      )
  ) then
    raise exception 'Structured request lines must match the request scope';
  end if;

  insert into public.work_orders (
    shop_id,
    customer_id,
    customer_name,
    vehicle_id,
    status,
    approval_state,
    source_fleet_service_request_id,
    created_by,
    notes
  ) values (
    v_request.shop_id,
    v_fleet.customer_id,
    v_fleet.name,
    v_request.vehicle_id,
    'awaiting_approval',
    'pending',
    v_request.id,
    v_user_id,
    concat('Fleet request: ', v_request.title, E'\n', v_request.summary)
  ) returning id into v_work_order_id;

  insert into public.work_order_lines (
    work_order_id,
    shop_id,
    vehicle_id,
    description,
    complaint,
    notes,
    labor_time,
    job_type,
    status,
    approval_state,
    menu_item_id,
    inspection_template_id,
    price_estimate,
    line_type,
    source_fleet_service_request_line_id
  )
  select
    v_work_order_id,
    l.shop_id,
    l.vehicle_id,
    l.description,
    case when l.line_kind = 'diagnostic' then l.description else null end,
    l.notes,
    l.requested_labor_hours,
    case
      when l.line_kind = 'diagnostic' then 'diagnostic'
      when l.line_kind in ('inspection', 'pm_package') then 'maintenance'
      else 'repair'
    end,
    'awaiting',
    'pending',
    l.source_menu_item_id,
    l.source_inspection_template_id,
    case
      when l.unit_price_snapshot is null then null
      else l.unit_price_snapshot * l.quantity
    end,
    'job',
    l.id
  from public.fleet_service_request_lines l
  where l.service_request_id = v_request.id
  order by l.created_at, l.id;

  update public.fleet_service_request_lines
  set work_order_line_id = wol.id,
      updated_at = now()
  from public.work_order_lines wol
  where wol.work_order_id = v_work_order_id
    and wol.source_fleet_service_request_line_id = fleet_service_request_lines.id;

  update public.fleet_service_requests
  set work_order_id = v_work_order_id,
      status = 'scheduled',
      updated_at = now()
  where id = v_request.id;

  update public.fleet_pm_due_events
  set service_request_id = v_request.id,
      status = 'converted',
      updated_at = now()
  where id = v_request.source_pm_due_event_id;

  return query select v_work_order_id, 'converted'::text;
end;
$$;

revoke all on function public.convert_fleet_service_request_to_work_order_atomic(uuid)
  from public, anon;
grant execute on function public.convert_fleet_service_request_to_work_order_atomic(uuid)
  to authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from public.fleets f
    left join public.customers c on c.id = f.customer_id
    where f.customer_id is null
       or c.id is null
       or c.shop_id is distinct from f.shop_id
  ) then
    raise exception 'Fleet customer backfill validation failed';
  end if;
end;
$$;
