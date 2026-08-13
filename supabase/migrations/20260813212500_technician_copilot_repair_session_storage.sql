-- Technician CoPilot V2 phase 1: durable repair-session storage.
-- Additive only; canonical work-order tables remain unchanged.

begin;

create table if not exists public.repair_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete restrict,
  work_order_id uuid not null references public.work_orders(id) on delete restrict,
  active_work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  service_visit_id uuid references public.service_visits(id) on delete set null,
  mode text not null default 'shop' check (mode in ('shop', 'field', 'fleet')),
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  current_task text,
  context_version bigint not null default 0 check (context_version >= 0),
  last_event_seq bigint not null default 0 check (last_event_seq >= 0),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repair_sessions_closed_time_check check (status <> 'closed' or ended_at is not null)
);

create unique index if not exists repair_sessions_one_active_per_technician_idx
  on public.repair_sessions (technician_id) where status = 'active';
create index if not exists repair_sessions_technician_activity_idx
  on public.repair_sessions (technician_id, status, last_activity_at desc);
create index if not exists repair_sessions_work_order_idx
  on public.repair_sessions (shop_id, work_order_id, status);

commit;
