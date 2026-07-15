begin;

create table if not exists public.system_lifecycle_operation_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  operation_name text not null,
  operation_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, operation_name, operation_key)
);

alter table public.system_lifecycle_operation_keys enable row level security;

drop policy if exists system_lifecycle_operation_keys_shop_select
  on public.system_lifecycle_operation_keys;
create policy system_lifecycle_operation_keys_shop_select
  on public.system_lifecycle_operation_keys
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = system_lifecycle_operation_keys.shop_id
    )
  );

create or replace function public.mark_work_order_ready_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_at, now());
  v_work_order public.work_orders%rowtype;
  v_existing jsonb;
  v_result jsonb;
  v_line_count integer := 0;
  v_not_done integer := 0;
  v_pending_quotes integer := 0;
begin
  if p_actor_user_id is null or nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'Authenticated actor and stable operation key are required.';
  end if;

  select result into v_existing
  from public.system_lifecycle_operation_keys
  where shop_id = p_shop_id
    and operation_name = 'mark_work_order_ready'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
    and shop_id = p_shop_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Work order not found for shop.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_user_id
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role::text, '')) in ('owner', 'admin', 'manager', 'advisor')
  ) then
    raise exception using errcode = 'P0001', message = 'Actor is not authorized to mark this work order ready.';
  end if;

  if public.work_order_is_financially_locked(p_shop_id, p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'FINANCIALLY_LOCKED: readiness cannot change after invoice finalization.';
  end if;

  perform 1
  from public.work_order_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
  order by id
  for update;

  perform 1
  from public.work_order_quote_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
  order by id
  for update;

  select
    count(*) filter (where voided_at is null),
    count(*) filter (
      where voided_at is null
        and lower(coalesce(status::text, '')) not in (
          'completed', 'declined', 'deferred', 'ready_to_invoice', 'invoiced'
        )
    )
  into v_line_count, v_not_done
  from public.work_order_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id;

  if v_line_count = 0 then
    raise exception using errcode = 'P0001', message = 'Work order has no active lines.';
  end if;
  if v_not_done > 0 then
    raise exception using errcode = 'P0001', message = 'All active lines must be completed, declined, or deferred first.';
  end if;

  select count(*)
  into v_pending_quotes
  from public.work_order_quote_lines
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and (
      sent_to_customer_at is not null
      or lower(coalesce(status::text, '')) in ('sent', 'ready_to_send', 'quoted')
    )
    and not (
      lower(coalesce(status::text, '')) in (
        'approved', 'converted', 'declined', 'deferred', 'rejected', 'cancelled', 'canceled'
      )
      or stage::text in ('customer_approved', 'customer_declined', 'customer_deferred')
      or approved_at is not null
      or declined_at is not null
      or work_order_line_id is not null
    );

  if v_pending_quotes > 0 then
    raise exception using errcode = 'P0001', message = 'Active pending quote lines must be resolved before invoicing.';
  end if;

  update public.work_orders
  set status = 'ready_to_invoice',
      updated_at = v_now
  where id = p_work_order_id
    and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'workOrderId', p_work_order_id,
    'status', 'ready_to_invoice',
    'lineCount', v_line_count
  );

  insert into public.system_lifecycle_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'mark_work_order_ready', p_operation_key,
    p_actor_user_id, p_work_order_id, v_result
  );

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id,
    'work_order_marked_ready',
    'work_orders',
    p_work_order_id,
    jsonb_build_object('shop_id', p_shop_id, 'operation_key', p_operation_key)
  );

  return v_result;
end;
$$;

revoke all on function public.mark_work_order_ready_atomic(uuid, uuid, uuid, text, timestamptz)
  from public, anon;
grant execute on function public.mark_work_order_ready_atomic(uuid, uuid, uuid, text, timestamptz)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
