begin;

-- The authenticated user id and the canonical profiles.id are normally the
-- same value, but imported and subsequently activated staff can legitimately
-- have profiles.user_id = auth.uid() with a different profile primary key.
-- Every assistant command resolves both forms before applying role or
-- assignment checks.
create or replace function public.shop_assistant_profile_id(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  select p.id
    into v_profile_id
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.user_id = p_actor_user_id then 0 else 1 end, p.id
  limit 1;

  if v_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'The actor is not available for this shop.';
  end if;

  return v_profile_id;
end;
$$;

revoke all on function public.shop_assistant_profile_id(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.shop_assistant_profile_role(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  select case lower(replace(trim(coalesce(p.role::text, '')), ' ', '_'))
      when 'lead' then 'lead_hand'
      when 'leadhand' then 'lead_hand'
      when 'service_advisor' then 'service'
      when 'tech' then 'mechanic'
      when 'technician' then 'mechanic'
      else lower(replace(trim(coalesce(p.role::text, '')), ' ', '_'))
    end
    into v_role
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.user_id = p_actor_user_id then 0 else 1 end, p.id
  limit 1;

  if v_role is null or v_role = '' then
    raise exception using
      errcode = '42501',
      message = 'The actor is not available for this shop.';
  end if;

  return v_role;
end;
$$;

revoke all on function public.shop_assistant_profile_role(uuid, uuid)
  from public, anon, authenticated;

-- Legacy records can have a null updated_at. The literal "missing" is a
-- deliberate version sentinel, not a wildcard, so those rows remain usable
-- while every confirmation still binds to one exact preview state.
create or replace function public.shop_assistant_timestamp_version_matches(
  p_expected text,
  p_current timestamptz
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_expected is null then false
    when p_expected = 'missing' then p_current is null
    else p_current is not distinct from p_expected::timestamptz
  end;
$$;

revoke all on function public.shop_assistant_timestamp_version_matches(
  text, timestamptz
) from public, anon, authenticated;

create or replace function public.shop_assistant_json_fingerprint(
  p_value jsonb
) returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select encode(
    extensions.digest(coalesce(p_value, 'null'::jsonb)::text, 'sha256'::text),
    'hex'
  );
$$;

revoke all on function public.shop_assistant_json_fingerprint(jsonb)
  from public, anon, authenticated;

-- Hash every persisted row that can contribute to the canonical invoice
-- snapshot. The digest is safe to persist in an action preview and lets the
-- finalization command reject additions, deletions, pricing edits, or identity
-- changes without copying customer or financial details into the action row.
create or replace function public.shop_assistant_invoice_source_fingerprint(
  p_shop_id uuid,
  p_work_order_id uuid
) returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_payload jsonb;
begin
  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found for this shop.';
  end if;

  select jsonb_build_object(
    'workOrder', to_jsonb(v_work_order),
    'shop', (
      select to_jsonb(shop) from public.shops shop
      where shop.id = p_shop_id
    ),
    'customer', (
      select to_jsonb(customer) from public.customers customer
      where customer.id = v_work_order.customer_id
        and customer.shop_id = p_shop_id
    ),
    'vehicle', (
      select to_jsonb(vehicle) from public.vehicles vehicle
      where vehicle.id = v_work_order.vehicle_id
        and vehicle.shop_id = p_shop_id
    ),
    'workOrderLines', (
      select coalesce(jsonb_agg(to_jsonb(line) order by line.id), '[]'::jsonb)
      from public.work_order_lines line
      where line.shop_id = p_shop_id
        and line.work_order_id = p_work_order_id
    ),
    'quoteLines', (
      select coalesce(jsonb_agg(to_jsonb(quote) order by quote.id), '[]'::jsonb)
      from public.work_order_quote_lines quote
      where quote.shop_id = p_shop_id
        and quote.work_order_id = p_work_order_id
    ),
    'partAllocations', (
      select coalesce(jsonb_agg(to_jsonb(allocation) order by allocation.id), '[]'::jsonb)
      from public.work_order_part_allocations allocation
      where allocation.shop_id = p_shop_id
        and allocation.work_order_id = p_work_order_id
    ),
    'workOrderParts', (
      select coalesce(jsonb_agg(to_jsonb(work_part) order by work_part.id), '[]'::jsonb)
      from public.work_order_parts work_part
      where work_part.shop_id = p_shop_id
        and work_part.work_order_id = p_work_order_id
    ),
    'partRequestItems', (
      select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
      from public.part_request_items item
      where item.shop_id = p_shop_id
        and item.work_order_id = p_work_order_id
    ),
    'partRequests', (
      select coalesce(jsonb_agg(to_jsonb(request) order by request.id), '[]'::jsonb)
      from public.part_requests request
      where request.shop_id = p_shop_id
        and (
          request.work_order_id = p_work_order_id
          or request.id in (
            select item.request_id
            from public.part_request_items item
            where item.shop_id = p_shop_id
              and item.work_order_id = p_work_order_id
          )
        )
    ),
    'parts', (
      select coalesce(jsonb_agg(to_jsonb(part) order by part.id), '[]'::jsonb)
      from public.parts part
      where part.shop_id = p_shop_id
        and part.id in (
          select allocation.part_id
          from public.work_order_part_allocations allocation
          where allocation.shop_id = p_shop_id
            and allocation.work_order_id = p_work_order_id
          union
          select work_part.part_id
          from public.work_order_parts work_part
          where work_part.shop_id = p_shop_id
            and work_part.work_order_id = p_work_order_id
            and work_part.part_id is not null
          union
          select item.part_id
          from public.part_request_items item
          where item.shop_id = p_shop_id
            and item.work_order_id = p_work_order_id
            and item.part_id is not null
        )
    ),
    'pricingOverrides', (
      select coalesce(jsonb_agg(to_jsonb(override_row)), '[]'::jsonb)
      from public.invoice_pricing_overrides override_row
      where override_row.shop_id = p_shop_id
        and override_row.work_order_id = p_work_order_id
    ),
    'invoices', (
      select coalesce(jsonb_agg(to_jsonb(invoice) order by invoice.id), '[]'::jsonb)
      from public.invoices invoice
      where invoice.shop_id = p_shop_id
        and invoice.work_order_id = p_work_order_id
    ),
    'invoiceVersions', (
      select coalesce(jsonb_agg(to_jsonb(version) order by version.id), '[]'::jsonb)
      from public.invoice_versions version
      where version.shop_id = p_shop_id
        and version.work_order_id = p_work_order_id
    )
  ) into v_payload;

  return public.shop_assistant_json_fingerprint(v_payload);
end;
$$;

revoke all on function public.shop_assistant_invoice_source_fingerprint(
  uuid, uuid
) from public, anon, authenticated;

create or replace function public.shop_assistant_succeed_action(
  p_action_id uuid,
  p_shop_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.shop_assistant_actions
  set status = 'succeeded',
      result = coalesce(p_result, '{}'::jsonb),
      error = null,
      execution_finished_at = now(),
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';
  get diagnostics v_count = row_count;

  if v_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'The assistant action could not record its terminal result.';
  end if;

  return coalesce(p_result, '{}'::jsonb);
end;
$$;

revoke all on function public.shop_assistant_succeed_action(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Only trusted server code may create or advance assistant actions. Keep an
-- insert guard as defense in depth if table grants are broadened later; a
-- browser client must never manufacture an already-executing action and call
-- an atomic command without the reviewed confirmation route.
create or replace function public.shop_assistant_guard_action_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' and (
    new.status <> 'pending_confirmation'
    or new.confirmed_by is not null
    or new.confirmed_at is not null
    or new.execution_started_at is not null
    or new.execution_finished_at is not null
    or new.result is not null
    or new.error is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'Client-created assistant actions must await confirmation.';
  end if;
  return new;
end;
$$;

create or replace function public.shop_assistant_guard_terminal_action()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = any (
    array['succeeded'::text, 'failed'::text, 'cancelled'::text, 'expired'::text]
  ) and new.status is distinct from old.status then
    if old.status = 'failed'
       and new.status = 'executing'
       and old.error ->> 'retryable' = 'true' then
      return new;
    end if;
    raise exception 'Terminal shop assistant actions cannot transition';
  end if;
  return new;
end;
$$;

revoke all on function public.shop_assistant_guard_action_insert()
  from public, anon, authenticated;
revoke all on function public.shop_assistant_guard_terminal_action()
  from public, anon, authenticated;
revoke all on function public.shop_assistant_lock_action_for_tool(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

drop trigger if exists shop_assistant_actions_guard_insert
  on public.shop_assistant_actions;
create trigger shop_assistant_actions_guard_insert
before insert on public.shop_assistant_actions
for each row execute function public.shop_assistant_guard_action_insert();

-- Fleet workflows historically compared auth.uid() only with profiles.id.
-- Assistant wrappers resolve the canonical profile id explicitly so activated
-- imported staff (profiles.user_id = auth.uid()) retain the same permissions,
-- audit identity, idempotency, and all-or-nothing action ledger semantics.
create or replace function public.shop_assistant_create_fleet_service_request_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_fleet_id uuid,
  p_vehicle_id uuid,
  p_title text,
  p_summary text,
  p_requested_for_date date default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_fleet public.fleets%rowtype;
  v_request_id uuid;
  v_title text := left(coalesce(nullif(btrim(p_title), ''), 'Fleet service request'), 160);
  v_summary text := left(coalesce(nullif(btrim(p_summary), ''), 'Structured fleet request'), 4000);
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id,
    p_shop_id,
    p_actor_user_id,
    'create_fleet_service_request'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_actor_profile_id := public.shop_assistant_profile_id(
    p_shop_id,
    p_actor_user_id
  );
  v_actor_role := public.shop_assistant_profile_role(
    p_shop_id,
    p_actor_user_id
  );
  if v_actor_role not in ('owner', 'admin', 'manager', 'fleet_manager') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot create fleet service requests.';
  end if;

  select fleet.*
    into v_fleet
  from public.fleets fleet
  where fleet.id = p_fleet_id
    and fleet.shop_id = p_shop_id
    and coalesce(fleet.active, true)
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Fleet not found in this shop.';
  end if;

  if v_actor_role = 'fleet_manager'
     and not exists (
       select 1
       from public.fleet_members member
       where member.shop_id = p_shop_id
         and member.fleet_id = p_fleet_id
         and member.user_id in (v_actor_profile_id, p_actor_user_id)
         and lower(replace(coalesce(member.role::text, ''), ' ', '_')) in (
           'owner', 'admin', 'manager', 'fleet_manager'
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'That fleet is outside your fleet access.';
  end if;

  if not exists (
    select 1
    from public.fleet_vehicles enrollment
    where enrollment.fleet_id = p_fleet_id
      and enrollment.vehicle_id = p_vehicle_id
      and (enrollment.shop_id is null or enrollment.shop_id = p_shop_id)
      and coalesce(enrollment.active, true)
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'That vehicle is not actively enrolled in this fleet.';
  end if;

  insert into public.fleet_service_requests (
    shop_id,
    fleet_id,
    vehicle_id,
    title,
    summary,
    severity,
    status,
    requested_for_date,
    submitted_at,
    created_by_profile_id,
    operation_key,
    request_fingerprint
  ) values (
    p_shop_id,
    p_fleet_id,
    p_vehicle_id,
    v_title,
    v_summary,
    'recommend',
    'open',
    p_requested_for_date,
    now(),
    v_actor_profile_id,
    'shop-assistant:' || p_action_id::text,
    md5(jsonb_build_object(
      'fleetId', p_fleet_id,
      'vehicleId', p_vehicle_id,
      'title', v_title,
      'summary', v_summary,
      'requestedForDate', p_requested_for_date
    )::text)
  )
  returning id into v_request_id;

  insert into public.fleet_service_request_lines (
    shop_id,
    fleet_id,
    service_request_id,
    vehicle_id,
    line_kind,
    description,
    notes,
    quantity,
    price_status,
    source_snapshot,
    created_by
  ) values (
    p_shop_id,
    p_fleet_id,
    v_request_id,
    p_vehicle_id,
    'custom',
    v_title,
    v_summary,
    1,
    'advisor_pending',
    jsonb_build_object(
      'source', 'shop_assistant',
      'actionId', p_action_id
    ),
    v_actor_profile_id
  );

  v_result := jsonb_build_object(
    'ok', true,
    'serviceRequestId', v_request_id,
    'summary', 'Created fleet service request “' || v_title || '”.',
    'href', '/fleet/service-requests'
  );

  insert into public.activity_logs(
    action,
    user_id,
    timestamp,
    target_table,
    target_id,
    context
  ) values (
    'shop_assistant_fleet_service_request_created',
    p_actor_user_id,
    now(),
    'fleet_service_request',
    v_request_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'fleet_id', p_fleet_id,
      'vehicle_id', p_vehicle_id,
      'profile_id', v_actor_profile_id,
      'action_id', p_action_id
    )
  );

  return public.shop_assistant_succeed_action(
    p_action_id,
    p_shop_id,
    v_result
  );
end;
$$;

create or replace function public.shop_assistant_convert_fleet_service_request_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_service_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_request public.fleet_service_requests%rowtype;
  v_fleet public.fleets%rowtype;
  v_work_order_id uuid;
  v_expected text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id,
    p_shop_id,
    p_actor_user_id,
    'convert_fleet_service_request_to_work_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_actor_profile_id := public.shop_assistant_profile_id(
    p_shop_id,
    p_actor_user_id
  );
  v_actor_role := public.shop_assistant_profile_role(
    p_shop_id,
    p_actor_user_id
  );
  if v_actor_role not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot convert fleet service requests.';
  end if;

  select request.*
    into v_request
  from public.fleet_service_requests request
  where request.id = p_service_request_id
    and request.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Fleet service request not found in this shop.';
  end if;

  v_expected := v_action.target_versions
    ->> ('fleet_service_request:' || p_service_request_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_request.updated_at
  ) then
    raise exception using
      errcode = '40001',
      message = 'The fleet service request changed after the confirmation preview.';
  end if;

  if v_request.work_order_id is not null then
    v_result := jsonb_build_object(
      'ok', true,
      'workOrderId', v_request.work_order_id,
      'conversionStatus', 'already_linked',
      'summary', 'The fleet request was already linked to this work order.',
      'href', '/work-orders/' || v_request.work_order_id::text
    );
    return public.shop_assistant_succeed_action(
      p_action_id,
      p_shop_id,
      v_result
    );
  end if;

  select fleet.*
    into v_fleet
  from public.fleets fleet
  where fleet.id = v_request.fleet_id
    and fleet.shop_id = p_shop_id;
  if not found or v_fleet.customer_id is null then
    raise exception using
      errcode = '55000',
      message = 'Fleet billing account is unavailable.';
  end if;

  if not exists (
    select 1
    from public.fleet_vehicles enrollment
    where enrollment.fleet_id = v_request.fleet_id
      and enrollment.vehicle_id = v_request.vehicle_id
      and (enrollment.shop_id is null or enrollment.shop_id = p_shop_id)
      and coalesce(enrollment.active, true)
  ) then
    raise exception using
      errcode = '55000',
      message = 'Vehicle is not actively enrolled in this fleet.';
  end if;

  if not exists (
    select 1
    from public.fleet_service_request_lines line
    where line.service_request_id = v_request.id
  ) or exists (
    select 1
    from public.fleet_service_request_lines line
    where line.service_request_id = v_request.id
      and (
        line.shop_id <> p_shop_id
        or line.fleet_id <> v_request.fleet_id
        or line.vehicle_id <> v_request.vehicle_id
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Structured request lines do not match the fleet request scope.';
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
    p_shop_id,
    v_fleet.customer_id,
    v_fleet.name,
    v_request.vehicle_id,
    'awaiting_approval',
    'pending',
    v_request.id,
    v_actor_profile_id,
    concat('Fleet request: ', v_request.title, E'\n', v_request.summary)
  )
  returning id into v_work_order_id;

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
    line.shop_id,
    line.vehicle_id,
    line.description,
    case when line.line_kind = 'diagnostic' then line.description else null end,
    line.notes,
    line.requested_labor_hours,
    case
      when line.line_kind = 'diagnostic' then 'diagnosis'
      when line.line_kind in ('inspection', 'pm_package') then 'maintenance'
      else 'repair'
    end,
    'awaiting',
    'pending',
    line.source_menu_item_id,
    line.source_inspection_template_id,
    case
      when line.unit_price_snapshot is null then null
      else line.unit_price_snapshot * line.quantity
    end,
    'job',
    line.id
  from public.fleet_service_request_lines line
  where line.service_request_id = v_request.id
  order by line.created_at, line.id;

  update public.fleet_service_request_lines request_line
  set work_order_line_id = work_line.id,
      updated_at = now()
  from public.work_order_lines work_line
  where work_line.work_order_id = v_work_order_id
    and work_line.source_fleet_service_request_line_id = request_line.id;

  update public.fleet_service_requests
  set work_order_id = v_work_order_id,
      status = 'scheduled',
      updated_at = now()
  where id = v_request.id
    and shop_id = p_shop_id;

  update public.fleet_pm_due_events
  set service_request_id = v_request.id,
      status = 'converted',
      updated_at = now()
  where id = v_request.source_pm_due_event_id
    and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', v_work_order_id,
    'conversionStatus', 'converted',
    'summary', 'The fleet service request was converted to a work order.',
    'href', '/work-orders/' || v_work_order_id::text
  );

  insert into public.activity_logs(
    action,
    user_id,
    timestamp,
    target_table,
    target_id,
    context
  ) values (
    'shop_assistant_fleet_request_converted',
    p_actor_user_id,
    now(),
    'work_order',
    v_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'fleet_service_request_id', v_request.id,
      'profile_id', v_actor_profile_id,
      'action_id', p_action_id
    )
  );

  return public.shop_assistant_succeed_action(
    p_action_id,
    p_shop_id,
    v_result
  );
end;
$$;

-- Keep durable assistant conversations available to every authenticated shop
-- staff role accepted by requireShopAssistantActor, including mechanics, while
-- preserving auth-user ownership and same-shop isolation for linked/imported
-- profiles whose canonical profiles.id differs from auth.uid().
drop policy if exists shop_assistant_threads_owner_select
  on public.shop_assistant_threads;
create policy shop_assistant_threads_owner_select
on public.shop_assistant_threads
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.shop_id = shop_assistant_threads.shop_id
      and (p.id = auth.uid() or p.user_id = auth.uid())
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor',
        'service advisor',
        'parts', 'mechanic', 'tech', 'technician', 'lead', 'lead_hand',
        'leadhand', 'lead hand', 'foreman', 'fleet_manager', 'dispatcher'
      )
  )
);

drop policy if exists shop_assistant_threads_owner_insert
  on public.shop_assistant_threads;
create policy shop_assistant_threads_owner_insert
on public.shop_assistant_threads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.shop_id = shop_assistant_threads.shop_id
      and (p.id = auth.uid() or p.user_id = auth.uid())
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor',
        'service advisor',
        'parts', 'mechanic', 'tech', 'technician', 'lead', 'lead_hand',
        'leadhand', 'lead hand', 'foreman', 'fleet_manager', 'dispatcher'
      )
  )
);

drop policy if exists shop_assistant_threads_owner_update
  on public.shop_assistant_threads;
create policy shop_assistant_threads_owner_update
on public.shop_assistant_threads
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.shop_id = shop_assistant_threads.shop_id
      and (p.id = auth.uid() or p.user_id = auth.uid())
      and lower(coalesce(p.role::text, '')) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor',
        'service advisor',
        'parts', 'mechanic', 'tech', 'technician', 'lead', 'lead_hand',
        'leadhand', 'lead hand', 'foreman', 'fleet_manager', 'dispatcher'
      )
  )
);

