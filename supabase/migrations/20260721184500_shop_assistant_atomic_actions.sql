begin;

-- Shop-assistant writes use the durable action row as their idempotency record.
-- The domain mutation and terminal action result are committed in one transaction.

create or replace function public.shop_assistant_lock_action_for_tool(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_tool_name text
) returns public.shop_assistant_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_actor_user_id then
    raise exception using errcode = '42501', message = 'The authenticated actor does not match this action.';
  end if;

  select *
    into v_action
  from public.shop_assistant_actions a
  where a.id = p_action_id
    and a.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Shop assistant action not found.';
  end if;
  if v_action.requested_by is distinct from p_actor_user_id then
    raise exception using errcode = '42501', message = 'Only the requesting staff member can execute this action.';
  end if;
  if v_action.tool_name is distinct from p_tool_name then
    raise exception using errcode = 'P0001', message = 'The action tool does not match the requested operation.';
  end if;
  if v_action.status = 'succeeded' then
    return v_action;
  end if;
  if v_action.status <> 'executing' then
    raise exception using errcode = 'P0001', message = 'The action is not in an executable state.';
  end if;

  return v_action;
end;
$$;

revoke all on function public.shop_assistant_lock_action_for_tool(uuid, uuid, uuid, text) from public;

create or replace function public.shop_assistant_profile_role(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select lower(replace(coalesce(p.role::text, ''), ' ', '_'))
    into v_role
  from public.profiles p
  where p.id = p_actor_user_id
    and p.shop_id = p_shop_id;

  if not found then
    raise exception using errcode = '42501', message = 'The actor is not available for this shop.';
  end if;

  return v_role;
end;
$$;

revoke all on function public.shop_assistant_profile_role(uuid, uuid) from public;

create or replace function public.shop_assistant_hold_work_order_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_role text;
  v_status text;
  v_expected text;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Hold for assistance');
  v_affected integer := 0;
  v_label text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'hold_work_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner','admin','manager','advisor','service','lead_hand','leadhand','foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot place work orders on hold.';
  end if;

  select *
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: the work order cannot be placed on hold.';
  end if;

  v_status := lower(replace(coalesce(v_work_order.status::text, 'awaiting'), ' ', '_'));
  if v_status not in ('awaiting','awaiting_approval','planned','queued','in_progress','active','on_hold') then
    raise exception using errcode = 'P0001', message = 'Only active operational work orders can be placed on hold.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if v_expected is not null
     and v_work_order.updated_at is distinct from v_expected::timestamptz then
    raise exception using errcode = 'P0001', message = 'The work order changed after the confirmation preview.';
  end if;

  if exists (
    select 1
    from public.work_order_line_labor_segments seg
    join public.work_order_lines wol on wol.id = seg.work_order_line_id
    where wol.shop_id = p_shop_id
      and wol.work_order_id = p_work_order_id
      and seg.ended_at is null
  ) or exists (
    select 1
    from public.work_order_lines wol
    where wol.shop_id = p_shop_id
      and wol.work_order_id = p_work_order_id
      and wol.punched_in_at is not null
      and wol.punched_out_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'Pause active technician labor before placing this work order on hold.';
  end if;

  update public.work_order_lines
  set status = 'on_hold',
      hold_reason = v_reason,
      on_hold_since = coalesce(on_hold_since, now()),
      updated_at = now()
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and lower(replace(coalesce(status::text, 'awaiting'), ' ', '_')) in (
      'awaiting','awaiting_approval','active','queued','in_progress','planned'
    );
  get diagnostics v_affected = row_count;

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

  update public.shop_assistant_actions
  set status = 'succeeded',
      result = v_result,
      error = null,
      execution_finished_at = now(),
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
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

  return v_result;
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
set search_path = public
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_role text;
  v_status text;
  v_expected text;
  v_affected integer := 0;
  v_label text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'release_work_order_hold'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner','admin','manager','advisor','service','lead_hand','leadhand','foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot release work-order holds.';
  end if;

  select *
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: the work-order hold cannot be released.';
  end if;

  v_status := lower(replace(coalesce(v_work_order.status::text, ''), ' ', '_'));
  if v_status <> 'on_hold' then
    raise exception using errcode = 'P0001', message = 'Only an on-hold work order can have its hold released.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if v_expected is not null
     and v_work_order.updated_at is distinct from v_expected::timestamptz then
    raise exception using errcode = 'P0001', message = 'The work order changed after the confirmation preview.';
  end if;

  update public.work_order_lines
  set status = 'awaiting',
      hold_reason = null,
      on_hold_since = null,
      updated_at = now()
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and lower(replace(coalesce(status::text, ''), ' ', '_')) = 'on_hold';
  get diagnostics v_affected = row_count;

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

  update public.shop_assistant_actions
  set status = 'succeeded',
      result = v_result,
      error = null,
      execution_finished_at = now(),
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
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

  return v_result;
end;
$$;

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
set search_path = public
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_work_order public.work_orders%rowtype;
  v_actor_role text;
  v_technician_role text;
  v_technician_name text;
  v_expected text;
  v_count integer := 0;
  v_label text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'assign_work_order'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  v_actor_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_actor_role not in ('owner','admin','manager','advisor','lead_hand','leadhand','foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot assign work.';
  end if;

  select lower(replace(coalesce(p.role::text, ''), ' ', '_')), p.full_name
    into v_technician_role, v_technician_name
  from public.profiles p
  where p.id = p_technician_id
    and p.shop_id = p_shop_id
  for update;
  if not found
     or v_technician_role not in ('mechanic','tech','technician','foreman','lead_hand','leadhand') then
    raise exception using errcode = 'P0001', message = 'Technician is not assignable for this shop.';
  end if;

  select *
    into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for this shop.';
  end if;
  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: assignment cannot change after invoice finalization.';
  end if;

  v_expected := v_action.target_versions ->> ('work_order:' || p_work_order_id::text);
  if v_expected is not null
     and v_work_order.updated_at is distinct from v_expected::timestamptz then
    raise exception using errcode = 'P0001', message = 'The work order changed after the confirmation preview.';
  end if;

  with candidates as materialized (
    select wol.id
    from public.work_order_lines wol
    where wol.shop_id = p_shop_id
      and wol.work_order_id = p_work_order_id
      and coalesce(wol.line_type::text, 'job') = 'job'
      and (not coalesce(p_only_unassigned, true) or wol.assigned_tech_id is null)
    for update
  ), bridge_rows as (
    insert into public.work_order_line_technicians(
      work_order_line_id,
      technician_id,
      assigned_by
    )
    select c.id, p_technician_id, p_actor_user_id
    from candidates c
    on conflict (work_order_line_id, technician_id)
    do update set assigned_by = excluded.assigned_by
    returning work_order_line_id
  ), updated_rows as (
    update public.work_order_lines wol
    set assigned_tech_id = p_technician_id,
        updated_at = now()
    from candidates c
    where wol.id = c.id
    returning wol.id
  )
  select count(*)::integer into v_count from updated_rows;

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
    'summary', v_label || ' assigned ' || v_count::text || ' line(s) to ' || coalesce(nullif(trim(v_technician_name), ''), 'the selected technician') || '.',
    'href', '/work-orders/' || p_work_order_id::text
  );

  update public.shop_assistant_actions
  set status = 'succeeded',
      result = v_result,
      error = null,
      execution_finished_at = now(),
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'shop_assistant_work_order_assigned',
    p_actor_user_id,
    now(),
    'work_order',
    p_work_order_id,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'action_id', p_action_id,
      'technician_id', p_technician_id,
      'assigned_lines', v_count,
      'only_unassigned', coalesce(p_only_unassigned, true)
    )
  );

  return v_result;
