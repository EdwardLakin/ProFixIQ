-- Add non-actionable info lines + expected completion target for work orders.
-- Non-breaking: additive columns with safe defaults and conservative constraints.

alter table public.work_order_lines
  add column if not exists line_type text;

update public.work_order_lines
set line_type = 'job'
where line_type is null;

alter table public.work_order_lines
  alter column line_type set default 'job';

alter table public.work_order_lines
  alter column line_type set not null;

alter table public.work_order_lines
  drop constraint if exists work_order_lines_line_type_check;

alter table public.work_order_lines
  add constraint work_order_lines_line_type_check
  check (line_type in ('job', 'info'));

create index if not exists idx_work_order_lines_work_order_line_type
  on public.work_order_lines (work_order_id, line_type, created_at);

create index if not exists idx_work_order_lines_assigned_line_type
  on public.work_order_lines (assigned_tech_id, line_type, status);

alter table public.work_orders
  add column if not exists expected_completion_at timestamptz;
