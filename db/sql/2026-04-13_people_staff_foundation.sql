-- Canonical people/staff foundation for admin workflows.
-- Additive, shop-scoped, and non-breaking.

create table if not exists public.people_workforce_profiles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  workforce_role text,
  workforce_category text,
  employment_status text not null default 'active' check (employment_status in ('active','inactive','on_leave')),
  start_date date,
  payroll_ready boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

create table if not exists public.staff_certifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cert_type text not null default 'certification',
  cert_name text not null,
  cert_number text,
  issuing_body text,
  issue_date date,
  expiry_date date,
  status text not null default 'active' check (status in ('active','expired','revoked','pending')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_people_workforce_shop_status on public.people_workforce_profiles(shop_id, employment_status);
create index if not exists idx_staff_certifications_shop_user on public.staff_certifications(shop_id, user_id);
create index if not exists idx_staff_certifications_expiry on public.staff_certifications(shop_id, expiry_date);

alter table public.people_workforce_profiles enable row level security;
alter table public.staff_certifications enable row level security;

do $$ begin
  create policy people_workforce_profiles_shop_all on public.people_workforce_profiles
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy staff_certifications_shop_all on public.staff_certifications
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;
