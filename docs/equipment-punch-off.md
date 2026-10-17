# Equipment punch-off: the last one off closes the line

**Rule:** any technician on a line can punch off. The line completes only when
the last technician on it punches off.

## Behaviour

`POST /api/equipment/punch-off` (header `Idempotency-Key`, body `{ lineId, cause?, correction?, notes? }`)
calls `equipment_punch_off_line_atomic`, which wraps the canonical
`apply_job_punch_transition_atomic`:

| Situation | Canonical action | Result |
| --- | --- | --- |
| Another technician is still running, or paused / on hold | `pause` (line status preserved, reason `punched_off`) | Only this technician's labor ends; `lineClosed: false`, `remaining` lists who is left |
| Nobody else is on the job | `finish` | Line completes; `lineClosed: true`. Cause, correction, labor time and a signed inspection are still required by the canonical command |

Assigned technicians who never punched on do not block closing. Time is never
discarded: every segment is kept for payroll and costing.

## Safety

- A technician can only punch themselves off; they need a running timer.
- Punch-offs on a line are serialized, so two technicians finishing together
  cannot both see the other as "still running" and leave the line open.
- Idempotent per `Idempotency-Key`; reusing a key with a different request is a conflict.
- Service-role only. The shared punch path and its contract are unchanged.

## Not included yet

- Office override to close a line when a technician forgot to punch off.
- Held / paused technicians still block closing (confirm this is the intent).
- The mobile punch-off UI; this PR is the command and route.
