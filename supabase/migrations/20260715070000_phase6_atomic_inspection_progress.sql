begin;

create table if not exists public.mobile_operation_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  operation_name text not null,
  operation_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  work_order_line_id uuid references public.work_order_lines(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, operation_name, operation_key)
);

alter table public.mobile_operation_keys enable row level security;

drop policy if exists mobile_operation_keys_shop_select
  on public.mobile_operation_keys;
create policy mobile_operation_keys_shop_select
  on public.mobile_operation_keys
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = mobile_operation_keys.shop_id
    )
  );

create or replace function public.save_inspection_progress_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_session jsonb,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_existing jsonb;
  v_inspection_id uuid;
  v_now timestamptz := coalesce(p_at, now());
  v_result jsonb;
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Inspection session payload must be a JSON object.';
  end if;

  select mok.result
    into v_existing
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'save_inspection_progress'
    and mok.operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select wol.id, wol.work_order_id, wol.shop_id
    into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id
    and wol.shop_id = p_shop_id
  for update;
  if not found or v_line.work_order_id is null then
    raise exception using errcode = 'P0001', message = 'Work-order line not found for shop.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_user_id
      and p.shop_id = p_shop_id
  ) then
    raise exception using errcode = 'P0001', message = 'Actor is not a member of this shop.';
  end if;

  select i.id
    into v_inspection_id
  from public.inspections i
  where i.work_order_line_id = p_work_order_line_id
    and i.shop_id = p_shop_id
  for update;

  if exists (
    select 1
    from public.inspections i
    where i.work_order_line_id = p_work_order_line_id
      and i.shop_id = p_shop_id
      and coalesce(i.locked, false) = true
  ) then
    raise exception using errcode = 'P0001', message = 'Inspection is finalized and locked. Reopen is required before editing.';
  end if;

  insert into public.inspection_sessions(
    work_order_id,
    work_order_line_id,
    user_id,
    state,
    updated_at
  ) values (
    v_line.work_order_id,
    p_work_order_line_id,
    p_actor_user_id,
    p_session,
    v_now
  )
  on conflict (work_order_line_id) do update
  set work_order_id = excluded.work_order_id,
      user_id = excluded.user_id,
      state = excluded.state,
      updated_at = excluded.updated_at;

  insert into public.inspections(
    work_order_id,
    work_order_line_id,
    shop_id,
    user_id,
    summary,
    is_draft,
    completed,
    locked,
    status,
    updated_at
  ) values (
    v_line.work_order_id,
    p_work_order_line_id,
    p_shop_id,
    p_actor_user_id,
    p_session,
    true,
    false,
    false,
    'draft',
    v_now
  )
  on conflict (work_order_line_id) do update
  set work_order_id = excluded.work_order_id,
      shop_id = excluded.shop_id,
      user_id = excluded.user_id,
      summary = excluded.summary,
      is_draft = true,
      completed = false,
      status = 'draft',
      updated_at = excluded.updated_at
  where coalesce(public.inspections.locked, false) = false
  returning id into v_inspection_id;

  if v_inspection_id is null then
    raise exception using errcode = 'P0001', message = 'Inspection is finalized and locked. Reopen is required before editing.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'inspection_id', v_inspection_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'saved_at', v_now,
    'idempotent', false
  );

  insert into public.mobile_operation_keys(
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    p_shop_id,
    'save_inspection_progress',
    p_operation_key,
    p_actor_user_id,
    v_line.work_order_id,
    p_work_order_line_id,
    v_result
  );

  return v_result;
exception
  when unique_violation then
    select mok.result
      into v_existing
    from public.mobile_operation_keys mok
    where mok.shop_id = p_shop_id
      and mok.operation_name = 'save_inspection_progress'
      and mok.operation_key = p_operation_key;
    if found then
      return v_existing || jsonb_build_object('idempotent', true);
    end if;
    raise;
end;
$$;

revoke all on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public;
grant execute on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;

commit;
