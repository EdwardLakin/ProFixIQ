begin;

-- PFX-004 follow-up.
--
-- supabase/migrations/20260822235000_establish_technician_assignment_contract.sql
-- added enforce_work_order_line_assignment_contract, which permanently
-- blocks start/pause/resume/finish on any work_order_lines row that still
-- has the legacy assigned_to compatibility field set alongside a canonical
-- assignment (assigned_tech_id and/or a work_order_line_technicians row).
-- That migration deliberately did not backfill existing rows ("Existing
-- ambiguous rows are deliberately reported ... and are not backfilled"), so
-- any row where assigned_to was already redundant at deploy time has been
-- unable to start labor ever since — confirmed in production on WO
-- EL000007, where the technician could not punch in at all.
--
-- This clears assigned_to only where it is provably redundant, not merely
-- present: assigned_to exactly equals assigned_tech_id, and that same
-- technician is already recorded in the canonical work_order_line_technicians
-- set. report_work_order_line_assignment_ambiguities() does not flag these
-- rows as ambiguous, because there is no disagreement to resolve — clearing
-- the legacy field changes no technician, no status, and no read path that
-- doesn't already prefer assigned_tech_id.
--
-- Any row where assigned_to disagrees with the canonical assignment, or
-- where the canonical set is empty, is left untouched for manual review via
-- report_work_order_line_assignment_ambiguities().
update public.work_order_lines wol
set assigned_to = null,
    updated_at = clock_timestamp()
where wol.assigned_to is not null
  and wol.assigned_tech_id is not null
  and wol.assigned_to = wol.assigned_tech_id
  and exists (
    select 1
    from public.work_order_line_technicians wolt
    where wolt.work_order_line_id = wol.id
      and wolt.technician_id = wol.assigned_to
  );

commit;
