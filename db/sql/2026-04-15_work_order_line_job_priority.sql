-- Add lightweight technician/dispatch job priority for actionable work-order lines.
-- Safe, additive migration with backfill for existing rows.

alter table public.work_order_lines
  add column if not exists job_priority text;

update public.work_order_lines
set job_priority = 'normal'
where job_priority is null
  and (line_type is null or line_type = 'job');

alter table public.work_order_lines
  alter column job_priority set default 'normal';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_order_lines_job_priority_check'
      and conrelid = 'public.work_order_lines'::regclass
  ) then
    alter table public.work_order_lines
      add constraint work_order_lines_job_priority_check
      check (job_priority in ('low', 'normal', 'high', 'urgent') or job_priority is null);
  end if;
end $$;

create index if not exists idx_work_order_lines_tech_queue_priority
  on public.work_order_lines (shop_id, assigned_tech_id, status, job_priority, created_at desc)
  where line_type = 'job';
