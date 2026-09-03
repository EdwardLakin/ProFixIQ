-- Technician assignment is canonicalized by
-- public.mutate_work_order_line_assignment_atomic():
--   * work_order_line_technicians stores the assignment set;
--   * work_order_lines.assigned_tech_id stores the explicit primary; and
--   * work_order_lines.assigned_to remains null for canonical assignments.
--
-- These historical mirror triggers repopulate assigned_to whenever the
-- canonical RPC sets assigned_tech_id. The deferred assignment constraint then
-- rejects the transaction because legacy and canonical assignment cannot
-- coexist. Retire only the obsolete trigger wiring; keep the functions in place
-- because dropping them is unnecessary for restoring assignment behavior.
drop trigger if exists trg_sync_work_order_line_assignee
  on public.work_order_lines;

drop trigger if exists trg_wol_sync_assigned_to
  on public.work_order_lines;
