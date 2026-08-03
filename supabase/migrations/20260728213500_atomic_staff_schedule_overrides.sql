-- Make one-off staff schedule overrides deterministic and atomic.
--
-- Workforce treats an override as the single authoritative posture for one
-- employee/shop day. Historical retries could create multiple active rows, and
-- the route wrote the audit record after the schedule mutation. Normalize old
-- duplicates, enforce one active row, and commit the override plus audit event
-- in one transaction.

with ranked as (
  select
    override_row.id,
    row_number() over (
      partition by
        override_row.shop_id,
        override_row.user_id,
        override_row.schedule_date
      order by
        override_row.updated_at desc nulls last,
        override_row.created_at desc nulls last,
        override_row.id desc
    ) as position
  from public.staff_schedule_overrides override_row
  where lower(coalesce(override_row.status, '')) <> 'cancelled'
)
update public.staff_schedule_overrides override_row
set
  status = 'cancelled',
  updated_at = now()
from ranked
where ranked.id = override_row.id
  and ranked.position > 1;

create unique index if not exists
  staff_schedule_overrides_one_active_day_uidx
on public.staff_schedule_overrides (
  shop_id,
  user_id,
  schedule_date
)
where lower(coalesce(status, '')) <> 'cancelled';

create or replace function public.save_staff_schedule_override_atomic(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_override_id uuid,
  p_target_user_id uuid,
  p_schedule_date date,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_unpaid_break_minutes integer,
  p_notes text,
  p_status text
) returns public.staff_schedule_overrides
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_override public.staff_schedule_overrides%rowtype;
  v_existing_id uuid;
  v_status text := lower(trim(coalesce(p_status, 'scheduled')));
  v_action text;
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_actor_auth_user_id is null
     or p_target_user_id is null
     or p_schedule_date is null then
    raise exception 'Shop, actor, employee, and schedule date are required';
  end if;

  select *
  into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id
    and (
      profile.id = p_actor_auth_user_id
      or profile.user_id = p_actor_auth_user_id
    );

  if not found then
    raise exception 'Actor is not a member of this shop';
  end if;
  if auth.uid() is not null and auth.uid() <> p_actor_auth_user_id then
    raise exception 'Actor identity mismatch';
  end if;
  if lower(coalesce(v_actor.role::text, '')) not in (
    'owner',
    'admin',
    'manager'
  ) then
    raise exception 'Not authorized to manage staff schedules';
  end if;
  if not exists (
    select 1
    from public.profiles target
    where target.id = p_target_user_id
      and target.shop_id = p_shop_id
  ) then
    raise exception 'Employee not found in this shop';
  end if;
  if v_status not in ('scheduled', 'cancelled') then
    raise exception 'Override status must be scheduled or cancelled';
  end if;
  if (p_start_time is null) <> (p_end_time is null) then
    raise exception 'Provide both schedule start and end times, or leave both blank';
  end if;
  if p_start_time is not null and p_end_time <= p_start_time then
    raise exception 'Schedule end must be after start';
  end if;
  if p_unpaid_break_minutes is null
     or p_unpaid_break_minutes < 0
     or p_unpaid_break_minutes > 1440 then
    raise exception 'Unpaid break minutes must be from 0 through 1440';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      p_shop_id::text
      || ':schedule-override:'
      || p_target_user_id::text
      || ':'
      || p_schedule_date::text
    )
  );

  if p_override_id is not null then
    select override_row.id
    into v_existing_id
    from public.staff_schedule_overrides override_row
    where override_row.id = p_override_id
      and override_row.shop_id = p_shop_id
      and override_row.user_id = p_target_user_id
    for update;

    if v_existing_id is null then
      raise exception 'Schedule override not found';
    end if;
  else
    select override_row.id
    into v_existing_id
    from public.staff_schedule_overrides override_row
    where override_row.shop_id = p_shop_id
      and override_row.user_id = p_target_user_id
      and override_row.schedule_date = p_schedule_date
      and lower(coalesce(override_row.status, '')) <> 'cancelled'
    for update;
  end if;

  if v_existing_id is not null then
    update public.staff_schedule_overrides override_row
    set
      schedule_date = p_schedule_date,
      start_time = p_start_time,
      end_time = p_end_time,
      unpaid_break_minutes = p_unpaid_break_minutes,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      status = v_status,
      updated_at = now()
    where override_row.id = v_existing_id
      and override_row.shop_id = p_shop_id
    returning * into v_override;

    v_action := case
      when v_status = 'cancelled'
        then 'staff.schedule.override.cancelled'
      else 'staff.schedule.override.updated'
    end;
  else
    if v_status = 'cancelled' then
      raise exception 'Schedule override not found';
    end if;

    insert into public.staff_schedule_overrides (
      shop_id,
      user_id,
      schedule_date,
      start_time,
      end_time,
      unpaid_break_minutes,
      notes,
      source_type,
      status,
      created_by
    ) values (
      p_shop_id,
      p_target_user_id,
      p_schedule_date,
      p_start_time,
      p_end_time,
      p_unpaid_break_minutes,
      nullif(trim(coalesce(p_notes, '')), ''),
      'manual_override',
      'scheduled',
      p_actor_profile_id
    )
    returning * into v_override;

    v_action := 'staff.schedule.override.created';
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    v_action,
    p_target_user_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'override_id', v_override.id,
      'schedule_date', v_override.schedule_date,
      'status', v_override.status
    )
  );

  return v_override;
end;
$$;

revoke all on function public.save_staff_schedule_override_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  timestamptz,
  timestamptz,
  integer,
  text,
  text
) from public, anon;
grant execute on function public.save_staff_schedule_override_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  timestamptz,
  timestamptz,
  integer,
  text,
  text
) to authenticated, service_role;

comment on function public.save_staff_schedule_override_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  date,
  timestamptz,
  timestamptz,
  integer,
  text,
  text
) is
  'Creates, replaces, updates, or cancels one staff day override together with its audit event.';