end;
$$;

create or replace function public.shop_assistant_create_customer_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_customer public.customers%rowtype;
  v_name text := nullif(trim(p_name), '');
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'create_customer'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner','admin','manager','advisor','service','lead_hand','leadhand','foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot create customers.';
  end if;
  if v_name is null then
    raise exception using errcode = 'P0001', message = 'Customer name is required.';
  end if;

  insert into public.customers(shop_id, name, email, phone)
  values (
    p_shop_id,
    v_name,
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    nullif(trim(coalesce(p_phone, '')), '')
  )
  returning * into v_customer;

  v_result := jsonb_build_object(
    'ok', true,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'name', coalesce(nullif(trim(v_customer.name), ''), v_name),
      'email', v_customer.email,
      'phone', v_customer.phone,
      'href', '/customers/' || v_customer.id::text
    ),
    'summary', coalesce(nullif(trim(v_customer.name), ''), v_name) || ' was created as a shop customer.'
  );

  update public.shop_assistant_actions
  set status = 'succeeded',
      result = v_result,
      error = null,
      execution_finished_at = now(),
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
    'shop_assistant_customer_created',
    p_actor_user_id,
    now(),
    'customer',
    v_customer.id,
    jsonb_build_object('shop_id', p_shop_id, 'action_id', p_action_id)
  );

  return v_result;
