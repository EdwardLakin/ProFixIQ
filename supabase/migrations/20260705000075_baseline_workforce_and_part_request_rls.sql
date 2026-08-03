-- Complete clean-bootstrap dependencies discovered by the ordered migration replay.
--
-- This migration runs after the historical public-schema baseline and canonical
-- part-request bootstrap, but before the first incremental migration.

create extension if not exists btree_gist;

create table if not exists public.work_order_line_labor_segments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  source text not null default 'job_punch',
  pause_reason text,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_order_line_labor_segments_time_order_chk
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists idx_wolls_shop
  on public.work_order_line_labor_segments(shop_id);
create index if not exists idx_wolls_line
  on public.work_order_line_labor_segments(work_order_line_id);
create index if not exists idx_wolls_tech_start
  on public.work_order_line_labor_segments(technician_id, started_at);
create index if not exists idx_wolls_active_tech
  on public.work_order_line_labor_segments(technician_id)
  where ended_at is null;

-- Preserve historical evidence rather than silently closing competing open
-- segments. Existing databases with conflicts fail before the unique index with
-- technician-specific diagnostics so an administrator can reconcile them.
do $$
declare
  v_conflicts text;
begin
  select string_agg(
    technician_id::text || ' (' || open_count::text || ' open)',
    ', ' order by technician_id::text
  )
  into v_conflicts
  from (
    select technician_id, count(*) as open_count
    from public.work_order_line_labor_segments
    where ended_at is null
    group by technician_id
    having count(*) > 1
    order by technician_id
    limit 20
  ) conflicts;

  if v_conflicts is not null then
    raise exception using errcode = 'P0001',
      message = 'WORKFORCE_OPEN_SEGMENT_CONFLICTS: reconcile multiple open labor segments before migration: '
        || v_conflicts;
  end if;
end
$$;

create unique index if not exists uq_wolls_active_by_tech
  on public.work_order_line_labor_segments(technician_id)
  where ended_at is null;

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

-- Canonical part-request tables are browser-accessible and therefore require
-- explicit same-shop policies rather than RLS-enabled deny-all behavior.
alter table public.part_requests enable row level security;
alter table public.part_request_items enable row level security;
alter table public.part_request_lines enable row level security;

drop policy if exists part_requests_shop_select on public.part_requests;
create policy part_requests_shop_select
  on public.part_requests
  for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists part_requests_shop_insert on public.part_requests;
create policy part_requests_shop_insert
  on public.part_requests
  for insert to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists part_requests_shop_update on public.part_requests;
create policy part_requests_shop_update
  on public.part_requests
  for update to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

drop policy if exists part_requests_shop_delete on public.part_requests;
create policy part_requests_shop_delete
  on public.part_requests
  for delete to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists part_request_items_shop_select on public.part_request_items;
create policy part_request_items_shop_select
  on public.part_request_items
  for select to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists part_request_items_shop_insert on public.part_request_items;
create policy part_request_items_shop_insert
  on public.part_request_items
  for insert to authenticated
  with check (
    shop_id = public.current_shop_id()
    and exists (
      select 1
      from public.part_requests pr
      where pr.id = part_request_items.request_id
        and pr.shop_id = public.current_shop_id()
    )
  );

drop policy if exists part_request_items_shop_update on public.part_request_items;
create policy part_request_items_shop_update
  on public.part_request_items
  for update to authenticated
  using (shop_id = public.current_shop_id())
  with check (
    shop_id = public.current_shop_id()
    and exists (
      select 1
      from public.part_requests pr
      where pr.id = part_request_items.request_id
        and pr.shop_id = public.current_shop_id()
    )
  );

drop policy if exists part_request_items_shop_delete on public.part_request_items;
create policy part_request_items_shop_delete
  on public.part_request_items
  for delete to authenticated
  using (shop_id = public.current_shop_id());

-- A request-line link must keep the request, work-order line, and (when known)
-- work order inside the same tenant. This prevents a valid Shop A request from
-- being linked to a known Shop B line UUID.
drop policy if exists part_request_lines_shop_select on public.part_request_lines;
create policy part_request_lines_shop_select
  on public.part_request_lines
  for select to authenticated
  using (
    exists (
      select 1
      from public.part_requests pr
      join public.work_order_lines wl
        on wl.id = part_request_lines.work_order_line_id
      where pr.id = part_request_lines.request_id
        and pr.shop_id = public.current_shop_id()
        and wl.shop_id = public.current_shop_id()
        and (pr.work_order_id is null or wl.work_order_id = pr.work_order_id)
    )
  );

drop policy if exists part_request_lines_shop_insert on public.part_request_lines;
create policy part_request_lines_shop_insert
  on public.part_request_lines
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.part_requests pr
      join public.work_order_lines wl
        on wl.id = part_request_lines.work_order_line_id
      where pr.id = part_request_lines.request_id
        and pr.shop_id = public.current_shop_id()
        and wl.shop_id = public.current_shop_id()
        and (pr.work_order_id is null or wl.work_order_id = pr.work_order_id)
    )
  );

drop policy if exists part_request_lines_shop_update on public.part_request_lines;
create policy part_request_lines_shop_update
  on public.part_request_lines
  for update to authenticated
  using (
    exists (
      select 1
      from public.part_requests pr
      join public.work_order_lines wl
        on wl.id = part_request_lines.work_order_line_id
      where pr.id = part_request_lines.request_id
        and pr.shop_id = public.current_shop_id()
        and wl.shop_id = public.current_shop_id()
        and (pr.work_order_id is null or wl.work_order_id = pr.work_order_id)
    )
  )
  with check (
    exists (
      select 1
      from public.part_requests pr
      join public.work_order_lines wl
        on wl.id = part_request_lines.work_order_line_id
      where pr.id = part_request_lines.request_id
        and pr.shop_id = public.current_shop_id()
        and wl.shop_id = public.current_shop_id()
        and (pr.work_order_id is null or wl.work_order_id = pr.work_order_id)
    )
  );

drop policy if exists part_request_lines_shop_delete on public.part_request_lines;
create policy part_request_lines_shop_delete
  on public.part_request_lines
  for delete to authenticated
  using (
    exists (
      select 1
      from public.part_requests pr
      join public.work_order_lines wl
        on wl.id = part_request_lines.work_order_line_id
      where pr.id = part_request_lines.request_id
        and pr.shop_id = public.current_shop_id()
        and wl.shop_id = public.current_shop_id()
        and (pr.work_order_id is null or wl.work_order_id = pr.work_order_id)
    )
  );
