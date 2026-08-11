-- Expand the canonical customer record without replacing any existing
-- customer, vehicle, work-order, portal, or Fleet relationship.

alter table public.customers
  add column if not exists account_type text not null default 'individual',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists parent_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists default_bill_to_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists active boolean not null default true;

update public.customers c
set account_type = case
  when c.is_fleet or exists (
    select 1 from public.fleets f where f.customer_id = c.id
  ) then 'fleet'
  when nullif(trim(coalesce(c.business_name, '')), '') is not null then 'business'
  else 'individual'
end;

alter table public.customers
  drop constraint if exists customers_account_type_check;
alter table public.customers
  add constraint customers_account_type_check
  check (account_type in ('individual', 'business', 'fleet', 'enterprise'))
  not valid;
alter table public.customers validate constraint customers_account_type_check;

create index if not exists customers_shop_account_type_idx
  on public.customers (shop_id, account_type)
  where active;
create index if not exists customers_parent_customer_idx
  on public.customers (parent_customer_id)
  where parent_customer_id is not null;
create index if not exists customers_default_bill_to_idx
  on public.customers (default_bill_to_customer_id)
  where default_bill_to_customer_id is not null;

create or replace function public.enforce_customer_account_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_fleet then
    new.account_type := 'fleet';
  elsif new.account_type = 'fleet' then
    new.is_fleet := true;
  elsif new.account_type = 'individual'
    and nullif(trim(coalesce(new.business_name, '')), '') is not null then
    new.account_type := 'business';
  end if;

  if new.parent_customer_id = new.id then
    raise exception 'A customer cannot be its own parent account';
  end if;
  if new.default_bill_to_customer_id = new.id then
    raise exception 'A customer cannot bill to itself through an override';
  end if;

  if new.parent_customer_id is not null and not exists (
    select 1
    from public.customers parent
    where parent.id = new.parent_customer_id
      and parent.shop_id = new.shop_id
  ) then
    raise exception 'Parent customer account must belong to the same shop';
  end if;

  if new.default_bill_to_customer_id is not null and not exists (
    select 1
    from public.customers bill_to
    where bill_to.id = new.default_bill_to_customer_id
      and bill_to.shop_id = new.shop_id
  ) then
    raise exception 'Bill-to customer account must belong to the same shop';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_customer_account_boundary()
  from public, anon, authenticated;

drop trigger if exists enforce_customer_account_boundary_trigger
  on public.customers;
create trigger enforce_customer_account_boundary_trigger
before insert or update of
  shop_id,
  account_type,
  is_fleet,
  business_name,
  parent_customer_id,
  default_bill_to_customer_id
on public.customers
for each row execute function public.enforce_customer_account_boundary();

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  email text,
  phone text,
  role text not null default 'other'
    check (role in ('primary', 'service', 'billing', 'approver', 'other')),
  portal_user_id uuid references auth.users(id) on delete set null,
  is_primary boolean not null default false,
  can_approve boolean not null default false,
  can_view_billing boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contacts_identity_check check (
    nullif(trim(coalesce(display_name, '')), '') is not null
    or nullif(trim(coalesce(first_name, '')), '') is not null
    or nullif(trim(coalesce(last_name, '')), '') is not null
    or nullif(trim(coalesce(email, '')), '') is not null
    or nullif(trim(coalesce(phone, '')), '') is not null
  )
);

create index if not exists customer_contacts_customer_idx
  on public.customer_contacts (customer_id, active);
create index if not exists customer_contacts_shop_email_idx
  on public.customer_contacts (shop_id, lower(email))
  where email is not null and active;
create unique index if not exists customer_contacts_one_primary_idx
  on public.customer_contacts (customer_id)
  where is_primary and active;

create table if not exists public.customer_locations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  location_type text not null default 'service'
    check (location_type in ('billing', 'service', 'branch', 'other')),
  address text,
  city text,
  province text,
  postal_code text,
  country text not null default 'CA',
  is_primary boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_locations_customer_idx
  on public.customer_locations (customer_id, active);
create unique index if not exists customer_locations_one_primary_idx
  on public.customer_locations (customer_id)
  where is_primary and active;

create or replace function public.enforce_customer_child_shop_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.shop_id = new.shop_id
  ) then
    raise exception 'Customer contact or location must belong to the same shop';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_customer_child_shop_boundary()
  from public, anon, authenticated;

