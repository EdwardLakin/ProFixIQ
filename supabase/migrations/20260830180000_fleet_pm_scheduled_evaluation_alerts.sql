-- Scheduled Fleet PM evaluation and PM-due alerts.
--
-- evaluate_fleet_pm_due_events required auth.uid() and raised
-- 'Authentication required' when it was null, so pg_cron could never run it --
-- unlike evaluate_fleet_pretrip_compliance, which carries no such guard and has
-- been scheduled hourly since 20260803041000. PM evaluation therefore only ever
-- ran when a person happened to open a Fleet surface, and it raised no alert at
-- all.
--
-- This splits the actor-authorized path from a system path over one shared core
-- and schedules the system path. The existing
-- evaluate_fleet_pm_due_events(uuid, uuid) signature, its authentication and
-- fleet-access checks, its return shape, and its policy auto-provisioning are
-- preserved exactly for every existing caller.
--
-- fleet_pm_policies.created_by is NOT NULL, so the unattended path evaluates
-- existing active policies and never provisions new ones.

create or replace function public.evaluate_fleet_pm_due_events_core(
  p_fleet_id uuid,
  p_vehicle_id uuid,
  p_actor_id uuid,
  p_provision_policies boolean
)
returns table (due_event_id uuid, vehicle_id uuid, policy_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_policy record;
  v_vehicle_id uuid;
  v_reading public.fleet_unit_readings%rowtype;
  v_due_reasons text[];
  v_due_snapshot jsonb;
  v_event_id uuid;
  v_event_created boolean;
  v_evidence_id uuid;
  v_unit_label text;
begin
  if p_provision_policies then
    -- Existing fleet-authored PM programs become per-unit policies automatically.
    -- Unit overrides win, and the first trustworthy reading becomes the anchor.
    insert into public.fleet_pm_policies (
      shop_id,
      fleet_id,
      vehicle_id,
      program_id,
      name,
      interval_km,
      interval_hours,
      interval_days,
      anchor_odometer_km,
      anchor_engine_hours,
      anchor_date,
      created_by
    )
    select
      f.shop_id,
      fp.fleet_id,
      fv.vehicle_id,
      fp.id,
      fp.name,
      coalesce(fv.custom_interval_km, fp.interval_km),
      coalesce(fv.custom_interval_hours, fp.interval_hours),
      coalesce(fv.custom_interval_days, fp.interval_days),
      latest.odometer_km,
      latest.engine_hours,
      current_date,
      p_actor_id
    from public.fleet_programs fp
    join public.fleets f on f.id = fp.fleet_id
    join public.fleet_vehicles fv
      on fv.fleet_id = fp.fleet_id
     and coalesce(fv.active, true)
    left join lateral (
      select r.odometer_km, r.engine_hours
      from public.fleet_unit_readings r
      where r.fleet_id = fp.fleet_id
        and r.vehicle_id = fv.vehicle_id
      order by r.recorded_at desc, r.created_at desc
      limit 1
    ) latest on true
    where fp.fleet_id = p_fleet_id
      and (p_vehicle_id is null or fv.vehicle_id = p_vehicle_id)
      and (
        coalesce(fv.custom_interval_km, fp.interval_km) is not null
        or coalesce(fv.custom_interval_hours, fp.interval_hours) is not null
        or coalesce(fv.custom_interval_days, fp.interval_days) is not null
      )
    on conflict (program_id, vehicle_id)
      where active = true
    do nothing;
  end if;

  for v_policy in
    select p.*
    from public.fleet_pm_policies p
    where p.fleet_id = p_fleet_id
      and p.active
      and (p_vehicle_id is null or p.vehicle_id is null or p.vehicle_id = p_vehicle_id)
  loop
    for v_vehicle_id in
      select fv.vehicle_id
      from public.fleet_vehicles fv
      where fv.fleet_id = p_fleet_id
        and coalesce(fv.active, true)
        and (p_vehicle_id is null or fv.vehicle_id = p_vehicle_id)
        and (v_policy.vehicle_id is null or fv.vehicle_id = v_policy.vehicle_id)
    loop
      select r.* into v_reading
      from public.fleet_unit_readings r
      where r.fleet_id = p_fleet_id
        and r.vehicle_id = v_vehicle_id
      order by r.recorded_at desc, r.created_at desc
      limit 1;

      if v_policy.anchor_odometer_km is null and v_reading.odometer_km is not null then
        update public.fleet_pm_policies
        set anchor_odometer_km = v_reading.odometer_km,
            updated_at = now()
        where id = v_policy.id;
        v_policy.anchor_odometer_km := v_reading.odometer_km;
      end if;

      if v_policy.anchor_engine_hours is null and v_reading.engine_hours is not null then
        update public.fleet_pm_policies
        set anchor_engine_hours = v_reading.engine_hours,
            updated_at = now()
        where id = v_policy.id;
        v_policy.anchor_engine_hours := v_reading.engine_hours;
      end if;

      v_due_reasons := array[]::text[];

      if v_policy.interval_km is not null
        and v_reading.odometer_km is not null
        and v_policy.anchor_odometer_km is not null
        and v_reading.odometer_km >= v_policy.anchor_odometer_km + v_policy.interval_km
      then
        v_due_reasons := array_append(v_due_reasons, 'odometer');
      end if;

      if v_policy.interval_hours is not null
        and v_reading.engine_hours is not null
        and v_policy.anchor_engine_hours is not null
        and v_reading.engine_hours >= v_policy.anchor_engine_hours + v_policy.interval_hours
      then
        v_due_reasons := array_append(v_due_reasons, 'engine_hours');
      end if;

      if v_policy.interval_days is not null
        and current_date >= v_policy.anchor_date + v_policy.interval_days
      then
        v_due_reasons := array_append(v_due_reasons, 'calendar');
      end if;

      if cardinality(v_due_reasons) = 0 then
        continue;
      end if;

      v_due_snapshot := jsonb_build_object(
        'policy_id', v_policy.id,
        'program_id', v_policy.program_id,
        'policy_name', v_policy.name,
        'due_reasons', to_jsonb(v_due_reasons),
        'current_odometer_km', v_reading.odometer_km,
        'current_engine_hours', v_reading.engine_hours,
        'anchor_odometer_km', v_policy.anchor_odometer_km,
        'anchor_engine_hours', v_policy.anchor_engine_hours,
        'anchor_date', v_policy.anchor_date,
        'interval_km', v_policy.interval_km,
        'interval_hours', v_policy.interval_hours,
        'interval_days', v_policy.interval_days,
        'reading_id', v_reading.id,
        'reading_recorded_at', v_reading.recorded_at
      );

      v_event_id := null;
      v_event_created := false;

      insert into public.fleet_pm_due_events (
        shop_id,
        fleet_id,
        vehicle_id,
        policy_id,
        program_id,
        triggering_reading_id,
        due_reasons,
        due_snapshot
      )
      values (
        v_policy.shop_id,
        v_policy.fleet_id,
        v_vehicle_id,
        v_policy.id,
        v_policy.program_id,
        v_reading.id,
        v_due_reasons,
        v_due_snapshot
      )
      on conflict (policy_id, vehicle_id)
        where status in ('pending', 'deferred', 'converted')
      do update
        set due_reasons = excluded.due_reasons,
            due_snapshot = excluded.due_snapshot,
            triggering_reading_id = excluded.triggering_reading_id,
            last_evaluated_at = now(),
            updated_at = now()
      returning id, (xmax = 0) into v_event_id, v_event_created;

      if v_event_created then
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
          v_policy.shop_id,
          'fleet_unit',
          v_vehicle_id,
          'fleet',
          'pm_due_event',
          v_due_snapshot,
          jsonb_build_array(
            jsonb_build_object('table', 'fleet_pm_policies', 'id', v_policy.id),
            jsonb_build_object('table', 'fleet_unit_readings', 'id', v_reading.id)
          ),
          case
            when v_reading.id is null then '["current_unit_reading"]'::jsonb
            else '[]'::jsonb
          end,
          coalesce(v_reading.recorded_at, now()),
          case when v_reading.id is null then 0.7 else 0.95 end,
          p_actor_id,
          jsonb_build_object('fleet_id', v_policy.fleet_id, 'policy_id', v_policy.id, 'due_event_id', v_event_id)
        )
        returning id into v_evidence_id;

        update public.fleet_pm_due_events
        set evidence_snapshot_id = v_evidence_id
        where id = v_event_id;

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
          missing_data,
          recommended_action,
          requires_approval,
          source,
          created_by,
          metadata
        )
        values (
          v_policy.shop_id,
          'fleet',
          'pm_due',
          'fleet_unit',
          v_vehicle_id,
          concat(v_policy.name, ' is due'),
          concat('Due by ', array_to_string(v_due_reasons, ', '), '. Review the evidence before creating work.'),
          'high',
          case when v_reading.id is null then 0.7 else 0.95 end,
          'low',
          v_evidence_id,
          array[v_evidence_id],
          case
            when v_reading.id is null then '["current_unit_reading"]'::jsonb
            else '[]'::jsonb
          end,
          jsonb_build_object(
            'action', 'review_pm_due_event',
            'due_event_id', v_event_id,
            'program_id', v_policy.program_id
          ),
          true,
          'fleet_pm_policy_engine',
          p_actor_id,
          jsonb_build_object('fleet_id', v_policy.fleet_id, 'policy_id', v_policy.id, 'due_event_id', v_event_id)
        );

        select coalesce(nullif(v.unit_number,''), nullif(v.license_plate,''), nullif(v.vin,''), 'Unit')
        into v_unit_label
        from public.vehicles v
        where v.id = v_vehicle_id;

        insert into public.assistant_notifications (
          shop_id, role, source, fingerprint, code, level, title, message,
          href, entity_type, entity_id, status, metadata, first_seen_at,
          last_seen_at, created_at, updated_at
        )
        values (
          v_policy.shop_id, 'manager', 'fleet',
          'fleet-pm-due:' || v_event_id::text,
          'fleet_pm_due', 'warning',
          coalesce(v_unit_label, 'Unit') || ' is due for ' || v_policy.name,
          'Due by ' || array_to_string(v_due_reasons, ', ') || '. Review the evidence before creating work.',
          '/fleet/maintenance', 'fleet_pm_due_event', v_event_id, 'active',
          jsonb_build_object(
            'fleet_id', v_policy.fleet_id,
            'vehicle_id', v_vehicle_id,
            'policy_id', v_policy.id,
            'due_event_id', v_event_id,
            'due_reasons', to_jsonb(v_due_reasons)
          ),
          now(), now(), now(), now()
        )
        on conflict (shop_id, fingerprint) do update
          set status = 'active',
              level = excluded.level,
              title = excluded.title,
              message = excluded.message,
              metadata = excluded.metadata,
              last_seen_at = now(),
              resolved_at = null,
              updated_at = now();
      end if;

      due_event_id := v_event_id;
      vehicle_id := v_vehicle_id;
      policy_id := v_policy.id;
      created := v_event_created;
      return next;
    end loop;
  end loop;
