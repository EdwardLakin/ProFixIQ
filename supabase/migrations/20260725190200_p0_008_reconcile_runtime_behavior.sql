-- P0-008: restore runtime functions, security-invoker views, and triggers.
-- Definitions are catalog-derived for runtime-required objects only. SECURITY
-- DEFINER functions are fixed-search-path and function execution is opt-in.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';
SET LOCAL check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.accept_property_portal_invite(p_raw_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_email text;
  v_now timestamptz := now();
  v_token_hash text;

  v_invite_id uuid;
  v_shop_id uuid;
  v_role text;
  v_portfolio_id uuid;
  v_property_id uuid;
  v_unit_id uuid;

  v_member_id uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Authentication required'
    );
  end if;

  if p_raw_token is null or btrim(p_raw_token) = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'Invite token is required'
    );
  end if;

  -- Raw token is never stored; hash-only lookup.
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  -- Authenticated email lookup from auth.users. If this is inaccessible in a target
  -- environment, stop and provide an explicit fallback plan rather than broadening RLS.
  select lower(u.email)
    into v_email
  from auth.users u
  where u.id = v_uid
  limit 1;

  if v_email is null or v_email = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'No authenticated email available for this user'
    );
  end if;

  -- Lock pending invite row by hash for atomic acceptance.
  select i.id, i.shop_id, i.role, i.portfolio_id, i.property_id, i.unit_id
    into v_invite_id, v_shop_id, v_role, v_portfolio_id, v_property_id, v_unit_id
  from public.property_portal_invites i
  where i.token_hash = v_token_hash
    and i.status = 'pending'
    and i.expires_at > v_now
    and lower(i.invited_email) = v_email
  for update;

  if v_invite_id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Invite is invalid, expired, already handled, or does not match this account'
    );
  end if;

  -- Reuse existing member row when it already exists for the same assignment scope.
  select pm.id
    into v_member_id
  from public.property_members pm
  where pm.shop_id = v_shop_id
    and pm.user_id = v_uid
    and pm.role = v_role
    and pm.portfolio_id is not distinct from v_portfolio_id
    and pm.property_id is not distinct from v_property_id
    and pm.unit_id is not distinct from v_unit_id
  limit 1;

  if v_member_id is null then
    insert into public.property_members (
      shop_id,
      user_id,
      role,
      portfolio_id,
      property_id,
      unit_id
    )
    values (
      v_shop_id,
      v_uid,
      v_role,
      v_portfolio_id,
      v_property_id,
      v_unit_id
    )
    returning id into v_member_id;
  end if;

  update public.property_portal_invites
  set
    status = 'accepted',
    accepted_by_profile_id = v_uid,
    accepted_at = v_now,
    updated_at = v_now
  where id = v_invite_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Invite accepted',
    'invite_id', v_invite_id,
    'member_id', v_member_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.add_repair_line_from_vehicle_service(p_work_order_id uuid, p_vehicle_year integer, p_vehicle_make text, p_vehicle_model text, p_engine_family text, p_service_code text, p_qty numeric DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_shop_id uuid;
  v_menu_item_id uuid;
  v_line_id uuid;
  v_menu record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve shop from work order
  SELECT wo.shop_id
    INTO v_shop_id
  FROM public.work_orders wo
  WHERE wo.id = p_work_order_id;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'work_order % has no shop_id', p_work_order_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.id = v_uid OR p.user_id = v_uid)
      AND p.shop_id = v_shop_id
      AND lower(coalesce(p.role, '')) IN ('owner','admin','manager','advisor','mechanic','parts')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Find the mapped menu item for this shop + YMM + service_code
  v_menu_item_id := public.find_menu_item_for_vehicle_service(
    v_shop_id,
    p_vehicle_year,
    p_vehicle_make,
    p_vehicle_model,
    p_engine_family,
    p_service_code
  );

  IF v_menu_item_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_menu_item',
      'detail', 'No mapped menu item exists for this YMM/service in this shop',
      'shop_id', v_shop_id
    );
  END IF;

  SELECT
    mi.id,
    mi.name,
    mi.description,
    mi.labor_time,
    mi.total_price,
    mi.inspection_template_id
  INTO v_menu
  FROM public.menu_items mi
  WHERE mi.id = v_menu_item_id;

  -- Insert work order line as waiting for approval
  INSERT INTO public.work_order_lines (
    work_order_id,
    description,
    notes,
    labor_time,
    price_estimate,
    status,
    menu_item_id,
    template_id,
    qty
  )
  VALUES (
    p_work_order_id,
    v_menu.name,
    COALESCE(v_menu.description, NULL),
    v_menu.labor_time,
    v_menu.total_price,
    'waiting_for_approval',
    v_menu.id,
    v_menu.inspection_template_id,
    COALESCE(NULLIF(p_qty, 0), 1)
  )
  RETURNING id INTO v_line_id;

  RETURN jsonb_build_object(
    'ok', true,
    'work_order_id', p_work_order_id,
    'shop_id', v_shop_id,
    'work_order_line_id', v_line_id,
    'menu_item_id', v_menu_item_id,
    'status', 'waiting_for_approval'
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.agent_approve_action(p_action_id uuid, p_approved_by uuid DEFAULT NULL::uuid)
 RETURNS agent_actions
 LANGUAGE plpgsql
AS $function$
DECLARE
  a public.agent_actions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_approved_by IS NOT NULL AND p_approved_by <> auth.uid() THEN
    RAISE EXCEPTION 'approved_by must match the authenticated actor';
  END IF;
  p_approved_by := auth.uid();

  UPDATE public.agent_actions
  SET status = 'approved',
      approved_by = p_approved_by,
      approved_at = now(),
      rejected_by = NULL,
      rejected_at = NULL,
      rejected_reason = NULL
  WHERE id = p_action_id
  RETURNING * INTO a;

  RETURN a;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.agent_reject_action(p_action_id uuid, p_rejected_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS agent_actions
 LANGUAGE plpgsql
AS $function$
DECLARE
  a public.agent_actions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_rejected_by IS NOT NULL AND p_rejected_by <> auth.uid() THEN
    RAISE EXCEPTION 'rejected_by must match the authenticated actor';
  END IF;
  p_rejected_by := auth.uid();

  UPDATE public.agent_actions
  SET status = 'rejected',
      rejected_by = p_rejected_by,
      rejected_at = now(),
      rejected_reason = p_reason
  WHERE id = p_action_id
  RETURNING * INTO a;

  RETURN a;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.ai_generate_training_row()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into ai_training_data(shop_id, source_event_id, content)
  values(
    new.shop_id,
    new.id,
    new.payload::text
  );
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.clear_other_active_brand_assets()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.is_active = true then
    update public.shop_brand_assets
    set is_active = false,
        updated_at = now()
    where shop_id = new.shop_id
      and kind = new.kind
      and id <> new.id
      and is_active = true;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.complete_canonical_shift(p_shift_id uuid, p_shop_id uuid, p_user_id uuid, p_profile_id uuid, p_timestamp timestamp with time zone DEFAULT now())
 RETURNS TABLE(id uuid, start_time timestamp with time zone, status text, end_time timestamp with time zone, shop_id uuid, user_id uuid, inserted_events jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_shift public.tech_shifts%rowtype;
  v_latest_event_type text;
  v_auto_close_event public.punch_events%rowtype;
  v_end_event public.punch_events%rowtype;
  v_inserted_events jsonb := '[]'::jsonb;
begin
  select *
  into v_shift
  from public.tech_shifts ts
  where ts.id = p_shift_id
    and ts.shop_id = p_shop_id
    and ts.user_id = p_user_id
    and ts.status = 'active'
    and ts.end_time is null
  for update;

  if not found then
    raise exception 'No matching active shift in this shop/user'
      using errcode = 'P0002';
  end if;

  select pe.event_type
  into v_latest_event_type
  from public.punch_events pe
  where pe.shift_id = v_shift.id
    and pe.event_type in ('start_shift', 'break_start', 'break_end', 'lunch_start', 'lunch_end', 'end_shift')
  order by
    pe.timestamp desc,
    pe.created_at desc nulls last,
    case pe.event_type
      when 'end_shift' then 3
      when 'break_end' then 2
      when 'lunch_end' then 2
      when 'break_start' then 1
      when 'lunch_start' then 1
      when 'start_shift' then 0
      else -1
    end desc,
    pe.id desc
  limit 1;

  if v_latest_event_type = 'break_start' then
    insert into public.punch_events (shift_id, user_id, profile_id, event_type, timestamp)
    values (v_shift.id, p_user_id, p_profile_id, 'break_end', p_timestamp)
    returning * into v_auto_close_event;

    v_inserted_events := v_inserted_events || jsonb_build_array(jsonb_build_object(
      'id', v_auto_close_event.id,
      'event_type', v_auto_close_event.event_type,
      'timestamp', v_auto_close_event.timestamp,
      'created_at', v_auto_close_event.created_at
    ));
  elsif v_latest_event_type = 'lunch_start' then
    insert into public.punch_events (shift_id, user_id, profile_id, event_type, timestamp)
    values (v_shift.id, p_user_id, p_profile_id, 'lunch_end', p_timestamp)
    returning * into v_auto_close_event;

    v_inserted_events := v_inserted_events || jsonb_build_array(jsonb_build_object(
      'id', v_auto_close_event.id,
      'event_type', v_auto_close_event.event_type,
      'timestamp', v_auto_close_event.timestamp,
      'created_at', v_auto_close_event.created_at
    ));
  end if;

  insert into public.punch_events (shift_id, user_id, profile_id, event_type, timestamp)
  values (v_shift.id, p_user_id, p_profile_id, 'end_shift', p_timestamp + interval '1 microsecond')
  returning * into v_end_event;

  v_inserted_events := v_inserted_events || jsonb_build_array(jsonb_build_object(
    'id', v_end_event.id,
    'event_type', v_end_event.event_type,
    'timestamp', v_end_event.timestamp,
    'created_at', v_end_event.created_at
  ));

  update public.tech_shifts ts
  set status = 'completed', end_time = p_timestamp, type = 'shift'
  where ts.id = v_shift.id
  returning * into v_shift;

  return query
  select
    v_shift.id,
    v_shift.start_time,
    v_shift.status,
    v_shift.end_time,
    v_shift.shop_id,
    v_shift.user_id,
    v_inserted_events;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.compute_timecard_hours()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Only compute when both times are present
  if new.clock_in is not null and new.clock_out is not null then
    if new.clock_out <= new.clock_in then
      raise exception 'clock_out must be after clock_in';
    end if;

    new.hours_worked :=
      extract(epoch from (new.clock_out - new.clock_in)) / 3600.0;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_ai_suggestion_feedback_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  wo_shop_id uuid;
  wol_work_order_id uuid;
begin
  select shop_id
  into wo_shop_id
  from public.work_orders
  where id = new.work_order_id;

  if wo_shop_id is null then
    raise exception
      'ai_suggestion_feedback % references missing work_order %',
      new.id,
      new.work_order_id;
  end if;

  if new.shop_id <> wo_shop_id then
    raise exception
      'ai_suggestion_feedback % shop_id % does not match work_order % shop_id %',
      new.id,
      new.shop_id,
      new.work_order_id,
      wo_shop_id;
  end if;

  if new.work_order_line_id is not null then
    select work_order_id
    into wol_work_order_id
    from public.work_order_lines
    where id = new.work_order_line_id;

    if wol_work_order_id is null then
      raise exception
        'ai_suggestion_feedback % references missing work_order_line %',
        new.id,
        new.work_order_line_id;
    end if;

    if wol_work_order_id <> new.work_order_id then
      raise exception
        'ai_suggestion_feedback % work_order_line % belongs to work_order %, not %',
        new.id,
        new.work_order_line_id,
        wol_work_order_id,
        new.work_order_id;
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_assistant_daily_summary_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  shop_exists uuid;
  user_exists uuid;
begin
  select id
  into shop_exists
  from public.shops
  where id = new.shop_id;

  if shop_exists is null then
    raise exception
      'assistant_daily_summary % references missing shop %',
      new.id,
      new.shop_id;
  end if;

  select id
  into user_exists
  from public.profiles
  where id = new.user_id;

  if user_exists is null then
    raise exception
      'assistant_daily_summary % references missing user/profile %',
      new.id,
      new.user_id;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_content_asset_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  ce_shop_id uuid;
begin
  select shop_id
  into ce_shop_id
  from public.content_events
  where id = new.content_event_id;

  if ce_shop_id is null then
    raise exception
      'content_asset % references missing content_event %',
      new.id,
      new.content_event_id;
  end if;

  if new.shop_id is null then
    new.shop_id := ce_shop_id;
  elsif new.shop_id <> ce_shop_id then
    raise exception
      'content_asset % shop_id % does not match content_event % shop_id %',
      new.id,
      new.shop_id,
      new.content_event_id,
      ce_shop_id;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_content_event_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  wo_shop_id uuid;
  wol_work_order_id uuid;
  i_work_order_id uuid;
  i_shop_id uuid;
begin
  if new.work_order_id is not null then
    select shop_id
    into wo_shop_id
    from public.work_orders
    where id = new.work_order_id;

    if wo_shop_id is null then
      raise exception
        'content_event % references missing work_order %',
        new.id,
        new.work_order_id;
    end if;

    if new.shop_id is null then
      new.shop_id := wo_shop_id;
    elsif new.shop_id <> wo_shop_id then
      raise exception
        'content_event % shop_id % does not match work_order % shop_id %',
        new.id,
        new.shop_id,
        new.work_order_id,
        wo_shop_id;
    end if;
  end if;

  if new.work_order_line_id is not null then
    select work_order_id
    into wol_work_order_id
    from public.work_order_lines
    where id = new.work_order_line_id;

    if wol_work_order_id is null then
      raise exception
        'content_event % references missing work_order_line %',
        new.id,
        new.work_order_line_id;
    end if;

    if new.work_order_id is null then
      new.work_order_id := wol_work_order_id;
    elsif new.work_order_id <> wol_work_order_id then
      raise exception
        'content_event % work_order_line % belongs to work_order %, not %',
        new.id,
        new.work_order_line_id,
        wol_work_order_id,
        new.work_order_id;
    end if;
  end if;

  if new.inspection_id is not null then
    select work_order_id, shop_id
    into i_work_order_id, i_shop_id
    from public.inspections
    where id = new.inspection_id;

    if i_shop_id is null then
      raise exception
        'content_event % references missing inspection %',
        new.id,
        new.inspection_id;
    end if;

    if new.shop_id is null then
      new.shop_id := i_shop_id;
    elsif new.shop_id <> i_shop_id then
      raise exception
        'content_event % shop_id % does not match inspection % shop_id %',
        new.id,
        new.shop_id,
        new.inspection_id,
        i_shop_id;
    end if;

    if i_work_order_id is not null then
      if new.work_order_id is null then
        new.work_order_id := i_work_order_id;
      elsif new.work_order_id <> i_work_order_id then
        raise exception
          'content_event % work_order_id % does not match inspection % work_order_id %',
          new.id,
          new.work_order_id,
          new.inspection_id,
          i_work_order_id;
      end if;
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_invoice_work_order_for_active_invoices()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.work_order_id is null
     and not public.invoice_is_historical_import(coalesce(new.metadata::jsonb, '{}'::jsonb)) then
    raise exception 'invoice % must belong to a work_order', new.id
      using errcode = '23514';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_property_inspection_signature_shop_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  inspection_shop_id uuid;
begin
  select pi.shop_id
  into inspection_shop_id
  from public.property_inspections pi
  where pi.id = new.inspection_id;

  if inspection_shop_id is null then
    raise exception 'property_inspection % not found', new.inspection_id;
  end if;

  if new.shop_id is distinct from inspection_shop_id then
    raise exception using
      message = format(
        'shop_id mismatch for property inspection signature: signature.shop_id=%s inspection.shop_id=%s',
        new.shop_id,
        inspection_shop_id
      ),
      errcode = '23514';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_supplier_quote_batch_row_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  batch_exists uuid;
begin
  select id
  into batch_exists
  from public.supplier_quote_batches
  where id = new.batch_id;

  if batch_exists is null then
    raise exception
      'supplier_quote_batch_row % references missing batch %',
      new.id,
      new.batch_id;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_work_order_line_ai_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  wo_shop_id uuid;
  wol_work_order_id uuid;
begin
  select shop_id
  into wo_shop_id
  from public.work_orders
  where id = new.work_order_id;

  if wo_shop_id is null then
    raise exception
      'work_order_line_ai % references missing work_order %',
      new.id,
      new.work_order_id;
  end if;

  if new.shop_id <> wo_shop_id then
    raise exception
      'work_order_line_ai % shop_id % does not match work_order % shop_id %',
      new.id,
      new.shop_id,
      new.work_order_id,
      wo_shop_id;
  end if;

  select work_order_id
  into wol_work_order_id
  from public.work_order_lines
  where id = new.work_order_line_id;

  if wol_work_order_id is null then
    raise exception
      'work_order_line_ai % references missing work_order_line %',
      new.id,
      new.work_order_line_id;
  end if;

  if wol_work_order_id <> new.work_order_id then
    raise exception
      'work_order_line_ai % work_order_line % belongs to work_order %, not %',
      new.id,
      new.work_order_line_id,
      wol_work_order_id,
      new.work_order_id;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fleet_fill_fleet_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_resolved uuid;
begin
  -- vehicle_id must exist for these tables; if not, fail clearly
  if new.vehicle_id is null then
    raise exception 'vehicle_id is required for %', tg_table_name
      using errcode = '23502'; -- not_null_violation style
  end if;

  v_resolved := public.resolve_fleet_id_from_vehicle(new.vehicle_id);

  -- If fleet_id not provided, populate it
  if new.fleet_id is null then
    new.fleet_id := v_resolved;
    return new;
  end if;

  -- If fleet_id provided, enforce consistency with vehicle mapping
  if new.fleet_id <> v_resolved then
    raise exception 'fleet_id mismatch for %. Provided %, resolved % from vehicle_id %',
      tg_table_name, new.fleet_id, v_resolved, new.vehicle_id
      using errcode = '23514';
  end if;

  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.fleet_inspection_schedules_set_next()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- If last_inspection_date present, compute next = last + interval_days
  if new.last_inspection_date is not null then
    new.next_inspection_date := new.last_inspection_date + make_interval(days => coalesce(new.interval_days, 365));
  elsif new.next_inspection_date is null then
    -- If no last date given and next is null, seed next from today + interval_days
    new.next_inspection_date := current_date + make_interval(days => coalesce(new.interval_days, 365));
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_work_order_assignments(p_work_order_id uuid)
 RETURNS TABLE(technician_id uuid, full_name text, role text, has_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    p.id AS technician_id,
    p.full_name,
    p.role,
    BOOL_OR(wol.punched_in_at IS NOT NULL AND wol.punched_out_at IS NULL) AS has_active
  FROM public.work_order_lines wol
  LEFT JOIN public.work_order_line_technicians wolt
    ON wolt.work_order_line_id = wol.id
  LEFT JOIN public.profiles p
    ON p.id = COALESCE(wolt.technician_id, wol.assigned_tech_id)
  WHERE wol.work_order_id = p_work_order_id
    AND public.can_view_work_order(p_work_order_id)
  GROUP BY p.id, p.full_name, p.role
  HAVING p.id IS NOT NULL;
$function$
;
CREATE OR REPLACE FUNCTION public.insert_ai_event(p_shop_id uuid, p_event_type text, p_payload jsonb, p_entity_id uuid DEFAULT NULL::uuid, p_entity_table text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_training_source text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO ai_events (
    shop_id,
    event_type,
    payload,
    entity_id,
    entity_table,
    user_id,
    training_source
  )
  VALUES (
    p_shop_id,
    p_event_type,
    p_payload,
    p_entity_id,
    p_entity_table,
    p_user_id,
    p_training_source
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.invoice_is_historical_import(p_metadata jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce((p_metadata->>'imported')::boolean, false)
     and coalesce((p_metadata->>'read_only')::boolean, false)
     and p_metadata->>'import_type' = 'invoice_csv'
$function$
;
CREATE OR REPLACE FUNCTION public.match_learned_job_templates(p_shop_id uuid, p_embedding vector, p_match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, label text, job_category text, default_labor_hours numeric, default_parts jsonb, usage_count integer, confidence_score numeric, tags jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select
    ljt.id,
    ljt.label,
    ljt.job_category,
    ljt.default_labor_hours,
    coalesce(ljt.default_parts, '[]'::jsonb),
    ljt.usage_count,
    ljt.confidence_score,
    to_jsonb(ljt.tags),
    1 - (ljt.embedding <=> p_embedding) as similarity
  from public.learned_job_templates ljt
  where ljt.shop_id = p_shop_id
    and ljt.embedding is not null
  order by ljt.embedding <=> p_embedding
  limit greatest(p_match_count, 1);
$function$
;
CREATE OR REPLACE FUNCTION public.match_work_order_intelligence(p_shop_id uuid, p_embedding vector, p_match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, complaint text, symptom text, cause text, correction text, labor_time numeric, parts jsonb, job_category text, tags jsonb, vehicle_make text, vehicle_model text, vehicle_year integer, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select
    woi.id,
    woi.complaint,
    woi.symptom,
    woi.cause,
    woi.correction,
    woi.labor_time,
    coalesce(woi.parts, '[]'::jsonb),
    woi.job_category,
    to_jsonb(woi.tags),
    woi.vehicle_make,
    woi.vehicle_model,
    woi.vehicle_year,
    1 - (woi.embedding <=> p_embedding) as similarity
  from public.work_order_intelligence woi
  where woi.shop_id = p_shop_id
    and woi.embedding is not null
  order by woi.embedding <=> p_embedding
  limit greatest(p_match_count, 1);
$function$
;
CREATE OR REPLACE FUNCTION public.menu_repair_items_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.payroll_timecards_set_hours()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only compute when both times are present
  IF NEW.clock_in IS NOT NULL AND NEW.clock_out IS NOT NULL THEN
    IF NEW.clock_out <= NEW.clock_in THEN
      RAISE EXCEPTION 'clock_out must be after clock_in';
    END IF;

    NEW.hours_worked :=
      EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.plan_user_limit(p_plan text)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select public.plan_user_limit(p_plan, null::text)
$function$
;
CREATE OR REPLACE FUNCTION public.plan_user_limit(p_plan text, p_stripe_subscription_status text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_plan text := lower(trim(coalesce(p_plan, '')));
  v_status text := lower(trim(coalesce(p_stripe_subscription_status, '')));
begin
  if v_plan in ('pro_plus', 'unlimited', 'complete_unlimited') then
    return 2147483647;
  end if;

  if v_plan in ('complete_100') then
    return 100;
  end if;

  if v_plan in ('pro', 'pro50', 'complete_50') then
    return 50;
  end if;

  if v_plan in ('starter', 'starter10', 'free', 'diy', 'complete_10') then
    return 10;
  end if;

  if v_status = 'trialing' then
    return 10;
  end if;

  return 10;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.process_ai_event_for_shopreel()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_story_source_id uuid;
  v_event_type text;
BEGIN
  v_event_type := NEW.event_type;

  -- ❌ Ignore training/internal noise
  IF v_event_type LIKE 'training.%' THEN
    RETURN NEW;
  END IF;

  -- ============================================
  -- CREATE STORY SOURCE
  -- ============================================

  INSERT INTO shopreel_story_sources (
    shop_id,
    source_type,
    source_id,
    title,
    description,
    metadata,
    created_at
  )
  VALUES (
    NEW.shop_id,
    'ai_event',
    NEW.id,
    v_event_type,
    COALESCE(NEW.payload->>'summary', v_event_type),
    NEW.payload,
    NOW()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_story_source_id;

  -- If already exists, fetch it
  IF v_story_source_id IS NULL THEN
    SELECT id INTO v_story_source_id
    FROM shopreel_story_sources
    WHERE source_type = 'ai_event'
    AND source_id = NEW.id
    LIMIT 1;
  END IF;

  -- ============================================
  -- CREATE OPPORTUNITY
  -- ============================================

  INSERT INTO shopreel_content_opportunities (
    shop_id,
    story_source_id,
    status,
    score,
    reason,
    created_at
  )
  VALUES (
    NEW.shop_id,
    v_story_source_id,
    'ready',
    CASE
      WHEN v_event_type = 'inspection.completed' THEN 90
      WHEN v_event_type = 'workorder.completed' THEN 95
      WHEN v_event_type = 'quote.suggested' THEN 75
      ELSE 60
    END,
    'Auto-generated from AI event: ' || v_event_type,
    NOW()
  )
  ON CONFLICT (shop_id, story_source_id) DO NOTHING;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.property_portal_invites_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.property_portal_invites_validate_hierarchy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_portfolio_shop_id uuid;
  v_property_shop_id uuid;
  v_unit_shop_id uuid;
  v_property_portfolio_id uuid;
  v_unit_property_id uuid;
begin
  if new.portfolio_id is not null then
    select p.shop_id
      into v_portfolio_shop_id
    from public.property_portfolios p
    where p.id = new.portfolio_id;

    if v_portfolio_shop_id is null then
      raise exception 'Invalid portfolio_id % for invite %', new.portfolio_id, new.id;
    end if;

    if v_portfolio_shop_id <> new.shop_id then
      raise exception 'shop_id mismatch: invite %, portfolio %', new.id, new.portfolio_id;
    end if;
  end if;

  if new.property_id is not null then
    select p.shop_id, p.portfolio_id
      into v_property_shop_id, v_property_portfolio_id
    from public.property_properties p
    where p.id = new.property_id;

    if v_property_shop_id is null then
      raise exception 'Invalid property_id % for invite %', new.property_id, new.id;
    end if;

    if v_property_shop_id <> new.shop_id then
      raise exception 'shop_id mismatch: invite %, property %', new.id, new.property_id;
    end if;

    if new.portfolio_id is not null and v_property_portfolio_id is distinct from new.portfolio_id then
      raise exception 'Hierarchy mismatch: property % does not belong to portfolio %', new.property_id, new.portfolio_id;
    end if;
  end if;

  if new.unit_id is not null then
    select u.shop_id, u.property_id
      into v_unit_shop_id, v_unit_property_id
    from public.property_units u
    where u.id = new.unit_id;

    if v_unit_shop_id is null then
      raise exception 'Invalid unit_id % for invite %', new.unit_id, new.id;
    end if;

    if v_unit_shop_id <> new.shop_id then
      raise exception 'shop_id mismatch: invite %, unit %', new.id, new.unit_id;
    end if;

    if new.property_id is not null and v_unit_property_id is distinct from new.property_id then
      raise exception 'Hierarchy mismatch: unit % does not belong to property %', new.unit_id, new.property_id;
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.receive_po_part_and_allocate(p_po_id uuid, p_part_id uuid, p_location_id uuid, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid;
  v_shop_id uuid;

  v_move public.stock_moves%rowtype;

  v_remaining numeric;
  v_po_closed boolean := false;

  -- allocation loop
  v_item record;
  v_item_target numeric;
  v_item_received numeric;
  v_need numeric;
  v_take numeric;

  v_alloc jsonb := '[]'::jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_po_id is null then raise exception 'p_po_id is required'; end if;
  if p_part_id is null then raise exception 'p_part_id is required'; end if;
  if p_location_id is null then raise exception 'p_location_id is required'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'p_qty must be > 0'; end if;

  -- Load PO shop
  select po.shop_id into v_shop_id
  from public.purchase_orders po
  where po.id = p_po_id;

  if v_shop_id is null then
    raise exception 'Purchase order not found';
  end if;

  -- Auth: staff in shop
  if not exists (
    select 1
    from public.profiles p
    where p.user_id = v_uid
      and p.shop_id = v_shop_id
      and p.role in ('owner','admin','manager','advisor','mechanic','parts')
  ) then
    raise exception 'Not allowed';
  end if;

  -- 1) Stock move (authoritative inventory record)
  select *
  into v_move
  from public.apply_stock_move(
    p_part => p_part_id,
    p_loc  => p_location_id,
    p_qty  => p_qty,
    p_reason => 'receive',
    p_ref_kind => 'purchase_order',
    p_ref_id => p_po_id
  );

  -- 2) Update PO lines received_qty (FIFO by created_at)
  v_remaining := p_qty;

  for v_item in
    select id, qty, received_qty
    from public.purchase_order_lines
    where po_id = p_po_id
      and part_id = p_part_id
    order by created_at asc
  loop
    exit when v_remaining <= 0;

    -- how much can this line still accept?
    v_need := greatest(coalesce(v_item.qty,0) - coalesce(v_item.received_qty,0), 0);
    v_take := least(v_remaining, v_need);

    if v_take > 0 then
      update public.purchase_order_lines
      set received_qty = coalesce(received_qty,0) + v_take
      where id = v_item.id;

      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  -- 3) Auto-close PO if fully received
  if exists (
    select 1
    from public.purchase_order_lines pol
    where pol.po_id = p_po_id
      and coalesce(pol.received_qty,0) < coalesce(pol.qty,0)
  ) then
    v_po_closed := false;
  else
    update public.purchase_orders
    set status = 'received'
    where id = p_po_id;
    v_po_closed := true;
  end if;

  -- 4) Allocate received qty to part_request_items (FIFO)
  v_remaining := p_qty;

  for v_item in
    select
      pri.id,
      pri.status,
      pri.qty,
      pri.qty_requested,
      pri.qty_approved,
      pri.qty_received
    from public.part_request_items pri
    where pri.shop_id = v_shop_id
      and pri.part_id = p_part_id
      and pri.status in ('approved','reserved','ordered','picking','picked','partially_received')
      and greatest(
            coalesce(pri.qty_approved,0),
            coalesce(pri.qty_requested,0),
            coalesce(pri.qty,0),
            0
          ) > greatest(coalesce(pri.qty_received,0),0)
    order by pri.created_at asc, pri.id asc
  loop
    exit when v_remaining <= 0;

    v_item_target :=
      greatest(
        coalesce(v_item.qty_approved,0),
        coalesce(v_item.qty_requested,0),
        coalesce(v_item.qty,0),
        0
      );

    v_item_received := greatest(coalesce(v_item.qty_received,0),0);
    v_need := greatest(v_item_target - v_item_received, 0);
    v_take := least(v_remaining, v_need);

    if v_take > 0 then
      update public.part_request_items
      set
        qty_received = v_item_received + v_take,
        status = case
          when (v_item_received + v_take) >= v_item_target then 'received'::public.part_request_item_status
          else 'partially_received'::public.part_request_item_status
        end
      where id = v_item.id;

      v_alloc := v_alloc || jsonb_build_object(
        'item_id', v_item.id,
        'delta_received', v_take
      );

      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  -- Existing triggers will:
  -- - update stock snapshot (stock_moves -> part_stock)
  -- - re-run reservation + maybe release holds (part_request_items trigger)

  return jsonb_build_object(
    'ok', true,
    'move_id', v_move.id,
    'po_id', p_po_id,
    'po_closed', v_po_closed,
    'part_id', p_part_id,
    'qty_received_total', p_qty,
    'allocations', v_alloc,
    'unallocated_qty', greatest(v_remaining,0)
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.replace_shop_hours_atomic(p_shop_id uuid, p_hours jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_role text;
  v_profile_shop_id uuid;
  v_row jsonb;
  v_day integer;
  v_open text;
  v_close text;
  v_closed boolean;
  v_has_day_of_week boolean;
  v_has_weekday boolean;
  v_has_is_closed boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select lower(coalesce(p.role, '')), p.shop_id
    into v_role, v_profile_shop_id
  from public.profiles p
  where p.id = v_uid;

  if v_profile_shop_id is null then
    raise exception 'Forbidden';
  end if;

  if v_profile_shop_id <> p_shop_id then
    raise exception 'Forbidden';
  end if;

  if v_role not in ('owner', 'admin') then
    raise exception 'Forbidden';
  end if;

  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then
    raise exception 'hours must be an array';
  end if;

  v_has_day_of_week := public.has_column('shop_hours'::regclass, 'day_of_week');
  v_has_weekday := public.has_column('shop_hours'::regclass, 'weekday');
  v_has_is_closed := public.has_column('shop_hours'::regclass, 'is_closed');

  if not v_has_day_of_week and not v_has_weekday then
    raise exception 'shop_hours weekday/day_of_week column missing';
  end if;

  delete from public.shop_hours where shop_id = p_shop_id;

  for v_row in select value from jsonb_array_elements(p_hours)
  loop
    v_day := nullif(trim(coalesce(v_row->>'day_of_week', v_row->>'weekday', '')), '')::integer;
    if v_day is null or v_day < 0 or v_day > 6 then
      raise exception 'Invalid weekday/day_of_week value';
    end if;

    v_closed := coalesce((v_row->>'is_closed')::boolean, (v_row->>'closed')::boolean, false);
    v_open := nullif(trim(coalesce(v_row->>'open_time', '')), '');
    v_close := nullif(trim(coalesce(v_row->>'close_time', '')), '');

    if v_closed then
      v_open := null;
      v_close := null;
    end if;

    if v_has_day_of_week and v_has_is_closed then
      insert into public.shop_hours (shop_id, day_of_week, open_time, close_time, is_closed)
      values (p_shop_id, v_day, v_open, v_close, v_closed);
    elsif v_has_day_of_week then
      insert into public.shop_hours (shop_id, day_of_week, open_time, close_time)
      values (p_shop_id, v_day, coalesce(v_open, '00:00'), coalesce(v_close, '00:00'));
    elsif v_has_is_closed then
      insert into public.shop_hours (shop_id, weekday, open_time, close_time, is_closed)
      values (p_shop_id, v_day, v_open, v_close, v_closed);
    else
      insert into public.shop_hours (shop_id, weekday, open_time, close_time)
      values (p_shop_id, v_day, coalesce(v_open, '00:00'), coalesce(v_close, '00:00'));
    end if;
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_part_request_status(p_request uuid, p_status part_request_status)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.part_requests
  set status = p_status
  where id = p_request
    and shop_id = public.current_shop_id();
$function$
;
CREATE OR REPLACE FUNCTION public.set_quickbooks_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_shop_maintenance_service_map_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at_now()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at_shopreel_event_deliveries()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at_shopreel_integrations()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_user_theme_preferences_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_work_order_line_dtc_threads_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.shopreel_manual_assets_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.start_canonical_shift(p_shop_id uuid, p_user_id uuid, p_profile_id uuid, p_timestamp timestamp with time zone DEFAULT now())
 RETURNS TABLE(id uuid, start_time timestamp with time zone, status text, end_time timestamp with time zone, shop_id uuid, user_id uuid, inserted_events jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_shift public.tech_shifts%rowtype;
  v_event public.punch_events%rowtype;
begin
  if exists (
    select 1
    from public.tech_shifts ts
    where ts.shop_id = p_shop_id
      and ts.user_id = p_user_id
      and ts.status = 'active'
      and ts.end_time is null
  ) then
    raise exception 'Active shift already exists for this shop/user'
      using errcode = '23505';
  end if;

  insert into public.tech_shifts (shop_id, user_id, status, type, start_time, end_time)
  values (p_shop_id, p_user_id, 'active', 'shift', p_timestamp, null)
  returning * into v_shift;

  insert into public.punch_events (shift_id, user_id, profile_id, event_type, timestamp)
  values (v_shift.id, p_user_id, p_profile_id, 'start_shift', p_timestamp)
  returning * into v_event;

  return query
  select
    v_shift.id,
    v_shift.start_time,
    v_shift.status,
    v_shift.end_time,
    v_shift.shop_id,
    v_shift.user_id,
    jsonb_build_array(jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'timestamp', v_event.timestamp,
      'created_at', v_event.created_at
    ));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_shop_brand_logo_to_profile()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.is_active = true and new.kind = 'logo' then
    insert into public.shop_brand_profiles (shop_id, logo_asset_id, updated_at)
    values (new.shop_id, new.id, now())
    on conflict (shop_id)
    do update set
      logo_asset_id = excluded.logo_asset_id,
      updated_at = now();

    update public.shops
    set logo_url = coalesce(new.file_url, logo_url),
        updated_at = now()
    where id = new.shop_id;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_shop_user_limit_from_billing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.user_limit := public.plan_user_limit(new.plan, new.stripe_subscription_status);
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_pricing_snapshot_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.valid_until is not null and new.valid_until < now() then
    new.status := 'expired';
  elsif new.valid_until is not null and new.valid_until < now() + interval '3 days' then
    new.status := 'stale';
  else
    new.status := 'fresh';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_assets_tenant_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  parent_shop_id uuid;
  unit_record record;
begin
  select pp.shop_id into parent_shop_id
  from public.property_properties pp
  where pp.id = new.property_id;

  if parent_shop_id is null or parent_shop_id <> new.shop_id then
    raise exception 'property_assets.shop_id must match property_properties.shop_id'
      using errcode = '23514';
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id into unit_record
    from public.property_units pu
    where pu.id = new.unit_id;

    if unit_record.shop_id is null
      or unit_record.shop_id <> new.shop_id
      or unit_record.property_id <> new.property_id then
      raise exception 'property_assets unit_id must belong to the same shop_id and property_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_inspections_tenant_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  parent_shop_id uuid;
  unit_record record;
begin
  select pp.shop_id into parent_shop_id
  from public.property_properties pp
  where pp.id = new.property_id;

  if parent_shop_id is null or parent_shop_id <> new.shop_id then
    raise exception 'property_inspections.shop_id must match property_properties.shop_id'
      using errcode = '23514';
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id into unit_record
    from public.property_units pu
    where pu.id = new.unit_id;

    if unit_record.shop_id is null
      or unit_record.shop_id <> new.shop_id
      or unit_record.property_id <> new.property_id then
      raise exception 'property_inspections unit_id must belong to the same shop_id and property_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_maintenance_requests_tenant_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  parent_shop_id uuid;
  unit_record record;
  asset_record record;
  work_order_shop_id uuid;
begin
  select pp.shop_id into parent_shop_id
  from public.property_properties pp
  where pp.id = new.property_id;

  if parent_shop_id is null or parent_shop_id <> new.shop_id then
    raise exception 'property_maintenance_requests.shop_id must match property_properties.shop_id'
      using errcode = '23514';
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id into unit_record
    from public.property_units pu
    where pu.id = new.unit_id;

    if unit_record.shop_id is null
      or unit_record.shop_id <> new.shop_id
      or unit_record.property_id <> new.property_id then
      raise exception 'property_maintenance_requests unit_id must belong to the same shop_id and property_id'
        using errcode = '23514';
    end if;
  end if;

  if new.asset_id is not null then
    select pa.shop_id, pa.property_id, pa.unit_id into asset_record
    from public.property_assets pa
    where pa.id = new.asset_id;

    if asset_record.shop_id is null
      or asset_record.shop_id <> new.shop_id
      or asset_record.property_id <> new.property_id
      or (asset_record.unit_id is not null and asset_record.unit_id is distinct from new.unit_id) then
      raise exception 'property_maintenance_requests asset_id must belong to the same shop_id, property_id, and unit_id scope'
        using errcode = '23514';
    end if;
  end if;

  if new.work_order_id is not null then
    select wo.shop_id into work_order_shop_id
    from public.work_orders wo
    where wo.id = new.work_order_id;

    if work_order_shop_id is null or work_order_shop_id <> new.shop_id then
      raise exception 'property_maintenance_requests.shop_id must match work_orders.shop_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_members_tenant_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  portfolio_shop_id uuid;
  property_record record;
  unit_record record;
begin
  if new.portfolio_id is not null then
    select pp.shop_id into portfolio_shop_id
    from public.property_portfolios pp
    where pp.id = new.portfolio_id;

    if portfolio_shop_id is null or portfolio_shop_id <> new.shop_id then
      raise exception 'property_members.shop_id must match property_portfolios.shop_id'
        using errcode = '23514';
    end if;
  end if;

  if new.property_id is not null then
    select pp.shop_id, pp.portfolio_id into property_record
    from public.property_properties pp
    where pp.id = new.property_id;

    if property_record.shop_id is null or property_record.shop_id <> new.shop_id then
      raise exception 'property_members.shop_id must match property_properties.shop_id'
        using errcode = '23514';
    end if;

    if new.portfolio_id is not null and property_record.portfolio_id is distinct from new.portfolio_id then
      raise exception 'property_members.property_id must belong to portfolio_id when both are present'
        using errcode = '23514';
    end if;
  end if;

  if new.unit_id is not null then
    select pu.shop_id, pu.property_id into unit_record
    from public.property_units pu
    where pu.id = new.unit_id;

    if unit_record.shop_id is null or unit_record.shop_id <> new.shop_id then
      raise exception 'property_members.shop_id must match property_units.shop_id'
        using errcode = '23514';
    end if;

    if new.property_id is not null and unit_record.property_id <> new.property_id then
      raise exception 'property_members.unit_id must belong to property_id when both are present'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_properties_tenant_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  parent_shop_id uuid;
begin
  if new.portfolio_id is not null then
    select pp.shop_id into parent_shop_id
    from public.property_portfolios pp
    where pp.id = new.portfolio_id;

    if parent_shop_id is null or parent_shop_id <> new.shop_id then
      raise exception 'property_properties.shop_id must match property_portfolios.shop_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_request_attachment_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  request_shop_id uuid;
  event_request_id uuid;
  event_shop_id uuid;
begin
  select pmr.shop_id into request_shop_id
  from public.property_maintenance_requests pmr
  where pmr.id = new.request_id;

  if request_shop_id is null then
    raise exception 'property_maintenance_request % not found', new.request_id;
  end if;

  if request_shop_id <> new.shop_id then
    raise exception 'property_request_attachments.shop_id must match property_maintenance_requests.shop_id';
  end if;

  if new.event_id is not null then
    select e.request_id, e.shop_id
      into event_request_id, event_shop_id
    from public.property_request_events e
    where e.id = new.event_id;

    if event_request_id is null then
      raise exception 'property_request_event % not found', new.event_id;
    end if;

    if event_request_id <> new.request_id or event_shop_id <> new.shop_id then
      raise exception 'property_request_attachments.event_id must match request_id and shop_id';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_request_event_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  request_shop_id uuid;
begin
  select pmr.shop_id into request_shop_id
  from public.property_maintenance_requests pmr
  where pmr.id = new.request_id;

  if request_shop_id is null then
    raise exception 'property_maintenance_request % not found', new.request_id;
  end if;

  if request_shop_id <> new.shop_id then
    raise exception 'property_request_events.shop_id must match property_maintenance_requests.shop_id';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_units_tenant_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  parent_shop_id uuid;
begin
  select pp.shop_id into parent_shop_id
  from public.property_properties pp
  where pp.id = new.property_id;

  if parent_shop_id is null or parent_shop_id <> new.shop_id then
    raise exception 'property_units.shop_id must match property_properties.shop_id'
      using errcode = '23514';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_property_vendor_assignments_tenant_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  request_shop_id uuid;
  work_order_shop_id uuid;
  vendor_shop_id uuid;
begin
  select pv.shop_id into vendor_shop_id
  from public.property_vendors pv
  where pv.id = new.vendor_id;

  if vendor_shop_id is null or vendor_shop_id <> new.shop_id then
    raise exception 'property_vendor_assignments.shop_id must match property_vendors.shop_id'
      using errcode = '23514';
  end if;

  if new.request_id is not null then
    select pmr.shop_id into request_shop_id
    from public.property_maintenance_requests pmr
    where pmr.id = new.request_id;

    if request_shop_id is null or request_shop_id <> new.shop_id then
      raise exception 'property_vendor_assignments.shop_id must match property_maintenance_requests.shop_id'
        using errcode = '23514';
    end if;
  end if;

  if new.work_order_id is not null then
    select wo.shop_id into work_order_shop_id
    from public.work_orders wo
    where wo.id = new.work_order_id;

    if work_order_shop_id is null or work_order_shop_id <> new.shop_id then
      raise exception 'property_vendor_assignments.shop_id must match work_orders.shop_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wo_release_parts_holds_for_part(p_part_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_shop uuid;
  v_released int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select p.shop_id into v_shop
  from public.profiles p
  where p.id = v_uid;

  if v_shop is null then
    raise exception 'No shop profile';
  end if;

  with target_lines as (
    select distinct wl.id
    from public.work_order_lines wl
    join public.work_orders wo on wo.id = wl.work_order_id
    join public.work_order_part_allocations a on a.work_order_line_id = wl.id
    where wo.shop_id = v_shop
      and wl.status = 'on_hold'
      and lower(coalesce(wl.hold_reason,'')) in ('awaiting_parts','awaiting parts')
      and a.part_id = p_part_id
  )
  update public.work_order_lines wl
  set
    status = 'awaiting',
    on_hold_since = null,
    hold_reason = null,
    updated_at = now()
  from target_lines t
  where wl.id = t.id;

  get diagnostics v_released = row_count;
  return v_released;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wor_enforce_shop_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  wo_shop_id uuid;
begin
  select shop_id into wo_shop_id from public.work_orders where id = NEW.work_order_id;
  if wo_shop_id is null then
    raise exception 'work_order_id % does not exist', NEW.work_order_id;
  end if;

  if NEW.shop_id is distinct from wo_shop_id then
    raise exception 'shop_id % does not match work order % shop_id %',
      NEW.shop_id, NEW.work_order_id, wo_shop_id;
  end if;

  return NEW;
end;
$function$
;

-- Remove implicit PUBLIC execution before granting only known callers.
REVOKE ALL ON FUNCTION public.accept_property_portal_invite(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_repair_line_from_vehicle_service(uuid,integer,text,text,text,text,numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agent_approve_action(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agent_reject_action(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ai_generate_training_row() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clear_other_active_brand_assets() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_canonical_shift(uuid,uuid,uuid,uuid,timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.compute_timecard_hours() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_ai_suggestion_feedback_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_assistant_daily_summary_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_content_asset_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_content_event_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_invoice_work_order_for_active_invoices() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_property_inspection_signature_shop_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_supplier_quote_batch_row_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_work_order_line_ai_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_fill_fleet_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fleet_inspection_schedules_set_next() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_work_order_assignments(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invoice_is_historical_import(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_learned_job_templates(uuid,vector,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_work_order_intelligence(uuid,vector,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.menu_repair_items_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.payroll_timecards_set_hours() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.plan_user_limit(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.plan_user_limit(text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_ai_event_for_shopreel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.property_portal_invites_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.property_portal_invites_validate_hierarchy() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_shop_hours_atomic(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_part_request_status(uuid,part_request_status) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_quickbooks_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_shop_maintenance_service_map_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at_now() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at_shopreel_event_deliveries() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at_shopreel_integrations() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at_timestamp() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_user_theme_preferences_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_work_order_line_dtc_threads_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.shopreel_manual_assets_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_canonical_shift(uuid,uuid,uuid,timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_shop_brand_logo_to_profile() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_shop_user_limit_from_billing() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_pricing_snapshot_status() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_assets_tenant_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_inspections_tenant_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_maintenance_requests_tenant_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_members_tenant_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_properties_tenant_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_request_attachment_scope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_request_event_scope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_units_tenant_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_property_vendor_assignments_tenant_consistency() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wo_release_parts_holds_for_part(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.wor_enforce_shop_consistency() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.accept_property_portal_invite(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_repair_line_from_vehicle_service(uuid,integer,text,text,text,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_approve_action(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_reject_action(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_generate_training_row() TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_other_active_brand_assets() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_canonical_shift(uuid,uuid,uuid,uuid,timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_timecard_hours() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_ai_suggestion_feedback_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_assistant_daily_summary_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_content_asset_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_content_event_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_invoice_work_order_for_active_invoices() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_property_inspection_signature_shop_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_supplier_quote_batch_row_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_work_order_line_ai_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_fill_fleet_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_inspection_schedules_set_next() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_assignments(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_is_historical_import(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_learned_job_templates(uuid,vector,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_work_order_intelligence(uuid,vector,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.menu_repair_items_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.payroll_timecards_set_hours() TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_user_limit(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_user_limit(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_ai_event_for_shopreel() TO service_role;
GRANT EXECUTE ON FUNCTION public.property_portal_invites_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.property_portal_invites_validate_hierarchy() TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_shop_hours_atomic(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_part_request_status(uuid,part_request_status) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_quickbooks_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_shop_maintenance_service_map_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at_now() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at_shopreel_event_deliveries() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at_shopreel_integrations() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at_timestamp() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_theme_preferences_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_work_order_line_dtc_threads_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.shopreel_manual_assets_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.start_canonical_shift(uuid,uuid,uuid,timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_shop_brand_logo_to_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_shop_user_limit_from_billing() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_pricing_snapshot_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_assets_tenant_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_inspections_tenant_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_maintenance_requests_tenant_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_members_tenant_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_properties_tenant_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_request_attachment_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_request_event_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_units_tenant_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_property_vendor_assignments_tenant_consistency() TO service_role;
GRANT EXECUTE ON FUNCTION public.wo_release_parts_holds_for_part(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wor_enforce_shop_consistency() TO service_role;

GRANT EXECUTE ON FUNCTION public.accept_property_portal_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_repair_line_from_vehicle_service(uuid,integer,text,text,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_approve_action(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_reject_action(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_work_order_assignments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_learned_job_templates(uuid,vector,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_work_order_intelligence(uuid,vector,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_shop_hours_atomic(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_part_request_status(uuid,part_request_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wo_release_parts_holds_for_part(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.v_menu_repair_item_match_stats
WITH (security_invoker = true)
AS
SELECT f.shop_id,
    f.menu_repair_item_id,
    count(*) FILTER (WHERE f.action = 'accepted'::text) AS accepted_count,
    count(*) FILTER (WHERE f.action = 'dismissed'::text) AS dismissed_count,
    count(*) AS feedback_count,
        CASE
            WHEN count(*) = 0 THEN 0::numeric
            ELSE round(count(*) FILTER (WHERE f.action = 'accepted'::text)::numeric / count(*)::numeric, 4)
        END AS acceptance_rate
   FROM inspection_smart_match_feedback f
  WHERE f.menu_repair_item_id IS NOT NULL
  GROUP BY f.shop_id, f.menu_repair_item_id;
CREATE OR REPLACE VIEW public.v_portal_invoices
WITH (security_invoker = true)
AS
SELECT wo.id AS work_order_id,
    wo.shop_id,
    wo.customer_id,
    wo.vehicle_id,
    wo.status,
    wo.approval_state,
    wo.invoice_total,
    wo.invoice_url,
    wo.invoice_pdf_url,
    wo.invoice_sent_at,
    wo.invoice_last_sent_to,
    wo.created_at,
    wo.updated_at
   FROM work_orders wo
  WHERE wo.invoice_sent_at IS NOT NULL OR wo.invoice_pdf_url IS NOT NULL OR wo.invoice_url IS NOT NULL OR (wo.status = ANY (ARRAY['ready_to_invoice'::text, 'invoiced'::text]));
CREATE OR REPLACE VIEW public.v_shop_boost_overview
WITH (security_invoker = true, security_barrier = true)
AS
WITH latest_snapshot_by_intake AS (
         SELECT DISTINCT ON (shop_health_snapshots.intake_id) shop_health_snapshots.id AS snapshot_id,
            shop_health_snapshots.shop_id,
            shop_health_snapshots.intake_id,
            shop_health_snapshots.scores,
            shop_health_snapshots.metrics,
            shop_health_snapshots.created_at
           FROM shop_health_snapshots
          ORDER BY shop_health_snapshots.intake_id, shop_health_snapshots.created_at DESC
        ), file_counts AS (
         SELECT shop_import_files.intake_id,
            count(*)::integer AS file_count
           FROM shop_import_files
          GROUP BY shop_import_files.intake_id
        ), row_counts AS (
         SELECT shop_import_rows.intake_id,
            count(*)::integer AS row_count
           FROM shop_import_rows
          GROUP BY shop_import_rows.intake_id
        )
 SELECT i.id AS intake_id,
    i.shop_id,
    i.status AS intake_status,
    i.source AS intake_source,
    i.created_at AS intake_created_at,
    i.processed_at AS intake_processed_at,
    COALESCE(fc.file_count, 0) AS import_file_count,
    COALESCE(rc.row_count, 0) AS import_row_count,
    ls.snapshot_id AS latest_snapshot_id,
    ls.created_at AS latest_snapshot_created_at,
    ls.scores AS latest_scores,
    ls.metrics AS latest_metrics
   FROM shop_boost_intakes i
     LEFT JOIN file_counts fc ON fc.intake_id = i.id
     LEFT JOIN row_counts rc ON rc.intake_id = i.id
     LEFT JOIN latest_snapshot_by_intake ls ON ls.intake_id = i.id;
CREATE OR REPLACE VIEW public.v_shop_boost_suggestions
WITH (security_invoker = true)
AS
SELECT 'menu_item'::text AS suggestion_type,
    mis.id,
    mis.shop_id,
    mis.intake_id,
    COALESCE(mis.title, 'Untitled'::text) AS name,
    mis.category,
    mis.price_suggestion,
    mis.labor_hours_suggestion,
    mis.confidence,
    mis.reason,
    mis.created_at
   FROM menu_item_suggestions mis
UNION ALL
 SELECT 'inspection_template'::text AS suggestion_type,
    its.id,
    its.shop_id,
    its.intake_id,
    COALESCE(its.name, 'Untitled'::text) AS name,
    its.applies_to AS category,
    NULL::numeric AS price_suggestion,
    NULL::numeric AS labor_hours_suggestion,
    its.confidence,
    NULL::text AS reason,
    its.created_at
   FROM inspection_template_suggestions its
UNION ALL
 SELECT 'staff_invite'::text AS suggestion_type,
    sis.id,
    sis.shop_id,
    sis.intake_id,
    COALESCE(sis.full_name, sis.email, sis.role, 'Staff'::text) AS name,
    sis.role AS category,
    NULL::numeric AS price_suggestion,
    NULL::numeric AS labor_hours_suggestion,
    0::numeric AS confidence,
    COALESCE(sis.notes, ''::text) AS reason,
    sis.created_at
   FROM staff_invite_suggestions sis;
CREATE OR REPLACE VIEW public.v_shop_health_latest
WITH (security_invoker = true, security_barrier = true)
AS
SELECT DISTINCT ON (shop_health_snapshots.shop_id) shop_health_snapshots.id AS snapshot_id,
    shop_health_snapshots.shop_id,
    shop_health_snapshots.intake_id,
    shop_health_snapshots.period_start,
    shop_health_snapshots.period_end,
    shop_health_snapshots.metrics,
    shop_health_snapshots.scores,
    shop_health_snapshots.narrative_summary,
    shop_health_snapshots.created_at AS snapshot_created_at
   FROM shop_health_snapshots
  ORDER BY shop_health_snapshots.shop_id, shop_health_snapshots.created_at DESC;
CREATE OR REPLACE VIEW public.v_staff_invites_common
WITH (security_invoker = true)
AS
SELECT 'candidate'::text AS source_type,
    c.id,
    c.shop_id,
    c.intake_id,
    COALESCE(c.full_name, c.email, c.username, c.role::text, 'Staff'::text) AS name,
    c.full_name,
    c.email,
    c.phone,
    c.username,
    c.role::text AS role,
    c.notes,
    c.status,
    c.confidence,
    c.created_at
   FROM staff_invite_candidates c
UNION ALL
 SELECT 'suggestion'::text AS source_type,
    s.id,
    s.shop_id,
    s.intake_id,
    COALESCE(s.full_name, s.email, s.role, 'Staff'::text) AS name,
    s.full_name,
    s.email,
    NULL::text AS phone,
    NULL::text AS username,
    s.role,
    s.notes,
    NULL::text AS status,
    NULL::numeric AS confidence,
    s.created_at
   FROM staff_invite_suggestions s
  WHERE NOT (EXISTS ( SELECT 1
           FROM staff_invite_candidates c
          WHERE c.shop_id = s.shop_id AND c.intake_id = s.intake_id));
CREATE OR REPLACE VIEW public.v_work_order_board_cards_shop
WITH (security_invoker = true)
AS
WITH line_rollup AS (
         SELECT wol.work_order_id,
            count(*) FILTER (WHERE wol.voided_at IS NULL) AS jobs_total,
            count(*) FILTER (WHERE wol.voided_at IS NULL AND COALESCE(wol.status, ''::text) = 'completed'::text) AS jobs_completed,
            count(*) FILTER (WHERE wol.voided_at IS NULL AND COALESCE(wol.status, ''::text) <> 'completed'::text) AS jobs_open,
            count(*) FILTER (WHERE wol.voided_at IS NULL AND (COALESCE(wol.status, ''::text) = ANY (ARRAY['on_hold'::text, 'awaiting_approval'::text]))) AS jobs_blocked,
            bool_or(wol.voided_at IS NULL AND COALESCE(wol.status, ''::text) = 'on_hold'::text) AS any_on_hold,
            bool_or(wol.voided_at IS NULL AND COALESCE(wol.status, ''::text) = 'awaiting_approval'::text) AS any_awaiting_approval,
            bool_or(wol.voided_at IS NULL AND COALESCE(wol.status, ''::text) = 'in_progress'::text) AS any_in_progress,
            bool_or(wol.voided_at IS NULL AND (COALESCE(wol.status, ''::text) = ANY (ARRAY['awaiting'::text, 'queued'::text]))) AS any_awaiting_or_queued
           FROM work_order_lines wol
          GROUP BY wol.work_order_id
        ), parts_rollup AS (
         SELECT wol.work_order_id,
            count(*) FILTER (WHERE COALESCE(pri.status::text, ''::text) = 'requested'::text OR COALESCE(pri.qty_received, 0::numeric) < COALESCE(pri.qty_approved, 0::numeric)) AS parts_blocker_count,
            bool_or(COALESCE(pri.status::text, ''::text) = 'requested'::text OR COALESCE(pri.qty_received, 0::numeric) < COALESCE(pri.qty_approved, 0::numeric)) AS has_waiting_parts
           FROM part_request_items pri
             JOIN work_order_lines wol ON wol.id = pri.work_order_line_id
          WHERE wol.voided_at IS NULL
          GROUP BY wol.work_order_id
        ), tech_rollup AS (
         SELECT wol.work_order_id,
            count(DISTINCT wolt.technician_id) AS assigned_tech_count,
            min(NULLIF(p.full_name, ''::text)) AS first_tech_name,
            array_remove(array_agg(DISTINCT NULLIF(p.full_name, ''::text)), NULL::text) AS tech_names
           FROM work_order_line_technicians wolt
             JOIN work_order_lines wol ON wol.id = wolt.work_order_line_id
             LEFT JOIN profiles p ON p.id = wolt.technician_id
          WHERE wol.voided_at IS NULL
          GROUP BY wol.work_order_id
        )
 SELECT w.id AS work_order_id,
    w.custom_id,
    w.shop_id,
    w.customer_id,
    w.vehicle_id,
    COALESCE(NULLIF(c.business_name, ''::text), NULLIF(c.name, ''::text), NULLIF(TRIM(BOTH FROM (COALESCE(c.first_name, ''::text) || ' '::text) || COALESCE(c.last_name, ''::text)), ''::text), 'Customer'::text) AS display_name,
    NULLIF(v.unit_number, ''::text) AS unit_label,
    NULLIF(TRIM(BOTH FROM concat_ws(' '::text, v.year::text, v.make, v.model)), ''::text) AS vehicle_label,
    COALESCE(lr.jobs_total, 0::bigint)::integer AS jobs_total,
    COALESCE(lr.jobs_completed, 0::bigint)::integer AS jobs_completed,
        CASE
            WHEN COALESCE(lr.jobs_total, 0::bigint) = 0 THEN 0::numeric
            ELSE round(COALESCE(lr.jobs_completed, 0::bigint)::numeric / NULLIF(lr.jobs_total, 0)::numeric * 100::numeric)
        END::integer AS progress_pct,
    COALESCE(pr.parts_blocker_count, 0::bigint)::integer AS parts_blocker_count,
    COALESCE(pr.has_waiting_parts, false) AS has_waiting_parts,
    COALESCE(tr.assigned_tech_count, 0::bigint)::integer AS assigned_tech_count,
        CASE
            WHEN COALESCE(tr.assigned_tech_count, 0::bigint) = 0 THEN 'Unassigned'::text
            WHEN COALESCE(tr.assigned_tech_count, 0::bigint) = 1 THEN COALESCE(tr.first_tech_name, 'Assigned'::text)
            ELSE (COALESCE(tr.first_tech_name, 'Assigned'::text) || ' +'::text) || ((tr.assigned_tech_count - 1)::text)
        END AS assigned_summary,
        CASE
            WHEN COALESCE(lr.jobs_total, 0::bigint) > 0 AND COALESCE(lr.jobs_completed, 0::bigint) = COALESCE(lr.jobs_total, 0::bigint) THEN 'completed'::text
            WHEN COALESCE(lr.any_on_hold, false) THEN 'on_hold'::text
            WHEN COALESCE(pr.has_waiting_parts, false) THEN 'waiting_parts'::text
            WHEN COALESCE(lr.any_awaiting_approval, false) OR (COALESCE(w.approval_state, ''::text) = ANY (ARRAY['awaiting_approval'::text, 'pending'::text, 'sent'::text])) THEN 'awaiting_approval'::text
            WHEN COALESCE(lr.any_in_progress, false) THEN 'in_progress'::text
            WHEN COALESCE(lr.any_awaiting_or_queued, false) THEN 'awaiting'::text
            WHEN COALESCE(lr.jobs_total, 0::bigint) = 0 THEN 'empty'::text
            ELSE 'awaiting'::text
        END AS overall_stage,
        CASE
            WHEN COALESCE(pr.has_waiting_parts, false) AND COALESCE(w.updated_at, w.created_at) < (now() - '48:00:00'::interval) THEN 'danger'::text
            WHEN (COALESCE(lr.any_on_hold, false) OR COALESCE(pr.has_waiting_parts, false) OR COALESCE(lr.any_awaiting_approval, false)) AND COALESCE(w.updated_at, w.created_at) < (now() - '24:00:00'::interval) THEN 'warn'::text
            ELSE 'none'::text
        END AS risk_level,
        CASE
            WHEN COALESCE(pr.has_waiting_parts, false) AND COALESCE(w.updated_at, w.created_at) < (now() - '48:00:00'::interval) THEN 'Waiting on parts too long'::text
            WHEN COALESCE(lr.any_on_hold, false) AND COALESCE(w.updated_at, w.created_at) < (now() - '24:00:00'::interval) THEN 'On hold too long'::text
            WHEN COALESCE(lr.any_awaiting_approval, false) AND COALESCE(w.updated_at, w.created_at) < (now() - '24:00:00'::interval) THEN 'Approval pending too long'::text
            ELSE NULL::text
        END AS risk_reason,
    GREATEST(0::numeric, EXTRACT(epoch FROM now() - COALESCE(w.updated_at, w.created_at)))::bigint AS time_in_stage_seconds,
    COALESCE(w.updated_at, w.created_at) AS activity_at,
    NULL::text AS portal_stage_label,
    NULL::text AS portal_status_note,
    NULL::text AS fleet_stage_label,
    w.priority,
    COALESCE(w.is_waiter, false) AS is_waiter,
    w.advisor_id,
    NULLIF(ap.full_name, ''::text) AS advisor_name,
    tr.first_tech_name,
    tr.tech_names,
    COALESCE(lr.jobs_open, 0::bigint)::integer AS jobs_open,
    COALESCE(lr.jobs_blocked, 0::bigint)::integer AS jobs_blocked,
        CASE
            WHEN COALESCE(pr.has_waiting_parts, false) THEN COALESCE(pr.parts_blocker_count, 0::bigint)::integer
            ELSE 0
        END AS jobs_waiting_parts
   FROM work_orders w
     LEFT JOIN line_rollup lr ON lr.work_order_id = w.id
     LEFT JOIN parts_rollup pr ON pr.work_order_id = w.id
     LEFT JOIN tech_rollup tr ON tr.work_order_id = w.id
     LEFT JOIN customers c ON c.id = w.customer_id
     LEFT JOIN vehicles v ON v.id = w.vehicle_id
     LEFT JOIN profiles ap ON ap.id = w.advisor_id;

DO $p0_008$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('agent_actions', 'set_agent_actions_updated_at', 'CREATE TRIGGER set_agent_actions_updated_at BEFORE UPDATE ON agent_actions FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at()'),
      ('agent_jobs', 'set_agent_jobs_updated_at', 'CREATE TRIGGER set_agent_jobs_updated_at BEFORE UPDATE ON agent_jobs FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at()'),
      ('agent_jobs', 'trg_agent_jobs_updated_at', 'CREATE TRIGGER trg_agent_jobs_updated_at BEFORE UPDATE ON agent_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('agent_requests', 'trg_agent_requests_updated_at', 'CREATE TRIGGER trg_agent_requests_updated_at BEFORE UPDATE ON agent_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('ai_action_previews', 'trg_ai_action_previews_updated_at', 'CREATE TRIGGER trg_ai_action_previews_updated_at BEFORE UPDATE ON ai_action_previews FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('ai_events', 'ai_event_to_training', 'CREATE TRIGGER ai_event_to_training AFTER INSERT ON ai_events FOR EACH ROW EXECUTE FUNCTION ai_generate_training_row()'),
      ('ai_events', 'trg_ai_events_to_shopreel', 'CREATE TRIGGER trg_ai_events_to_shopreel AFTER INSERT ON ai_events FOR EACH ROW EXECUTE FUNCTION process_ai_event_for_shopreel()'),
      ('ai_recommendations', 'trg_ai_recommendations_updated_at', 'CREATE TRIGGER trg_ai_recommendations_updated_at BEFORE UPDATE ON ai_recommendations FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('ai_suggestion_feedback', 'trg_enforce_ai_suggestion_feedback_consistency', 'CREATE TRIGGER trg_enforce_ai_suggestion_feedback_consistency BEFORE INSERT OR UPDATE OF shop_id, work_order_id, work_order_line_id ON ai_suggestion_feedback FOR EACH ROW EXECUTE FUNCTION enforce_ai_suggestion_feedback_consistency()'),
      ('assets', 'trg_assets_updated_at', 'CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('assistant_daily_summaries', 'trg_enforce_assistant_daily_summary_consistency', 'CREATE TRIGGER trg_enforce_assistant_daily_summary_consistency BEFORE INSERT OR UPDATE OF shop_id, user_id ON assistant_daily_summaries FOR EACH ROW EXECUTE FUNCTION enforce_assistant_daily_summary_consistency()'),
      ('content_assets', 'trg_content_assets_updated_at', 'CREATE TRIGGER trg_content_assets_updated_at BEFORE UPDATE ON content_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('content_assets', 'trg_enforce_content_asset_consistency', 'CREATE TRIGGER trg_enforce_content_asset_consistency BEFORE INSERT OR UPDATE OF shop_id, content_event_id ON content_assets FOR EACH ROW EXECUTE FUNCTION enforce_content_asset_consistency()'),
      ('content_assets', 'trg_touch_content_assets_updated_at', 'CREATE TRIGGER trg_touch_content_assets_updated_at BEFORE UPDATE ON content_assets FOR EACH ROW EXECUTE FUNCTION touch_updated_at()'),
      ('content_events', 'trg_content_events_updated_at', 'CREATE TRIGGER trg_content_events_updated_at BEFORE UPDATE ON content_events FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('content_events', 'trg_enforce_content_event_consistency', 'CREATE TRIGGER trg_enforce_content_event_consistency BEFORE INSERT OR UPDATE OF shop_id, work_order_id, work_order_line_id, inspection_id ON content_events FOR EACH ROW EXECUTE FUNCTION enforce_content_event_consistency()'),
      ('content_events', 'trg_touch_content_events_updated_at', 'CREATE TRIGGER trg_touch_content_events_updated_at BEFORE UPDATE ON content_events FOR EACH ROW EXECUTE FUNCTION touch_updated_at()'),
      ('content_pieces', 'trg_content_pieces_updated_at', 'CREATE TRIGGER trg_content_pieces_updated_at BEFORE UPDATE ON content_pieces FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('content_platform_accounts', 'trg_content_platform_accounts_updated_at', 'CREATE TRIGGER trg_content_platform_accounts_updated_at BEFORE UPDATE ON content_platform_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('content_publications', 'trg_content_publications_updated_at', 'CREATE TRIGGER trg_content_publications_updated_at BEFORE UPDATE ON content_publications FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('content_templates', 'trg_content_templates_updated_at', 'CREATE TRIGGER trg_content_templates_updated_at BEFORE UPDATE ON content_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('dashboard_layouts', 'trg_dashboard_layouts_updated_at', 'CREATE TRIGGER trg_dashboard_layouts_updated_at BEFORE UPDATE ON dashboard_layouts FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('fleet_dispatch_assignments', 'trg_fleet_dispatch_assignments_fill_fleet_id', 'CREATE TRIGGER trg_fleet_dispatch_assignments_fill_fleet_id BEFORE INSERT OR UPDATE OF vehicle_id, fleet_id ON fleet_dispatch_assignments FOR EACH ROW EXECUTE FUNCTION fleet_fill_fleet_id()'),
      ('fleet_dispatch_assignments', 'trg_fleet_dispatch_assignments_set_updated_at', 'CREATE TRIGGER trg_fleet_dispatch_assignments_set_updated_at BEFORE UPDATE ON fleet_dispatch_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('fleet_inspection_schedules', 'trg_fleet_inspection_schedules_fill_fleet_id', 'CREATE TRIGGER trg_fleet_inspection_schedules_fill_fleet_id BEFORE INSERT OR UPDATE OF vehicle_id, fleet_id ON fleet_inspection_schedules FOR EACH ROW EXECUTE FUNCTION fleet_fill_fleet_id()'),
      ('fleet_inspection_schedules', 'trg_fleet_inspection_schedules_set_next', 'CREATE TRIGGER trg_fleet_inspection_schedules_set_next BEFORE INSERT OR UPDATE OF last_inspection_date, interval_days, next_inspection_date ON fleet_inspection_schedules FOR EACH ROW EXECUTE FUNCTION fleet_inspection_schedules_set_next()'),
      ('fleet_inspection_schedules', 'trg_fleet_inspection_schedules_set_updated_at', 'CREATE TRIGGER trg_fleet_inspection_schedules_set_updated_at BEFORE UPDATE ON fleet_inspection_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('fleet_pretrip_reports', 'trg_fleet_pretrip_reports_fill_fleet_id', 'CREATE TRIGGER trg_fleet_pretrip_reports_fill_fleet_id BEFORE INSERT OR UPDATE OF vehicle_id, fleet_id ON fleet_pretrip_reports FOR EACH ROW EXECUTE FUNCTION fleet_fill_fleet_id()'),
      ('fleet_pretrip_reports', 'trg_fleet_pretrip_reports_set_updated_at', 'CREATE TRIGGER trg_fleet_pretrip_reports_set_updated_at BEFORE UPDATE ON fleet_pretrip_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('fleet_service_requests', 'trg_fleet_service_requests_fill_fleet_id', 'CREATE TRIGGER trg_fleet_service_requests_fill_fleet_id BEFORE INSERT OR UPDATE OF vehicle_id, fleet_id ON fleet_service_requests FOR EACH ROW EXECUTE FUNCTION fleet_fill_fleet_id()'),
      ('fleet_service_requests', 'trg_fleet_service_requests_set_updated_at', 'CREATE TRIGGER trg_fleet_service_requests_set_updated_at BEFORE UPDATE ON fleet_service_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('invoices', 'enforce_invoice_work_order_for_active_invoices', 'CREATE TRIGGER enforce_invoice_work_order_for_active_invoices BEFORE INSERT OR UPDATE OF work_order_id, metadata ON invoices FOR EACH ROW EXECUTE FUNCTION enforce_invoice_work_order_for_active_invoices()'),
      ('invoices', 'invoices_compute_totals_biu', 'CREATE TRIGGER invoices_compute_totals_biu BEFORE INSERT OR UPDATE OF labor_cost, parts_cost, tax_total, discount_total, status, issued_at ON invoices FOR EACH ROW EXECUTE FUNCTION invoices_compute_totals_biu()'),
      ('invoices', 'invoices_sync_work_orders_aiu', 'CREATE TRIGGER invoices_sync_work_orders_aiu AFTER INSERT OR UPDATE OF labor_cost, parts_cost, subtotal, total ON invoices FOR EACH ROW EXECUTE FUNCTION invoices_sync_work_orders_aiu()'),
      ('invoices', 'set_updated_at_invoices', 'CREATE TRIGGER set_updated_at_invoices BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('invoices', 'trg_ai_observe_invoice_preparation', 'CREATE TRIGGER trg_ai_observe_invoice_preparation AFTER INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION capture_ai_automation_observation(''invoice_preparation'', ''invoice'', ''id'', '''')'),
      ('invoices', 'trg_enforce_invoice_amount_consistency', 'CREATE TRIGGER trg_enforce_invoice_amount_consistency BEFORE INSERT OR UPDATE OF subtotal, discount_total, tax_total, total ON invoices FOR EACH ROW EXECUTE FUNCTION enforce_invoice_amount_consistency()'),
      ('menu_repair_item_pricing_snapshots', 'trg_update_pricing_snapshot_status', 'CREATE TRIGGER trg_update_pricing_snapshot_status BEFORE INSERT OR UPDATE ON menu_repair_item_pricing_snapshots FOR EACH ROW EXECUTE FUNCTION update_pricing_snapshot_status()'),
      ('menu_repair_items', 'trg_menu_repair_items_updated_at', 'CREATE TRIGGER trg_menu_repair_items_updated_at BEFORE UPDATE ON menu_repair_items FOR EACH ROW EXECUTE FUNCTION menu_repair_items_set_updated_at()'),
      ('payroll_timecards', 'compute_timecard_hours_biu', 'CREATE TRIGGER compute_timecard_hours_biu BEFORE INSERT OR UPDATE ON payroll_timecards FOR EACH ROW EXECUTE FUNCTION compute_timecard_hours()'),
      ('payroll_timecards', 'set_hours_on_payroll_timecards', 'CREATE TRIGGER set_hours_on_payroll_timecards BEFORE INSERT OR UPDATE ON payroll_timecards FOR EACH ROW EXECUTE FUNCTION payroll_timecards_set_hours()'),
      ('payroll_timecards', 'set_updated_at_payroll_timecards', 'CREATE TRIGGER set_updated_at_payroll_timecards BEFORE UPDATE ON payroll_timecards FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('property_assets', 'trg_property_assets_tenant_consistency', 'CREATE TRIGGER trg_property_assets_tenant_consistency BEFORE INSERT OR UPDATE ON property_assets FOR EACH ROW EXECUTE FUNCTION validate_property_assets_tenant_consistency()'),
      ('property_assets', 'trg_property_assets_updated_at', 'CREATE TRIGGER trg_property_assets_updated_at BEFORE UPDATE ON property_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('property_inspection_signatures', 'trg_property_inspection_signatures_shop_id', 'CREATE TRIGGER trg_property_inspection_signatures_shop_id BEFORE INSERT OR UPDATE ON property_inspection_signatures FOR EACH ROW EXECUTE FUNCTION enforce_property_inspection_signature_shop_id()'),
      ('property_inspections', 'trg_property_inspections_tenant_consistency', 'CREATE TRIGGER trg_property_inspections_tenant_consistency BEFORE INSERT OR UPDATE ON property_inspections FOR EACH ROW EXECUTE FUNCTION validate_property_inspections_tenant_consistency()'),
      ('property_inspections', 'trg_property_inspections_updated_at', 'CREATE TRIGGER trg_property_inspections_updated_at BEFORE UPDATE ON property_inspections FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('property_maintenance_requests', 'trg_property_maintenance_requests_tenant_consistency', 'CREATE TRIGGER trg_property_maintenance_requests_tenant_consistency BEFORE INSERT OR UPDATE ON property_maintenance_requests FOR EACH ROW EXECUTE FUNCTION validate_property_maintenance_requests_tenant_consistency()'),
      ('property_maintenance_requests', 'trg_property_maintenance_requests_updated_at', 'CREATE TRIGGER trg_property_maintenance_requests_updated_at BEFORE UPDATE ON property_maintenance_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('property_members', 'trg_property_members_tenant_consistency', 'CREATE TRIGGER trg_property_members_tenant_consistency BEFORE INSERT OR UPDATE ON property_members FOR EACH ROW EXECUTE FUNCTION validate_property_members_tenant_consistency()'),
      ('property_portal_invites', 'trg_property_portal_invites_set_updated_at', 'CREATE TRIGGER trg_property_portal_invites_set_updated_at BEFORE UPDATE ON property_portal_invites FOR EACH ROW EXECUTE FUNCTION property_portal_invites_set_updated_at()'),
      ('property_portal_invites', 'trg_property_portal_invites_validate_hierarchy', 'CREATE TRIGGER trg_property_portal_invites_validate_hierarchy BEFORE INSERT OR UPDATE ON property_portal_invites FOR EACH ROW EXECUTE FUNCTION property_portal_invites_validate_hierarchy()'),
      ('property_portfolios', 'trg_property_portfolios_updated_at', 'CREATE TRIGGER trg_property_portfolios_updated_at BEFORE UPDATE ON property_portfolios FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('property_properties', 'trg_property_properties_tenant_consistency', 'CREATE TRIGGER trg_property_properties_tenant_consistency BEFORE INSERT OR UPDATE ON property_properties FOR EACH ROW EXECUTE FUNCTION validate_property_properties_tenant_consistency()'),
      ('property_properties', 'trg_property_properties_updated_at', 'CREATE TRIGGER trg_property_properties_updated_at BEFORE UPDATE ON property_properties FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('property_request_attachments', 'trg_validate_property_request_attachment_scope', 'CREATE TRIGGER trg_validate_property_request_attachment_scope BEFORE INSERT OR UPDATE ON property_request_attachments FOR EACH ROW EXECUTE FUNCTION validate_property_request_attachment_scope()'),
      ('property_request_events', 'trg_validate_property_request_event_scope', 'CREATE TRIGGER trg_validate_property_request_event_scope BEFORE INSERT OR UPDATE ON property_request_events FOR EACH ROW EXECUTE FUNCTION validate_property_request_event_scope()'),
      ('property_units', 'trg_property_units_tenant_consistency', 'CREATE TRIGGER trg_property_units_tenant_consistency BEFORE INSERT OR UPDATE ON property_units FOR EACH ROW EXECUTE FUNCTION validate_property_units_tenant_consistency()'),
      ('property_units', 'trg_property_units_updated_at', 'CREATE TRIGGER trg_property_units_updated_at BEFORE UPDATE ON property_units FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('property_vendor_assignments', 'trg_property_vendor_assignments_tenant_consistency', 'CREATE TRIGGER trg_property_vendor_assignments_tenant_consistency BEFORE INSERT OR UPDATE ON property_vendor_assignments FOR EACH ROW EXECUTE FUNCTION validate_property_vendor_assignments_tenant_consistency()'),
      ('property_vendor_assignments', 'trg_property_vendor_assignments_updated_at', 'CREATE TRIGGER trg_property_vendor_assignments_updated_at BEFORE UPDATE ON property_vendor_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('property_vendors', 'trg_property_vendors_updated_at', 'CREATE TRIGGER trg_property_vendors_updated_at BEFORE UPDATE ON property_vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('quickbooks_connections', 'trg_quickbooks_connections_updated_at', 'CREATE TRIGGER trg_quickbooks_connections_updated_at BEFORE UPDATE ON quickbooks_connections FOR EACH ROW EXECUTE FUNCTION set_quickbooks_updated_at()'),
      ('quickbooks_customer_links', 'trg_quickbooks_customer_links_updated_at', 'CREATE TRIGGER trg_quickbooks_customer_links_updated_at BEFORE UPDATE ON quickbooks_customer_links FOR EACH ROW EXECUTE FUNCTION set_quickbooks_updated_at()'),
      ('shop_brand_assets', 'trg_clear_other_active_brand_assets', 'CREATE TRIGGER trg_clear_other_active_brand_assets AFTER INSERT OR UPDATE OF is_active ON shop_brand_assets FOR EACH ROW WHEN (new.is_active = true) EXECUTE FUNCTION clear_other_active_brand_assets()'),
      ('shop_brand_assets', 'trg_shop_brand_assets_updated_at', 'CREATE TRIGGER trg_shop_brand_assets_updated_at BEFORE UPDATE ON shop_brand_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()'),
      ('shop_brand_assets', 'trg_sync_shop_brand_logo_to_profile', 'CREATE TRIGGER trg_sync_shop_brand_logo_to_profile AFTER INSERT OR UPDATE OF is_active, file_url ON shop_brand_assets FOR EACH ROW EXECUTE FUNCTION sync_shop_brand_logo_to_profile()'),
      ('shop_brand_profiles', 'trg_shop_brand_profiles_updated_at', 'CREATE TRIGGER trg_shop_brand_profiles_updated_at BEFORE UPDATE ON shop_brand_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()'),
      ('shop_maintenance_service_map', 'trg_shop_maintenance_service_map_updated_at', 'CREATE TRIGGER trg_shop_maintenance_service_map_updated_at BEFORE UPDATE ON shop_maintenance_service_map FOR EACH ROW EXECUTE FUNCTION set_shop_maintenance_service_map_updated_at()'),
      ('shop_onboarding_activation_rules', 'trg_shop_onboarding_activation_rules_set_updated_at', 'CREATE TRIGGER trg_shop_onboarding_activation_rules_set_updated_at BEFORE UPDATE ON shop_onboarding_activation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at_now()'),
      ('shop_onboarding_jobs', 'trg_shop_onboarding_jobs_set_updated_at', 'CREATE TRIGGER trg_shop_onboarding_jobs_set_updated_at BEFORE UPDATE ON shop_onboarding_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at_now()'),
      ('shop_onboarding_runs', 'trg_shop_onboarding_runs_set_updated_at', 'CREATE TRIGGER trg_shop_onboarding_runs_set_updated_at BEFORE UPDATE ON shop_onboarding_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at_now()'),
      ('shopreel_event_deliveries', 'trg_shopreel_event_deliveries_updated_at', 'CREATE TRIGGER trg_shopreel_event_deliveries_updated_at BEFORE UPDATE ON shopreel_event_deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at_shopreel_event_deliveries()'),
      ('shopreel_integrations', 'trg_shopreel_integrations_updated_at', 'CREATE TRIGGER trg_shopreel_integrations_updated_at BEFORE UPDATE ON shopreel_integrations FOR EACH ROW EXECUTE FUNCTION set_updated_at_shopreel_integrations()'),
      ('shopreel_manual_assets', 'trg_shopreel_manual_assets_updated_at', 'CREATE TRIGGER trg_shopreel_manual_assets_updated_at BEFORE UPDATE ON shopreel_manual_assets FOR EACH ROW EXECUTE FUNCTION shopreel_manual_assets_set_updated_at()'),
      ('shopreel_publications', 'trg_shopreel_publications_updated_at', 'CREATE TRIGGER trg_shopreel_publications_updated_at BEFORE UPDATE ON shopreel_publications FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()'),
      ('shopreel_publish_jobs', 'trg_shopreel_publish_jobs_updated_at', 'CREATE TRIGGER trg_shopreel_publish_jobs_updated_at BEFORE UPDATE ON shopreel_publish_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('shopreel_social_connections', 'trg_shopreel_social_connections_updated_at', 'CREATE TRIGGER trg_shopreel_social_connections_updated_at BEFORE UPDATE ON shopreel_social_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()'),
      ('shops', 'prevent_client_shop_billing_identity_write', 'CREATE TRIGGER prevent_client_shop_billing_identity_write BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION prevent_client_shop_billing_identity_write()'),
      ('shops', 'shops_set_ownership_defaults', 'CREATE TRIGGER shops_set_ownership_defaults BEFORE INSERT ON shops FOR EACH ROW EXECUTE FUNCTION set_shop_ownership_defaults()'),
      ('shops', 'shops_set_timestamps', 'CREATE TRIGGER shops_set_timestamps BEFORE INSERT OR UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION tg_set_timestamps()'),
      ('shops', 'trg_set_owner_shop_id', 'CREATE TRIGGER trg_set_owner_shop_id AFTER INSERT OR UPDATE OF owner_id ON shops FOR EACH ROW EXECUTE FUNCTION set_owner_shop_id()'),
      ('shops', 'trg_shop_labor_rate_recalc_menu', 'CREATE TRIGGER trg_shop_labor_rate_recalc_menu AFTER UPDATE OF labor_rate ON shops FOR EACH ROW EXECUTE FUNCTION recalc_menu_items_for_shop()'),
      ('shops', 'trg_shops_updated_at', 'CREATE TRIGGER trg_shops_updated_at BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('shops', 'trg_sync_shop_user_limit_from_billing', 'CREATE TRIGGER trg_sync_shop_user_limit_from_billing BEFORE INSERT OR UPDATE OF plan, stripe_subscription_status ON shops FOR EACH ROW EXECUTE FUNCTION sync_shop_user_limit_from_billing()'),
      ('staff_invite_candidates', 'trg_staff_invite_candidates_updated_at', 'CREATE TRIGGER trg_staff_invite_candidates_updated_at BEFORE UPDATE ON staff_invite_candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('supplier_quote_batch_rows', 'trg_enforce_supplier_quote_batch_row_consistency', 'CREATE TRIGGER trg_enforce_supplier_quote_batch_row_consistency BEFORE INSERT OR UPDATE OF batch_id ON supplier_quote_batch_rows FOR EACH ROW EXECUTE FUNCTION enforce_supplier_quote_batch_row_consistency()'),
      ('user_theme_preferences', 'set_user_theme_preferences_updated_at', 'CREATE TRIGGER set_user_theme_preferences_updated_at BEFORE UPDATE ON user_theme_preferences FOR EACH ROW EXECUTE FUNCTION set_user_theme_preferences_updated_at()'),
      ('videos', 'trg_videos_updated_at', 'CREATE TRIGGER trg_videos_updated_at BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION set_updated_at()'),
      ('work_order_invoice_reviews', 'wor_shop_consistency_trg', 'CREATE TRIGGER wor_shop_consistency_trg BEFORE INSERT ON work_order_invoice_reviews FOR EACH ROW EXECUTE FUNCTION wor_enforce_shop_consistency()'),
      ('work_order_line_ai', 'trg_enforce_work_order_line_ai_consistency', 'CREATE TRIGGER trg_enforce_work_order_line_ai_consistency BEFORE INSERT OR UPDATE OF shop_id, work_order_id, work_order_line_id ON work_order_line_ai FOR EACH ROW EXECUTE FUNCTION enforce_work_order_line_ai_consistency()'),
      ('work_order_line_dtc_threads', 'trg_work_order_line_dtc_threads_updated_at', 'CREATE TRIGGER trg_work_order_line_dtc_threads_updated_at BEFORE UPDATE ON work_order_line_dtc_threads FOR EACH ROW EXECUTE FUNCTION set_work_order_line_dtc_threads_updated_at()'),
      ('workforce_document_requirements', 'trg_workforce_document_requirements_updated_at', 'CREATE TRIGGER trg_workforce_document_requirements_updated_at BEFORE UPDATE ON workforce_document_requirements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')
    ) AS definitions(table_name, trigger_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = item.table_name
        AND t.tgname = item.trigger_name
        AND NOT t.tgisinternal
    ) THEN
      EXECUTE item.definition;
    END IF;
  END LOOP;
END
$p0_008$;

COMMIT;
