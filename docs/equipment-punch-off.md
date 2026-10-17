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

Desktop job modal: it reads the active-technician list from the same scoped route it already loads
(`workspace-detail`), never from the line's status. After A punches off while B continues, A is offered
**Start job** (and cannot Complete) while B keeps **Finish job**.

Story on a non-final punch-off: the punch-off itself does not save the story, so the mobile job page and
the desktop modal save it to the line right after (the same write their Save draft button uses). If that
save fails, the technician is told they are punched off but the story was not saved, the dialog stays
open with their text, nothing is reloaded over it, and Submit retries **only the save** (it never
punches off a second time). Closing the dialog abandons the retry. The mobile focused-job screen keeps
the technician's local draft instead. Separate permanent per-technician stories are a later decision and
are not part of this change.

Known limits (be precise about what "unchanged" means):
- **Unknown classification is not identical to today.** When Equipment status has never been learned, a
  queued Finish is shown as pending sync instead of the old optimistic "Job completed". That is the safer
  fallback, but it is a difference from the pre-change behavior. Button logic and online finishes are
  unchanged in that case.
- A request queued before this change keeps the old behavior until it syncs (nothing queued is cleared or
  discarded; tests cover projection and replay of such a request).
- The classification is shop-level, matching the server rule, which applies to every line in an
  Equipment shop.
- The first Finish after opening can wait up to 4 s on the entitlement check, and again after a lookup
  failure, before falling back to the remembered answer. Worth improving separately.
- Editing the story from the dialog's other entry points (for example "Edit story") still opens the
  finish dialog; submitting it as a technician who is not timing is refused safely by the server.

## Queued Start/Finish and the story save (review follow-up)

- On the technician mobile screen, while an Equipment Start or Finish for the job is still queued, the primary button reads "Sync pending" and is disabled, so the same timer change cannot be queued twice. It clears when the replay reports back.
- The story save after a non-final punch-off is based on the line's version read right after the punch-off, because the punch-off can advance it. A retry reads it again. If the device is offline, the queued save keeps the version it was written against and uses the existing conflict handling.

## Second review round

- A retry of a Finish the Equipment command already answered replays through the command even if the add-on now reads disabled or the lookup fails, because the standard finish keeps its receipts elsewhere. If the receipt itself cannot be read the request fails with a retryable 503.
- The desktop post-punch-off story save uses the version-checked `save_story_draft` mutation against the line's current version, so a line another technician has completed is refused instead of overwritten.
- On the technician mobile job page, a queued Equipment (or unclassified) Finish disables the Cause & Correction rail and refuses a second submit until replay answers. Ordinary Shop finishes and requests queued before classification was recorded are not held.
