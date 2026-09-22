-- Fleet alert dismissal is an additive presentation-layer contract.
-- The canonical pre-trip compliance evaluator and assistant notification
-- lifecycle remain unchanged. Dismissals suppress an alert from the Fleet bell
-- without rewriting shared notification state or compliance history.

create table if not exists public.fleet_notification_dismissals (
  notification_id uuid primary key
    references public.assistant_notifications(id) on delete cascade,
  shop_id uuid not null
    references public.shops(id) on delete cascade,
  fleet_id uuid
    references public.fleets(id) on delete cascade,
  dismissed_by uuid not null
    references public.profiles(id) on delete restrict,
  dismissed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists fleet_notification_dismissals_shop_idx
  on public.fleet_notification_dismissals (shop_id, dismissed_at desc);

create index if not exists fleet_notification_dismissals_fleet_idx
  on public.fleet_notification_dismissals (fleet_id, dismissed_at desc)
  where fleet_id is not null;

alter table public.fleet_notification_dismissals enable row level security;

revoke all on table public.fleet_notification_dismissals
  from public, anon, authenticated;
grant select, insert, delete on table public.fleet_notification_dismissals
  to service_role;

comment on table public.fleet_notification_dismissals is
  'Fleet-bell dismissal ledger. Keeps UI acknowledgement separate from the canonical assistant notification and pre-trip compliance lifecycles.';
