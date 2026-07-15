begin;

-- Canonicalize the current application role inside database policies so legacy
-- aliases cannot accidentally create a second permission path.
create or replace function public.profixiq_current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case lower(btrim(coalesce(p.role, '')))
    when 'tech' then 'mechanic'
    when 'technician' then 'mechanic'
    when 'lead' then 'lead_hand'
    when 'leadhand' then 'lead_hand'
    when 'lead hand' then 'lead_hand'
    else lower(btrim(coalesce(p.role, 'unknown')))
  end
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.profixiq_is_assigned_to_line(p_line_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.work_order_lines wol
    where wol.id = p_line_id
      and wol.shop_id = public.current_shop_id()
      and (
        wol.assigned_tech_id = auth.uid()
        or wol.assigned_to = auth.uid()
        or exists (
          select 1
          from public.work_order_line_technicians wolt
          where wolt.work_order_line_id = wol.id
            and wolt.technician_id = auth.uid()
        )
      )
  )
$$;

create or replace function public.profixiq_is_assigned_to_work_order(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.work_order_lines wol
    where wol.work_order_id = p_work_order_id
      and public.profixiq_is_assigned_to_line(wol.id)
  )
$$;

revoke all on function public.profixiq_current_role() from public;
revoke all on function public.profixiq_is_assigned_to_line(uuid) from public;
revoke all on function public.profixiq_is_assigned_to_work_order(uuid) from public;
grant execute on function public.profixiq_current_role() to authenticated;
grant execute on function public.profixiq_is_assigned_to_line(uuid) to authenticated;
grant execute on function public.profixiq_is_assigned_to_work_order(uuid) to authenticated;

alter table public.work_orders enable row level security;
alter table public.work_order_lines enable row level security;
alter table public.work_order_line_technicians enable row level security;

-- Replace every permissive policy on these three core tables. Leaving even one
-- same-shop-for-all policy in place would OR around the role gates below.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'work_orders',
        'work_order_lines',
        'work_order_line_technicians'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end $$;

create policy work_orders_role_select
on public.work_orders
for select
to authenticated
using (
  shop_id = public.current_shop_id()
  and (
    public.profixiq_current_role() in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'parts', 'lead_hand', 'foreman'
    )
    or (
      public.profixiq_current_role() = 'mechanic'
      and public.profixiq_is_assigned_to_work_order(id)
    )
  )
);

create policy work_orders_role_insert
on public.work_orders
for insert
to authenticated
with check (
  shop_id = public.current_shop_id()
  and public.profixiq_current_role() in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  )
);

create policy work_orders_role_update
on public.work_orders
for update
to authenticated
using (
  shop_id = public.current_shop_id()
  and public.profixiq_current_role() in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  )
)
with check (
  shop_id = public.current_shop_id()
  and public.profixiq_current_role() in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  )
);

create policy work_orders_role_delete
on public.work_orders
for delete
to authenticated
using (
  shop_id = public.current_shop_id()
  and public.profixiq_current_role() in ('owner', 'admin')
);

create policy work_order_lines_role_select
on public.work_order_lines
for select
to authenticated
using (
  shop_id = public.current_shop_id()
  and (
    public.profixiq_current_role() in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'parts', 'lead_hand', 'foreman'
    )
    or (
      public.profixiq_current_role() = 'mechanic'
      and (
        public.profixiq_is_assigned_to_line(id)
        or public.profixiq_is_assigned_to_work_order(work_order_id)
      )
    )
  )
);

create policy work_order_lines_role_insert
on public.work_order_lines
for insert
to authenticated
with check (
  shop_id = public.current_shop_id()
  and (
    public.profixiq_current_role() in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
    )
    or (
      public.profixiq_current_role() = 'mechanic'
      and public.profixiq_is_assigned_to_work_order(work_order_id)
    )
  )
);

create policy work_order_lines_role_update
on public.work_order_lines
for update
to authenticated
using (
  shop_id = public.current_shop_id()
  and (
    public.profixiq_current_role() in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
    )
    or (
      public.profixiq_current_role() = 'mechanic'
      and public.profixiq_is_assigned_to_line(id)
    )
  )
)
with check (
  shop_id = public.current_shop_id()
  and (
    public.profixiq_current_role() in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
    )
    or (
      public.profixiq_current_role() = 'mechanic'
      and public.profixiq_is_assigned_to_line(id)
    )
  )
);

create policy work_order_lines_role_delete
on public.work_order_lines
for delete
to authenticated
using (
  shop_id = public.current_shop_id()
  and public.profixiq_current_role() in ('owner', 'admin')
);

create policy work_order_line_technicians_role_select
on public.work_order_line_technicians
for select
to authenticated
using (
  technician_id = auth.uid()
  or (
    public.profixiq_current_role() in (
      'owner', 'admin', 'manager', 'advisor', 'lead_hand', 'foreman'
    )
    and exists (
      select 1
      from public.work_order_lines wol
      where wol.id = work_order_line_id
        and wol.shop_id = public.current_shop_id()
    )
  )
);

create policy work_order_line_technicians_role_insert
on public.work_order_line_technicians
for insert
to authenticated
with check (
  public.profixiq_current_role() in (
    'owner', 'admin', 'manager', 'advisor', 'lead_hand', 'foreman'
  )
  and exists (
    select 1
    from public.work_order_lines wol
    where wol.id = work_order_line_id
      and wol.shop_id = public.current_shop_id()
  )
);

create policy work_order_line_technicians_role_update
on public.work_order_line_technicians
for update
to authenticated
using (
  public.profixiq_current_role() in (
    'owner', 'admin', 'manager', 'advisor', 'lead_hand', 'foreman'
  )
  and exists (
    select 1
    from public.work_order_lines wol
    where wol.id = work_order_line_id
      and wol.shop_id = public.current_shop_id()
  )
)
with check (
  public.profixiq_current_role() in (
    'owner', 'admin', 'manager', 'advisor', 'lead_hand', 'foreman'
  )
  and exists (
    select 1
    from public.work_order_lines wol
    where wol.id = work_order_line_id
      and wol.shop_id = public.current_shop_id()
  )
);

create policy work_order_line_technicians_role_delete
on public.work_order_line_technicians
for delete
to authenticated
using (
  public.profixiq_current_role() in (
    'owner', 'admin', 'manager', 'advisor', 'lead_hand', 'foreman'
  )
  and exists (
    select 1
    from public.work_order_lines wol
    where wol.id = work_order_line_id
      and wol.shop_id = public.current_shop_id()
  )
);

commit;
