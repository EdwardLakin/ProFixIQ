begin;

create table if not exists public.invoice_pricing_overrides (
  work_order_id uuid primary key references public.work_orders(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  line_labor_totals jsonb not null default '{}'::jsonb,
  part_unit_prices jsonb not null default '{}'::jsonb,
  shop_supplies_amount numeric(12,2),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(line_labor_totals) = 'object'),
  check (jsonb_typeof(part_unit_prices) = 'object'),
  check (shop_supplies_amount is null or shop_supplies_amount >= 0)
);

create index if not exists invoice_pricing_overrides_shop_idx
  on public.invoice_pricing_overrides(shop_id, work_order_id);

alter table public.invoice_pricing_overrides enable row level security;
revoke all on public.invoice_pricing_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.invoice_pricing_overrides to service_role;
grant select on public.invoice_pricing_overrides to authenticated;

drop policy if exists invoice_pricing_overrides_shop_read
  on public.invoice_pricing_overrides;
create policy invoice_pricing_overrides_shop_read
  on public.invoice_pricing_overrides
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.shop_id = invoice_pricing_overrides.shop_id
        and (profile.id = auth.uid() or profile.user_id = auth.uid())
    )
  );

create or replace function public.work_order_delete_empty_shell_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_operation_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_order public.work_orders%rowtype;
  v_operation public.parts_operation_keys;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'WORK_ORDER_DELETE_SERVICE_ROLE_REQUIRED';
  end if;

  if p_shop_id is null or p_work_order_id is null
     or coalesce(trim(p_operation_key), '') = ''
     or p_operation_key <> p_shop_id::text || ':delete-empty-work-order:' || p_work_order_id::text then
    raise exception using errcode = '22023', message = 'WORK_ORDER_DELETE_OPERATION_KEY_INVALID';
  end if;

  v_operation := public.parts_begin_operation(
    p_shop_id,
    p_operation_key,
    'delete_empty_work_order',
    'work_order',
    p_work_order_id,
    p_actor_user_id
  );
  if v_operation.completed_at is not null then
    return coalesce(v_operation.result, '{}'::jsonb) || jsonb_build_object('idempotent', true);
  end if;

  select wo.* into v_work_order
  from public.work_orders wo
  where wo.id = p_work_order_id and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'WORK_ORDER_DELETE_NOT_FOUND_FOR_SHOP';
  end if;

  if coalesce(v_work_order.invoice_total, 0) <> 0
     or coalesce(v_work_order.labor_total, 0) <> 0
     or coalesce(v_work_order.parts_total, 0) <> 0
     or public.work_order_is_financially_locked(p_shop_id, p_work_order_id)
     or exists (select 1 from public.work_order_lines x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.work_order_quote_lines x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.work_order_parts x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.work_order_part_allocations x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.part_requests x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.invoices x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.invoice_versions x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.payments x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.supplier_orders x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.work_order_line_labor_segments x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.inspections x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id)
     or exists (select 1 from public.inspection_sessions x where x.work_order_id = p_work_order_id)
     or exists (select 1 from public.invoice_pricing_overrides x where x.shop_id = p_shop_id and x.work_order_id = p_work_order_id) then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_DELETE_NOT_EMPTY';
  end if;

  delete from public.work_orders
  where id = p_work_order_id and shop_id = p_shop_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'deleted', true,
    'work_order_id', p_work_order_id
  );
  return public.parts_complete_operation(v_operation.id, v_result);
end;
$$;

revoke all on function public.work_order_delete_empty_shell_atomic(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.work_order_delete_empty_shell_atomic(uuid, uuid, text, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
