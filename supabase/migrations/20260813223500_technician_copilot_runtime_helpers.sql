-- Technician CoPilot V2 phase 2: private runtime helpers.

begin;

create or replace function copilot.technician_profile_id(p_auth_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select p.* into v_profile
  from public.profiles p
  where p.id = p_auth_user_id or p.user_id = p_auth_user_id
  order by (p.id = p_auth_user_id) desc
  limit 1;

  if not found then raise exception 'copilot_profile_not_found' using errcode = 'P0001'; end if;
  if lower(coalesce(v_profile.role::text, '')) not in ('mechanic', 'technician', 'tech') then
    raise exception 'copilot_technician_role_required' using errcode = '42501';
  end if;
  if v_profile.shop_id is null then raise exception 'copilot_shop_required' using errcode = '42501'; end if;
  return v_profile.id;
end;
$$;

create or replace function copilot.technician_is_assigned(p_auth_user_id uuid,p_profile_id uuid,p_shop_id uuid,p_work_order_id uuid,p_work_order_line_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, copilot, pg_temp
as $$
  select exists (
    select 1 from public.work_order_lines wol
    where wol.shop_id = p_shop_id
      and wol.work_order_id = p_work_order_id
      and (p_work_order_line_id is null or wol.id = p_work_order_line_id)
      and (
        wol.assigned_tech_id in (p_auth_user_id, p_profile_id)
        or wol.assigned_to in (p_auth_user_id, p_profile_id)
        or exists (
          select 1 from public.work_order_line_technicians wolt
          where wolt.work_order_line_id = wol.id
            and wolt.technician_id in (p_auth_user_id, p_profile_id)
        )
      )
  )
$$;

create or replace function copilot.append_repair_event_internal(p_session_id uuid,p_shop_id uuid,p_technician_id uuid,p_event_type text,p_origin text,p_operation_id uuid,p_details jsonb,p_occurred_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, copilot, pg_temp
as $$
declare
  v_existing_event_id uuid; v_existing_session_id uuid; v_existing_seq bigint;
  v_event_id uuid; v_next_seq bigint;
begin
  select e.id,e.session_id,e.event_seq into v_existing_event_id,v_existing_session_id,v_existing_seq
  from copilot.repair_session_event_context c
  join copilot.repair_session_events e on e.id=c.event_id
  where c.operation_id=p_operation_id;
  if found then
    if v_existing_session_id <> p_session_id then raise exception 'copilot_operation_id_conflict' using errcode='23505'; end if;
    return jsonb_build_object('eventId',v_existing_event_id,'eventSeq',v_existing_seq,'replayed',true);
  end if;

  select rs.last_event_seq+1 into v_next_seq from copilot.repair_sessions rs
  where rs.id=p_session_id and rs.shop_id=p_shop_id and rs.technician_id=p_technician_id for update;
  if not found then raise exception 'copilot_session_not_found' using errcode='P0001'; end if;

  insert into copilot.repair_session_events(session_id,shop_id,technician_id,event_seq,event_type,occurred_at)
  values(p_session_id,p_shop_id,p_technician_id,v_next_seq,p_event_type,p_occurred_at) returning id into v_event_id;
  insert into copilot.repair_session_event_context(event_id,shop_id,technician_id,operation_id,origin,details,occurred_at)
  values(v_event_id,p_shop_id,p_technician_id,p_operation_id,p_origin,p_details,p_occurred_at);
  update copilot.repair_sessions set last_event_seq=v_next_seq,context_version=context_version+1,last_activity_at=greatest(last_activity_at,p_occurred_at),updated_at=now()
  where id=p_session_id;
  return jsonb_build_object('eventId',v_event_id,'eventSeq',v_next_seq,'replayed',false);
end;
$$;

commit;
