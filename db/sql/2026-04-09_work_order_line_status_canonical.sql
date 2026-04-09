-- Normalize work_order_lines.status to a canonical vocabulary.
-- Canonical statuses:
--   awaiting | awaiting_approval | active | on_hold | completed | invoiced

begin;

-- 1) Backfill legacy / mixed-case values into canonical statuses.
update public.work_order_lines
set status = case
  when status is null then 'awaiting'
  when lower(replace(status, ' ', '_')) in ('awaiting', 'awaiting_approval', 'active', 'on_hold', 'completed', 'invoiced')
    then lower(replace(status, ' ', '_'))
  when lower(replace(status, ' ', '_')) in ('queued', 'in_progress', 'assigned')
    then 'active'
  when lower(replace(status, ' ', '_')) in ('paused', 'declined')
    then 'on_hold'
  when lower(replace(status, ' ', '_')) in ('unassigned')
    then 'awaiting'
  when lower(replace(status, ' ', '_')) in ('ready_to_invoice')
    then 'completed'
  when lower(replace(status, ' ', '_')) in ('quoted')
    then 'awaiting_approval'
  else status
end
where status is null
   or lower(replace(status, ' ', '_')) not in ('awaiting', 'awaiting_approval', 'active', 'on_hold', 'completed', 'invoiced');

-- 2) Defensive normalizer for future writes.
create or replace function public.normalize_work_order_line_status()
returns trigger
language plpgsql
as $$
begin
  new.status := coalesce(lower(replace(new.status, ' ', '_')), 'awaiting');

  new.status := case new.status
    when 'queued' then 'active'
    when 'in_progress' then 'active'
    when 'assigned' then 'active'
    when 'paused' then 'on_hold'
    when 'declined' then 'on_hold'
    when 'unassigned' then 'awaiting'
    when 'ready_to_invoice' then 'completed'
    when 'quoted' then 'awaiting_approval'
    else new.status
  end;

  if new.status not in ('awaiting', 'awaiting_approval', 'active', 'on_hold', 'completed', 'invoiced') then
    raise exception 'Invalid work_order_lines.status: %', new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_work_order_line_status on public.work_order_lines;
create trigger trg_normalize_work_order_line_status
before insert or update of status on public.work_order_lines
for each row
execute function public.normalize_work_order_line_status();

-- 3) Enforce canonical check constraint.
alter table public.work_order_lines
  drop constraint if exists work_order_lines_status_check;

alter table public.work_order_lines
  add constraint work_order_lines_status_check
  check (status = any (array['awaiting'::text, 'awaiting_approval'::text, 'active'::text, 'on_hold'::text, 'completed'::text, 'invoiced'::text]));

commit;