drop policy if exists shop_assistant_actions_actor_select
  on public.shop_assistant_actions;
create policy shop_assistant_actions_actor_select
on public.shop_assistant_actions
for select
to authenticated
using (
  requested_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.shop_id = shop_assistant_actions.shop_id
      and (p.id = auth.uid() or p.user_id = auth.uid())
      and lower(coalesce(p.role::text, '')) in ('owner', 'admin', 'manager')
  )
);

drop policy if exists shop_assistant_actions_actor_update
  on public.shop_assistant_actions;
drop policy if exists shop_assistant_actions_actor_insert
  on public.shop_assistant_actions;
revoke insert, update on table public.shop_assistant_actions from authenticated;
grant select on table public.shop_assistant_actions to authenticated;

-- Repair the canonical request creator. The prior definition both assumed
-- profiles.id = auth.uid() and supplied two extra VALUES expressions when
-- inserting request items, causing valid assistant and UI requests to fail at
-- runtime.
create or replace function public.create_part_request_with_items(
  p_work_order_id uuid,
  p_items jsonb,
  p_job_id text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_role text;
  v_request_id uuid;
  v_job_id uuid;
  v_preapproved boolean := false;
  v_item jsonb;
  v_description text;
  v_part_number text;
  v_manufacturer text;
  v_qty numeric;
begin
  select wo.shop_id
    into v_shop_id
  from public.work_orders wo
  where wo.id = p_work_order_id;

  if v_shop_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Work order not found or missing shop_id.';
  end if;

  if auth.role() <> 'service_role' then
    if v_actor_id is null then
      raise exception using errcode = '28000', message = 'Authentication is required.';
    end if;
    v_actor_profile_id := public.shop_assistant_profile_id(v_shop_id, v_actor_id);
    v_actor_role := public.shop_assistant_profile_role(v_shop_id, v_actor_id);
    if v_actor_role not in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
      'mechanic', 'lead_hand', 'foreman'
    ) then
      raise exception using
        errcode = '42501',
        message = 'Parts request actor is not authorized for this shop.';
    end if;
  end if;

  if nullif(trim(coalesce(p_job_id, '')), '') is not null then
    if trim(p_job_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Invalid work-order line id.';
    end if;
    v_job_id := trim(p_job_id)::uuid;
    select (
      lower(coalesce(wol.approval_state::text, '')) = 'approved'
      or lower(coalesce(wol.line_status::text, '')) = 'authorized'
    )
      into v_preapproved
    from public.work_order_lines wol
    where wol.id = v_job_id
      and wol.shop_id = v_shop_id
      and wol.work_order_id = p_work_order_id;
    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'Work-order line not found for this work order and shop.';
    end if;
  end if;

  if auth.role() <> 'service_role' and v_actor_role = 'mechanic' then
    if v_job_id is null or not exists (
      select 1
      from public.work_order_lines wol
      where wol.id = v_job_id
        and wol.shop_id = v_shop_id
        and wol.work_order_id = p_work_order_id
        and (
          wol.assigned_tech_id = v_actor_profile_id
          or wol.assigned_to = v_actor_profile_id
          or exists (
            select 1
            from public.work_order_line_technicians wolt
            where wolt.work_order_line_id = wol.id
              and wolt.technician_id = v_actor_profile_id
          )
        )
    ) then
      raise exception using
        errcode = '42501',
        message = 'Technicians can request parts only for their assigned work-order line.';
    end if;
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 100 then
    raise exception using
      errcode = '22023',
      message = 'Parts requests require between 1 and 100 items.';
  end if;

  insert into public.part_requests(
    work_order_id, shop_id, job_id, notes, status, requested_by
  ) values (
    p_work_order_id,
    v_shop_id,
    v_job_id,
    nullif(trim(coalesce(p_notes, '')), ''),
    case
      when v_preapproved then 'approved'::public.part_request_status
      else 'requested'::public.part_request_status
    end,
    v_actor_id
  ) returning id into v_request_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := trim(coalesce(v_item ->> 'description', ''));
    v_part_number := nullif(trim(coalesce(
      v_item ->> 'partNumber',
      v_item ->> 'requested_part_number',
      ''
    )), '');
    v_manufacturer := nullif(trim(coalesce(
      v_item ->> 'manufacturer',
      v_item ->> 'requested_manufacturer',
      ''
    )), '');

    if nullif(v_item ->> 'qty', '') is not null
       and (v_item ->> 'qty') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception using
        errcode = '22023',
        message = 'Every requested part quantity must be numeric.';
    end if;
    v_qty := greatest(1, coalesce(nullif(v_item ->> 'qty', '')::numeric, 1));
    if v_qty > 10000 then
      raise exception using
        errcode = '22023',
        message = 'Every requested part quantity must be from 1 to 10,000.';
    end if;

    if v_description <> '' then
      insert into public.part_request_items(
        request_id,
        shop_id,
        work_order_id,
        work_order_line_id,
        description,
        qty,
        qty_requested,
        qty_approved,
        requested_part_number,
        requested_manufacturer,
        status,
        approved
      ) values (
        v_request_id,
        v_shop_id,
        p_work_order_id,
        v_job_id,
        v_description,
        v_qty,
        v_qty,
        case when v_preapproved then v_qty else 0 end,
        v_part_number,
        v_manufacturer,
        case
          when v_preapproved then 'approved'::public.part_request_item_status
          else 'requested'::public.part_request_item_status
        end,
        v_preapproved
      );
    end if;
  end loop;

  if not exists (
    select 1 from public.part_request_items pri where pri.request_id = v_request_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'No valid parts request items were supplied.';
  end if;

  perform public.parts_reconcile_request_lifecycle(v_request_id);
  return v_request_id;
end;
$$;

revoke all on function public.create_part_request_with_items(uuid, jsonb, text, text)
  from public, anon;
grant execute on function public.create_part_request_with_items(uuid, jsonb, text, text)
  to authenticated, service_role;

create or replace function public.shop_assistant_create_vehicle_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_year integer default null,
  p_make text default null,
  p_model text default null,
  p_vin text default null,
  p_license_plate text default null,
  p_unit_number text default null,
  p_mileage text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_vehicle public.vehicles%rowtype;
  v_vin text := nullif(upper(trim(coalesce(p_vin, ''))), '');
  v_plate text := nullif(upper(trim(coalesce(p_license_plate, ''))), '');
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'create_vehicle'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  ) then
    raise exception using errcode = '42501', message = 'Your role cannot create vehicles.';
  end if;

  if not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.shop_id = p_shop_id and c.active is not false
  ) then
    raise exception using
      errcode = '23503',
      message = 'Customer does not belong to this shop.';
  end if;
  if p_year is not null and (p_year < 1886 or p_year > 2100) then
    raise exception using errcode = '22023', message = 'Vehicle year is outside the allowed range.';
  end if;
  if v_vin is null
     and v_plate is null
     and nullif(trim(coalesce(p_unit_number, '')), '') is null
     and nullif(trim(coalesce(p_make, '')), '') is null
     and nullif(trim(coalesce(p_model, '')), '') is null then
    raise exception using errcode = '22023', message = 'At least one vehicle identifier is required.';
  end if;
  if v_vin is not null and (length(v_vin) < 6 or length(v_vin) > 17) then
    raise exception using errcode = '22023', message = 'VIN must contain 6 to 17 characters.';
  end if;
  if v_vin is not null and exists (
    select 1 from public.vehicles v
    where v.shop_id = p_shop_id and upper(trim(coalesce(v.vin, ''))) = v_vin
  ) then
    raise exception using errcode = '23505', message = 'A vehicle with this VIN already exists in the shop.';
  end if;

  insert into public.vehicles(
    shop_id,
    customer_id,
    user_id,
    year,
    make,
    model,
    vin,
    license_plate,
    unit_number,
    mileage,
    notes
  ) values (
    p_shop_id,
    p_customer_id,
    p_actor_user_id,
    p_year,
    nullif(trim(coalesce(p_make, '')), ''),
    nullif(trim(coalesce(p_model, '')), ''),
    v_vin,
    v_plate,
    nullif(trim(coalesce(p_unit_number, '')), ''),
    nullif(trim(coalesce(p_mileage, '')), ''),
    nullif(trim(coalesce(p_notes, '')), '')
  ) returning * into v_vehicle;

  v_result := jsonb_build_object(
    'ok', true,
    'vehicle', jsonb_build_object(
      'id', v_vehicle.id,
      'customerId', v_vehicle.customer_id,
      'year', v_vehicle.year,
      'make', v_vehicle.make,
      'model', v_vehicle.model,
      'vin', v_vehicle.vin,
      'licensePlate', v_vehicle.license_plate,
      'unitNumber', v_vehicle.unit_number
    ),
    'summary', coalesce(
        nullif(trim(concat_ws(' ', v_vehicle.year, v_vehicle.make, v_vehicle.model)), ''),
        nullif(trim(v_vehicle.unit_number), ''),
        nullif(trim(v_vehicle.license_plate), ''),
        nullif(trim(v_vehicle.vin), ''),
        'Vehicle ' || left(v_vehicle.id::text, 8)
      ) || ' was added to the customer.',
    'href', '/customers/' || p_customer_id::text
  );

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_vehicle_created',
    p_actor_user_id,
    'vehicles',
    v_vehicle.id,
    jsonb_build_object('shop_id', p_shop_id, 'action_id', p_action_id)
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_create_work_order_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_notes text default null,
  p_priority integer default 3,
  p_is_waiter boolean default false,
  p_advisor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_customer public.customers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_work_order public.work_orders%rowtype;
  v_custom_id text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'create_work_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  ) then
    raise exception using errcode = '42501', message = 'Your role cannot create work orders.';
  end if;
  if coalesce(p_priority, 3) < 1 or coalesce(p_priority, 3) > 5 then
    raise exception using errcode = '22023', message = 'Work-order priority must be between 1 and 5.';
  end if;

  select * into v_customer
  from public.customers c
  where c.id = p_customer_id and c.shop_id = p_shop_id and c.active is not false
  for share;
  if not found then
    raise exception using errcode = '23503', message = 'Customer does not belong to this shop.';
  end if;

  select * into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id
    and v.shop_id = p_shop_id
    and v.customer_id = p_customer_id
  for share;
  if not found then
    raise exception using
      errcode = '23503',
      message = 'Vehicle does not belong to this customer and shop.';
  end if;

  if p_advisor_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_advisor_id and p.shop_id = p_shop_id
  ) then
    raise exception using errcode = '23503', message = 'Advisor does not belong to this shop.';
  end if;

  loop
    v_custom_id := 'WO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.work_orders(
      shop_id,
      customer_id,
      vehicle_id,
      notes,
      priority,
      is_waiter,
      created_by,
      advisor_id,
      custom_id,
      status,
      customer_name,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_vin,
      vehicle_license_plate,
      vehicle_unit_number,
      vehicle_color,
      vehicle_engine,
      vehicle_engine_hours
    ) values (
      p_shop_id,
      p_customer_id,
      p_vehicle_id,
      coalesce(p_notes, ''),
      coalesce(p_priority, 3),
      coalesce(p_is_waiter, false),
      p_actor_user_id,
      p_advisor_id,
      v_custom_id,
      'awaiting',
      coalesce(
        nullif(trim(v_customer.business_name), ''),
        nullif(trim(v_customer.name), ''),
        nullif(trim(concat_ws(' ', v_customer.first_name, v_customer.last_name)), '')
      ),
      v_vehicle.year,
      v_vehicle.make,
      v_vehicle.model,
      v_vehicle.vin,
      v_vehicle.license_plate,
      v_vehicle.unit_number,
      v_vehicle.color,
      coalesce(v_vehicle.engine, v_vehicle.engine_family),
      v_vehicle.engine_hours
    )
    on conflict do nothing
    returning * into v_work_order;
    exit when v_work_order.id is not null;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', v_work_order.id,
    'customId', v_work_order.custom_id,
    'status', v_work_order.status,
    'customerId', v_work_order.customer_id,
    'vehicleId', v_work_order.vehicle_id,
    'summary', 'WO #' || v_work_order.custom_id || ' was created.',
    'href', '/work-orders/' || v_work_order.id::text
  );

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_work_order_created',
    p_actor_user_id,
    'work_orders',
    v_work_order.id,
    jsonb_build_object('shop_id', p_shop_id, 'action_id', p_action_id)
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_add_work_order_line_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_work_order_id uuid,
  p_description text,
  p_job_type text default 'repair',
  p_urgency text default 'medium',
  p_labor_time numeric default null,
  p_price_estimate numeric default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_work_order public.work_orders%rowtype;
  v_line public.work_order_lines%rowtype;
  v_expected text;
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_job_type text := lower(trim(coalesce(p_job_type, 'repair')));
  v_urgency text := lower(trim(coalesce(p_urgency, 'medium')));
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'add_work_order_line'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  ) then
    raise exception using errcode = '42501', message = 'Your role cannot add work-order jobs.';
  end if;
  if v_description is null then
    raise exception using errcode = '22023', message = 'A job description is required.';
  end if;
  if v_job_type not in ('diagnosis', 'inspection', 'maintenance', 'repair', 'tech-suggested') then
    raise exception using errcode = '22023', message = 'Unsupported work-order job type.';
  end if;
  if v_urgency not in ('low', 'medium', 'high') then
    raise exception using errcode = '22023', message = 'Unsupported work-order urgency.';
  end if;
  if p_labor_time is not null and (p_labor_time < 0 or p_labor_time > 1000) then
    raise exception using errcode = '22023', message = 'Labor time is outside the allowed range.';
  end if;
  if p_price_estimate is not null and p_price_estimate < 0 then
    raise exception using errcode = '22023', message = 'Price estimate cannot be negative.';
  end if;

  select * into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: jobs cannot be added after invoice finalization.';
  end if;

  if lower(coalesce(v_work_order.status::text, '')) in ('completed', 'invoiced', 'cancelled', 'canceled') then
    raise exception using errcode = 'P0001', message = 'This work order is no longer editable.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = '40001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  insert into public.work_order_lines(
    work_order_id,
    shop_id,
    vehicle_id,
    user_id,
    line_type,
    complaint,
    description,
    job_type,
    urgency,
    labor_time,
    price_estimate,
    notes,
    status,
    approval_state,
    priority
  ) values (
    p_work_order_id,
    p_shop_id,
    v_work_order.vehicle_id,
    p_actor_user_id,
    'job',
    v_description,
    v_description,
    v_job_type,
    v_urgency,
    p_labor_time,
    p_price_estimate,
    nullif(trim(coalesce(p_notes, '')), ''),
    'awaiting_approval',
    'pending',
    coalesce(v_work_order.priority, 3)
  ) returning * into v_line;

  update public.work_orders
  set updated_at = now()
  where id = p_work_order_id and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', p_work_order_id,
    'workOrderLineId', v_line.id,
    'description', v_description,
    'status', v_line.status,
    'summary', v_description || ' was added to '
      || case
        when nullif(trim(v_work_order.custom_id), '') is not null
          then 'WO #' || trim(v_work_order.custom_id)
        else 'the work order'
      end || '.',
    'href', '/work-orders/' || p_work_order_id::text
  );

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_work_order_line_created',
    p_actor_user_id,
    'work_order_lines',
    v_line.id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'work_order_id', p_work_order_id
    )
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_create_booking_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null,
  p_mode text default 'shop',
  p_resource_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_scheduler jsonb;
  v_booking jsonb;
  v_booking_id uuid;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'create_booking'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using errcode = '42501', message = 'Your role cannot create appointments.';
  end if;
  if p_ends_at is null or p_starts_at is null or p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'A valid appointment start and end are required.';
  end if;

  v_scheduler := public.scheduler_apply_booking_command_atomic(
    'create',
    null,
    p_shop_id,
    p_customer_id,
    p_vehicle_id,
    p_starts_at,
    p_ends_at,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_actor_user_id,
    'staff',
    p_shop_id::text || ':shop-assistant:create-booking:' || p_action_id::text,
    null,
    now(),
    p_mode,
    p_resource_id
  );
  v_booking := coalesce(v_scheduler -> 'booking', '{}'::jsonb);
  v_booking_id := nullif(v_booking ->> 'id', '')::uuid;

  v_result := jsonb_build_object(
    'ok', true,
    'booking', jsonb_build_object(
      'id', v_booking_id,
      'startsAt', v_booking ->> 'starts_at',
      'endsAt', v_booking ->> 'ends_at',
      'status', v_booking ->> 'status',
      'customerId', nullif(v_booking ->> 'customer_id', '')::uuid,
      'vehicleId', nullif(v_booking ->> 'vehicle_id', '')::uuid,
      'workOrderId', nullif(v_booking ->> 'work_order_id', '')::uuid
    ),
    'summary', 'Appointment ' || left(v_booking_id::text, 8)
      || ' was created for ' || (v_booking ->> 'starts_at') || '.',
    'href', '/dashboard/appointments',
    'scheduler', v_scheduler -> 'scheduler'
  );

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  return v_result;
end;
$$;

