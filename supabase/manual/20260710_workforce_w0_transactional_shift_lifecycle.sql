-- Workforce W0.1: transactional canonical shift lifecycle hardening.
-- Schema compatibility note: current generated types show punch_events has id, user_id,
-- profile_id, shift_id, event_type, timestamp, and created_at, but no shop_id. These
-- RPCs therefore scope punch events through the locked tech_shifts row instead of
-- writing punch_events.shop_id.

begin;

create or replace function public.start_canonical_shift(
  p_shop_id uuid,
  p_user_id uuid,
  p_profile_id uuid,
  p_timestamp timestamptz default now()
)
returns table (
  id uuid,
  start_time timestamptz,
  status text,
  end_time timestamptz,
  shop_id uuid,
  user_id uuid,
  inserted_events jsonb
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.complete_canonical_shift(
  p_shift_id uuid,
  p_shop_id uuid,
  p_user_id uuid,
  p_profile_id uuid,
  p_timestamp timestamptz default now()
)
returns table (
  id uuid,
  start_time timestamptz,
  status text,
  end_time timestamptz,
  shop_id uuid,
  user_id uuid,
  inserted_events jsonb
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.start_canonical_shift(uuid, uuid, uuid, timestamptz) from public;
revoke all on function public.complete_canonical_shift(uuid, uuid, uuid, uuid, timestamptz) from public;
grant execute on function public.start_canonical_shift(uuid, uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.complete_canonical_shift(uuid, uuid, uuid, uuid, timestamptz) to authenticated, service_role;

commit;
