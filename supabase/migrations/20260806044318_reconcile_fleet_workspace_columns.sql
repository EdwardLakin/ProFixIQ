begin;

-- Some production databases predate the canonical Fleet table definition.
-- Reconcile the additive workspace columns before the Fleet settings and PM
-- management migrations use them.
alter table public.fleets
  add column if not exists contact_phone text,
  add column if not exists active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists fleets_shop_active_idx
  on public.fleets (shop_id, active, created_at desc);

commit;