end;
$$;

-- Actor path: unchanged contract. Authenticates, authorizes the fleet, then
-- delegates to the shared core with policy provisioning enabled.
create or replace function public.evaluate_fleet_pm_due_events(
  p_fleet_id uuid,
  p_vehicle_id uuid default null
)
returns table (due_event_id uuid, vehicle_id uuid, policy_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not (
    exists (
      select 1 from public.profiles p
      join public.fleets f on f.shop_id = p.shop_id
      where p.id = v_user_id and f.id = p_fleet_id
    )
    or exists (
      select 1 from public.fleet_members m
      where m.user_id = v_user_id and m.fleet_id = p_fleet_id
    )
  ) then
    raise exception 'Fleet access required';
  end if;

  return query
  select *
  from public.evaluate_fleet_pm_due_events_core(
    p_fleet_id, p_vehicle_id, v_user_id, true
  );
end;
$$;

-- System path: no auth.uid(). Never provisions policies, because their
-- created_by is NOT NULL and an unattended run has no actor to attribute.
create or replace function public.evaluate_fleet_pm_due_events_system(
  p_fleet_id uuid,
  p_vehicle_id uuid default null
)
returns table (due_event_id uuid, vehicle_id uuid, policy_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select *
  from public.evaluate_fleet_pm_due_events_core(
    p_fleet_id, p_vehicle_id, null, false
  );
end;
$$;

-- Hourly sweep: evaluate every fleet, then retire alerts whose due event is no
-- longer outstanding. Resolution lives here rather than in a trigger on the
-- pre-existing fleet_pm_due_events table.
create or replace function public.evaluate_fleet_pm_due_calendar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fleet record;
  v_evaluated integer := 0;
begin
  for v_fleet in select id from public.fleets loop
    begin
      perform public.evaluate_fleet_pm_due_events_system(v_fleet.id, null);
      v_evaluated := v_evaluated + 1;
    exception when others then
      -- One unhealthy fleet must not stop the sweep.
      raise warning 'fleet pm sweep failed for fleet %: %', v_fleet.id, sqlerrm;
    end;
  end loop;

  update public.assistant_notifications n
  set status = 'resolved',
      resolved_at = coalesce(n.resolved_at, now()),
      updated_at = now()
  where n.source = 'fleet'
    and n.code = 'fleet_pm_due'
    and n.status in ('active', 'acknowledged')
    and exists (
      select 1
      from public.fleet_pm_due_events e
      where e.id = n.entity_id
        and e.status not in ('pending', 'deferred')
    );

  return v_evaluated;
end;
$$;

revoke all on function public.evaluate_fleet_pm_due_events_core(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.evaluate_fleet_pm_due_events_system(uuid, uuid) from public, anon, authenticated;
revoke all on function public.evaluate_fleet_pm_due_calendar() from public, anon, authenticated;
grant execute on function public.evaluate_fleet_pm_due_events_core(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.evaluate_fleet_pm_due_events_system(uuid, uuid) to service_role;
grant execute on function public.evaluate_fleet_pm_due_calendar() to service_role;

-- The public actor entrypoint keeps its existing grants.
revoke all on function public.evaluate_fleet_pm_due_events(uuid, uuid) from public, anon;
grant execute on function public.evaluate_fleet_pm_due_events(uuid, uuid) to authenticated, service_role;

-- Schedule the sweep beside the existing hourly pre-trip compliance job.
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $schedule$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'fleet-pm-due-hourly'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'fleet-pm-due-hourly',
    '27 * * * *',
    $command$select public.evaluate_fleet_pm_due_calendar();$command$
  );
end;
$schedule$;
