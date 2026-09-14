-- Phase 4 of the dashboard assistant plan: a scheduled projection of
-- upcoming bookings into a reviewable "appointment preparation" record —
-- vehicle/customer context, still-outstanding deferred/declined history,
-- any matching known menu repair, parts readiness, and missing-information
-- flags. Unlike Phase 3's shadow-mode blocker table, this one is meant to be
-- read by staff (surfaced inside ProFix Operations), so it carries a select
-- policy. Only the service-role cron job
-- (features/operations/server/syncAppointmentPreparations.ts) writes it.
-- This never creates repair findings, approvals, orders, or punchable work.

create table if not exists public.appointment_preparations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  starts_at timestamptz not null,
  status text not null default 'active'::text,
  -- Point-in-time snapshots/summaries assembled by the sync job. Structure is
  -- owned by features/operations/server/appointmentPreparation/*, not by a
  -- DB constraint, since this is a read projection rather than a workflow
  -- record of its own.
  vehicle_snapshot jsonb not null default '{}'::jsonb,
  customer_snapshot jsonb not null default '{}'::jsonb,
  deferred_items jsonb not null default '[]'::jsonb,
  matched_menu_items jsonb not null default '[]'::jsonb,
  missing_info jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_preparations_booking_key
    unique (booking_id),
  constraint appointment_preparations_status_chk
    check (status = any (array['active'::text, 'resolved'::text])),
  constraint appointment_preparations_resolved_requires_timestamp_chk
    check (status <> 'resolved'::text or resolved_at is not null)
);

create index if not exists appointment_preparations_shop_status_idx
  on public.appointment_preparations (shop_id, status, starts_at);

drop trigger if exists appointment_preparations_set_updated_at
  on public.appointment_preparations;
create trigger appointment_preparations_set_updated_at
before update on public.appointment_preparations
for each row execute function public.shop_assistant_set_updated_at();

alter table public.appointment_preparations enable row level security;
revoke all on table public.appointment_preparations from anon, authenticated;
grant select on table public.appointment_preparations to authenticated;
grant all on table public.appointment_preparations to service_role;

drop policy if exists appointment_preparations_staff_read
  on public.appointment_preparations;
create policy appointment_preparations_staff_read
  on public.appointment_preparations
  for select
  to authenticated
  using (
    public.is_shop_member_v2(shop_id)
    and public.profixiq_current_role() in (
      'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
    )
  );
