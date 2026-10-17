# Equipment punch-off: the last one off closes the line

**Rule:** any technician on a line can punch off. The line completes only when
the last technician on it punches off.

## Behaviour

`POST /api/equipment/punch-off` (header `Idempotency-Key`, body `{ lineId, cause?, correction?, notes? }`)
calls `equipment_punch_off_line_atomic`, which wraps the canonical
`apply_job_punch_transition_atomic`:

| Situation | Canonical action | Result |
| --- | --- | --- |
| Another technician still has a running timer | `pause` (line status preserved, reason `punched_off`) | Only this technician's labor ends; `lineClosed: false`, `remaining` lists who is left |
| Nobody else is on the job | `finish` | Line completes; `lineClosed: true`. Cause, correction and labor time are required by the canonical command, and if the line has a canonical inspection it must be completed and signed (a line with no inspection has no inspection gate, exactly as in the shared punch path) |

Only running timers block closing. A technician who is paused or on hold is not working, and one who was assigned but never punched on is not either, so neither blocks. Time is never
discarded: every segment is kept for payroll and costing.

## Safety

- A technician can only punch themselves off; they need a running timer.
- Punch-offs on a line are serialized, so two technicians finishing together
  cannot both see the other as "still running" and leave the line open.
- Idempotent per `Idempotency-Key`; reusing a key with a different request is a conflict.
- Service-role only. The shared punch path and its contract are unchanged.

## Office override

`POST /api/equipment/punch-off/close` (header `Idempotency-Key`, body `{ lineId, reason, cause?, correction? }`)
calls `equipment_close_line_atomic` for a forgotten timer. It needs dispatch
authority (`canManageScheduling`) and a written reason (3+ characters), which is
recorded on the activity log. All running timers end at the close time with
reason `office_closed` (time is kept), then the line completes through the
canonical finish core, which still requires cause, correction and labor time (and a
signed inspection when the line has one). If that refuses, nothing changes and timers keep running.

The shared public punch guard binds the actor to the technician, so the
override calls the private canonical core after its own office authorization.
The shared punch contract is not edited.

## Notes and approvals

- A technician's `notes` are saved on the activity log (`equipment_punch_off_note`) for both
  outcomes, because the canonical pause and finish paths do not keep them.
- The office override keeps the approval fences of the public punch guard: approval-pending
  work and the awaiting-parts-quote hold cannot be closed.

## Not included yet

- The mobile punch-off and office close UI; this PR is the commands and routes.
