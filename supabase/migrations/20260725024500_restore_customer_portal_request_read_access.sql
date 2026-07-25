begin;

create or replace function public.profixiq_has_portal_customer_shop(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customers c
    join public.customer_portal_invites i on i.customer_id = c.id
    where c.shop_id = p_shop_id
      and c.user_id = auth.uid()
      and i.accepted_by_user_id = auth.uid()
      and i.accepted_at is not null
      and i.revoked_at is null
  )
$$;

create or replace function public.profixiq_is_portal_customer_for(
  p_customer_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customers c
    join public.customer_portal_invites i on i.customer_id = c.id
    where c.id = p_customer_id
      and c.shop_id = p_shop_id
      and c.user_id = auth.uid()
      and i.accepted_by_user_id = auth.uid()
      and i.accepted_at is not null
      and i.revoked_at is null
  )
$$;

create or replace function public.profixiq_is_portal_customer_work_order(
  p_work_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and public.profixiq_is_portal_customer_for(wo.customer_id, wo.shop_id)
  )
$$;

revoke all on function public.profixiq_has_portal_customer_shop(uuid) from public;
revoke all on function public.profixiq_is_portal_customer_for(uuid, uuid) from public;
revoke all on function public.profixiq_is_portal_customer_work_order(uuid) from public;
grant execute on function public.profixiq_has_portal_customer_shop(uuid) to authenticated;
grant execute on function public.profixiq_is_portal_customer_for(uuid, uuid) to authenticated;
grant execute on function public.profixiq_is_portal_customer_work_order(uuid) to authenticated;

alter table public.work_orders enable row level security;
alter table public.bookings enable row level security;
alter table public.work_order_lines enable row level security;
alter table public.work_order_quote_lines enable row level security;
alter table public.menu_items enable row level security;

drop policy if exists work_orders_customer_portal_select on public.work_orders;
create policy work_orders_customer_portal_select
on public.work_orders
for select
to authenticated
using (public.profixiq_is_portal_customer_for(customer_id, shop_id));

drop policy if exists bookings_customer_portal_select on public.bookings;
create policy bookings_customer_portal_select
on public.bookings
for select
to authenticated
using (public.profixiq_is_portal_customer_for(customer_id, shop_id));

drop policy if exists work_order_lines_customer_portal_select on public.work_order_lines;
create policy work_order_lines_customer_portal_select
on public.work_order_lines
for select
to authenticated
using (public.profixiq_is_portal_customer_work_order(work_order_id));

drop policy if exists work_order_quote_lines_customer_portal_select on public.work_order_quote_lines;
create policy work_order_quote_lines_customer_portal_select
on public.work_order_quote_lines
for select
to authenticated
using (public.profixiq_is_portal_customer_work_order(work_order_id));

drop policy if exists menu_items_customer_portal_select on public.menu_items;
create policy menu_items_customer_portal_select
on public.menu_items
for select
to authenticated
using (
  is_active = true
  and public.profixiq_has_portal_customer_shop(shop_id)
);

commit;
