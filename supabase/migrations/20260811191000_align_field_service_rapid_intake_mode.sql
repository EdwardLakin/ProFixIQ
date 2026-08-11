begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Rapid intake is shared by Shop Mobile and Field Service. Resolve the
-- effective visit mode before enforcing the Field Service product boundary so
-- a shop-only configuration continues to create ordinary shop work.
create or replace function public.mobile_create_service_call_atomic(
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
declare
  v_config_model text;
  v_effective_mode text;
  v_requested_mode text := lower(nullif(trim(coalesce(p_service_mode, '')), ''));
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select lower(coalesce(settings.service_model,
      case when shop.location_type = 'mobile_service_branch' then 'mobile' else 'shop' end
    ))
  into v_config_model
  from public.shops shop
  left join public.mobile_service_settings settings on settings.shop_id = shop.id
  where shop.id = p_shop_id;

  if not found then
    raise exception using errcode = '23503', message = 'Shop not found.';
  end if;

  if v_config_model = 'both' then
    if v_requested_mode not in ('shop', 'mobile') then
      raise exception using errcode = '22023', message = 'Choose shop or mobile service for this call.';
    end if;
    v_effective_mode := v_requested_mode;
  elsif v_config_model in ('shop', 'mobile') then
    v_effective_mode := v_config_model;
  else
    v_effective_mode := case
      when v_requested_mode in ('shop', 'mobile') then v_requested_mode
      else 'shop'
    end;
  end if;

  if v_effective_mode = 'mobile'
     and not public.mobile_actor_has_field_service_access(p_shop_id, p_actor_user_id) then
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
