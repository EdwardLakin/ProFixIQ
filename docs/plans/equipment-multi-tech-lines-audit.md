# Multi-technician lines: audit and decisions needed (PR D)

Status: read-only audit of `main` @ a5e3d1c. Docs only; no behavior changes.

## What already exists (reuse)
- **Assignment set.** `work_order_line_technicians` is the complete set; `work_order_lines.assigned_tech_id` is the primary and acts as the **lead** (`docs/phase-7-technician-assignment-contract.md`).
- **"+ Add tech" backend.** `POST /api/work-orders/assign-line` already supports `set_primary`, `add_supporting`, `remove_supporting`, `clear` with an `Idempotency-Key`, a stale-write guard (`ASSIGNMENT_STALE`), and refusal to remove a technician with active labor. Adding a supporting technician never replaces existing ones. Requires the `work_order.assignment.manage` capability (office roles).
- **"+ Add tech" UI.** `AssignTechModal` (desktop work order, focused job, dispatch board) already adds supporting technicians. There is **no mobile/technician-facing control**.
- **Per-technician labor.** `work_order_line_labor_segments.technician_id`; assignment never creates labor.
- **Per-technician access.** Mechanics read a work order when assigned to at least one of its lines (`profixiq_is_assigned_to_work_order`), so line assignment is what gives a supporting technician job access (this closes the open #1894 thread).

## Findings: lead completion is NOT enforced today
`apply_job_punch_transition_atomic` (wrapper `20260831035025`, core `20260816013256`):
1. **`finish` closes only the actor's own open segments**, then sets the line `completed`. Other technicians' timers on the same line are left running on a completed line.
2. **Any assigned technician may finish**, not only the lead. The wrapper only requires the actor to be assigned and, if any timer is active, to own one.
3. **No office override exists.** The actor must be the technician (`p_actor_user_id` must equal the technician). A manager cannot finish, stop, or correct another technician's timer through this RPC. Time corrections go through `work_order_line_labor_segment_corrections`.
4. Dispatch, acknowledgement and assignment never start labor (verified; matches the requirement).

## Decision needed: where to enforce "lead completes after all timers stop"
Changing the shared RPC affects Shop, Fleet and Field technicians, so it is a contract change.

**A. Additive, Equipment-scoped command (recommended).** New `equipment_complete_line_atomic`: only the lead (or an office override with a recorded reason) may complete; refuses while any other technician has an active timer, listing who; override stops those timers with a reason, preserving all time and notes, then calls the canonical finish. Existing flows are untouched. Limit: the guarantee holds for Equipment surfaces that use this command; the shared punch path still lets any assigned technician finish.

**B. Contract change to the shared RPC.** Enforces the rule for every product. Affects any technician who currently finishes while a helper's timer is still running, and the Copilot completion path (`private.apply_technician_copilot_job_punch_transition_atomic`). Needs an approved change report, regression coverage for each consumer, and likely a rollout flag.

## Also needed in A
- Mobile "+ Add tech" for the lead (a technician-facing action that calls the existing `add_supporting` for lines they lead). This requires deciding whether leads may use the office-only capability; proposal: a lead may add supporting technicians only on lines where they are the primary, via a thin Equipment route, without widening the capability itself.
- Dispatch assigns supporting technicians to the visit's lines through the existing assignment contract so they get job access, then the notification can link to the job.

## Not changed
`apply_job_punch_transition_atomic`, `assign-line`, work-order RLS, labor segments.