drop trigger if exists customer_contacts_shop_boundary_trigger
  on public.customer_contacts;
create trigger customer_contacts_shop_boundary_trigger
before insert or update of shop_id, customer_id on public.customer_contacts
for each row execute function public.enforce_customer_child_shop_boundary();

drop trigger if exists customer_locations_shop_boundary_trigger
  on public.customer_locations;
create trigger customer_locations_shop_boundary_trigger
before insert or update of shop_id, customer_id on public.customer_locations
for each row execute function public.enforce_customer_child_shop_boundary();

drop trigger if exists customer_contacts_set_updated_at
  on public.customer_contacts;
create trigger customer_contacts_set_updated_at
before update on public.customer_contacts
for each row execute function public.set_updated_at();

drop trigger if exists customer_locations_set_updated_at
  on public.customer_locations;
create trigger customer_locations_set_updated_at
before update on public.customer_locations
for each row execute function public.set_updated_at();

alter table public.customer_contacts enable row level security;
alter table public.customer_locations enable row level security;

create policy customer_contacts_staff_select
on public.customer_contacts for select to authenticated
using (public.is_staff_for_shop(shop_id));
create policy customer_contacts_staff_insert
on public.customer_contacts for insert to authenticated
with check (public.is_staff_for_shop(shop_id));
create policy customer_contacts_staff_update
on public.customer_contacts for update to authenticated
using (public.is_staff_for_shop(shop_id))
with check (public.is_staff_for_shop(shop_id));
create policy customer_contacts_staff_delete
on public.customer_contacts for delete to authenticated
using (public.is_staff_for_shop(shop_id));

create policy customer_locations_staff_select
on public.customer_locations for select to authenticated
using (public.is_staff_for_shop(shop_id));
create policy customer_locations_staff_insert
on public.customer_locations for insert to authenticated
with check (public.is_staff_for_shop(shop_id));
create policy customer_locations_staff_update
on public.customer_locations for update to authenticated
using (public.is_staff_for_shop(shop_id))
with check (public.is_staff_for_shop(shop_id));
create policy customer_locations_staff_delete
on public.customer_locations for delete to authenticated
using (public.is_staff_for_shop(shop_id));

grant select, insert, update, delete on table public.customer_contacts
  to authenticated, service_role;
grant select, insert, update, delete on table public.customer_locations
  to authenticated, service_role;

-- Keep the established Fleet compatibility flag and new account type aligned
-- for both explicitly linked and automatically created Fleet customers.
create or replace function public.ensure_fleet_customer_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
begin
  if new.customer_id is not null then
    if not exists (
      select 1
      from public.customers c
      where c.id = new.customer_id
        and c.shop_id = new.shop_id
    ) then
      raise exception 'Fleet customer account must belong to the same shop';
    end if;
    update public.customers
    set is_fleet = true,
        account_type = 'fleet',
        business_name = coalesce(nullif(business_name, ''), new.name),
        name = coalesce(nullif(name, ''), new.contact_name, new.name),
        email = coalesce(nullif(email, ''), new.contact_email),
        updated_at = now()
    where id = new.customer_id;
    return new;
  end if;

  if nullif(trim(coalesce(new.contact_email, '')), '') is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.shop_id = new.shop_id
      and lower(trim(c.email)) = lower(trim(new.contact_email))
    order by c.created_at, c.id
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      shop_id, name, business_name, email, is_fleet, account_type, notes, updated_at
    ) values (
      new.shop_id,
      coalesce(nullif(trim(coalesce(new.contact_name, '')), ''), new.name),
      new.name,
      nullif(trim(coalesce(new.contact_email, '')), ''),
      true,
      'fleet',
      'Canonical customer account for Fleet portal billing and history.',
      now()
    )
    returning id into v_customer_id;
  else
    update public.customers
    set is_fleet = true,
        account_type = 'fleet',
        business_name = coalesce(nullif(business_name, ''), new.name),
        name = coalesce(nullif(name, ''), new.contact_name, new.name),
        updated_at = now()
    where id = v_customer_id;
  end if;

  new.customer_id := v_customer_id;
  return new;
end;
$$;

revoke all on function public.ensure_fleet_customer_account()
  from public, anon, authenticated;
