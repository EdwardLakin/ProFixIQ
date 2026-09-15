-- Phase 6 of the dashboard assistant plan: a narrow GREEN command
-- (stage_appointment_work_order_lines) that stages a proposed repair line
-- for a booking's exactly-matched, parts-ready learned repair(s) — never a
-- live, punchable work_order_lines row. This is internal-only at the table
-- level, the same lockdown as appointment_preparations (Phase 4) and
-- shop_blocker_observations (Phase 3): no application role can read it
-- directly. Only the service-role cron job
-- (features/operations/server/syncAppointmentWorkOrderStaging.ts) writes
-- and reads it. This never creates a work order, a repair line, an
-- approval, or otherwise punchable work — the advisor still reviews and
-- explicitly creates the real work order themselves.

create table if not exists public.appointment_work_order_staging (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  -- Point-in-time proposal assembled by the sync job from
  -- appointment_preparations.matched_menu_items. Structure is owned by
  -- features/operations/server/appointmentWorkOrderStaging/*, not by a DB
  -- constraint, since this is a reviewable proposal rather than a
  -- workflow record of its own.
  staged_lines jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_work_order_staging_booking_key
    unique (booking_id)
);

create index if not exists appointment_work_order_staging_shop_idx
  on public.appointment_work_order_staging (shop_id);

drop trigger if exists appointment_work_order_staging_set_updated_at
  on public.appointment_work_order_staging;
create trigger appointment_work_order_staging_set_updated_at
before update on public.appointment_work_order_staging
for each row execute function public.shop_assistant_set_updated_at();

alter table public.appointment_work_order_staging enable row level security;
revoke all on table public.appointment_work_order_staging from anon, authenticated;
grant all on table public.appointment_work_order_staging to service_role;
