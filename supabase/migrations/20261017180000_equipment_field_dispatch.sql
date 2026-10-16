begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';
set local check_function_bodies = false;

-- ===========================================================================
-- EQUIPMENT FIELD DISPATCH (isolated addition)
--
-- Adds a participants table (multiple technicians per visit, per-technician
-- acknowledgement) and three commands that WRAP the existing canonical
-- dispatch commands. No existing function, table, trigger, policy or grant is
-- changed. service_visits.assigned_user_id stays the single execution owner
-- (the lead); additional technicians are recorded here and keep labor
-- attribution on work_order_line_labor_segments / work_order_line_technicians.
-- ===========================================================================

create table if not exists public.service_visit_participants (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_visit_id uuid not null references public.service_visits(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  role text not null,
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_reason text,
  constraint service_visit_participants_role_check
    check (role in ('lead', 'support')),
  constraint service_visit_participants_removal_check
    check ((removed_at is null) = (removed_reason is null))
);

create unique index if not exists service_visit_participants_active_user_uniq
  on public.service_visit_participants (service_visit_id, user_id)
  where removed_at is null and user_id is not null;
create unique index if not exists service_visit_participants_active_lead_uniq
  on public.service_visit_participants (service_visit_id)
  where removed_at is null and role = 'lead';
create index if not exists service_visit_participants_user_idx
  on public.service_visit_participants (shop_id, user_id)
  where removed_at is null;
create index if not exists service_visit_participants_added_by_idx
  on public.service_visit_participants (added_by);
create index if not exists service_visit_participants_removed_by_idx
  on public.service_visit_participants (removed_by);

alter table public.service_visit_participants enable row level security;
revoke all on table public.service_visit_participants from public, anon, authenticated;
grant all on table public.service_visit_participants to service_role;

comment on table public.service_visit_participants is
  'Technicians on a service visit. role=lead mirrors service_visits.assigned_user_id (execution owner); acknowledgement is recorded here and never starts labor. Server-only; written by equipment dispatch commands.';

-- ---------------------------------------------------------------------------
-- Dispatch an existing work order: visit + participants (+ dispatch now).
-- ---------------------------------------------------------------------------
create or replace function public.equipment_dispatch_visit_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_mode text,
  p_service_address_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_lead_user_id uuid,
  p_support_user_ids uuid[],
  p_service_vehicle_id uuid,
  p_dispatch_notes text,
  p_dispatch_now boolean,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_profile uuid;
  v_mode text := lower(trim(coalesce(p_mode, '')));
  v_supports uuid[];
  v_request jsonb;
  v_hash text;
  v_operation public.scheduler_operation_keys%rowtype;
  v_active uuid;
  v_created jsonb;
  v_visit_id uuid;
  v_visit jsonb;
  v_transition jsonb;
  v_participants jsonb;
  v_result jsonb;
  v_user uuid;
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_manage(p_shop_id, p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Equipment dispatch denied.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null
     or length(trim(p_operation_key)) < 8 then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if v_mode not in ('shop', 'mobile') then
    raise exception using errcode = 'P0001', message = 'Visit mode must be shop or mobile.';
  end if;

  v_actor_profile := public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id);

  select coalesce(array_agg(distinct s order by s), '{}'::uuid[])
  into v_supports
  from unnest(coalesce(p_support_user_ids, '{}'::uuid[])) as s
  where s is not null and s is distinct from p_lead_user_id;

  if p_lead_user_id is null and cardinality(v_supports) > 0 then
    raise exception using errcode = 'P0001',
      message = 'A lead technician is required when adding supporting technicians.';
  end if;
  if coalesce(p_dispatch_now, false) and p_lead_user_id is null then
    raise exception using errcode = 'P0001',
      message = 'A technician is required to dispatch a visit.';
  end if;
  if coalesce(p_dispatch_now, false) and v_mode = 'mobile' and p_service_address_id is null then
    raise exception using errcode = 'P0001',
      message = 'A service address is required to dispatch a field visit.';
  end if;

  v_request := jsonb_build_object(
    'shop_id', p_shop_id,
    'work_order_id', p_work_order_id,
    'mode', v_mode,
    'service_address_id', p_service_address_id,
    'scheduled_start', p_scheduled_start,
    'scheduled_end', p_scheduled_end,
    'lead', p_lead_user_id,
    'supports', to_jsonb(v_supports),
    'service_vehicle_id', p_service_vehicle_id,
    'dispatch_notes', nullif(trim(coalesce(p_dispatch_notes, '')), ''),
    'dispatch_now', coalesce(p_dispatch_now, false),
    'actor_profile_id', v_actor_profile
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Serialize by key first, then by work order (same order everywhere).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_shop_id::text || ':equipment_dispatch_visit:' || p_operation_key, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_shop_id::text || ':equipment_dispatch_work_order:' || p_work_order_id::text, 0));

  select k.* into v_operation
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = 'equipment_dispatch_visit'
    and k.operation_key = p_operation_key;
  if found then
    if v_operation.actor_user_id is distinct from v_actor_profile
       or coalesce(v_operation.result ->> '_request_hash', '') <> v_hash then
      raise exception using errcode = '22023', message = 'EQUIPMENT_DISPATCH_OPERATION_KEY_CONFLICT';
    end if;
    return (v_operation.result - '_request_hash') || jsonb_build_object('idempotent', true);
  end if;

  if not exists (
    select 1 from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.shop_id = p_shop_id
      and coalesce(wo.record_type, 'work_order') = 'work_order'
  ) then
    raise exception using errcode = 'P0001', message = 'Work order is not available for dispatch in this shop.';
  end if;

  -- One active visit per work order: a double tap with a new key, or a second
  -- dispatcher, cannot create a parallel visit. Return trips are created after
  -- the previous visit is completed or cancelled.
  select sv.id into v_active
  from public.service_visits sv
  where sv.shop_id = p_shop_id
    and sv.work_order_id = p_work_order_id
    and sv.status in ('scheduled', 'dispatched', 'en_route', 'arrived', 'working', 'paused')
  limit 1;
  if found then
    raise exception using errcode = 'P0001',
      message = 'ACTIVE_SERVICE_VISIT_EXISTS',
      detail = v_active::text;
  end if;

  -- Supporting technicians must be dispatchable in this shop. The lead is
  -- validated (including Field access for mobile visits) by the canonical
  -- visit command below.
  foreach v_user in array v_supports loop
    if not exists (
      select 1 from public.profiles p
      where p.id = v_user and p.shop_id = p_shop_id
        and (
          lower(coalesce(p.role, '')) in ('mechanic','technician','tech','lead_hand','leadhand','foreman')
          or public.mobile_is_field_operator(p_shop_id, p.id)
        )
    ) then
      raise exception using errcode = 'P0001',
        message = 'A supporting technician is not eligible for dispatch.';
    end if;
  end loop;

  v_created := public.dispatch_create_service_visit_atomic(
    p_shop_id, null, p_work_order_id, v_mode, p_service_address_id,
    p_scheduled_start, p_scheduled_end, p_lead_user_id, p_service_vehicle_id,
    p_dispatch_notes, null, null, p_actor_user_id, p_operation_key || ':visit'
  );
  v_visit_id := (v_created #>> '{visit,id}')::uuid;
  v_visit := v_created -> 'visit';

  if p_lead_user_id is not null then
    insert into public.service_visit_participants(shop_id, service_visit_id, user_id, role, added_by)
    values (p_shop_id, v_visit_id, p_lead_user_id, 'lead', v_actor_profile);
  end if;
  foreach v_user in array v_supports loop
    insert into public.service_visit_participants(shop_id, service_visit_id, user_id, role, added_by)
    values (p_shop_id, v_visit_id, v_user, 'support', v_actor_profile);
  end loop;

  if coalesce(p_dispatch_now, false) then
    v_transition := public.dispatch_transition_service_visit_atomic(
      p_shop_id, v_visit_id, 'dispatched', null, null,
      nullif(v_visit ->> 'version', '')::integer,
      p_actor_user_id, p_operation_key || ':dispatch'
    );
    v_visit := coalesce(v_transition -> 'visit', v_visit);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('userId', p.user_id, 'role', p.role) order by p.role, p.added_at), '[]'::jsonb)
  into v_participants
  from public.service_visit_participants p
  where p.service_visit_id = v_visit_id and p.removed_at is null;

  v_result := jsonb_build_object(
    'ok', true,
    'workOrderId', p_work_order_id,
    'visit', v_visit,
    'participants', v_participants,
    'idempotent', false
  );
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (
    p_shop_id, 'equipment_dispatch_visit', p_operation_key, v_actor_profile,
    v_result || jsonb_build_object('_request_hash', v_hash)
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Office "New field call": linked work order + visit in one transaction.
-- Uses the canonical create_work_order_with_custom_id, which authorizes the
-- caller's session (auth.uid()) and restricts creation to office roles.
-- ---------------------------------------------------------------------------
create or replace function public.equipment_create_field_call_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_vehicle_id uuid,
  p_complaint text,
  p_priority integer,
  p_service_address_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_lead_user_id uuid,
  p_support_user_ids uuid[],
  p_service_vehicle_id uuid,
  p_dispatch_notes text,
  p_dispatch_now boolean,
  p_actor_user_id uuid,
  p_operation_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_profile uuid;
  v_request jsonb;
  v_hash text;
  v_operation public.scheduler_operation_keys%rowtype;
  v_work_order public.work_orders%rowtype;
  v_dispatch jsonb;
  v_result jsonb;
begin
  if not public.scheduler_actor_matches(p_actor_user_id)
     or not public.dispatch_can_manage(p_shop_id, p_actor_user_id)
     or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Equipment field call denied.';
  end if;
  if nullif(trim(coalesce(p_operation_key, '')), '') is null
     or length(trim(p_operation_key)) < 8 then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  v_actor_profile := public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id);
  v_request := jsonb_build_object(
    'shop_id', p_shop_id,
    'customer_id', p_customer_id,
    'vehicle_id', p_vehicle_id,
    'complaint', nullif(trim(coalesce(p_complaint, '')), ''),
    'priority', p_priority,
    'service_address_id', p_service_address_id,
    'scheduled_start', p_scheduled_start,
    'scheduled_end', p_scheduled_end,
    'lead', p_lead_user_id,
    'supports', (select coalesce(jsonb_agg(s order by s), '[]'::jsonb)
                 from (select distinct x as s from unnest(coalesce(p_support_user_ids, '{}'::uuid[])) x
                       where x is not null and x is distinct from p_lead_user_id) d),
    'service_vehicle_id', p_service_vehicle_id,
    'dispatch_notes', nullif(trim(coalesce(p_dispatch_notes, '')), ''),
    'dispatch_now', coalesce(p_dispatch_now, false),
    'actor_profile_id', v_actor_profile
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_shop_id::text || ':equipment_field_call:' || p_operation_key, 0));

  select k.* into v_operation
  from public.scheduler_operation_keys k
  where k.shop_id = p_shop_id
    and k.operation_name = 'equipment_field_call'
    and k.operation_key = p_operation_key;
  if found then
    if v_operation.actor_user_id is distinct from v_actor_profile
       or coalesce(v_operation.result ->> '_request_hash', '') <> v_hash then
      raise exception using errcode = '22023', message = 'EQUIPMENT_DISPATCH_OPERATION_KEY_CONFLICT';
    end if;
    return (v_operation.result - '_request_hash') || jsonb_build_object('idempotent', true);
  end if;

  if p_service_address_id is not null and not exists (
    select 1 from public.service_addresses sa
    where sa.id = p_service_address_id and sa.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Service address is not available in this shop.';
  end if;

  select * into v_work_order
  from public.create_work_order_with_custom_id(
    p_shop_id, p_customer_id, p_vehicle_id,
    coalesce(nullif(trim(coalesce(p_complaint, '')), ''), ''),
    coalesce(p_priority, 3), false, v_actor_profile
  );

  -- Any failure below rolls back the work order too: no orphan call.
  v_dispatch := public.equipment_dispatch_visit_atomic(
    p_shop_id, v_work_order.id, 'mobile', p_service_address_id,
    p_scheduled_start, p_scheduled_end, p_lead_user_id, p_support_user_ids,
    p_service_vehicle_id, p_dispatch_notes, p_dispatch_now,
    p_actor_user_id, p_operation_key || ':dispatch'
  );

  v_result := jsonb_build_object(
    'ok', true,
    'workOrder', jsonb_build_object('id', v_work_order.id, 'customId', v_work_order.custom_id),
    'workOrderId', v_work_order.id,
    'visit', v_dispatch -> 'visit',
    'participants', v_dispatch -> 'participants',
    'idempotent', false
  );
  insert into public.scheduler_operation_keys(shop_id, operation_name, operation_key, actor_user_id, result)
  values (
    p_shop_id, 'equipment_field_call', p_operation_key, v_actor_profile,
    v_result || jsonb_build_object('_request_hash', v_hash)
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Technician acknowledgement: records receipt only. It never changes visit
-- status and never starts, stops or creates labor.
-- ---------------------------------------------------------------------------
create or replace function public.equipment_acknowledge_visit_atomic(
  p_shop_id uuid,
  p_visit_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_profile uuid;
  v_row public.service_visit_participants%rowtype;
  v_already boolean;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Visit acknowledgement denied.';
  end if;
  v_actor_profile := public.dispatch_actor_profile_id(p_shop_id, p_actor_user_id);

  select p.* into v_row
  from public.service_visit_participants p
  join public.service_visits sv on sv.id = p.service_visit_id and sv.shop_id = p.shop_id
  where p.shop_id = p_shop_id
    and p.service_visit_id = p_visit_id
    and p.user_id = v_actor_profile
    and p.removed_at is null
    and sv.status in ('scheduled', 'dispatched', 'en_route', 'arrived', 'working', 'paused')
  for update of p;
  if not found then
    raise exception using errcode = '42501', message = 'Visit acknowledgement denied.';
  end if;

  v_already := v_row.acknowledged_at is not null;
  if not v_already then
    update public.service_visit_participants
    set acknowledged_at = now()
    where id = v_row.id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'visitId', p_visit_id,
    'acknowledgedAt', v_row.acknowledged_at,
    'idempotent', v_already
  );
end;
$$;

revoke all on function public.equipment_dispatch_visit_atomic(
  uuid,uuid,text,uuid,timestamptz,timestamptz,uuid,uuid[],uuid,text,boolean,uuid,text
) from public, anon;
revoke all on function public.equipment_create_field_call_atomic(
  uuid,uuid,uuid,text,integer,uuid,timestamptz,timestamptz,uuid,uuid[],uuid,text,boolean,uuid,text
) from public, anon;
revoke all on function public.equipment_acknowledge_visit_atomic(uuid,uuid,uuid)
  from public, anon;

grant execute on function public.equipment_dispatch_visit_atomic(
  uuid,uuid,text,uuid,timestamptz,timestamptz,uuid,uuid[],uuid,text,boolean,uuid,text
) to authenticated, service_role;
grant execute on function public.equipment_create_field_call_atomic(
  uuid,uuid,uuid,text,integer,uuid,timestamptz,timestamptz,uuid,uuid[],uuid,text,boolean,uuid,text
) to authenticated, service_role;
grant execute on function public.equipment_acknowledge_visit_atomic(uuid,uuid,uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
