CREATE OR REPLACE FUNCTION public.capture_fleet_ai_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event_type text;
  v_entity_id uuid;
  v_entity_table text;
  v_shop_id uuid;
  v_payload jsonb;
  v_evidence_id uuid;
  v_pm_due_event_id uuid;
begin
  if tg_table_name = 'fleet_pretrip_reports' then
    v_event_type := 'fleet_pretrip_submitted';
    v_entity_id := new.id;
    v_entity_table := 'fleet_pretrip_reports';
    v_shop_id := new.shop_id;
    v_payload := jsonb_build_object(
      'fleet_id', new.fleet_id,
      'vehicle_id', new.vehicle_id,
      'has_defects', new.has_defects,
      'odometer_km', new.odometer_km,
      'status', new.status
    );
  elsif tg_table_name = 'fleet_pm_due_events' then
    v_event_type := 'fleet_pm_due';
    v_entity_id := new.id;
    v_entity_table := 'fleet_pm_due_events';
    v_shop_id := new.shop_id;
    v_payload := jsonb_build_object(
      'fleet_id', new.fleet_id,
      'vehicle_id', new.vehicle_id,
      'policy_id', new.policy_id,
      'program_id', new.program_id,
      'due_reasons', new.due_reasons,
      'evidence_snapshot_id', new.evidence_snapshot_id
    );
  elsif tg_table_name = 'fleet_service_requests' then
    if tg_op = 'INSERT' then
      v_event_type := 'fleet_request_created';
    elsif new.status = 'deferred' and old.status is distinct from new.status then
      v_event_type := 'fleet_work_deferred';
    else
      return new;
    end if;
    v_entity_id := new.id;
    v_entity_table := 'fleet_service_requests';
    v_shop_id := new.shop_id;
    v_payload := jsonb_build_object(
      'fleet_id', new.fleet_id,
      'vehicle_id', new.vehicle_id,
      'status', new.status,
      'work_order_id', new.work_order_id
    );
  elsif tg_table_name = 'work_orders' then
    if new.source_fleet_service_request_id is null
      or lower(coalesce(new.status, '')) not in ('completed', 'closed', 'invoiced', 'paid')
      or old.status is not distinct from new.status
    then
      return new;
    end if;
    v_event_type := 'fleet_work_completed';
    v_entity_id := new.id;
    v_entity_table := 'work_orders';
    v_shop_id := new.shop_id;
    v_payload := jsonb_build_object(
      'vehicle_id', new.vehicle_id,
      'service_request_id', new.source_fleet_service_request_id,
      'status', new.status,
      'invoice_total', new.invoice_total
    );

    select sr.source_pm_due_event_id
      into v_pm_due_event_id
    from public.fleet_service_requests sr
    where sr.id = new.source_fleet_service_request_id;

    if v_pm_due_event_id is not null then
      update public.fleet_pm_policies p
      set last_completed_at = now(),
          last_completed_work_order_id = new.id,
          anchor_date = current_date,
          anchor_odometer_km = coalesce(
            (
              select r.odometer_km
              from public.fleet_unit_readings r
              where r.vehicle_id = new.vehicle_id
                and r.odometer_km is not null
              order by r.recorded_at desc, r.created_at desc
              limit 1
            ),
            p.anchor_odometer_km
          ),
          anchor_engine_hours = coalesce(
            (
              select r.engine_hours
              from public.fleet_unit_readings r
              where r.vehicle_id = new.vehicle_id
                and r.engine_hours is not null
              order by r.recorded_at desc, r.created_at desc
              limit 1
            ),
            p.anchor_engine_hours
          ),
          updated_at = now()
      from public.fleet_pm_due_events due
      where due.id = v_pm_due_event_id
        and p.id = due.policy_id;

      update public.fleet_pm_due_events
      set status = 'completed',
          completed_at = now(),
          updated_at = now()
      where id = v_pm_due_event_id;
    end if;
  elsif tg_table_name = 'work_order_quote_lines' then
    if new.status not in ('declined', 'deferred')
      or old.status is not distinct from new.status
      or not exists (
        select 1 from public.work_orders wo
        where wo.id = new.work_order_id
          and wo.source_fleet_service_request_id is not null
      )
    then
      return new;
    end if;
    v_event_type := case when new.status = 'deferred' then 'fleet_work_deferred' else 'fleet_work_declined' end;
    v_entity_id := new.id;
    v_entity_table := 'work_order_quote_lines';
    select wo.shop_id into v_shop_id
    from public.work_orders wo
    where wo.id = new.work_order_id;
    v_payload := jsonb_build_object(
      'work_order_id', new.work_order_id,
      'description', new.description,
      'status', new.status,
      'stage', new.stage
    );
  else
    return new;
  end if;

  insert into public.ai_events (
    shop_id,
    user_id,
    event_type,
    entity_id,
    entity_table,
    payload,
    training_source,
    source_id
  )
  values (
    v_shop_id,
    auth.uid(),
    v_event_type,
    v_entity_id,
    v_entity_table,
    v_payload,
    'fleet',
    v_entity_id
  );

  if tg_table_name = 'fleet_pretrip_reports'
     and coalesce((to_jsonb(new) ->> 'has_defects')::boolean, false) then
    insert into public.ai_evidence_snapshots (
      shop_id,
      subject_type,
      subject_id,
      domain,
      evidence_kind,
      snapshot,
      source_refs,
      missing_data,
      freshness_at,
      confidence,
      created_by,
      metadata
    )
    values (
      new.shop_id,
      'fleet_unit',
      new.vehicle_id,
      'fleet',
      'pretrip_defects',
      jsonb_build_object(
        'pretrip_id', new.id,
        'inspection_date', new.inspection_date,
        'odometer_km', new.odometer_km,
        'checklist', new.checklist,
        'notes', new.notes,
        'driver_name', new.driver_name
      ),
      jsonb_build_array(
        jsonb_build_object('table', 'fleet_pretrip_reports', 'id', new.id)
      ),
      '[]'::jsonb,
      coalesce(new.created_at, now()),
      1,
      new.driver_profile_id,
      jsonb_build_object(
        'fleet_id', new.fleet_id,
        'pretrip_id', new.id
      )
    )
    returning id into v_evidence_id;

    insert into public.ai_recommendations (
      shop_id,
      domain,
      recommendation_type,
      subject_type,
      subject_id,
      title,
      summary,
      priority,
      confidence,
      risk_tier,
      evidence_snapshot_id,
      evidence_snapshot_ids,
      recommended_action,
      requires_approval,
      source,
      created_by,
      metadata
    )
    values (
      new.shop_id,
      'fleet',
      'pretrip_defect_review',
      'fleet_unit',
      new.vehicle_id,
      'Pre-trip defects need review',
      'Review the driver-recorded defects and decide whether to create structured service work.',
      'high',
      1,
      'medium',
      v_evidence_id,
      array[v_evidence_id],
      jsonb_build_object(
        'action', 'review_pretrip',
        'pretrip_id', new.id
      ),
      true,
      'fleet_pretrip_event',
      new.driver_profile_id,
      jsonb_build_object(
        'fleet_id', new.fleet_id,
        'pretrip_id', new.id
      )
    );
  end if;

  return new;
end;
$function$

revoke execute on function public.capture_fleet_ai_event() from public, anon, authenticated;
