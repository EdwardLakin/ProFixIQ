-- Do not count a pre-trip as missed when the assignment began after that
-- day's local due time. The first required service date is the next day.

do $cleanup$
begin
  if to_regclass('public.assistant_notifications') is not null then
    execute $sql$
      update public.assistant_notifications n
      set status = 'resolved',
          resolved_at = coalesce(n.resolved_at, now()),
          updated_at = now()
      where n.status = 'active'
        and exists (
          select 1
          from public.fleet_pretrip_compliance c
          join public.fleet_dispatch_assignments a on a.id = c.assignment_id
          join public.shops s on s.id = a.shop_id
          where c.notification_fingerprint = n.fingerprint
            and c.pretrip_report_id is null
            and c.status in ('due', 'missed')
            and c.service_date = (
              a.assigned_at at time zone coalesce(nullif(s.timezone, ''), 'America/Los_Angeles')
            )::date
            and (
              a.assigned_at at time zone coalesce(nullif(s.timezone, ''), 'America/Los_Angeles')
            )::time > a.pretrip_due_local_time
        )
    $sql$;
  end if;
end;
$cleanup$;

delete from public.fleet_pretrip_compliance c
using public.fleet_dispatch_assignments a, public.shops s
where a.id = c.assignment_id
  and s.id = a.shop_id
  and c.pretrip_report_id is null
  and c.status in ('due', 'missed')
  and c.service_date = (
    a.assigned_at at time zone coalesce(nullif(s.timezone, ''), 'America/Los_Angeles')
  )::date
  and (
    a.assigned_at at time zone coalesce(nullif(s.timezone, ''), 'America/Los_Angeles')
  )::time > a.pretrip_due_local_time;

create or replace function public.evaluate_fleet_pretrip_compliance(p_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment record;
  v_service_date date;
  v_due_at timestamptz;
  v_timezone text;
  v_report_id uuid;
  v_status text;
  v_fingerprint text;
  v_checked integer := 0;
  v_missed integer := 0;
  v_completed integer := 0;
begin
  for v_assignment in
    select a.*, coalesce(nullif(s.timezone,''),'America/Los_Angeles') as shop_timezone
    from public.fleet_dispatch_assignments a
    join public.shops s on s.id=a.shop_id
    where a.active and a.pretrip_required
  loop
    v_timezone := v_assignment.shop_timezone;
    v_status := null;
    for v_service_date in
      select d::date from generate_series(
        greatest(
          (v_assignment.assigned_at at time zone v_timezone)::date
            + case
                when (v_assignment.assigned_at at time zone v_timezone)::time
                  > v_assignment.pretrip_due_local_time then 1
                else 0
              end,
          (p_at at time zone v_timezone)::date - 1
        ),
        (p_at at time zone v_timezone)::date,
        interval '1 day'
      ) d
    loop
      v_checked := v_checked+1;
      v_due_at := (v_service_date + v_assignment.pretrip_due_local_time) at time zone v_timezone;

      select r.id into v_report_id
      from public.fleet_pretrip_reports r
      where r.fleet_id=v_assignment.fleet_id
        and r.vehicle_id=v_assignment.vehicle_id
        and r.driver_profile_id=v_assignment.driver_profile_id
        and r.inspection_date=v_service_date
      order by r.created_at desc limit 1;

      v_status := case when v_report_id is not null then 'completed'
                       when p_at>v_due_at then 'missed' else 'due' end;
      if v_status='completed' then v_completed:=v_completed+1; end if;
      if v_status='missed' then v_missed:=v_missed+1; end if;

      insert into public.fleet_pretrip_compliance (
        shop_id,fleet_id,assignment_id,vehicle_id,driver_profile_id,
        service_date,due_at,status,pretrip_report_id,completed_at,
        notification_fingerprint,updated_at
      )
      values (
        v_assignment.shop_id,v_assignment.fleet_id,v_assignment.id,
        v_assignment.vehicle_id,v_assignment.driver_profile_id,v_service_date,
        v_due_at,v_status,v_report_id,case when v_report_id is not null then now() end,
        'fleet-pretrip-missed:'||v_assignment.id::text||':'||v_service_date::text,now()
      )
      on conflict (assignment_id,service_date) do update set
        status=case when public.fleet_pretrip_compliance.status in ('completed','excused')
                    then public.fleet_pretrip_compliance.status else excluded.status end,
        pretrip_report_id=coalesce(public.fleet_pretrip_compliance.pretrip_report_id,excluded.pretrip_report_id),
        completed_at=coalesce(public.fleet_pretrip_compliance.completed_at,excluded.completed_at),
        updated_at=now();

      if v_status='missed' then
        v_fingerprint := 'fleet-pretrip-missed:'||v_assignment.id::text||':'||v_service_date::text;
        insert into public.assistant_notifications (
          shop_id,role,source,fingerprint,code,level,title,message,href,
          entity_type,entity_id,status,metadata,first_seen_at,last_seen_at,created_at,updated_at
        ) values (
          v_assignment.shop_id,'manager','fleet',v_fingerprint,'fleet_pretrip_missed',
          'critical','Daily pre-trip missed',
          coalesce(v_assignment.driver_name,'Driver')||' missed the '||v_service_date::text||
            ' pre-trip for '||coalesce(v_assignment.unit_label,'Unit')||'.',
          '/fleet?focus=defects','fleet_dispatch_assignment',v_assignment.id,'active',
          jsonb_build_object('fleet_id',v_assignment.fleet_id,'vehicle_id',v_assignment.vehicle_id,'driver_profile_id',v_assignment.driver_profile_id,'service_date',v_service_date),
          now(),now(),now(),now()
        )
        on conflict (shop_id,fingerprint) do update
        set status='active',resolved_at=null,last_seen_at=now(),updated_at=now(),message=excluded.message,metadata=excluded.metadata;
      end if;
    end loop;

    update public.fleet_dispatch_assignments
    set state=case
          when v_status is null then state
          when v_status='completed' then 'en_route'
          else 'pretrip_due'
        end,
        next_pretrip_due=((((p_at at time zone v_timezone)::date+1)+pretrip_due_local_time) at time zone v_timezone),
        updated_at=now()
    where id=v_assignment.id;
  end loop;

  return jsonb_build_object('ok',true,'checked',v_checked,'missed',v_missed,'completed',v_completed,'evaluatedAt',p_at);
end;
$function$;

revoke execute on function public.evaluate_fleet_pretrip_compliance(timestamptz)
  from public, anon, authenticated;
grant execute on function public.evaluate_fleet_pretrip_compliance(timestamptz)
  to service_role;
