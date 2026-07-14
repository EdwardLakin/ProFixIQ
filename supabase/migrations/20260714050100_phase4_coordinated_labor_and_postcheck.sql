begin;

create or replace function public.pause_all_active_technician_labor_atomic(
  p_shop_id uuid,
  p_technician_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz,
  p_reason text,
  p_event text,
  p_source_event_id uuid default null,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_result jsonb;
  v_line_id uuid;
  v_child jsonb;
  v_children jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select result into v_existing
  from public.workforce_operation_keys
  where shop_id = p_shop_id
    and operation_name = 'pause_all_active_labor'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  perform 1
  from public.profiles p
  where p.id = p_actor_user_id and p.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'Actor is not available for this shop.';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_technician_id and p.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Technician is not available for this shop.';
  end if;

  perform 1
  from public.work_order_line_labor_segments seg
  where seg.shop_id = p_shop_id
    and seg.technician_id = p_technician_id
    and seg.ended_at is null
  for update;

  for v_line_id in
    select distinct seg.work_order_line_id
    from public.work_order_line_labor_segments seg
    where seg.shop_id = p_shop_id
      and seg.technician_id = p_technician_id
      and seg.ended_at is null
      and seg.work_order_line_id is not null
    order by seg.work_order_line_id
  loop
    v_child := public.apply_job_punch_transition_atomic(
      p_shop_id,
      v_line_id,
      'pause',
      p_technician_id,
      p_actor_user_id,
      p_operation_key || ':' || v_line_id::text,
      true,
      coalesce(p_at, now()),
      null,
      p_reason,
      null,
      true,
      false,
      null,
      null,
      p_event,
      coalesce(p_details, '{}'::jsonb) || jsonb_build_object('source_event_id', p_source_event_id)
    );
    v_children := v_children || jsonb_build_array(v_child);
    v_count := v_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'shop_id', p_shop_id,
    'technician_id', p_technician_id,
    'closed_line_count', v_count,
    'source_event_id', p_source_event_id,
    'transitions', v_children
  );

  insert into public.workforce_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, result
  ) values (
    p_shop_id, 'pause_all_active_labor', p_operation_key, p_actor_user_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function public.pause_all_active_technician_labor_atomic(uuid,uuid,uuid,text,timestamptz,text,text,uuid,jsonb) from public, anon;
grant execute on function public.pause_all_active_technician_labor_atomic(uuid,uuid,uuid,text,timestamptz,text,text,uuid,jsonb) to authenticated, service_role;

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.workforce_operation_keys') is null then
    v_missing := array_append(v_missing, 'workforce_operation_keys');
  end if;
  if to_regprocedure('public.assign_work_order_line_technician_atomic(uuid,uuid,uuid,uuid,text)') is null then
    v_missing := array_append(v_missing, 'assign_work_order_line_technician_atomic');
  end if;
  if to_regprocedure('public.apply_job_punch_transition_atomic(uuid,uuid,text,uuid,uuid,text,boolean,timestamptz,text,text,text,boolean,boolean,text,text,text,jsonb)') is null then
    v_missing := array_append(v_missing, 'apply_job_punch_transition_atomic');
  end if;
  if to_regprocedure('public.pause_all_active_technician_labor_atomic(uuid,uuid,uuid,text,timestamptz,text,text,uuid,jsonb)') is null then
    v_missing := array_append(v_missing, 'pause_all_active_technician_labor_atomic');
  end if;
  if to_regprocedure('public.work_order_is_financially_locked(uuid,uuid)') is null then
    v_missing := array_append(v_missing, 'Phase 2 financial lock function');
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'workforce_operation_keys'
      and indexdef ilike '%unique%shop_id%operation_name%operation_key%'
  ) then
    v_missing := array_append(v_missing, 'tenant operation-key uniqueness');
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_order_line_labor_segments'
      and column_name in ('shop_id','work_order_id','work_order_line_id','technician_id','started_at','ended_at','pause_reason')
    group by table_schema, table_name
    having count(*) = 7
  ) then
    v_missing := array_append(v_missing, 'labor segment column contract');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'Phase 4 technician labor postcheck failed. Missing: %', array_to_string(v_missing, ', ');
  end if;
  raise notice 'Phase 4 technician labor lifecycle postcheck passed.';
end;
$$;

notify pgrst, 'reload schema';
commit;
