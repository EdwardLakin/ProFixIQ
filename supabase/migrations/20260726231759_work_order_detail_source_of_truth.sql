begin;

alter table public.work_order_parts enable row level security;

-- Reconcile drift from older broad same-shop policies. Keep write policies intact,
-- but make every read path follow the same role/assignment rules as work orders.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'work_order_parts'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.work_order_parts',
      policy_row.policyname
    );
  end loop;
end $$;

create policy work_order_parts_role_select
on public.work_order_parts
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (
    (select public.profixiq_current_role()) in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'parts', 'lead_hand', 'foreman'
    )
    or (
      (select public.profixiq_current_role()) = 'mechanic'
      and (
        (
          work_order_line_id is not null
          and public.profixiq_is_assigned_to_line(work_order_line_id)
        )
        or public.profixiq_is_assigned_to_work_order(work_order_id)
      )
    )
  )
);

-- Customer portal reads are intentionally independent from shop-role access.
create policy work_order_parts_customer_portal_select
on public.work_order_parts
for select
to authenticated
using (
  exists (
    select 1
    from public.work_orders wo
    join public.customers c
      on c.id = wo.customer_id
    where wo.id = work_order_parts.work_order_id
      and wo.shop_id = work_order_parts.shop_id
      and c.user_id = (select auth.uid())
  )
);

grant select on table public.work_order_parts to authenticated;

notify pgrst, 'reload schema';

commit;
