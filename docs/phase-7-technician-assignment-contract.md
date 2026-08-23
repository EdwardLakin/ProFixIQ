# Phase 7 technician assignment contract

## Canonical ownership

- `work_order_line_technicians` is the complete multi-technician assignment set.
- `work_order_lines.assigned_tech_id` is the explicitly selected primary technician and operational owner.
- Additional rows in the assignment set are supporting technicians. They are not alternate primary values.
- `work_order_lines.assigned_to` is read-only legacy compatibility. It is used only when both canonical sources are empty and is cleared by the next explicit assignment mutation.
- `work_order_line_labor_segments.technician_id` remains the actual-labor and payroll attribution source. Assignment changes never create labor or payroll entries.

## Mutations

All assignment changes run through a capability-checked server route and one transactional database implementation:

- `set_primary` adds the selected technician to the canonical set and makes that technician primary. The prior primary remains an explicit supporting technician.
- `add_supporting` requires an existing primary and adds only the selected collaborator.
- `remove_supporting` cannot remove the primary.
- `clear` removes the entire assignment set and primary mirror.

Clear/remove operations are rejected while the affected technician has active job labor. Financially locked work orders are immutable. A client-provided `updated_at` precondition rejects stale concurrent manager/advisor edits with `ASSIGNMENT_STALE`.

## Legacy audit and rollout

Migration `20260822235000_establish_technician_assignment_contract.sql` creates the service-only `report_work_order_line_assignment_ambiguities(shop_id)` report. It identifies:

- a primary missing from the canonical set;
- a canonical set with no explicit primary;
- legacy-to-primary or legacy-to-set conflicts; and
- legacy-only assignment rows.

The migration performs no backfill. Export and review that report by shop before preparing a separate, approved reconciliation migration. Ambiguous rows must never be repaired by selecting the first technician or current user.

## Regression expectations

- Newly created jobs remain unassigned everywhere.
- Primary controls are labeled as primary and expose an explicit clear-all choice.
- Desktop summary, Mobile queue, scheduling, workforce, labor, and notification readers use the canonical set plus primary mirror.
- Deleted profiles remain displayable as historical assignment IDs but cannot be newly assigned.
- Inactive/on-leave workforce profiles are excluded from assignment options and rejected by the mutation.
- Realtime assignment changes refresh Mobile queue membership without duplicating jobs.
- Confirmed Shop Assistant assignment previews and mutations use the same contract; `only unassigned` excludes primary, supporting, and legacy-only assignments.
