begin;

-- The canonical assignment contract treats assigned_tech_id plus
-- work_order_line_technicians as authoritative. Older rows can still retain the
-- same technician in assigned_to; any later line update then trips the deferred
-- contract trigger even though there is no real assignment disagreement.
--
-- Reconcile only the deterministic case: an explicit primary exists and that
-- exact primary is already in the canonical set. No technician is selected or
-- inferred by this migration.
update public.work_order_lines line
set assigned_to = null,
    updated_at = greatest(
      clock_timestamp(),
      line.updated_at + interval '1 microsecond'
    )
where line.assigned_to is not null
  and line.assigned_tech_id is not null
  and exists (
    select 1
    from public.work_order_line_technicians assignment
    where assignment.work_order_line_id = line.id
      and assignment.technician_id = line.assigned_tech_id
  );

commit;
