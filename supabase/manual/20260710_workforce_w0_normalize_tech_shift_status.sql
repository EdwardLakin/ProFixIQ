-- Workforce W0: normalize tech_shifts.status to canonical active/completed values.
-- Root cause: repo schema constrains tech_shifts.status to active/completed while some app paths wrote open/closed.

begin;

alter table public.tech_shifts
  drop constraint if exists tech_shifts_status_check;

update public.tech_shifts
set status = case
  when status = 'open' then 'active'
  when status in ('closed', 'ended') then 'completed'
  else status
end
where status in ('open', 'closed', 'ended');

alter table public.tech_shifts
  alter column status set default 'active';

alter table public.tech_shifts
  add constraint tech_shifts_status_check
  check (status = any (array['active'::text, 'completed'::text])) not valid;

alter table public.tech_shifts
  validate constraint tech_shifts_status_check;

commit;
