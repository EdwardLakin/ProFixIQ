# Technician CoPilot V2 — Phase 2

## Scope

Phase 2 proves a persistent technician collaborator in text before realtime voice is attached.

The runtime path is:

```text
Technician
  -> authenticated CoPilot API
  -> resolve canonical profile / shop / technician role
  -> tenant or technician capability gate
  -> canonical assigned-work reads under existing RLS
  -> private Repair Session runtime
  -> ordered event ledger
  -> deterministic repair-context projection
  -> structured Text CoPilot
```

## Security boundary

The `copilot` Postgres schema remains private. Browser roles do not receive direct access to repair-session tables or functions.

The Next.js server uses the existing `ai_action_events` service-role write path as an internal command envelope. Rows use `source = technician_copilot_command`. A private trigger validates technician identity and shop ownership, then delegates to private session handlers. The normal shop SELECT policy explicitly excludes these internal command rows.

Private handlers re-check canonical technician assignment on every session read, session start/resume, and event append. The AI therefore cannot use the service credential to escape the technician's authority.

## Rollout

The runtime defaults closed. Access requires an enabled row in `ai_automation_capability_settings` for either:

- `technician_copilot_text`
- `technician_copilot_text:<profile-id>`

This provides a shop kill switch plus technician-scoped beta rollout without changing existing voice or technician workflows.

## Phase-2 action boundary

The model may write repair-session memory only:

- conversation turns
- current task
- complaint snapshot
- observations
- measurements
- DTCs
- evidence references
- teardown / reassembly state
- fluid state
- pending context markers

It does **not** execute canonical work-order, labor, parts, approvals, invoicing, customer communication, or financial mutations in this phase.

## Conversation behavior

The CoPilot is prompted as an experienced technician collaborator, not a command parser. It should document routine facts silently and ask a follow-up only when missing information materially changes the repair or the next useful step.

The model receives only assigned work-order candidates before a session begins. Any selected work-order ID is validated against those RLS-scoped candidates before a session can start.

Once a session is active, every technician and assistant turn is persisted into the ordered repair ledger. Structured findings are projected from that ledger each turn instead of relying on LLM chat memory.

## Acceptance path

The target manual/automated smoke sequence is:

1. `Start the Ford.`
2. `Read me the complaint.`
3. `I'm checking the driveline.`
4. `Rear U-joint has play.`
5. `Carrier bearing looks okay.`
6. `What have we figured out so far?`

At the final turn the CoPilot must still resolve the same repair session and work order, identify the driveline as the active task, retain both findings, and answer from the structured repair context.

## Rollback

No existing voice provider, work-order screen, inspection workflow, parts workflow, time tracking, mobile shell, or canonical work-order table is redirected to this runtime. Disabling the capability row makes the preview API unavailable and returns technicians to the existing application with no repair-data dependency on the CoPilot.

Realtime audio is intentionally out of scope until this text acceptance path is reliable.
