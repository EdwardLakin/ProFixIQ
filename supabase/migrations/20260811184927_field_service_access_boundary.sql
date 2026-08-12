begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Field Service is an opt-in product surface. A staff role alone must never
-- grant it: the shop must enable it and the individual must be assigned as an
-- enabled field operator. This keeps Shop Mobile available to every shop user
-- while making Field Service a deliberate, auditable capability.
create or replace function public.mobile_profile_has_field_service_access(
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
    from public.mobile_service_settings settings
    join public.mobile_field_operators operator
      on operator.shop_id = settings.shop_id
     and operator.profile_id = p_profile_id
     and operator.enabled
    join public.profiles profile
      on profile.id = operator.profile_id
     and profile.shop_id = settings.shop_id
    where settings.shop_id = p_shop_id
      and settings.onboarding_completed_at is not null
      and settings.service_model in ('mobile', 'both')
  );
$$;

create or replace function public.mobile_actor_has_field_service_access(
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
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
      and public.mobile_profile_has_field_service_access(p_shop_id, profile.id)
  );
$$;

revoke all on function public.mobile_profile_has_field_service_access(uuid, uuid)
  from public, anon;
revoke all on function public.mobile_actor_has_field_service_access(uuid, uuid)
  from public, anon;
grant execute on function public.mobile_profile_has_field_service_access(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.mobile_actor_has_field_service_access(uuid, uuid)
  to authenticated, service_role;

-- Keep the dispatch eligibility predicate aligned with the product boundary.
-- This predicate is used for Mobile assignment and follow-up checks; generic
-- shop technician roles remain valid for shop-mode work elsewhere.
create or replace function public.mobile_dispatch_profile_eligible(
  p_shop_id uuid,
  p_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.mobile_profile_has_field_service_access(p_shop_id, p_profile_id);
$$;

create or replace function public.mobile_can_manage_work_orders(
  p_shop_id uuid,
  p_actor_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id)
    and exists (
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
  select public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id)
    and exists (
      select 1
      from public.profiles p
      where p.shop_id = p_shop_id
        and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
        and lower(coalesce(p.role, '')) in (
          'owner','admin','manager','advisor','service','lead_hand','leadhand','foreman'
        )
    );
$$;

-- A direct dispatch RPC call must obey the same distinction: shop-mode work
-- uses its existing staff rules, mobile-mode work requires the field grant.
create or replace function public.dispatch_can_execute(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_visit_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.service_visits visit
    where visit.id = p_visit_id
      and visit.shop_id = p_shop_id
      and (
        (visit.mode = 'mobile'
          and public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id))
        or (
          visit.mode <> 'mobile'
          and (
            public.dispatch_can_manage(p_shop_id, p_actor_user_id)
            or exists (
              select 1
              from public.profiles profile
              where profile.id = visit.assigned_user_id
                and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
                and lower(coalesce(profile.role, '')) in (
                  'mechanic','technician','tech','lead_hand','leadhand','foreman'
                )
            )
          )
        )
      )
  );
$$;

-- The rapid-intake RPC previously admitted any technician-like shop role.
-- Preserve its hardened implementation as a private execution core and put the
-- product gate ahead of it, including for callers that bypass Next.js.
alter function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) rename to mobile_create_service_call_field_service_core;
alter function public.mobile_create_service_call_field_service_core(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) set schema private;

revoke all on function private.mobile_create_service_call_field_service_core(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) from public, anon, authenticated, service_role;

create function public.mobile_create_service_call_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_vehicle_id uuid,
  p_vehicle_year integer,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_plate text,
  p_address_line1 text,
  p_city text,
  p_province_state text,
  p_postal_code text,
  p_concern text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_quoted_price numeric,
  p_currency text,
  p_service_mode text,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if not public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Field Service access is required.';
  end if;

  return private.mobile_create_service_call_field_service_core(
    p_shop_id, p_customer_id, p_customer_name, p_phone, p_vehicle_id,
    p_vehicle_year, p_vehicle_make, p_vehicle_model, p_vehicle_plate,
    p_address_line1, p_city, p_province_state, p_postal_code, p_concern,
    p_starts_at, p_duration_minutes, p_quoted_price, p_currency,
    p_service_mode, p_actor_user_id, p_operation_key
  );
end;
$$;

revoke all on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) from public, anon;
grant execute on function public.mobile_create_service_call_atomic(
  uuid,uuid,text,text,uuid,integer,text,text,text,text,text,text,text,text,
  timestamptz,integer,numeric,text,text,uuid,text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
