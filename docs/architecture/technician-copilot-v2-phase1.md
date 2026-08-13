# Technician CoPilot V2 — Phase 1 Repair Session Foundation

## Scope

This slice introduces the durable substrate for the Technician CoPilot without changing existing technician, work-order, inspection, parts, labor, mobile, or voice workflows.

The existing ProFixIQ domain remains canonical. `repair_sessions`, `repair_session_events`, and `repair_context_snapshots` are context and audit infrastructure layered over existing work-order data.

## Invariants

- Only floor-technician roles can own a technician repair session.
- Session, work order, active line, vehicle, and service visit stay inside one shop boundary.
- A technician has at most one active repair session; switching jobs pauses the previous session.
- Session identity is immutable.
- Repair events are append-only, ordered, and idempotent by operation key.
- Context snapshots are versioned projections, not a second source of work-order truth.
- Closed sessions are retained rather than deleted.
- Lifecycle changes and event history stay synchronized.

## Rollback boundary

No existing screen, voice provider, or API consumes this substrate in Phase 1. The migration is additive and does not modify the canonical work-order tables. Phase 2 must introduce the runtime capability gate before any session endpoint is wired into the application.

## Next slice

Phase 2 adds the technician-authenticated session API, runtime capability gate, and text CoPilot surface. It should hydrate assigned work plus repair-session history and prove persistent multi-turn context before continuous duplex voice is introduced.
