begin;

-- The canonical assignment contract treats assigned_tech_id plus
-- work_order_line_technicians as authoritative. Two older BEFORE triggers still
-- mirror assigned_tech_id back into assigned_to. That is incompatible with the
-- canonical contract, which requires assigned_to to remain legacy-only once a
-- canonical assignment exists.
--
-- This migration is intentionally amended before merge/application with explicit
-- approval. Retire only the legacy mirror triggers; keep their functions in
-- place to avoid unnecessary dependency churn.
drop trigger if exists trg_sync_work_order_line_assignee
  on public.work_order_lines;
drop trigger if exists trg_wol_sync_assigned_to
  on public.work_order_lines;

-- Older rows can still retain the same technician in assigned_to; any later line
-- update then trips the deferred contract trigger even though there is no real
-- assignment disagreement.
--
-- Reconcile only the deterministic case: the legacy value is the same explicit
-- primary, and that exact primary is already in the canonical set. Conflicting
-- legacy/canonical assignments remain untouched for human review. No technician
-- is selected, inferred, or silently discarded by this migration.
update public.work_order_lines line
set assigned_to = null,
    updated_at = greatest(
      clock_timestamp(),
      line.updated_at + interval '1 microsecond'
    )
where line.assigned_to is not null
  and line.assigned_tech_id is not null
  and line.assigned_to = line.assigned_tech_id
  and exists (
    select 1
    from public.work_order_line_technicians assignment
    where assignment.work_order_line_id = line.id
      and assignment.technician_id = line.assigned_tech_id
  );

commit;
