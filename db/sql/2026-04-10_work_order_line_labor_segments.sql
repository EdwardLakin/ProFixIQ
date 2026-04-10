-- Add per-technician labor segments for work-order lines.
-- This is additive and preserves existing work_order_lines punch fields as compatibility mirrors.

create extension if not exists btree_gist;

create table if not exists public.work_order_line_labor_segments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid null references public.profiles(id) on delete set null,
  source text not null default 'job_punch',
  pause_reason text null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_order_line_labor_segments_time_order_chk
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists idx_wolls_shop on public.work_order_line_labor_segments(shop_id);
create index if not exists idx_wolls_line on public.work_order_line_labor_segments(work_order_line_id);
create index if not exists idx_wolls_tech_start on public.work_order_line_labor_segments(technician_id, started_at);
create index if not exists idx_wolls_active_tech on public.work_order_line_labor_segments(technician_id) where ended_at is null;

-- Strong DB guardrail: at most one active segment per technician.
create unique index if not exists uq_wolls_active_by_tech
  on public.work_order_line_labor_segments(technician_id)
  where ended_at is null;

-- Strong DB guardrail: no overlapping segment windows per technician.
alter table public.work_order_line_labor_segments
  drop constraint if exists ex_wolls_no_overlap;

alter table public.work_order_line_labor_segments
  add constraint ex_wolls_no_overlap
  exclude using gist (
    technician_id with =,
    tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz), '[)') with &&
  );

create or replace function public.set_work_order_line_labor_segments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wolls_updated_at on public.work_order_line_labor_segments;
create trigger trg_wolls_updated_at
before update on public.work_order_line_labor_segments
for each row
execute function public.set_work_order_line_labor_segments_updated_at();

alter table public.work_order_line_labor_segments enable row level security;

drop policy if exists wolls_shop_select on public.work_order_line_labor_segments;
create policy wolls_shop_select
on public.work_order_line_labor_segments
for select to authenticated
using (shop_id = public.current_shop_id());

drop policy if exists wolls_shop_insert on public.work_order_line_labor_segments;
create policy wolls_shop_insert
on public.work_order_line_labor_segments
for insert to authenticated
with check (shop_id = public.current_shop_id());

drop policy if exists wolls_shop_update on public.work_order_line_labor_segments;
create policy wolls_shop_update
on public.work_order_line_labor_segments
for update to authenticated
using (shop_id = public.current_shop_id())
with check (shop_id = public.current_shop_id());

drop policy if exists wolls_shop_delete on public.work_order_line_labor_segments;
create policy wolls_shop_delete
on public.work_order_line_labor_segments
for delete to authenticated
using (shop_id = public.current_shop_id());

create or replace view public.v_work_order_line_labor_rollups as
select
  ls.shop_id,
  ls.work_order_id,
  ls.work_order_line_id,
  count(*) filter (where ls.ended_at is null) as active_segment_count,
  count(distinct ls.technician_id) filter (where ls.ended_at is null) as active_tech_count,
  min(ls.started_at) as first_started_at,
  max(ls.ended_at) as last_ended_at,
  sum(extract(epoch from (coalesce(ls.ended_at, now()) - ls.started_at)))::bigint as worked_seconds
from public.work_order_line_labor_segments ls
group by ls.shop_id, ls.work_order_id, ls.work_order_line_id;
