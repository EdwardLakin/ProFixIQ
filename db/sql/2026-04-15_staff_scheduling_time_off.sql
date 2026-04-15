-- Staff scheduling + time off foundation (additive)

create table if not exists public.staff_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  is_working_day boolean not null default true,
  start_time time,
  end_time time,
  unpaid_break_minutes int not null default 0,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id, day_of_week, effective_from)
);

create table if not exists public.staff_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  schedule_date date not null,
  start_time timestamptz,
  end_time timestamptz,
  unpaid_break_minutes int not null default 0,
  source_type text not null default 'manual_override',
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_time_off_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_partial_day boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  reason text,
  requested_at timestamptz not null default now(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.staff_availability_blocks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  block_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_staff_sched_templates_shop_user on public.staff_schedule_templates(shop_id, user_id);
create index if not exists idx_staff_sched_overrides_shop_date on public.staff_schedule_overrides(shop_id, schedule_date);
create index if not exists idx_staff_sched_overrides_shop_user_date on public.staff_schedule_overrides(shop_id, user_id, schedule_date);
create index if not exists idx_staff_time_off_shop_status on public.staff_time_off_requests(shop_id, status);
create index if not exists idx_staff_time_off_shop_user_dates on public.staff_time_off_requests(shop_id, user_id, starts_at, ends_at);
create index if not exists idx_staff_avail_blocks_shop_user_dates on public.staff_availability_blocks(shop_id, user_id, starts_at, ends_at);
create unique index if not exists idx_staff_avail_blocks_source on public.staff_availability_blocks(shop_id, source_type, source_id) where source_id is not null;

alter table public.staff_schedule_templates enable row level security;
alter table public.staff_schedule_overrides enable row level security;
alter table public.staff_time_off_requests enable row level security;
alter table public.staff_availability_blocks enable row level security;

do $$ begin
  create policy staff_schedule_templates_shop_all on public.staff_schedule_templates
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy staff_schedule_overrides_shop_all on public.staff_schedule_overrides
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy staff_time_off_requests_shop_all on public.staff_time_off_requests
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy staff_time_off_requests_self on public.staff_time_off_requests
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy staff_availability_blocks_shop_all on public.staff_availability_blocks
    for all to authenticated
    using (shop_id = public.current_shop_id())
    with check (shop_id = public.current_shop_id());
exception when duplicate_object then null; end $$;

