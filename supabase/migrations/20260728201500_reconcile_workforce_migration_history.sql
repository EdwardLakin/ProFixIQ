-- Migration history compatibility marker.
--
-- The pull-request preview branch recorded the scheduled shift-end function
-- under this version before the canonical production migration version was
-- aligned to 20260728181241. The schema change itself remains owned by
-- 20260728181241_workforce_atomic_scheduled_shift_end.sql.
--
-- Keep this migration intentionally schema-neutral so both additive histories
-- can converge without removing or replacing any existing schema object.
select 1;
