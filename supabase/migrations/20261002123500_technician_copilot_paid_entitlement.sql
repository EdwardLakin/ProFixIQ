begin;

alter table public.shops
  add column if not exists technician_copilot_licensed_seats integer not null default 0
    check (technician_copilot_licensed_seats >= 0);

create table if not exists public.technician_copilot_seat_assignments (
  shop_id uuid not null references public.shops(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (shop_id, profile_id)
);

alter table public.technician_copilot_seat_assignments enable row level security;
revoke all on table public.technician_copilot_seat_assignments
  from anon, authenticated;

create or replace function public.technician_copilot_has_paid_access(
  p_shop_id uuid,
  p_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      shop.technician_copilot_licensed_seats > 0
      and exists (
        select 1
        from public.technician_copilot_seat_assignments assignment
        where assignment.shop_id = shop.id
          and assignment.profile_id = p_profile_id
          and assignment.active
      )
      and (
        select count(*)
        from public.technician_copilot_seat_assignments assignment
        where assignment.shop_id = shop.id
          and assignment.active
      ) <= shop.technician_copilot_licensed_seats
    from public.shops shop
    where shop.id = p_shop_id
  ), false);
$$;

revoke all on function public.technician_copilot_has_paid_access(uuid, uuid)
  from public, anon;
grant execute on function public.technician_copilot_has_paid_access(uuid, uuid)
  to authenticated, service_role;

create or replace function public.set_technician_copilot_licensed_seats(
  p_shop_id uuid,
  p_seats integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_shop_id is null or p_seats is null or p_seats < 0 then
    raise exception using errcode = '22023', message = 'invalid copilot seat entitlement';
  end if;

  update public.shops
  set technician_copilot_licensed_seats = p_seats,
      billing_entitlement_updated_at = now()
  where id = p_shop_id;

  return found;
end;
$$;

revoke all on function public.set_technician_copilot_licensed_seats(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.set_technician_copilot_licensed_seats(uuid, integer)
  to service_role;

comment on column public.shops.technician_copilot_licensed_seats is
  'Stripe-synchronized licensed Technician Copilot seats. Tester overrides are evaluated server-side and do not alter this count.';

commit;