end;
$$;

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
set search_path = public
as $$
declare
  v_action public.shop_assistant_actions%rowtype;
  v_role text;
  v_booking public.bookings%rowtype;
  v_expected text;
  v_notes text;
  v_result jsonb;
begin
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id, p_shop_id, p_actor_user_id, 'reschedule_booking'
  );
  if v_action.status = 'succeeded' then
    return coalesce(v_action.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  v_role := public.shop_assistant_profile_role(p_shop_id, p_actor_user_id);
  if v_role not in ('owner','admin','manager','advisor','lead_hand','leadhand','foreman') then
    raise exception using errcode = '42501', message = 'Your role cannot reschedule appointments.';
  end if;

  select *
    into v_booking
  from public.bookings b
  where b.id = p_booking_id
    and b.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Appointment not found for this shop.';
  end if;

  v_expected := v_action.target_versions ->> ('booking:' || p_booking_id::text);
  if v_expected is not null
     and v_booking.updated_at is distinct from v_expected::timestamptz then
    raise exception using errcode = 'P0001', message = 'The appointment changed after the confirmation preview.';
  end if;

  v_notes := case
    when nullif(trim(coalesce(p_note, '')), '') is null then v_booking.notes
    when nullif(trim(coalesce(v_booking.notes, '')), '') is null then trim(p_note)
    else v_booking.notes || E'\n' || trim(p_note)
  end;

  update public.bookings
  set starts_at = p_starts_at,
      ends_at = coalesce(p_ends_at, v_booking.ends_at),
      notes = v_notes,
      updated_at = now()
  where id = p_booking_id
    and shop_id = p_shop_id
  returning * into v_booking;

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
    'summary', 'Appointment ' || left(v_booking.id::text, 8) || ' was moved to ' || v_booking.starts_at::text || '.',
    'href', '/dashboard/appointments'
  );

  update public.shop_assistant_actions
  set status = 'succeeded',
      result = v_result,
      error = null,
      execution_finished_at = now(),
      updated_at = now()
  where id = p_action_id
    and shop_id = p_shop_id
    and status = 'executing';

  insert into public.activity_logs(action, user_id, timestamp, target_table, target_id, context)
  values (
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

  return v_result;
end;
$$;

revoke all on function public.shop_assistant_hold_work_order_atomic(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.shop_assistant_release_work_order_hold_atomic(uuid, uuid, uuid, uuid) from public;
revoke all on function public.shop_assistant_assign_work_order_atomic(uuid, uuid, uuid, uuid, uuid, boolean) from public;
revoke all on function public.shop_assistant_create_customer_atomic(uuid, uuid, uuid, text, text, text) from public;
revoke all on function public.shop_assistant_reschedule_booking_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text) from public;

grant execute on function public.shop_assistant_hold_work_order_atomic(uuid, uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.shop_assistant_release_work_order_hold_atomic(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.shop_assistant_assign_work_order_atomic(uuid, uuid, uuid, uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.shop_assistant_create_customer_atomic(uuid, uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.shop_assistant_reschedule_booking_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text) to authenticated, service_role;

commit;
