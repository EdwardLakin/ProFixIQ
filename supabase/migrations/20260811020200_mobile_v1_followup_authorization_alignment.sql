begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';
set local check_function_bodies = false;

-- Keep the command authorization and table invariant identical: Dispatch
-- management authority, or the eligible field operator actually assigned to the
-- linked physical Service Visit. Merely having field-operator capability is not
-- shop-wide future-work authority.
create or replace function public.mobile_guard_service_followup_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid;
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

  if public.dispatch_can_manage(new.shop_id, v_actor_user_id) then
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

create or replace function public.mobile_create_service_followup_atomic(
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
  v_profile public.profiles%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_followup_id uuid;
  v_disposition text := lower(coalesce(nullif(trim(p_disposition), ''), 'quote_later'));
  v_assigned_visit_id uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Operation key is required.';
  end if;
  if nullif(trim(coalesce(p_recommendation, '')), '') is null then
    raise exception using errcode = '22023', message = 'Recommendation is required.';
  end if;
  if v_disposition not in ('quote_later','contact_later','monitor') then
    raise exception using errcode = '22023', message = 'Invalid follow-up disposition.';
  end if;
  if p_estimated_amount is not null and p_estimated_amount < 0 then
    raise exception using errcode = '22023', message = 'Estimated amount cannot be negative.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':mobile-followup:' || p_operation_key, 0));
  select mok.result into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'mobile_service_followup'
    and mok.operation_key = p_operation_key;
  if v_existing is not null then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_profile
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Shop actor not found.';
  end if;

  select * into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id and wo.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found.';
  end if;

  if not public.dispatch_can_manage(p_shop_id, p_actor_user_id) then
    if not public.mobile_dispatch_profile_eligible(p_shop_id, v_profile.id) then
      raise exception using errcode = '42501', message = 'Field execution access is required.';
    end if;

    select sv.id into v_assigned_visit_id
    from public.service_visits sv
    where sv.shop_id = p_shop_id
      and sv.work_order_id = p_work_order_id
      and sv.assigned_user_id = v_profile.id
      and (p_service_visit_id is null or sv.id = p_service_visit_id)
    order by sv.created_at desc
    limit 1;

    if v_assigned_visit_id is null then
      raise exception using errcode = '42501', message = 'Field recommendations require an assigned Service Visit.';
    end if;
  end if;

  if p_service_visit_id is not null and not exists (
    select 1 from public.service_visits sv
    where sv.id = p_service_visit_id
      and sv.shop_id = p_shop_id
      and sv.work_order_id = p_work_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'Service Visit does not match the work order.';
  end if;

  insert into public.mobile_service_followups(
    shop_id, work_order_id, service_visit_id, customer_id, vehicle_id,
    recommendation, disposition, estimated_amount, follow_up_at,
    notes, recommended_by, updated_at
  ) values (
    p_shop_id, p_work_order_id,
    coalesce(p_service_visit_id, v_assigned_visit_id),
    v_work_order.customer_id, v_work_order.vehicle_id,
    trim(p_recommendation), v_disposition, p_estimated_amount, p_follow_up_at,
    nullif(trim(coalesce(p_notes, '')), ''), v_profile.id, now()
  ) returning id into v_followup_id;

  v_existing := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'followupId', v_followup_id,
    'workOrderId', p_work_order_id,
    'status', 'open',
    'disposition', v_disposition
  );

  insert into public.mobile_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'mobile_service_followup', p_operation_key,
    coalesce(auth.uid(), p_actor_user_id), p_work_order_id, v_existing
  ) on conflict (shop_id, operation_name, operation_key) do nothing;

  return v_existing;
end;
$$;

notify pgrst, 'reload schema';

commit;