create or replace function public.shop_assistant_cancel_booking_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_booking_id uuid,
  p_actor_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_booking public.bookings%rowtype;
  v_expected text;
  v_scheduler jsonb;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'cancel_booking'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using errcode = '42501', message = 'Your role cannot cancel appointments.';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Appointment not found for this shop.';
  end if;
  v_expected := v_action.target_versions ->> ('booking:' || p_booking_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_booking.updated_at
  ) then
    raise exception using
      errcode = '40001',
      message = 'The appointment changed after the confirmation preview.';
  end if;

  v_scheduler := public.scheduler_apply_booking_command_atomic(
    'cancel',
    p_booking_id,
    null,
    null,
    null,
    null,
    null,
    null,
    p_actor_user_id,
    'staff',
    p_shop_id::text || ':shop-assistant:cancel-booking:' || p_action_id::text,
    nullif(trim(coalesce(p_reason, '')), ''),
    now(),
    coalesce(nullif(v_booking.lifecycle_metadata ->> 'service_mode', ''), 'shop'),
    null
  );

  v_result := jsonb_build_object(
    'ok', true,
    'booking', jsonb_build_object(
      'id', p_booking_id,
      'startsAt', v_scheduler #>> '{booking,starts_at}',
      'endsAt', v_scheduler #>> '{booking,ends_at}',
      'status', v_scheduler #>> '{booking,status}',
      'customerId', nullif(v_scheduler #>> '{booking,customer_id}', '')::uuid,
      'vehicleId', nullif(v_scheduler #>> '{booking,vehicle_id}', '')::uuid,
      'workOrderId', nullif(v_scheduler #>> '{booking,work_order_id}', '')::uuid
    ),
    'summary', 'Appointment ' || left(p_booking_id::text, 8) || ' was cancelled.',
    'href', '/dashboard/appointments'
  );

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  return v_result;
end;
$$;

create or replace function public.shop_assistant_create_part_request_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_work_order_id uuid,
  p_work_order_line_id uuid,
  p_items jsonb,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_actor_profile_id uuid;
  v_work_order public.work_orders%rowtype;
  v_expected text;
  v_request_id uuid;
  v_item_count integer;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'create_part_request'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  v_actor_profile_id := public.shop_assistant_profile_id(
    p_shop_id,
    p_actor_user_id
  );
  if v_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
    'mechanic', 'lead_hand', 'foreman'
  ) then
    raise exception using errcode = '42501', message = 'Your role cannot create parts requests.';
  end if;

  select * into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: parts cannot be requested after invoice finalization.';
  end if;

  if v_role = 'mechanic' and (
    p_work_order_line_id is null
    or not exists (
      select 1
      from public.work_order_lines wol
      where wol.id = p_work_order_line_id
        and wol.shop_id = p_shop_id
        and wol.work_order_id = p_work_order_id
        and (
          wol.assigned_tech_id in (v_actor_profile_id, p_actor_user_id)
          or wol.assigned_to in (v_actor_profile_id, p_actor_user_id)
          or exists (
            select 1
            from public.work_order_line_technicians assignment
            where assignment.work_order_line_id = wol.id
              and assignment.technician_id in (
                v_actor_profile_id,
                p_actor_user_id
              )
          )
        )
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Technicians can request parts only for an assigned work-order line.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = '40001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  -- The canonical creator and its lifecycle triggers read auth.uid() for
  -- requested_by and event attribution. This wrapper has already verified
  -- the action actor, so project that identity into the transaction-local JWT
  -- subject while retaining the service_role claim used by the trusted RPC.
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  v_request_id := public.create_part_request_with_items(
    p_work_order_id,
    p_items,
    p_work_order_line_id::text,
    p_notes
  );
  select count(*)::integer into v_item_count
  from public.part_request_items pri
  where pri.request_id = v_request_id and pri.shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'requestId', v_request_id,
    'workOrderId', p_work_order_id,
    'workOrderLineId', p_work_order_line_id,
    'itemCount', v_item_count,
    'summary', v_item_count::text || ' part item(s) were requested for '
      || case
        when nullif(trim(v_work_order.custom_id), '') is not null
          then 'WO #' || trim(v_work_order.custom_id)
        else 'the work order'
      end || '.',
    'href', '/parts/requests/' || v_request_id::text
  );

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_part_request_created',
    p_actor_user_id,
    'part_requests',
    v_request_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'work_order_id', p_work_order_id,
      'work_order_line_id', p_work_order_line_id
    )
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_receive_part_request_item_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_purchase_order_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_item public.part_request_items%rowtype;
  v_line public.purchase_order_lines%rowtype;
  v_po public.purchase_orders%rowtype;
  v_line_count integer := 0;
  v_po_closed boolean := false;
  v_expected text;
  v_receive jsonb;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'receive_part_request_item'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot receive parts.';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100000 then
    raise exception using errcode = '22023', message = 'Receipt quantity must be greater than zero.';
  end if;

  select * into v_item
  from public.part_request_items pri
  where pri.id = p_item_id and pri.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Part request item not found for this shop.';
  end if;
  if v_item.part_id is null then
    raise exception using
      errcode = '55000',
      message = 'This request item must be linked to an inventory part before it can be received into stock.';
  end if;

  -- A purchase-order selection must resolve to exactly one linked line. Never
  -- guess across duplicate same-part lines because that can mutate a different
  -- line than the one the user reviewed.
  if p_purchase_order_id is not null then
    select * into v_po
    from public.purchase_orders po
    where po.id = p_purchase_order_id and po.shop_id = p_shop_id
    for update;
    if not found then
      raise exception using
        errcode = '23503',
        message = 'Purchase order does not belong to this shop.';
    end if;
    if lower(coalesce(v_po.status, '')) <> 'open' then
      raise exception using
        errcode = '55000',
        message = 'Only an open purchase order can receive parts.';
    end if;

    select count(*)::integer into v_line_count
    from public.purchase_order_lines line
    where line.po_id = p_purchase_order_id
      and line.part_request_item_id = p_item_id
      and line.part_id = v_item.part_id
      and coalesce(line.received_qty, 0) < greatest(
        coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0),
        0
      );
    if v_line_count = 0 then
      raise exception using
        errcode = 'P0002',
        message = 'No outstanding purchase-order line is linked to this request item.';
    end if;
    if v_line_count > 1 then
      raise exception using
        errcode = '55000',
        message = 'More than one PO line matches this request item. Choose the exact purchase-order line instead.';
    end if;

    select * into v_line
    from public.purchase_order_lines line
    where line.po_id = p_purchase_order_id
      and line.part_request_item_id = p_item_id
      and line.part_id = v_item.part_id
      and coalesce(line.received_qty, 0) < greatest(
        coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0),
        0
      )
    for update;
  end if;

  select * into v_item
  from public.part_request_items pri
  where pri.id = p_item_id and pri.shop_id = p_shop_id
  for update;
  v_expected := v_action.target_versions ->> ('part_request_item:' || p_item_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_item.updated_at
  ) then
    raise exception using
      errcode = '40001',
      message = 'The part request item changed after the confirmation preview.';
  end if;
  if not exists (
    select 1 from public.stock_locations sl
    where sl.id = p_location_id and sl.shop_id = p_shop_id
  ) then
    raise exception using errcode = '23503', message = 'Stock location does not belong to this shop.';
  end if;
  if p_purchase_order_id is not null
     and coalesce(v_line.received_qty, 0) + p_quantity > greatest(
       coalesce(v_line.qty, 0) - coalesce(v_line.cancelled_qty, 0),
       0
     ) then
    raise exception using
      errcode = '23514',
      message = 'Receipt quantity exceeds the selected purchase-order line.';
  end if;

  v_receive := public.receive_part_request_item(
    p_item_id,
    p_location_id,
    p_quantity,
    v_line.id,
    v_line.unit_cost,
    p_shop_id::text || ':shop-assistant:receive:' || p_action_id::text
  );

  if p_purchase_order_id is not null then
    perform 1
    from public.purchase_order_lines line
    where line.po_id = p_purchase_order_id
    order by line.created_at, line.id
    for update;

    if not exists (
      select 1
      from public.purchase_order_lines line
      where line.po_id = p_purchase_order_id
        and coalesce(line.received_qty, 0) < greatest(
          coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0),
          0
        )
    ) then
      update public.purchase_orders
      set status = 'received',
          received_at = coalesce(received_at, current_date)
      where id = p_purchase_order_id and shop_id = p_shop_id;
      v_po_closed := true;
    end if;
  end if;

  -- The canonical lifecycle function records auth.uid(). Assistant commands
  -- execute with the service role, so preserve the confirmed human actor on
  -- the durable stock ledger after the idempotent receipt succeeds.
  update public.stock_moves
  set created_by = coalesce(created_by, p_actor_user_id),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'shop_assistant',
        'action_id', p_action_id,
        'actor_user_id', p_actor_user_id
      )
  where shop_id = p_shop_id
    and idempotency_key = p_shop_id::text
      || ':shop-assistant:receive:' || p_action_id::text;

  v_result := coalesce(v_receive, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'requestItemId', p_item_id,
    'quantity', p_quantity,
    'summary', p_quantity::text || ' unit(s) of '
      || coalesce(nullif(trim(v_item.description), ''), 'the requested part')
      || ' were received.',
    'href', case
      when v_item.request_id is not null
        then '/parts/requests/' || v_item.request_id::text
      else '/parts/requests'
    end
  );

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_part_received',
    p_actor_user_id,
    'part_request_items',
    p_item_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'location_id', p_location_id,
      'quantity', p_quantity,
      'purchase_order_id', p_purchase_order_id,
      'purchase_order_line_id', v_line.id,
      'purchase_order_closed', v_po_closed
    )
  );
  return v_result;
end;
$$;

