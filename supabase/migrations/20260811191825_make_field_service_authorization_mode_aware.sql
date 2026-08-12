begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- These helpers describe canonical shop roles. Whether those roles may act on
-- a Field Service record is determined from the linked Service Visit below.
create or replace function public.mobile_can_manage_work_orders(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.shop_id = p_shop_id
      and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and lower(coalesce(p.role, '')) in (
        'owner','admin','manager','advisor','service','lead_hand','leadhand','foreman'
      )
  );
$$;

create or replace function public.mobile_can_manage_followups(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.shop_id = p_shop_id
      and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and lower(coalesce(p.role, '')) in (
        'owner','admin','manager','advisor','service','lead_hand','leadhand','foreman'
      )
  );
$$;

-- Keep ordinary shop technicians eligible for shop-mode Dispatch. Explicitly
-- enabled field operators extend that set, while mobile-mode wrappers below
-- still require the Field Service grant.
create or replace function public.mobile_dispatch_profile_eligible(
  p_shop_id uuid,
  p_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.shop_id = p_shop_id
      and (
        lower(coalesce(p.role, '')) in (
          'mechanic','technician','tech','lead_hand','leadhand','foreman'
        )
        or public.mobile_profile_has_field_service_access(p_shop_id, p.id)
      )
  );
$$;

-- Preserve the hardened implementations as private cores, then put a
-- visit-mode-aware product boundary in front of each public entry point.
alter function public.dispatch_assign_service_visit_atomic(
  uuid,uuid,uuid,uuid,integer,uuid,text
) rename to dispatch_assign_service_visit_mode_core;
alter function public.dispatch_assign_service_visit_mode_core(
  uuid,uuid,uuid,uuid,integer,uuid,text
) set schema private;
revoke all on function private.dispatch_assign_service_visit_mode_core(
  uuid,uuid,uuid,uuid,integer,uuid,text
) from public, anon, authenticated, service_role;

create function public.dispatch_assign_service_visit_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_assigned_user_id uuid,
  p_service_vehicle_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select sv.mode into v_mode
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Service visit not found.';
  end if;

  if v_mode = 'mobile' then
    if not public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id) then
      raise exception using errcode = '42501', message = 'Field Service access is required.';
    end if;
    if p_assigned_user_id is not null
       and not public.mobile_profile_has_field_service_access(p_shop_id, p_assigned_user_id) then
      raise exception using errcode = '42501', message = 'The assigned technician requires Field Service access.';
    end if;
  end if;

  return private.dispatch_assign_service_visit_mode_core(
    p_shop_id, p_visit_id, p_assigned_user_id, p_service_vehicle_id,
    p_expected_version, p_actor_user_id, p_operation_key
  );
end;
$$;

alter function public.mobile_materialize_service_visit_work_order_atomic(
  uuid,uuid,uuid,text
) rename to mobile_materialize_visit_work_order_mode_core;
alter function public.mobile_materialize_visit_work_order_mode_core(
  uuid,uuid,uuid,text
) set schema private;
revoke all on function private.mobile_materialize_visit_work_order_mode_core(
  uuid,uuid,uuid,text
) from public, anon, authenticated, service_role;

create function public.mobile_materialize_service_visit_work_order_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select sv.mode into v_mode
  from public.service_visits sv
  where sv.id = p_visit_id and sv.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Service visit not found.';
  end if;

  if v_mode = 'mobile'
     and not public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Field Service access is required.';
  end if;

  return private.mobile_materialize_visit_work_order_mode_core(
    p_shop_id, p_visit_id, p_actor_user_id, p_operation_key
  );
end;
$$;

alter function public.mobile_create_service_followup_atomic(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) rename to mobile_create_service_followup_mode_core;
alter function public.mobile_create_service_followup_mode_core(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) set schema private;
revoke all on function private.mobile_create_service_followup_mode_core(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) from public, anon, authenticated, service_role;

create function public.mobile_create_service_followup_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_service_visit_id uuid,
  p_recommendation text,
  p_disposition text,
  p_estimated_amount numeric,
  p_follow_up_at timestamptz,
  p_notes text,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requires_field_access boolean;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select exists (
    select 1
    from public.service_visits sv
    where sv.shop_id = p_shop_id
      and sv.work_order_id = p_work_order_id
      and sv.mode = 'mobile'
      and (p_service_visit_id is null or sv.id = p_service_visit_id)
  ) into v_requires_field_access;

  if v_requires_field_access
     and not public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Field Service access is required.';
  end if;

  return private.mobile_create_service_followup_mode_core(
    p_shop_id, p_work_order_id, p_service_visit_id, p_recommendation,
    p_disposition, p_estimated_amount, p_follow_up_at, p_notes,
    p_actor_user_id, p_operation_key
  );
