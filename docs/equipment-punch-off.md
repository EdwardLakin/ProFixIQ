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

## The existing Finish applies the rule (Equipment shops only)

Technicians keep using the shop's own punch pieces: the day shift tracker and the job screens' Start,
Hold and Finish. There is no separate Equipment punch screen.

`POST /api/work-orders/lines/<id>/finish` (the existing route) now calls
`finishViaEquipmentLastOff` first. It takes over only when **all** of these hold:

1. the caller's shop holds the Equipment add-on, and
2. the technician has a running timer on that line.

Then Finish is the punch-off above: it ends only the caller's time while others are still running (the
line stays open and the response says `lineClosed: false`), and it completes the line when the caller
is the last one. Every other case continues into the unchanged finish: shops without Equipment,
technicians with no running timer (for example a lead completing a line they never timed), and any
lookup that fails (the rule fails open to today's behavior, so a Finish that worked still works).

The job screens read `lineClosed`: `false` shows "Punched off. N other technicians are still on this
job." and leaves the line open; anything else shows the existing "Job completed". The rule applies to
every line in an Equipment shop, not only lines on Equipment assets.

Rollback: remove the `finishViaEquipmentLastOff` call from the finish route. No data migration is
involved.

### Per-technician Start / Finish and pending sync (Equipment shops)

The decision to treat a shop as Equipment on a screen comes from the authoritative entitlement endpoint
(`/api/equipment/entitlement`). The last good answer is remembered per shop and user so it still works
offline. If it has never been learned, the answer is "unknown": the screen then behaves exactly as it
always has, and a queued Finish is shown as pending, never completed.

- **Start / Finish follows your own timer.** On the technician job screen, a technician who punched off
  while others keep working sees **Start Job** (to rejoin). Technicians still working see **Finish Job**.
  The line stays **Active** while anyone is on it. The server still decides who the last technician is.
- **A queued Finish is pending, not completed**, for Equipment (and for an unknown classification). The
  job shows "Finish saved. It will sync when you're back online.", the queued request does not project as
  completed, no `work-order-line:completed` event is emitted, and the technician's story is kept as a draft.
- **When the queued Finish reaches the server** the open screen is told the result: `lineClosed=true`
  shows "Job completed" and emits the completion event; `lineClosed=false` refreshes the line and shows
  that the technician punched off while work continues. A replay that fails or conflicts emits nothing
  and goes through the existing retry/conflict handling, so the Finish stays pending.
- **Ordinary Shops are unchanged**, including the optimistic "Job completed" for a queued Finish.

Known limits: the desktop job modal (`FocusedJobModal`) has no per-technician timer data, so its
Start/Finish button still reflects the line as a whole (it does show the pending-sync message and the
punch-off message). A request queued before this change keeps the old behavior until it syncs. The
classification is shop-level, matching the server rule, which applies to every line in an Equipment shop.