-- Receive one exact PO line. This intentionally does not delegate catalog
-- receipts to receive_po_part_and_allocate because that routine aggregates by
-- PO + part and advances duplicate matching lines FIFO. A confirmed assistant
-- action must mutate only the line shown in its preview.
create or replace function public.shop_assistant_receive_purchase_order_line_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_purchase_order_id uuid,
  p_purchase_order_line_id uuid,
  p_quantity numeric,
  p_location_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_po public.purchase_orders%rowtype;
  v_line public.purchase_order_lines%rowtype;
  v_item public.part_request_items%rowtype;
  v_wop public.work_order_parts%rowtype;
  v_work_order_part_id uuid;
  v_location_id uuid;
  v_expected text;
  v_current_version text;
  v_line_received numeric;
  v_item_target numeric := 0;
  v_item_received numeric := 0;
  v_allocated numeric := 0;
  v_move public.stock_moves%rowtype;
  v_operation_key text;
  v_receive jsonb;
  v_status text;
  v_po_closed boolean := false;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id,
    p_shop_id,
    p_actor_user_id,
    'receive_purchase_order_line'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot receive purchase orders.';
  end if;
  if p_quantity is null
     or p_quantity <= 0
     or p_quantity > 1000000
     or p_quantity::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = '22023',
      message = 'Receipt quantity must be a finite number greater than zero.';
  end if;

  select * into v_po
  from public.purchase_orders po
  where po.id = p_purchase_order_id and po.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase order not found in this shop.';
  end if;
  if lower(coalesce(v_po.status, '')) <> 'open' then
    raise exception using
      errcode = '55000',
      message = 'Only an open purchase order can receive parts.';
  end if;

  select * into v_line
  from public.purchase_order_lines line
  where line.id = p_purchase_order_line_id
    and line.po_id = p_purchase_order_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase-order line not found on this purchase order.';
  end if;
  v_location_id := coalesce(p_location_id, v_line.location_id);

  v_expected := v_action.target_versions
    ->> ('purchase_order_line:' || p_purchase_order_line_id::text);
  v_current_version := trim_scale(coalesce(v_line.qty, 0))::text
    || ':' || trim_scale(coalesce(v_line.received_qty, 0))::text
    || ':' || trim_scale(coalesce(v_line.cancelled_qty, 0))::text
    || ':' || coalesce(v_po.status, '');
  if v_expected is null or v_expected is distinct from v_current_version then
    raise exception using
      errcode = '40001',
      message = 'The PO line changed after the confirmation preview.';
  end if;

  v_line_received := coalesce(v_line.received_qty, 0) + p_quantity;
  if v_line_received > greatest(
    coalesce(v_line.qty, 0) - coalesce(v_line.cancelled_qty, 0),
    0
  ) then
    raise exception using
      errcode = '23514',
      message = 'Receipt quantity exceeds the selected purchase-order line.';
  end if;

  v_operation_key := p_shop_id::text
    || ':shop-assistant:po-line-receive:' || p_action_id::text;

  if v_line.part_id is null then
    v_receive := public.parts_receive_free_text_po_line(
      p_purchase_order_id,
      p_purchase_order_line_id,
      p_quantity,
      v_operation_key
    );
    update public.parts_lifecycle_operations
    set created_by = coalesce(created_by, p_actor_user_id)
    where shop_id = p_shop_id and idempotency_key = v_operation_key;

    v_status := coalesce(v_receive ->> 'po_status', v_po.status);
    v_po_closed := coalesce((v_receive ->> 'po_closed')::boolean, false);
    if v_po_closed then
      update public.purchase_orders
      set received_at = coalesce(received_at, current_date)
      where id = p_purchase_order_id and shop_id = p_shop_id;
    end if;
  else
    if v_location_id is null then
      raise exception using
        errcode = '22023',
        message = 'A stock location is required for a catalog-part receipt.';
    end if;
    if not exists (
      select 1 from public.parts part
      where part.id = v_line.part_id and part.shop_id = p_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'The catalog part is outside this shop.';
    end if;
    if not exists (
      select 1 from public.stock_locations location
      where location.id = v_location_id and location.shop_id = p_shop_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'The receiving location is outside this shop.';
    end if;

    v_work_order_part_id := v_line.work_order_part_id;
    if v_line.part_request_item_id is not null then
      select * into v_item
      from public.part_request_items item
      where item.id = v_line.part_request_item_id and item.shop_id = p_shop_id
      for update;
      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'The linked part request item was not found.';
      end if;
      if v_item.part_id is not null and v_item.part_id is distinct from v_line.part_id then
        raise exception using
          errcode = '23514',
          message = 'The PO line part does not match its linked request item.';
      end if;
      if v_item.work_order_id is not null then
        perform public.parts_assert_work_order_mutable(
          p_shop_id,
          v_item.work_order_id
        );
      end if;
      if v_item.part_id is null then
        update public.part_request_items
        set part_id = v_line.part_id,
            location_id = coalesce(location_id, v_location_id),
            updated_at = now()
        where id = v_item.id;
        v_item.part_id := v_line.part_id;
      end if;

      if v_work_order_part_id is null then
        v_work_order_part_id := public.parts_ensure_work_order_part(v_item.id);
      else
        select * into v_wop
        from public.work_order_parts wop
        where wop.id = v_work_order_part_id
          and wop.shop_id = p_shop_id
          and wop.part_id = v_line.part_id
          and wop.is_active
        for update;
        if not found then
          raise exception using
            errcode = '23514',
            message = 'The PO line work-order part linkage is invalid.';
        end if;
      end if;

      v_item_target := greatest(
        coalesce(v_item.qty_approved, 0),
        coalesce(v_item.qty_requested, 0),
        coalesce(v_item.qty, 0),
        0
      );
      v_allocated := least(
        p_quantity,
        greatest(v_item_target - coalesce(v_item.qty_received, 0), 0)
      );
      v_item_received := coalesce(v_item.qty_received, 0) + v_allocated;
      if v_allocated > 0 then
        update public.part_request_items
        set qty_received = v_item_received,
            location_id = coalesce(location_id, v_location_id),
            unit_cost = coalesce(v_line.unit_cost, unit_cost),
            status = case
              when v_item_received >= v_item_target
                then 'received'::public.part_request_item_status
              else 'partially_received'::public.part_request_item_status
            end,
            updated_at = now()
        where id = v_item.id;

        update public.work_order_parts
        set quantity_received = coalesce(quantity_received, 0) + v_allocated,
            unit_cost_snapshot = coalesce(v_line.unit_cost, unit_cost_snapshot),
            updated_at = now()
        where id = v_work_order_part_id;
        perform public.parts_reconcile_work_order_part(v_work_order_part_id);
      end if;
    end if;

    insert into public.stock_moves (
      shop_id,
      part_id,
      location_id,
      qty_change,
      reason,
      reference_kind,
      reference_id,
      created_by,
      idempotency_key,
      metadata,
      lifecycle_quantity,
      work_order_part_id,
      part_request_item_id,
      purchase_order_line_id
    ) values (
      p_shop_id,
      v_line.part_id,
      v_location_id,
      p_quantity,
      'receive',
      'purchase_order_line',
      p_purchase_order_line_id,
      p_actor_user_id,
      v_operation_key,
      jsonb_build_object(
        'source', 'shop_assistant',
        'operation', 'purchase_order_line_receipt',
        'action_id', p_action_id,
        'actor_user_id', p_actor_user_id,
        'purchase_order_id', p_purchase_order_id,
        'purchase_order_line_id', p_purchase_order_line_id,
        'part_request_item_id', v_line.part_request_item_id
      ),
      p_quantity,
      v_work_order_part_id,
      v_line.part_request_item_id,
      p_purchase_order_line_id
    ) returning * into v_move;

    update public.purchase_order_lines
    set received_qty = v_line_received,
        location_id = coalesce(location_id, v_location_id),
        work_order_part_id = coalesce(work_order_part_id, v_work_order_part_id)
    where id = p_purchase_order_line_id;

    perform 1
    from public.purchase_order_lines line
    where line.po_id = p_purchase_order_id
    order by line.created_at, line.id
    for update;
    if not exists (
      select 1
      from public.purchase_order_lines line
      where line.po_id = p_purchase_order_id
        and coalesce(line.received_qty, 0) < greatest(
          coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0),
          0
        )
    ) then
      update public.purchase_orders
      set status = 'received',
          received_at = coalesce(received_at, current_date)
      where id = p_purchase_order_id and shop_id = p_shop_id;
      v_po_closed := true;
    end if;
    select po.status into v_status
    from public.purchase_orders po
    where po.id = p_purchase_order_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'purchaseOrderId', p_purchase_order_id,
    'purchaseOrderLineId', p_purchase_order_line_id,
    'quantity', p_quantity,
    'status', v_status,
    'closed', v_po_closed,
    'stockMoveId', v_move.id,
    'allocatedQuantity', v_allocated,
    'summary', p_quantity::text || ' unit(s) were received against the selected purchase-order line.',
    'href', '/parts/po/' || p_purchase_order_id::text
  );

  if v_move.id is not null then
    update public.stock_moves
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('receipt_result', v_result)
    where id = v_move.id and shop_id = p_shop_id;
  end if;

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_purchase_order_line_received',
    p_actor_user_id,
    'purchase_order_lines',
    p_purchase_order_line_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'purchase_order_id', p_purchase_order_id,
      'location_id', v_location_id,
      'quantity', p_quantity,
      'allocated_quantity', v_allocated,
      'purchase_order_closed', v_po_closed
    )
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_record_approval_decision_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_work_order_id uuid,
  p_item_ids uuid[],
  p_all_pending boolean,
  p_decision text,
  p_contact_method text,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_work_order public.work_orders%rowtype;
  v_expected text;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_contact text := lower(trim(coalesce(p_contact_method, '')));
  v_selected uuid[] := array(
    select distinct value
    from unnest(coalesce(p_item_ids, array[]::uuid[])) value
    where value is not null
    order by value
  );
  v_quote_ids uuid[] := array[]::uuid[];
  v_line_ids uuid[] := array[]::uuid[];
  v_current_quote_ids uuid[] := array[]::uuid[];
  v_current_line_ids uuid[] := array[]::uuid[];
  v_expected_count_text text;
  v_expected_count integer;
  v_quote_result jsonb := '{}'::jsonb;
  v_rollup text;
  v_count integer;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'record_approval_decision'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'advisor', 'service', 'foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot record approval decisions.';
  end if;
  if v_decision not in ('approve', 'decline', 'defer') then
    raise exception using errcode = '22023', message = 'Unsupported approval decision.';
  end if;
  if v_contact not in ('phone', 'in_person', 'email', 'other') then
    raise exception using errcode = '22023', message = 'Unsupported approval contact method.';
  end if;
  if not coalesce(p_all_pending, false) and cardinality(v_selected) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Select approval items or choose all pending items.';
  end if;

  select * into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: approval decisions cannot change this work order.';
  end if;
  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = '40001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  perform 1
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id and q.work_order_id = p_work_order_id
  order by q.id
  for update;
  perform 1
  from public.work_order_lines wol
  where wol.shop_id = p_shop_id and wol.work_order_id = p_work_order_id
  order by wol.id
  for update;

  -- Derive the mutation set only from the rows persisted in the confirmation
  -- preview. Keys are validated before casting so malformed action metadata
  -- fails closed instead of surfacing a UUID parser error.
  select coalesce(array_agg(
           substring(key from char_length('approval_quote_line:') + 1)::uuid
           order by substring(key from char_length('approval_quote_line:') + 1)::uuid
         ), array[]::uuid[])
    into v_quote_ids
  from jsonb_object_keys(coalesce(v_action.target_versions, '{}'::jsonb)) keys(key)
  where key ~* '^approval_quote_line:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  select coalesce(array_agg(
           substring(key from char_length('approval_work_order_line:') + 1)::uuid
           order by substring(key from char_length('approval_work_order_line:') + 1)::uuid
         ), array[]::uuid[])
    into v_line_ids
  from jsonb_object_keys(coalesce(v_action.target_versions, '{}'::jsonb)) keys(key)
  where key ~* '^approval_work_order_line:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  v_expected_count_text := v_action.target_versions
    ->> ('approval_item_count:' || p_work_order_id::text);
  if v_expected_count_text is null
     or v_expected_count_text !~ '^[0-9]+$'
     or length(v_expected_count_text) > 6 then
    raise exception using
      errcode = '40001',
      message = 'The approval confirmation is missing its exact reviewed item count.';
  end if;
  v_expected_count := v_expected_count_text::integer;
  if v_expected_count <> cardinality(v_quote_ids) + cardinality(v_line_ids)
     or v_expected_count > 500 then
    raise exception using
      errcode = '40001',
      message = 'The approval confirmation item set is incomplete or too large.';
  end if;

  if not coalesce(p_all_pending, false) and v_selected <> array(
    select id
    from unnest(v_quote_ids || v_line_ids) selected(id)
    order by id
  ) then
    raise exception using
      errcode = '40001',
      message = 'The selected approval items do not match the confirmed item set.';
  end if;

  -- Rebuild the complete pending set after locking both source tables. For an
  -- all-pending confirmation it must be byte-for-byte the same set the user
  -- reviewed; selected decisions only require their exact rows to remain
  -- pending, so unrelated new work does not invalidate them.
  select coalesce(array_agg(q.id order by q.id), array[]::uuid[])
    into v_current_quote_ids
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.work_order_line_id is null
    and q.approved_at is null
    and q.declined_at is null
    and (
      lower(coalesce(q.status::text, '')) in (
        'pending_parts', 'advisor_pending', 'ready_to_send', 'quoted', 'sent'
      )
      or lower(coalesce(q.stage::text, '')) in (
        'advisor_pending', 'ready_to_send', 'sent', 'customer_review'
      )
    )
    and lower(coalesce(q.status::text, '')) not in (
      'approved', 'converted', 'declined', 'deferred', 'rejected',
      'cancelled', 'canceled', 'superseded', 'void'
    )
    and lower(coalesce(q.stage::text, '')) not in (
      'customer_approved', 'customer_declined', 'customer_deferred',
      'approved', 'declined', 'deferred', 'converted', 'materialized',
      'cancelled', 'canceled', 'superseded', 'void'
    );
  select coalesce(array_agg(wol.id order by wol.id), array[]::uuid[])
    into v_current_line_ids
  from public.work_order_lines wol
  where wol.shop_id = p_shop_id
    and wol.work_order_id = p_work_order_id
    and wol.voided_at is null
    and lower(coalesce(wol.approval_state::text, '')) = 'pending'
    and not exists (
      select 1
      from public.work_order_quote_lines q
      where q.shop_id = p_shop_id
        and q.work_order_id = p_work_order_id
        and q.work_order_line_id = wol.id
    );

  if coalesce(p_all_pending, false) then
    if v_quote_ids <> v_current_quote_ids or v_line_ids <> v_current_line_ids then
      raise exception using
        errcode = '40001',
        message = 'The pending approval set changed after the confirmation preview.';
    end if;
  elsif exists (
    select 1 from unnest(v_quote_ids) expected(id)
    where not (expected.id = any(v_current_quote_ids))
  ) or exists (
    select 1 from unnest(v_line_ids) expected(id)
    where not (expected.id = any(v_current_line_ids))
  ) then
    raise exception using
      errcode = '40001',
      message = 'One or more selected approval items changed after the confirmation preview.';
  end if;

  if exists (
    select 1
    from public.work_order_quote_lines q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and q.id = any(v_quote_ids)
      and not public.shop_assistant_timestamp_version_matches(
        v_action.target_versions ->> ('approval_quote_line:' || q.id::text),
        q.updated_at
      )
  ) or exists (
    select 1
    from public.work_order_lines wol
    where wol.shop_id = p_shop_id
      and wol.work_order_id = p_work_order_id
      and wol.id = any(v_line_ids)
      and not public.shop_assistant_timestamp_version_matches(
        v_action.target_versions ->> ('approval_work_order_line:' || wol.id::text),
        wol.updated_at
      )
  ) then
    raise exception using
      errcode = '40001',
      message = 'An approval item changed after the confirmation preview.';
  end if;

  v_count := v_expected_count;
  if v_count = 0 then
    raise exception using errcode = 'P0001', message = 'No pending approval items were found.';
  end if;

  if cardinality(v_quote_ids) > 0 then
    v_quote_result := public.apply_customer_quote_decision_engine_atomic(
      p_shop_id,
      p_work_order_id,
      v_quote_ids,
      v_decision,
      false,
      null,
      p_actor_user_id,
      p_shop_id::text || ':shop-assistant:approval:' || p_action_id::text,
      now()
    );
    update public.work_order_quote_lines
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(
          jsonb_build_object(
            'decision_origin', 'shop_assistant',
            'shop_decision', v_decision,
            'shop_decision_at', now(),
            'shop_decision_actor_user_id', p_actor_user_id,
            'shop_decision_contact_method', v_contact,
            'shop_decision_note', left(nullif(trim(coalesce(p_note, '')), ''), 1000)
          )
        ),
        updated_at = now()
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_quote_ids);
  end if;

  if cardinality(v_line_ids) > 0 and v_decision = 'approve' then
    update public.work_order_lines
    set approval_state = 'approved',
        status = 'awaiting',
        line_status = 'authorized',
        approval_at = coalesce(approval_at, now()),
        approval_by = p_actor_user_id,
        hold_reason = null,
        updated_at = now()
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_line_ids);
  elsif cardinality(v_line_ids) > 0 and v_decision = 'decline' then
    update public.work_order_lines
    set approval_state = 'declined',
        status = 'on_hold',
        line_status = 'declined',
        approval_at = now(),
        approval_by = p_actor_user_id,
        hold_reason = coalesce(nullif(trim(hold_reason), ''), 'Customer declined'),
        updated_at = now()
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_line_ids);
  elsif cardinality(v_line_ids) > 0 then
    update public.work_order_lines
    set approval_state = 'declined',
        status = 'on_hold',
        line_status = 'deferred',
        approval_at = now(),
        approval_by = p_actor_user_id,
        hold_reason = coalesce(nullif(trim(hold_reason), ''), 'Customer deferred'),
        intake_json = coalesce(intake_json, '{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
            'shop_decision', 'defer',
            'shop_decision_at', now(),
            'shop_decision_actor_user_id', p_actor_user_id,
            'shop_decision_contact_method', v_contact,
            'shop_decision_note', left(nullif(trim(coalesce(p_note, '')), ''), 1000)
          )),
        updated_at = now()
    where shop_id = p_shop_id
      and work_order_id = p_work_order_id
      and id = any(v_line_ids);
  end if;

  v_rollup := public.reconcile_work_order_approval_state_atomic(
    p_shop_id, p_work_order_id, p_actor_user_id, now()
  );
  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', p_work_order_id,
    'decision', v_decision,
    'quoteLineIds', to_jsonb(v_quote_ids),
    'workOrderLineIds', to_jsonb(v_line_ids),
    'itemCount', v_count,
    'approvalState', v_rollup,
    'quoteResult', v_quote_result,
    'summary', v_count::text || ' approval item(s) were '
      || case v_decision
        when 'approve' then 'approved'
        when 'decline' then 'declined'
        else 'deferred'
      end || '.',
    'href', '/work-orders/' || p_work_order_id::text || '/quote-review'
  );

  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_approval_decision',
    p_actor_user_id,
    'work_orders',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'decision', v_decision,
      'contact_method', v_contact,
      'item_count', v_count
    )
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_create_inventory_part_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_sku text,
  p_part_number text,
  p_manufacturer text,
  p_category text,
  p_description text,
  p_cost numeric,
  p_price numeric,
  p_initial_quantity numeric,
  p_location_id uuid,
  p_low_stock_threshold numeric,
  p_reorder_quantity numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_part public.parts%rowtype;
  v_location public.stock_locations%rowtype;
  v_quantity numeric := coalesce(p_initial_quantity, 0);
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'create_inventory_part'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot create inventory parts.';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception using errcode = '22023', message = 'Part name is required.';
  end if;
  if v_quantity < 0
     or coalesce(p_cost, 0) < 0
     or coalesce(p_price, 0) < 0
     or coalesce(p_low_stock_threshold, 0) < 0
     or coalesce(p_reorder_quantity, 0) < 0 then
    raise exception using
      errcode = '22023',
      message = 'Inventory quantities and prices cannot be negative.';
  end if;
  if v_quantity > 0 and p_location_id is null then
    raise exception using
      errcode = '22023',
      message = 'A stock location is required for an initial quantity.';
  end if;

  if p_location_id is not null then
    select * into v_location
    from public.stock_locations location
    where location.id = p_location_id and location.shop_id = p_shop_id
    for update;
    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'Inventory location not found in this shop.';
    end if;
  end if;

  if nullif(trim(coalesce(p_sku, '')), '') is not null
     and exists (
       select 1 from public.parts part
       where part.shop_id = p_shop_id and part.sku = trim(p_sku)
     ) then
    raise exception using
      errcode = '23505',
      message = 'A part with this SKU already exists in this shop.';
  end if;

  insert into public.parts(
    shop_id,
    name,
    description,
    price,
    cost,
    default_price,
    default_cost,
    part_number,
    sku,
    manufacturer,
    category,
    low_stock_threshold
  ) values (
    p_shop_id,
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    p_price,
    p_cost,
    p_price,
    p_cost,
    nullif(trim(coalesce(p_part_number, '')), ''),
    nullif(trim(coalesce(p_sku, '')), ''),
    nullif(trim(coalesce(p_manufacturer, '')), ''),
    nullif(trim(coalesce(p_category, '')), ''),
    p_low_stock_threshold
  ) returning * into v_part;

  if p_location_id is not null then
    perform public.parts_set_stock_on_hand_snapshot(
      p_shop_id,
      v_part.id,
      p_location_id,
      v_quantity,
      p_shop_id::text || ':shop-assistant:create-part:' || p_action_id::text,
      jsonb_build_object(
        'source', 'shop_assistant',
        'action_id', p_action_id,
        'actor_user_id', p_actor_user_id,
        'reason', 'Initial inventory quantity'
      )
    );
    update public.stock_moves
    set created_by = coalesce(created_by, p_actor_user_id)
    where shop_id = p_shop_id
      and idempotency_key = p_shop_id::text
        || ':shop-assistant:create-part:' || p_action_id::text;
    update public.part_stock
    set reorder_point = coalesce(p_low_stock_threshold, reorder_point),
        reorder_qty = coalesce(p_reorder_quantity, reorder_qty)
    where part_id = v_part.id and location_id = p_location_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'partId', v_part.id,
    'name', v_part.name,
    'sku', v_part.sku,
    'quantityOnHand', v_quantity,
    'summary', v_part.name || ' was added to inventory'
      || case
        when p_location_id is null then '.'
        else ' with ' || v_quantity::text || ' on hand.'
      end,
    'href', '/parts/inventory?part=' || v_part.id::text
  );
  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_inventory_part_created',
    p_actor_user_id,
    'parts',
    v_part.id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'location_id', p_location_id,
      'initial_quantity', v_quantity
    )
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_set_inventory_stock_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_quantity_on_hand numeric,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_part public.parts%rowtype;
  v_location public.stock_locations%rowtype;
  v_current numeric := 0;
  v_reserved numeric := 0;
  v_expected text;
  v_snapshot jsonb;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'set_inventory_stock'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot adjust inventory stock.';
  end if;
  if p_quantity_on_hand is null or p_quantity_on_hand < 0 then
    raise exception using
      errcode = '22023',
      message = 'Inventory quantity must be zero or greater.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception using
      errcode = '22023',
      message = 'A stock adjustment reason is required.';
  end if;

  select * into v_part
  from public.parts part
  where part.id = p_part_id and part.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inventory part not found in this shop.';
  end if;
  select * into v_location
  from public.stock_locations location
  where location.id = p_location_id and location.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inventory location not found in this shop.';
  end if;

  select coalesce(stock.qty_on_hand, 0), coalesce(stock.qty_reserved, 0)
    into v_current, v_reserved
  from public.part_stock stock
  where stock.part_id = p_part_id and stock.location_id = p_location_id
  for update;
  if not found then
    v_current := 0;
    v_reserved := 0;
  end if;
  if p_quantity_on_hand < v_reserved then
    raise exception using
      errcode = 'P0001',
      message = 'The counted quantity cannot be below already reserved stock.';
  end if;

  v_expected := v_action.target_versions ->> (
    'inventory_stock:' || p_part_id::text || ':' || p_location_id::text
  );
  if v_expected is null or v_expected::numeric is distinct from v_current then
    raise exception using
      errcode = '40001',
      message = 'Inventory stock changed after the confirmation preview.';
  end if;

  v_snapshot := public.parts_set_stock_on_hand_snapshot(
    p_shop_id,
    p_part_id,
    p_location_id,
    p_quantity_on_hand,
    p_shop_id::text || ':shop-assistant:set-stock:' || p_action_id::text,
    jsonb_build_object(
      'source', 'shop_assistant',
      'action_id', p_action_id,
      'reason', trim(p_reason),
      'actor_user_id', p_actor_user_id
    )
  );
  update public.stock_moves
  set created_by = coalesce(created_by, p_actor_user_id)
  where shop_id = p_shop_id
    and idempotency_key = p_shop_id::text
      || ':shop-assistant:set-stock:' || p_action_id::text;
  v_result := jsonb_build_object(
    'ok', true,
    'partId', p_part_id,
    'locationId', p_location_id,
    'quantityOnHand', p_quantity_on_hand,
    'quantityChange', p_quantity_on_hand - v_current,
    'summary', v_part.name || ' at ' || v_location.name || ' was adjusted from '
      || v_current::text || ' to ' || p_quantity_on_hand::text || '.',
    'stockMoveId', v_snapshot ->> 'stock_move_id',
    'href', '/parts/inventory?part=' || p_part_id::text
  );
  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_inventory_stock_adjusted',
    p_actor_user_id,
    'parts',
    p_part_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'location_id', p_location_id,
      'quantity_before', v_current,
      'quantity_after', p_quantity_on_hand,
      'reason', trim(p_reason)
    )
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_create_purchase_order_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_supplier_id uuid,
  p_work_order_id uuid,
  p_expected_at timestamptz,
  p_notes text,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_supplier public.suppliers%rowtype;
  v_purchase_order public.purchase_orders%rowtype;
  v_part public.parts%rowtype;
  v_line jsonb;
  v_part_id uuid;
  v_location_id uuid;
  v_description text;
  v_sku text;
  v_quantity numeric;
  v_unit_cost numeric;
  v_subtotal numeric := 0;
  v_line_count integer := 0;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id,
    p_shop_id,
    p_actor_user_id,
    'create_purchase_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in (
    'owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot create purchase orders.';
  end if;
  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 50 then
    raise exception using
      errcode = '22023',
      message = 'A purchase order needs between 1 and 50 lines.';
  end if;

  select * into v_supplier
  from public.suppliers supplier
  where supplier.id = p_supplier_id
    and supplier.shop_id = p_shop_id
    and coalesce(supplier.is_active, true)
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Active supplier not found in this shop.';
  end if;

  if p_work_order_id is not null then
    perform 1
    from public.work_orders work_order
    where work_order.id = p_work_order_id
      and work_order.shop_id = p_shop_id
    for update;
    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Work order not found in this shop.';
    end if;
    if public.work_order_is_financially_locked(
      p_shop_id, p_work_order_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'FINANCIALLY_LOCKED: purchase orders cannot be linked after invoice finalization.';
    end if;
  end if;

  insert into public.purchase_orders(
    shop_id,
    supplier_id,
    work_order_id,
    notes,
    expected_at,
    created_by,
    status,
    subtotal,
    tax_total,
    shipping_total,
    total
  ) values (
    p_shop_id,
    p_supplier_id,
    p_work_order_id,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_expected_at,
    p_actor_user_id,
    'draft',
    0,
    0,
    0,
    0
  ) returning * into v_purchase_order;

  for v_line in
    select value from jsonb_array_elements(p_lines)
  loop
    v_part_id := nullif(trim(coalesce(v_line ->> 'partId', '')), '')::uuid;
    v_location_id := nullif(
      trim(coalesce(v_line ->> 'locationId', '')),
      ''
    )::uuid;
    v_description := nullif(
      trim(coalesce(v_line ->> 'description', '')),
      ''
    );
    v_sku := nullif(trim(coalesce(v_line ->> 'sku', '')), '');
    v_quantity := (v_line ->> 'quantity')::numeric;
    v_unit_cost := case
      when v_line ? 'unitCost' and v_line ->> 'unitCost' is not null
        then (v_line ->> 'unitCost')::numeric
      else null
    end;

    if v_quantity is null
       or v_quantity <= 0
       or v_quantity > 1000000
       or v_quantity::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception using
        errcode = '22023',
        message = 'Every purchase-order quantity must be greater than zero.';
    end if;
    if v_unit_cost is not null
       and (
         v_unit_cost < 0
         or v_unit_cost > 100000000
         or v_unit_cost::text in ('NaN', 'Infinity', '-Infinity')
       ) then
      raise exception using
        errcode = '22023',
        message = 'Purchase-order unit costs cannot be negative.';
    end if;

    if v_part_id is not null then
      select * into v_part
      from public.parts part
      where part.id = v_part_id and part.shop_id = p_shop_id
      for update;
      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'Purchase-order part not found in this shop.';
      end if;
      v_description := coalesce(v_description, v_part.name);
      v_sku := coalesce(v_sku, v_part.sku);
      v_unit_cost := coalesce(v_unit_cost, v_part.default_cost, v_part.cost, 0);
    elsif v_description is null then
      raise exception using
        errcode = '22023',
        message = 'Each PO line needs a catalog part or description.';
    else
      v_unit_cost := coalesce(v_unit_cost, 0);
    end if;

    if v_location_id is not null
       and not exists (
         select 1
         from public.stock_locations location
         where location.id = v_location_id
           and location.shop_id = p_shop_id
       ) then
      raise exception using
        errcode = 'P0002',
        message = 'Purchase-order receiving location not found in this shop.';
    end if;

    v_line_count := v_line_count + 1;
    insert into public.purchase_order_lines(
      po_id,
      part_id,
      sku,
      description,
      qty,
      unit_cost,
      location_id,
      idempotency_key
    ) values (
      v_purchase_order.id,
      v_part_id,
      v_sku,
      v_description,
      v_quantity,
      v_unit_cost,
      v_location_id,
      p_shop_id::text || ':shop-assistant:' || p_action_id::text
        || ':line:' || v_line_count::text
    );
    v_subtotal := v_subtotal + (v_quantity * v_unit_cost);
  end loop;

  update public.purchase_orders
  set subtotal = round(v_subtotal, 2),
      tax_total = 0,
      shipping_total = 0,
      total = round(v_subtotal, 2)
  where id = v_purchase_order.id
  returning * into v_purchase_order;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'purchaseOrderId', v_purchase_order.id,
    'poNumber', v_purchase_order.po_number,
    'status', v_purchase_order.status,
    'lineCount', v_line_count,
    'subtotal', coalesce(v_purchase_order.subtotal, 0),
    'summary', v_purchase_order.po_number || ' was created as a draft purchase order.',
    'href', '/parts/po/' || v_purchase_order.id::text
  );
  perform public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_purchase_order_created',
    p_actor_user_id,
    'purchase_orders',
    v_purchase_order.id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'supplier_id', p_supplier_id,
      'work_order_id', p_work_order_id,
      'line_count', v_line_count,
      'subtotal', round(v_subtotal, 2)
    )
  );
  return v_result;