end;
$$;

alter function public.mobile_update_service_followup_status_atomic(
  uuid,uuid,text,uuid,uuid,text
) rename to mobile_update_service_followup_mode_core;
alter function public.mobile_update_service_followup_mode_core(
  uuid,uuid,text,uuid,uuid,text
) set schema private;
revoke all on function private.mobile_update_service_followup_mode_core(
  uuid,uuid,text,uuid,uuid,text
) from public, anon, authenticated, service_role;

create function public.mobile_update_service_followup_status_atomic(
  p_shop_id uuid,
  p_followup_id uuid,
  p_status text,
  p_converted_work_order_id uuid,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requires_field_access boolean;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select exists (
    select 1
    from public.mobile_service_followups f
    join public.service_visits sv
      on sv.shop_id = f.shop_id
     and sv.work_order_id = f.work_order_id
     and (f.service_visit_id is null or sv.id = f.service_visit_id)
    where f.id = p_followup_id
      and f.shop_id = p_shop_id
      and sv.mode = 'mobile'
  ) into v_requires_field_access;

  if v_requires_field_access
     and not public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Field Service access is required.';
  end if;

  return private.mobile_update_service_followup_mode_core(
    p_shop_id, p_followup_id, p_status, p_converted_work_order_id,
    p_actor_user_id, p_operation_key
  );
end;
$$;

-- Direct inserts receive the same mode-aware boundary as the RPCs.
create or replace function public.mobile_guard_service_followup_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid;
  v_requires_field_access boolean;
begin
  if new.recommended_by is null then
    raise exception using errcode = '42501', message = 'A field recommendation requires an author.';
  end if;

  select coalesce(p.user_id, p.id) into v_actor_user_id
  from public.profiles p
  where p.id = new.recommended_by and p.shop_id = new.shop_id;
  if v_actor_user_id is null then
    raise exception using errcode = '42501', message = 'Recommendation author is not in this shop.';
  end if;

  select exists (
    select 1
    from public.service_visits sv
    where sv.shop_id = new.shop_id
      and sv.work_order_id = new.work_order_id
      and sv.mode = 'mobile'
      and (new.service_visit_id is null or sv.id = new.service_visit_id)
  ) into v_requires_field_access;

  if v_requires_field_access
     and not public.mobile_actor_has_field_service_access(new.shop_id, v_actor_user_id) then
    raise exception using errcode = '42501', message = 'Field Service access is required.';
  end if;

  if public.mobile_can_manage_followups(new.shop_id, v_actor_user_id) then
    return new;
  end if;

  if public.mobile_dispatch_profile_eligible(new.shop_id, new.recommended_by)
     and exists (
       select 1
       from public.service_visits sv
       where sv.shop_id = new.shop_id
         and sv.work_order_id = new.work_order_id
         and sv.assigned_user_id = new.recommended_by
         and (new.service_visit_id is null or sv.id = new.service_visit_id)
     ) then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'Field recommendations require an assigned Service Visit.';
end;
$$;

revoke all on function public.mobile_can_manage_work_orders(uuid,uuid) from public, anon;
revoke all on function public.mobile_can_manage_followups(uuid,uuid) from public, anon;
revoke all on function public.mobile_dispatch_profile_eligible(uuid,uuid) from public, anon;
grant execute on function public.mobile_can_manage_work_orders(uuid,uuid) to authenticated, service_role;
grant execute on function public.mobile_can_manage_followups(uuid,uuid) to authenticated, service_role;
grant execute on function public.mobile_dispatch_profile_eligible(uuid,uuid) to authenticated, service_role;

revoke all on function public.dispatch_assign_service_visit_atomic(
  uuid,uuid,uuid,uuid,integer,uuid,text
) from public, anon;
grant execute on function public.dispatch_assign_service_visit_atomic(
  uuid,uuid,uuid,uuid,integer,uuid,text
) to authenticated, service_role;

revoke all on function public.mobile_materialize_service_visit_work_order_atomic(
  uuid,uuid,uuid,text
) from public, anon;
grant execute on function public.mobile_materialize_service_visit_work_order_atomic(
  uuid,uuid,uuid,text
) to authenticated, service_role;

revoke all on function public.mobile_create_service_followup_atomic(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) from public, anon;
grant execute on function public.mobile_create_service_followup_atomic(
  uuid,uuid,uuid,text,text,numeric,timestamptz,text,uuid,text
) to authenticated, service_role;

revoke all on function public.mobile_update_service_followup_status_atomic(
  uuid,uuid,text,uuid,uuid,text
) from public, anon;
grant execute on function public.mobile_update_service_followup_status_atomic(
  uuid,uuid,text,uuid,uuid,text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