end;
$$;

create or replace function public.shop_assistant_place_purchase_order_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_purchase_order_id uuid,
  p_contact_channel text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_purchase_order public.purchase_orders%rowtype;
  v_supplier public.suppliers%rowtype;
  v_contact text := nullif(lower(trim(coalesce(p_contact_channel, ''))), '');
  v_expected_line_ids uuid[] := array[]::uuid[];
  v_current_line_ids uuid[] := array[]::uuid[];
  v_expected_count_text text;
  v_expected_count integer;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'place_purchase_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in (
    'owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot place purchase orders.';
  end if;
  if v_contact is not null and v_contact not in ('email', 'phone') then
    raise exception using
      errcode = '22023',
      message = 'A valid supplier contact method is required.';
  end if;

  select * into v_purchase_order
  from public.purchase_orders purchase_order
  where purchase_order.id = p_purchase_order_id
    and purchase_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase order not found in this shop.';
  end if;

  select * into v_supplier
  from public.suppliers supplier
  where supplier.id = v_purchase_order.supplier_id
    and supplier.shop_id = p_shop_id
  for share;
  if not found or not coalesce(v_supplier.is_active, true) then
    raise exception using
      errcode = 'P0002',
      message = 'Active purchase-order supplier not found in this shop.';
  end if;

  perform line.id
  from public.purchase_order_lines line
  where line.po_id = p_purchase_order_id
  order by line.id
  for update;

  if not (v_action.target_versions ? ('purchase_order:' || p_purchase_order_id::text))
     or not (
       v_action.target_versions
       ? ('purchase_order_supplier:' || v_supplier.id::text)
     )
     or not (
       v_action.target_versions
       ? ('purchase_order_contact_channel:' || p_purchase_order_id::text)
     ) then
    raise exception using
      errcode = '40001',
      message = 'The purchase-order confirmation is missing its exact header or supplier state.';
  end if;

  if (v_action.target_versions ->> ('purchase_order:' || p_purchase_order_id::text))::jsonb
       is distinct from jsonb_build_object(
         'expectedAt', v_purchase_order.expected_at,
         'notes', v_purchase_order.notes,
         'orderedAt', v_purchase_order.ordered_at,
         'poNumber', v_purchase_order.po_number,
         'receivedAt', v_purchase_order.received_at,
         'shippingTotal', v_purchase_order.shipping_total,
         'status', v_purchase_order.status,
         'subtotal', v_purchase_order.subtotal,
         'supplierContactChannel', v_purchase_order.supplier_contact_channel,
         'supplierContactedAt', v_purchase_order.supplier_contacted_at,
         'supplierContactedBy', v_purchase_order.supplier_contacted_by,
         'supplierId', v_purchase_order.supplier_id,
         'supplierQuoteRequestId', v_purchase_order.supplier_quote_request_id,
         'taxTotal', v_purchase_order.tax_total,
         'total', v_purchase_order.total,
         'workOrderId', v_purchase_order.work_order_id
       ) then
    raise exception using
      errcode = '40001',
      message = 'The purchase-order header changed after the confirmation preview.';
  end if;

  if (v_action.target_versions ->> ('purchase_order_supplier:' || v_supplier.id::text))::jsonb
       is distinct from jsonb_build_object(
         'accountNumber', v_supplier.account_no,
         'email', v_supplier.email,
         'isActive', v_supplier.is_active,
         'name', v_supplier.name,
         'phone', v_supplier.phone
       ) then
    raise exception using
      errcode = '40001',
      message = 'The purchase-order supplier changed after the confirmation preview.';
  end if;

  if coalesce(
       v_action.target_versions ->> (
         'purchase_order_contact_channel:' || p_purchase_order_id::text
       ),
       ''
     ) is distinct from coalesce(v_contact, '') then
    raise exception using
      errcode = '40001',
      message = 'The supplier contact method does not match the confirmation preview.';
  end if;
  if v_purchase_order.supplier_quote_request_id is not null and v_contact is null then
    raise exception using
      errcode = '22023',
      message = 'A supplier contact method is required for this quoted purchase order.';
  end if;
  if v_purchase_order.supplier_quote_request_id is null and v_contact is not null then
    raise exception using
      errcode = '22023',
      message = 'Supplier contact can only be audited for a quote-backed purchase order.';
  end if;

  select coalesce(array_agg(
           substring(key from char_length('purchase_order_line:') + 1)::uuid
           order by substring(key from char_length('purchase_order_line:') + 1)::uuid
         ), array[]::uuid[])
    into v_expected_line_ids
  from jsonb_object_keys(coalesce(v_action.target_versions, '{}'::jsonb)) keys(key)
  where key ~* '^purchase_order_line:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  v_expected_count_text := v_action.target_versions
    ->> ('purchase_order_line_count:' || p_purchase_order_id::text);
  if v_expected_count_text is null
     or v_expected_count_text !~ '^[0-9]+$'
     or length(v_expected_count_text) > 6 then
    raise exception using
      errcode = '40001',
      message = 'The purchase-order confirmation is missing its exact line count.';
  end if;
  v_expected_count := v_expected_count_text::integer;
  if v_expected_count <> cardinality(v_expected_line_ids)
     or v_expected_count = 0
     or v_expected_count > 500 then
    raise exception using
      errcode = '40001',
      message = 'The purchase-order confirmation line set is incomplete or too large.';
  end if;

  select coalesce(array_agg(line.id order by line.id), array[]::uuid[])
    into v_current_line_ids
  from public.purchase_order_lines line
  where line.po_id = p_purchase_order_id;
  if v_expected_line_ids <> v_current_line_ids then
    raise exception using
      errcode = '40001',
      message = 'The purchase-order lines changed after the confirmation preview.';
  end if;

  if exists (
    select 1
    from public.purchase_order_lines line
    where line.po_id = p_purchase_order_id
      and (
        v_action.target_versions
        ->> ('purchase_order_line:' || line.id::text)
      )::jsonb is distinct from jsonb_build_object(
        'cancelledQty', line.cancelled_qty,
        'description', line.description,
        'locationId', line.location_id,
        'partId', line.part_id,
        'partRequestItemId', line.part_request_item_id,
        'quantity', line.qty,
        'receivedQuantity', line.received_qty,
        'sku', line.sku,
        'unitCost', line.unit_cost,
        'workOrderPartId', line.work_order_part_id
      )
  ) then
    raise exception using
      errcode = '40001',
      message = 'A purchase-order line changed after the confirmation preview.';
  end if;
  if not exists (
    select 1
    from public.purchase_order_lines line
    where line.po_id = p_purchase_order_id
      and greatest(
        coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0), 0
      ) > 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'Add at least one active line before placing this purchase order.';
  end if;

  perform public.parts_place_purchase_order(
    p_purchase_order_id,
    p_shop_id::text || ':shop-assistant:' || p_action_id::text,
    v_contact
  );

  -- The nested canonical command executes under the service role. Preserve
  -- the requesting human as the supplier-contact audit actor.
  if v_purchase_order.supplier_quote_request_id is not null then
    update public.purchase_orders
    set supplier_contacted_by = p_actor_user_id
    where id = p_purchase_order_id and shop_id = p_shop_id;
    update public.parts_supplier_quote_requests
    set po_contacted_by = p_actor_user_id
    where id = v_purchase_order.supplier_quote_request_id
      and shop_id = p_shop_id;
  end if;

  select * into v_purchase_order
  from public.purchase_orders purchase_order
  where purchase_order.id = p_purchase_order_id
    and purchase_order.shop_id = p_shop_id;
  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'purchaseOrderId', v_purchase_order.id,
    'poNumber', coalesce(v_purchase_order.po_number, left(v_purchase_order.id::text, 8)),
    'status', v_purchase_order.status,
    'orderedAt', v_purchase_order.ordered_at,
    'summary', coalesce(v_purchase_order.po_number, 'The purchase order') || ' was placed.',
    'href', '/parts/po/' || v_purchase_order.id::text
  );
  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'shop_assistant_purchase_order_placed',
    p_actor_user_id,
    'purchase_orders',
    p_purchase_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'supplier_id', v_purchase_order.supplier_id,
      'line_count', v_expected_count,
      'contact_channel', v_contact
    )
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

-- Confirmation previews record the exact active line set. Lock and compare it
-- before a work-order command so a concurrent line insert, status change,
-- void, or assignment cannot silently broaden or alter the confirmed action.
create or replace function public.shop_assistant_assert_line_snapshot(
  p_target_versions jsonb,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_mode text,
  p_only_unassigned boolean default true
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected_text text;
  v_expected_count integer;
  v_current_count integer;
begin
  if p_mode not in ('hold', 'release', 'assign') then
    raise exception using errcode = '22023', message = 'Unsupported line snapshot mode.';
  end if;

  v_expected_text := p_target_versions ->> (
    'work_order_line_count:' || p_work_order_id::text
  );
  if v_expected_text is null or v_expected_text !~ '^[0-9]+$' then
    raise exception using
      errcode = 'P0001',
      message = 'The confirmed line snapshot is unavailable. Ask again to review the latest work order.';
  end if;
  v_expected_count := v_expected_text::integer;

  select count(*)::integer
    into v_current_count
  from public.work_order_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
    and line.voided_at is null
    and case p_mode
      when 'hold' then
        lower(replace(coalesce(line.status::text, 'awaiting'), ' ', '_')) in (
          'awaiting', 'awaiting_approval', 'active', 'queued',
          'in_progress', 'planned'
        )
      when 'release' then
        lower(replace(coalesce(line.status::text, ''), ' ', '_')) = 'on_hold'
      else
        coalesce(line.line_type::text, 'job') = 'job'
        and (
          not coalesce(p_only_unassigned, true)
          or line.assigned_tech_id is null
        )
        and lower(replace(coalesce(line.status::text, ''), ' ', '_')) not in (
          'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
          'void', 'voided', 'ready_to_invoice', 'invoiced'
        )
        and lower(replace(coalesce(line.line_status::text, ''), ' ', '_')) not in (
          'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
          'void', 'voided', 'ready_to_invoice', 'invoiced'
        )
    end;

  if v_current_count <> v_expected_count then
    raise exception using
      errcode = 'P0001',
      message = 'The eligible work-order lines changed after confirmation. Ask again to review the latest state.';
  end if;

  if exists (
    select 1
    from public.work_order_lines line
    where line.shop_id = p_shop_id
      and line.work_order_id = p_work_order_id
      and line.voided_at is null
      and case p_mode
        when 'hold' then
          lower(replace(coalesce(line.status::text, 'awaiting'), ' ', '_')) in (
            'awaiting', 'awaiting_approval', 'active', 'queued',
            'in_progress', 'planned'
          )
        when 'release' then
          lower(replace(coalesce(line.status::text, ''), ' ', '_')) = 'on_hold'
        else
          coalesce(line.line_type::text, 'job') = 'job'
          and (
            not coalesce(p_only_unassigned, true)
            or line.assigned_tech_id is null
          )
          and lower(replace(coalesce(line.status::text, ''), ' ', '_')) not in (
            'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
            'void', 'voided', 'ready_to_invoice', 'invoiced'
          )
          and lower(replace(coalesce(line.line_status::text, ''), ' ', '_')) not in (
            'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
            'void', 'voided', 'ready_to_invoice', 'invoiced'
          )
      end
      and (
        p_target_versions ->> ('work_order_line:' || line.id::text) is null
        or (
          line.updated_at is null
          and p_target_versions ->> ('work_order_line:' || line.id::text) <> 'missing'
        )
        or (
          line.updated_at is not null
          and (
            p_target_versions ->> ('work_order_line:' || line.id::text) = 'missing'
            or line.updated_at is distinct from (
              p_target_versions ->> ('work_order_line:' || line.id::text)
            )::timestamptz
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'A work-order line changed after confirmation. Ask again to review the latest state.';
  end if;

  return v_current_count;
end;
$$;

revoke all on function public.shop_assistant_assert_line_snapshot(
  jsonb, uuid, uuid, text, boolean
) from public, anon, authenticated;

create or replace function public.shop_assistant_hold_work_order_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_role text;
  v_status text;
  v_expected text;
  v_expected_count integer;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Hold for assistance');
  v_affected integer := 0;
  v_label text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'hold_work_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot place work orders on hold.';
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: the work order cannot be placed on hold.';
  end if;

  v_status := lower(replace(coalesce(v_work_order.status::text, 'awaiting'), ' ', '_'));
  if v_status not in (
    'awaiting', 'awaiting_approval', 'planned', 'queued',
    'in_progress', 'active', 'on_hold'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Only active operational work orders can be placed on hold.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  perform 1
  from public.work_order_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
  order by line.id
  for update;
  v_expected_count := public.shop_assistant_assert_line_snapshot(
    v_action.target_versions,
    p_shop_id,
    p_work_order_id,
    'hold',
    true
  );

  if exists (
    select 1
    from public.work_order_line_labor_segments segment
    join public.work_order_lines line on line.id = segment.work_order_line_id
    where line.shop_id = p_shop_id
      and line.work_order_id = p_work_order_id
      and line.voided_at is null
      and segment.ended_at is null
  ) or exists (
    select 1
    from public.work_order_lines line
    where line.shop_id = p_shop_id
      and line.work_order_id = p_work_order_id
      and line.voided_at is null
      and line.punched_in_at is not null
      and line.punched_out_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Pause active technician labor before placing this work order on hold.';
  end if;

  update public.work_order_lines
  set status = 'on_hold',
      hold_reason = v_reason,
      on_hold_since = coalesce(on_hold_since, now()),
      updated_at = now()
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and voided_at is null
    and lower(replace(coalesce(status::text, 'awaiting'), ' ', '_')) in (
      'awaiting', 'awaiting_approval', 'active', 'queued',
      'in_progress', 'planned'
    );
  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_count then
    raise exception using
      errcode = '40001',
      message = 'The eligible work-order lines changed while applying the hold.';
  end if;

  update public.work_orders
  set status = 'on_hold',
      updated_at = now()
  where id = p_work_order_id
    and shop_id = p_shop_id;

  v_label := case
    when nullif(trim(v_work_order.custom_id), '') is not null
      then 'WO #' || trim(v_work_order.custom_id)
    else 'WO ' || left(p_work_order_id::text, 8)
  end;
  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', p_work_order_id,
    'customId', v_work_order.custom_id,
    'status', 'on_hold',
    'affectedLines', v_affected,
    'summary', v_label || ' is now on hold for ' || v_reason || '.',
    'href', '/work-orders/' || p_work_order_id::text
  );

  insert into public.activity_logs(
    action, user_id, timestamp, target_table, target_id, context
  ) values (
    'shop_assistant_work_order_hold',
    p_actor_user_id,
    now(),
    'work_order',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'reason', v_reason,
      'affected_lines', v_affected
    )
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

create or replace function public.shop_assistant_release_work_order_hold_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_role text;
  v_status text;
  v_expected text;
  v_expected_count integer;
  v_affected integer := 0;
  v_label text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'release_work_order_hold'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot release work-order holds.';
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: the work-order hold cannot be released.';
  end if;

  v_status := lower(replace(coalesce(v_work_order.status::text, ''), ' ', '_'));
  if v_status <> 'on_hold' then
    raise exception using
      errcode = 'P0001',
      message = 'Only an on-hold work order can have its hold released.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  perform 1
  from public.work_order_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
  order by line.id
  for update;
  v_expected_count := public.shop_assistant_assert_line_snapshot(
    v_action.target_versions,
    p_shop_id,
    p_work_order_id,
    'release',
    true
  );

  update public.work_order_lines
  set status = 'awaiting',
      hold_reason = null,
      on_hold_since = null,
      updated_at = now()
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and voided_at is null
    and lower(replace(coalesce(status::text, ''), ' ', '_')) = 'on_hold';
  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_count then
    raise exception using
      errcode = '40001',
      message = 'The held work-order lines changed while releasing the hold.';
  end if;

  update public.work_orders
  set status = 'queued',
      updated_at = now()
  where id = p_work_order_id
    and shop_id = p_shop_id;

  v_label := case
    when nullif(trim(v_work_order.custom_id), '') is not null
      then 'WO #' || trim(v_work_order.custom_id)
    else 'WO ' || left(p_work_order_id::text, 8)
  end;
  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', p_work_order_id,
    'customId', v_work_order.custom_id,
    'status', 'queued',
    'affectedLines', v_affected,
    'summary', v_label || ' is back in the queue.',
    'href', '/work-orders/' || p_work_order_id::text
  );

  insert into public.activity_logs(
    action, user_id, timestamp, target_table, target_id, context
  ) values (
    'shop_assistant_work_order_hold_released',
    p_actor_user_id,
    now(),
    'work_order',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'affected_lines', v_affected
    )
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

-- Use profiles.id for bridge-table audit foreign keys, and only assign the
-- exact active line set shown in the confirmation preview.
create or replace function public.shop_assistant_assign_work_order_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_only_unassigned boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_technician_role text;
  v_technician_name text;
  v_expected text;
  v_expected_count integer;
  v_count integer := 0;
  v_label text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'assign_work_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_actor_profile_id := public.shop_assistant_profile_id(
    p_shop_id, p_actor_user_id
  );
  v_actor_role := public.shop_assistant_profile_role(
    p_shop_id, p_actor_user_id
  );
  if v_actor_role not in (
    'owner', 'admin', 'manager', 'advisor', 'lead_hand', 'foreman'
  ) then
    raise exception using errcode = '42501', message = 'Your role cannot assign work.';
  end if;

  select
    public.shop_assistant_profile_role(p_shop_id, profile.id),
    profile.full_name
    into v_technician_role, v_technician_name
  from public.profiles profile
  where profile.id = p_technician_id
    and profile.shop_id = p_shop_id
  for update;
  if not found or v_technician_role not in ('mechanic', 'foreman', 'lead_hand') then
    raise exception using
      errcode = 'P0001',
      message = 'Technician is not assignable for this shop.';
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: assignment cannot change after invoice finalization.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  perform 1
  from public.work_order_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
  order by line.id
  for update;

  v_expected_count := public.shop_assistant_assert_line_snapshot(
    v_action.target_versions,
    p_shop_id,
    p_work_order_id,
    'assign',
    p_only_unassigned
  );
  if v_expected_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'This work order has no eligible job lines to assign.';
  end if;

  with candidates as materialized (
    select line.id
    from public.work_order_lines line
    where line.shop_id = p_shop_id
      and line.work_order_id = p_work_order_id
      and line.voided_at is null
      and coalesce(line.line_type::text, 'job') = 'job'
      and (
        not coalesce(p_only_unassigned, true)
        or line.assigned_tech_id is null
      )
      and lower(replace(coalesce(line.status::text, ''), ' ', '_')) not in (
        'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
        'void', 'voided', 'ready_to_invoice', 'invoiced'
      )
      and lower(replace(coalesce(line.line_status::text, ''), ' ', '_')) not in (
        'completed', 'done', 'declined', 'deferred', 'cancelled', 'canceled',
        'void', 'voided', 'ready_to_invoice', 'invoiced'
      )
  ), bridge_rows as (
    insert into public.work_order_line_technicians(
      work_order_line_id,
      technician_id,
      assigned_by
    )
    select candidate.id, p_technician_id, v_actor_profile_id
    from candidates candidate
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by
    returning work_order_line_id
  ), updated_rows as (
    update public.work_order_lines line
    set assigned_tech_id = p_technician_id,
        updated_at = now()
    from candidates candidate
    where line.id = candidate.id
    returning line.id
  )
  select count(*)::integer into v_count from updated_rows;

  if v_count <> v_expected_count then
    raise exception using
      errcode = '40001',
      message = 'The eligible work-order lines changed during assignment.';
  end if;

  update public.work_orders
  set updated_at = now()
  where id = p_work_order_id
    and shop_id = p_shop_id;

  v_label := case
    when nullif(trim(v_work_order.custom_id), '') is not null
      then 'WO #' || trim(v_work_order.custom_id)
    else 'WO ' || left(p_work_order_id::text, 8)
  end;
  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', p_work_order_id,
    'technicianId', p_technician_id,
    'technicianName', coalesce(nullif(trim(v_technician_name), ''), 'Technician'),
    'assignedLines', v_count,
    'summary', v_label || ' assigned ' || v_count::text || ' line(s) to '
      || coalesce(nullif(trim(v_technician_name), ''), 'the selected technician') || '.',
    'href', '/work-orders/' || p_work_order_id::text
  );

  insert into public.activity_logs(
    action, user_id, timestamp, target_table, target_id, context
  ) values (
    'shop_assistant_work_order_assigned',
    p_actor_user_id,
    now(),
    'work_order',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'profile_id', v_actor_profile_id,
      'action_id', p_action_id,
      'technician_id', p_technician_id,
      'assigned_lines', v_count,
      'only_unassigned', coalesce(p_only_unassigned, true)
    )
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

-- Preserve the existing duration when the user supplies only a new start,
-- then delegate to the universal scheduler so events, reservations, overlap
-- checks, and booking state move together in the assistant transaction.
create or replace function public.shop_assistant_reschedule_booking_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_booking_id uuid,
  p_actor_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_booking public.bookings%rowtype;
  v_expected text;
  v_ends_at timestamptz;
  v_notes text;
  v_result jsonb;
  v_scheduler jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'reschedule_booking'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot reschedule appointments.';
  end if;

  select * into v_booking
  from public.bookings booking
  where booking.id = p_booking_id
    and booking.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Appointment not found for this shop.';
  end if;
  if lower(replace(coalesce(v_booking.status::text, ''), ' ', '_')) in (
    'cancelled', 'canceled', 'completed'
  ) then
    raise exception using errcode = 'P0001', message = 'Appointment is already in a terminal state.';
  end if;

  v_expected := v_action.target_versions ->> ('booking:' || p_booking_id::text);
  if not public.shop_assistant_timestamp_version_matches(
    v_expected,
    v_booking.updated_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'The appointment changed after the confirmation preview.';
  end if;

  if p_starts_at is null then
    raise exception using errcode = '22023', message = 'A new appointment start is required.';
  end if;
  if p_ends_at is null then
    if v_booking.starts_at is null
       or v_booking.ends_at is null
       or v_booking.ends_at <= v_booking.starts_at then
      raise exception using
        errcode = '22023',
        message = 'This appointment has no valid duration. Provide both a new start and end.';
    end if;
    v_ends_at := p_starts_at + (v_booking.ends_at - v_booking.starts_at);
  else
    v_ends_at := p_ends_at;
  end if;
  if v_ends_at <= p_starts_at then
    raise exception using
      errcode = '22023',
      message = 'The appointment end must be after its start.';
  end if;

  v_notes := case
    when nullif(trim(coalesce(p_note, '')), '') is null then v_booking.notes
    when nullif(trim(coalesce(v_booking.notes, '')), '') is null then trim(p_note)
    else v_booking.notes || E'\n' || trim(p_note)
  end;

  v_scheduler := public.scheduler_apply_booking_command_atomic(
    'reschedule',
    p_booking_id,
    null,
    null,
    null,
    p_starts_at,
    v_ends_at,
    v_notes,
    p_actor_user_id,
    'staff',
    p_shop_id::text || ':shop-assistant:reschedule-booking:' || p_action_id::text,
    null,
    now(),
    coalesce(nullif(v_booking.lifecycle_metadata ->> 'service_mode', ''), 'shop'),
    null
  );

  select * into v_booking
  from public.bookings booking
  where booking.id = p_booking_id
    and booking.shop_id = p_shop_id;
  v_result := jsonb_build_object(
    'ok', true,
    'booking', jsonb_build_object(
      'id', v_booking.id,
      'startsAt', v_booking.starts_at,
      'endsAt', v_booking.ends_at,
      'status', v_booking.status,
      'customerId', v_booking.customer_id,
      'vehicleId', v_booking.vehicle_id,
      'workOrderId', v_booking.work_order_id
    ),
    'summary', 'Appointment ' || left(v_booking.id::text, 8)
      || ' was moved to ' || v_booking.starts_at::text || '.',
    'href', '/dashboard/appointments',
    'scheduler', v_scheduler -> 'scheduler'
  );

  insert into public.activity_logs(
    action, user_id, timestamp, target_table, target_id, context
  ) values (
    'shop_assistant_booking_rescheduled',
    p_actor_user_id,
    now(),
    'booking',
    p_booking_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'starts_at', v_booking.starts_at,
      'ends_at', v_booking.ends_at
    )
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

-- Canonical readiness previously assumed profiles.id always equalled
-- auth.uid() and excluded the service-advisor role even though the HTTP
-- capability gate authorizes it. Keep the public signature stable while
-- resolving imported staff identities through the same dual-id contract as
-- the assistant.
create or replace function public.mark_work_order_ready_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_at, now());
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_profile_id uuid;
  v_role text;
  v_line_count integer := 0;
  v_not_done integer := 0;
  v_pending_quotes integer := 0;
begin
  if p_actor_user_id is null or nullif(trim(p_operation_key), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Authenticated actor and stable operation key are required.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and p_actor_user_id is distinct from auth.uid() then
    raise exception using
      errcode = '42501',
      message = 'The readiness actor does not match the authenticated user.';
  end if;

  v_profile_id := public.shop_assistant_profile_id(p_shop_id, p_actor_user_id);
  v_role := lower(coalesce(
    public.shop_assistant_profile_role(p_shop_id, p_actor_user_id),
    ''
  ));
  if v_profile_id is null
     or v_role not in (
       'owner', 'admin', 'manager', 'advisor', 'service',
       'service_advisor', 'service advisor'
     ) then
    raise exception using
      errcode = '42501',
      message = 'Your role is not authorized to mark this work order ready.';
  end if;

  select result into v_existing
  from public.system_lifecycle_operation_keys
  where shop_id = p_shop_id
    and operation_name = 'mark_work_order_ready'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCIALLY_LOCKED: readiness cannot change after invoice finalization.';
  end if;

  perform 1
  from public.work_order_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
  order by id
  for update;

  perform 1
  from public.work_order_quote_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
  order by id
  for update;

  select
    count(*) filter (where voided_at is null),
    count(*) filter (
      where voided_at is null
        and lower(coalesce(status::text, '')) not in (
          'completed', 'declined', 'deferred', 'ready_to_invoice', 'invoiced'
        )
        and lower(coalesce(line_status::text, '')) not in (
          'declined', 'deferred', 'voided', 'cancelled', 'canceled'
        )
    )
  into v_line_count, v_not_done
  from public.work_order_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id;

  if v_line_count = 0 then
    raise exception using errcode = 'P0001', message = 'Work order has no active lines.';
  end if;
  if v_not_done > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'All active lines must be completed, declined, or deferred first.';
  end if;

  select count(*)
  into v_pending_quotes
  from public.work_order_quote_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and (
      sent_to_customer_at is not null
      or lower(coalesce(status::text, '')) in ('sent', 'ready_to_send', 'quoted')
    )
    and not (
      lower(coalesce(status::text, '')) in (
        'approved', 'converted', 'declined', 'deferred', 'rejected',
        'cancelled', 'canceled'
      )
      or stage::text in (
        'customer_approved', 'customer_declined', 'customer_deferred'
      )
      or approved_at is not null
      or declined_at is not null
      or work_order_line_id is not null
    );

  if v_pending_quotes > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Active pending quote lines must be resolved before invoicing.';
  end if;

  update public.work_orders
  set status = 'ready_to_invoice',
      updated_at = v_now
  where id = p_work_order_id
    and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'workOrderId', p_work_order_id,
    'status', 'ready_to_invoice',
    'lineCount', v_line_count
  );

  insert into public.system_lifecycle_operation_keys(
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    result
  ) values (
    p_shop_id,
    'mark_work_order_ready',
    p_operation_key,
    p_actor_user_id,
    p_work_order_id,
    v_result
  );

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id,
    'work_order_marked_ready',
    'work_orders',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'profile_id', v_profile_id,
      'operation_key', p_operation_key
    )
  );

  return v_result;
end;
$$;

create or replace function public.shop_assistant_mark_work_order_ready_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_work_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_operation_key text := 'shop-assistant:' || p_action_id::text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id,
    p_shop_id,
    p_actor_user_id,
    'mark_work_order_ready_to_invoice'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  -- Recover an operation committed by the pre-wrapper executor before its
  -- action row was persisted. The durable operation key is unique to this
  -- exact assistant action and work order.
  select operation.result into v_existing
  from public.system_lifecycle_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_name = 'mark_work_order_ready'
    and operation.operation_key = v_operation_key
    and operation.work_order_id = p_work_order_id;
  if found then
    v_result := coalesce(v_existing, '{}'::jsonb) || jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'summary', 'The work order is ready to invoice.',
      'href', '/work-orders/' || p_work_order_id::text || '/invoice'
    );
    return public.shop_assistant_succeed_action(
      p_action_id, p_shop_id, v_result
    );
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found for this shop.';
  end if;
  if not public.shop_assistant_timestamp_version_matches(
    v_action.target_versions ->> ('work_order:' || p_work_order_id::text),
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = '40001',
      message = 'The work order changed after the confirmation preview.';
  end if;

  v_result := public.mark_work_order_ready_atomic(
    p_shop_id,
    p_work_order_id,
    p_actor_user_id,
    v_operation_key,
    clock_timestamp()
  ) || jsonb_build_object(
    'summary', 'The work order is ready to invoice.',
    'href', '/work-orders/' || p_work_order_id::text || '/invoice'
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

create or replace function public.shop_assistant_finalize_invoice_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_actor_profile_id uuid,
  p_work_order_id uuid,
  p_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_profile_id uuid;
  v_work_order public.work_orders%rowtype;
  v_expected_source text;
  v_expected_snapshot text;
  v_current_source text;
  v_current_snapshot text;
  v_version public.invoice_versions%rowtype;
  v_result jsonb;
  v_count integer;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'finalize_invoice'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  v_profile_id := public.shop_assistant_profile_id(
    p_shop_id, p_actor_user_id
  );
  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_profile_id is null
     or v_profile_id is distinct from p_actor_profile_id
     or v_role not in (
       'owner', 'admin', 'manager', 'advisor', 'service',
       'service_advisor', 'service advisor'
     ) then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot finalize invoices for this shop.';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'The confirmed invoice snapshot is required.';
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Work order not found for this shop.';
  end if;
  if not public.shop_assistant_timestamp_version_matches(
    v_action.target_versions ->> ('work_order:' || p_work_order_id::text),
    v_work_order.updated_at
  ) then
    raise exception using
      errcode = '40001',
      message = 'The work order changed after the invoice confirmation preview.';
  end if;

  -- Lock every source family before recomputing the confirmation fingerprint.
  -- The parent work-order FOR UPDATE lock also serializes child inserts that
  -- need a foreign-key key-share lock, preventing phantom invoice rows.
  perform 1 from public.shops shop
  where shop.id = p_shop_id
  for share;
  perform 1 from public.customers customer
  where customer.id = v_work_order.customer_id
    and customer.shop_id = p_shop_id
  for share;
  perform 1 from public.vehicles vehicle
  where vehicle.id = v_work_order.vehicle_id
    and vehicle.shop_id = p_shop_id
  for share;
  perform 1 from public.work_order_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
  order by line.id
  for update;
  perform 1 from public.work_order_quote_lines quote
  where quote.shop_id = p_shop_id
    and quote.work_order_id = p_work_order_id
  order by quote.id
  for update;
  perform 1 from public.work_order_part_allocations allocation
  where allocation.shop_id = p_shop_id
    and allocation.work_order_id = p_work_order_id
  order by allocation.id
  for update;
  perform 1 from public.work_order_parts work_part
  where work_part.shop_id = p_shop_id
    and work_part.work_order_id = p_work_order_id
  order by work_part.id
  for update;
  perform 1 from public.part_request_items item
  where item.shop_id = p_shop_id
    and item.work_order_id = p_work_order_id
  order by item.id
  for update;
  perform 1 from public.part_requests request
  where request.shop_id = p_shop_id
    and (
      request.work_order_id = p_work_order_id
      or request.id in (
        select item.request_id
        from public.part_request_items item
        where item.shop_id = p_shop_id
          and item.work_order_id = p_work_order_id
      )
    )
  order by request.id
  for update;
  perform 1 from public.parts part
  where part.shop_id = p_shop_id
    and part.id in (
      select allocation.part_id
      from public.work_order_part_allocations allocation
      where allocation.shop_id = p_shop_id
        and allocation.work_order_id = p_work_order_id
      union
      select work_part.part_id
      from public.work_order_parts work_part
      where work_part.shop_id = p_shop_id
        and work_part.work_order_id = p_work_order_id
        and work_part.part_id is not null
      union
      select item.part_id
      from public.part_request_items item
      where item.shop_id = p_shop_id
        and item.work_order_id = p_work_order_id
        and item.part_id is not null
    )
  order by part.id
  for share;
  perform 1 from public.invoice_pricing_overrides override_row
  where override_row.shop_id = p_shop_id
    and override_row.work_order_id = p_work_order_id
  for update;
  perform 1 from public.invoices invoice
  where invoice.shop_id = p_shop_id
    and invoice.work_order_id = p_work_order_id
  order by invoice.id
  for update;
  perform 1 from public.invoice_versions version
  where version.shop_id = p_shop_id
    and version.work_order_id = p_work_order_id
  order by version.id
  for update;

  v_expected_source := v_action.target_versions
    ->> ('invoice_source:' || p_work_order_id::text);
  v_expected_snapshot := v_action.target_versions
    ->> ('invoice_snapshot:' || p_work_order_id::text);
  if v_expected_source is null or v_expected_snapshot is null then
    raise exception using
      errcode = '40001',
      message = 'The invoice confirmation is missing its source fingerprints.';
  end if;
  v_current_source := public.shop_assistant_invoice_source_fingerprint(
    p_shop_id, p_work_order_id
  );
  v_current_snapshot := public.shop_assistant_json_fingerprint(
    p_snapshot - 'documentConfiguration'
  );
  if v_current_source is distinct from v_expected_source then
    raise exception using
      errcode = '40001',
      message = 'Invoice source records changed after the confirmation preview.';
  end if;
  if v_current_snapshot is distinct from v_expected_snapshot then
    raise exception using
      errcode = '40001',
      message = 'The invoice totals or line snapshot changed after confirmation.';
  end if;

  v_version := public.finalize_invoice_version(
    p_shop_id,
    p_work_order_id,
    null,
    p_snapshot,
    p_snapshot ->> 'currency',
    coalesce((p_snapshot ->> 'subtotal')::numeric, 0),
    coalesce((p_snapshot ->> 'discountTotal')::numeric, 0),
    coalesce((p_snapshot ->> 'taxTotal')::numeric, 0),
    coalesce((p_snapshot ->> 'total')::numeric, 0),
    p_actor_profile_id,
    'shop-assistant:' || p_action_id::text
  );
  if v_version.invoice_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Invoice finalization did not return an invoice record.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'invoiceId', v_version.invoice_id,
    'invoiceVersionId', v_version.id,
    'total', v_version.total,
    'currency', v_version.currency,
    'sideEffectsPending', true,
    'summary', 'Invoice ' || left(v_version.invoice_id::text, 8)
      || ' was finalized for ' || v_version.currency || ' '
      || v_version.total::text || '.',
    'href', '/work-orders/invoice/' || p_work_order_id::text
  );

  -- Financial issuance is atomic in this transaction, but attachment and
  -- operational-audit side effects run in the application process. Persist a
  -- resumable checkpoint without closing the action. The confirmation route
  -- records the terminal result, including any warnings, only after those
  -- side effects have run.
  update public.shop_assistant_actions
  set result = v_result,
      error = null,
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'The assistant action could not record its invoice checkpoint.';
  end if;
  return v_result;
end;
$$;

-- Reopen the canonical inspection through a dual-identity role check so
-- imported staff accounts behave the same as profiles whose primary key is
-- auth.uid(). The public signature remains unchanged for existing callers.
create or replace function public.reopen_inspection(
  p_inspection_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_role text;
  v_inspection_shop_id uuid;
  v_work_order_id uuid;
  v_locked boolean := false;
  v_completed boolean := false;
  v_is_draft boolean := true;
  v_status text := 'draft';
  v_finalized_at timestamptz;
  v_finalized_by uuid;
  v_signing_cycle bigint := 0;
  v_next_cycle bigint;
  v_now timestamptz := clock_timestamp();
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_actor_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_inspection_id is null or v_reason is null then
    raise exception using
      errcode = '22023',
      message = 'An inspection and reopen reason are required.';
  end if;

  select
    inspection.shop_id,
    inspection.work_order_id,
    coalesce(inspection.locked, false),
    coalesce(inspection.completed, false),
    coalesce(inspection.is_draft, true),
    coalesce(inspection.status, 'draft'),
    inspection.finalized_at,
    inspection.finalized_by,
    coalesce(inspection.signing_cycle, 0)
  into
    v_inspection_shop_id,
    v_work_order_id,
    v_locked,
    v_completed,
    v_is_draft,
    v_status,
    v_finalized_at,
    v_finalized_by,
    v_signing_cycle
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and coalesce(inspection.is_canonical, false)
  for update;
  if not found or v_inspection_shop_id is null then
    raise exception using errcode = 'P0002', message = 'Canonical inspection was not found.';
  end if;

  v_actor_profile_id := public.shop_assistant_profile_id(
    v_inspection_shop_id,
    v_actor_user_id
  );
  v_actor_role := public.shop_assistant_profile_role(
    v_inspection_shop_id,
    v_actor_user_id
  );
  if v_actor_role not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot reopen inspections.';
  end if;

  if not v_locked
     and not v_completed
     and v_is_draft
     and v_finalized_at is null
     and v_finalized_by is null
     and lower(v_status) not in ('completed', 'finalized', 'signed') then
    return jsonb_build_object(
      'ok', true,
      'already_open', true,
      'inspection_id', p_inspection_id,
      'signing_cycle', v_signing_cycle
    );
  end if;

  v_next_cycle := v_signing_cycle + 1;
  perform set_config('profixiq.inspection_reopen', 'on', true);
  update public.inspections
  set locked = false,
      completed = false,
      is_draft = true,
      status = 'in_progress',
      finalized_at = null,
      finalized_by = null,
      reopened_at = v_now,
      reopened_by = v_actor_user_id,
      reopen_reason = v_reason,
      signing_cycle = v_next_cycle,
      updated_at = v_now
  where id = p_inspection_id;

  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'inspection_reopened',
    v_actor_user_id,
    'inspections',
    p_inspection_id,
    jsonb_build_object(
      'shop_id', v_inspection_shop_id,
      'profile_id', v_actor_profile_id,
      'work_order_id', v_work_order_id,
      'reason', v_reason,
      'signing_cycle', v_next_cycle
    )
  );

  return jsonb_build_object(
    'ok', true,
    'already_open', false,
    'inspection_id', p_inspection_id,
    'reopened_at', v_now,
    'signing_cycle', v_next_cycle
  );
end;
$$;

-- The assistant confirmation captures every lifecycle field that authorizes a
-- reopen. Validate those fields while holding the inspection row lock, then
-- commit the correction cycle and the durable action result together.
create or replace function public.shop_assistant_reopen_inspection_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_inspection_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_inspection public.inspections%rowtype;
  v_reason text := nullif(trim(p_reason), '');
  v_now timestamptz := clock_timestamp();
  v_next_cycle bigint;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'reopen_inspection'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  if p_inspection_id is null or v_reason is null then
    raise exception using
      errcode = '22023',
      message = 'An inspection and reopen reason are required.';
  end if;
  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot reopen inspections.';
  end if;

  select * into v_inspection
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = p_shop_id
    and coalesce(inspection.is_canonical, false)
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Canonical inspection was not found in this shop.';
  end if;

  if not (v_action.target_versions ? ('inspection:' || p_inspection_id::text))
     or not (v_action.target_versions ? ('inspection_signing_cycle:' || p_inspection_id::text))
     or not (v_action.target_versions ? ('inspection_locked:' || p_inspection_id::text))
     or not (v_action.target_versions ? ('inspection_completed:' || p_inspection_id::text))
     or not (v_action.target_versions ? ('inspection_is_draft:' || p_inspection_id::text))
     or not (v_action.target_versions ? ('inspection_status:' || p_inspection_id::text))
     or not (v_action.target_versions ? ('inspection_finalized_at:' || p_inspection_id::text))
     or not (v_action.target_versions ? ('inspection_finalized_by:' || p_inspection_id::text)) then
    raise exception using
      errcode = '40001',
      message = 'The inspection confirmation is missing its exact lifecycle state.';
  end if;

  if not public.shop_assistant_timestamp_version_matches(
       v_action.target_versions ->> ('inspection:' || p_inspection_id::text),
       v_inspection.updated_at
     )
     or v_action.target_versions ->> ('inspection_signing_cycle:' || p_inspection_id::text)
          is distinct from coalesce(v_inspection.signing_cycle, 0)::text
     or v_action.target_versions ->> ('inspection_locked:' || p_inspection_id::text)
          is distinct from coalesce(v_inspection.locked, false)::text
     or v_action.target_versions ->> ('inspection_completed:' || p_inspection_id::text)
          is distinct from coalesce(v_inspection.completed, false)::text
     or v_action.target_versions ->> ('inspection_is_draft:' || p_inspection_id::text)
          is distinct from coalesce(v_inspection.is_draft, true)::text
     or v_action.target_versions ->> ('inspection_status:' || p_inspection_id::text)
          is distinct from coalesce(to_jsonb(v_inspection.status)::text, 'null')
     or not public.shop_assistant_timestamp_version_matches(
          v_action.target_versions ->> ('inspection_finalized_at:' || p_inspection_id::text),
          v_inspection.finalized_at
        )
     or v_action.target_versions ->> ('inspection_finalized_by:' || p_inspection_id::text)
          is distinct from coalesce(v_inspection.finalized_by::text, 'missing') then
    raise exception using
      errcode = '40001',
      message = 'The inspection changed after the confirmation preview.';
  end if;

  if not coalesce(v_inspection.locked, false)
     and not coalesce(v_inspection.completed, false)
     and coalesce(v_inspection.is_draft, true)
     and v_inspection.finalized_at is null
     and v_inspection.finalized_by is null
     and lower(coalesce(v_inspection.status, 'draft')) not in (
       'completed', 'finalized', 'signed'
     ) then
    raise exception using
      errcode = '40001',
      message = 'The inspection is already open and cannot start another correction cycle.';
  end if;

  v_next_cycle := coalesce(v_inspection.signing_cycle, 0) + 1;
  perform set_config('profixiq.inspection_reopen', 'on', true);
  update public.inspections
  set locked = false,
      completed = false,
      is_draft = true,
      status = 'in_progress',
      finalized_at = null,
      finalized_by = null,
      reopened_at = v_now,
      reopened_by = p_actor_user_id,
      reopen_reason = v_reason,
      signing_cycle = v_next_cycle,
      updated_at = v_now
  where id = p_inspection_id and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'inspectionId', p_inspection_id,
    'alreadyOpen', false,
    'reopenedAt', v_now,
    'signingCycle', v_next_cycle,
    'summary', 'The inspection was reopened for a new correction cycle.',
    'href', case
      when v_inspection.work_order_id is null then '/inspection/saved'
      else '/work-orders/' || v_inspection.work_order_id::text
    end
  );

  insert into public.activity_logs(action, user_id, target_table, target_id, context)
  values (
    'inspection_reopened',
    p_actor_user_id,
    'inspections',
    p_inspection_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'profile_id', public.shop_assistant_profile_id(p_shop_id, p_actor_user_id),
      'work_order_id', v_inspection.work_order_id,
      'reason', v_reason,
      'signing_cycle', v_next_cycle,
      'action_id', p_action_id
    )
  );
  return public.shop_assistant_succeed_action(p_action_id, p_shop_id, v_result);
end;
$$;

revoke all on function public.shop_assistant_create_vehicle_atomic(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_create_work_order_atomic(
  uuid, uuid, uuid, uuid, uuid, text, integer, boolean, uuid
) from public, anon, authenticated;
revoke all on function public.shop_assistant_add_work_order_line_atomic(
  uuid, uuid, uuid, uuid, text, text, text, numeric, numeric, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_create_booking_atomic(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.shop_assistant_cancel_booking_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_create_part_request_atomic(
  uuid, uuid, uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_receive_part_request_item_atomic(
  uuid, uuid, uuid, uuid, uuid, numeric, uuid
) from public, anon, authenticated;
revoke all on function public.shop_assistant_receive_purchase_order_line_atomic(
  uuid, uuid, uuid, uuid, uuid, numeric, uuid
) from public, anon, authenticated;
revoke all on function public.shop_assistant_record_approval_decision_atomic(
  uuid, uuid, uuid, uuid, uuid[], boolean, text, text, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_create_inventory_part_atomic(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric,
  numeric, uuid, numeric, numeric
) from public, anon, authenticated;
revoke all on function public.shop_assistant_set_inventory_stock_atomic(
  uuid, uuid, uuid, uuid, uuid, numeric, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_create_purchase_order_atomic(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, jsonb
) from public, anon, authenticated;
revoke all on function public.shop_assistant_place_purchase_order_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_create_fleet_service_request_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, date
) from public, anon, authenticated;
revoke all on function public.shop_assistant_convert_fleet_service_request_atomic(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.shop_assistant_hold_work_order_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_release_work_order_hold_atomic(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.shop_assistant_assign_work_order_atomic(
  uuid, uuid, uuid, uuid, uuid, boolean
) from public, anon, authenticated;
revoke all on function public.shop_assistant_create_customer_atomic(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.shop_assistant_reschedule_booking_atomic(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.mark_work_order_ready_atomic(
  uuid, uuid, uuid, text, timestamptz
) from public, anon;
revoke all on function public.shop_assistant_mark_work_order_ready_atomic(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.shop_assistant_finalize_invoice_atomic(
  uuid, uuid, uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.reopen_inspection(uuid, text)
  from public, anon;
revoke all on function public.shop_assistant_reopen_inspection_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.shop_assistant_create_vehicle_atomic(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text, text
) to service_role;
grant execute on function public.shop_assistant_create_work_order_atomic(
  uuid, uuid, uuid, uuid, uuid, text, integer, boolean, uuid
) to service_role;
grant execute on function public.shop_assistant_add_work_order_line_atomic(
  uuid, uuid, uuid, uuid, text, text, text, numeric, numeric, text
) to service_role;
grant execute on function public.shop_assistant_create_booking_atomic(
  uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid
) to service_role;
grant execute on function public.shop_assistant_cancel_booking_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;
grant execute on function public.shop_assistant_create_part_request_atomic(
  uuid, uuid, uuid, uuid, uuid, jsonb, text
) to service_role;
grant execute on function public.shop_assistant_receive_part_request_item_atomic(
  uuid, uuid, uuid, uuid, uuid, numeric, uuid
) to service_role;
grant execute on function public.shop_assistant_receive_purchase_order_line_atomic(
  uuid, uuid, uuid, uuid, uuid, numeric, uuid
) to service_role;
grant execute on function public.shop_assistant_record_approval_decision_atomic(
  uuid, uuid, uuid, uuid, uuid[], boolean, text, text, text
) to service_role;
grant execute on function public.shop_assistant_create_inventory_part_atomic(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric,
  numeric, uuid, numeric, numeric
) to service_role;
grant execute on function public.shop_assistant_set_inventory_stock_atomic(
  uuid, uuid, uuid, uuid, uuid, numeric, text
) to service_role;
grant execute on function public.shop_assistant_create_purchase_order_atomic(
  uuid, uuid, uuid, uuid, uuid, timestamptz, text, jsonb
) to service_role;
grant execute on function public.shop_assistant_place_purchase_order_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;
grant execute on function public.shop_assistant_create_fleet_service_request_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, date
) to service_role;
grant execute on function public.shop_assistant_convert_fleet_service_request_atomic(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.shop_assistant_hold_work_order_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;
grant execute on function public.shop_assistant_release_work_order_hold_atomic(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.shop_assistant_assign_work_order_atomic(
  uuid, uuid, uuid, uuid, uuid, boolean
) to service_role;
grant execute on function public.shop_assistant_create_customer_atomic(
  uuid, uuid, uuid, text, text, text
) to service_role;
grant execute on function public.shop_assistant_reschedule_booking_atomic(
  uuid, uuid, uuid, uuid, timestamptz, timestamptz, text
) to service_role;
grant execute on function public.mark_work_order_ready_atomic(
  uuid, uuid, uuid, text, timestamptz
) to authenticated, service_role;
grant execute on function public.shop_assistant_mark_work_order_ready_atomic(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.shop_assistant_finalize_invoice_atomic(
  uuid, uuid, uuid, uuid, uuid, jsonb
) to service_role;
grant execute on function public.shop_assistant_json_fingerprint(jsonb)
  to service_role;
grant execute on function public.shop_assistant_invoice_source_fingerprint(
  uuid, uuid
) to service_role;
grant execute on function public.reopen_inspection(uuid, text)
  to authenticated;
grant execute on function public.shop_assistant_reopen_inspection_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;

notify pgrst, 'reload schema';

commit;
