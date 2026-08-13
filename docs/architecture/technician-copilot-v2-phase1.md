# Technician CoPilot V2 — Phase 1 Repair Session Foundation

## Scope

Phase 1 adds persistent technician repair-session identity and an ordered event ledger without changing any current work-order, inspection, parts, labor, mobile, or voice workflow.

The new storage lives in the private `copilot` Postgres schema. Existing `work_orders`, `work_order_lines`, vehicles, service visits, and technician profiles remain canonical.

## Storage

- `copilot.repair_sessions` anchors the technician to the active work order/line, vehicle, service visit, operating mode, lifecycle state, and context version.
- `copilot.repair_session_events` is the ordered event spine for the repair session.
- `copilot.repair_session_event_context` stores event origin, bounded structured details, and a globally unique operation ID so Phase 2 can enforce exactly-once command receipts.

The TypeScript session contract defines the future evidence vocabulary for observations, measurements, DTCs, media evidence, teardown/reassembly, fluid state, and pending actions. The first reducer slice establishes strict lifecycle sequencing and replay protection.

## Safety boundary

- Canonical public work-order tables are unchanged.
- A technician can have at most one active repair session.
- Session identity is anchored to existing shop, profile, work-order, line, vehicle, and service-visit records.
- Event sequence is unique within a repair session.
- No application route, UI component, voice provider, or public RPC consumes this schema in Phase 1.
- No production migration is applied as part of the branch implementation; clean replay and CI must pass first.

## Rollback

Phase 1 is dark infrastructure. Ignoring the private schema leaves all existing ProFixIQ behavior unchanged. There is no technician-callable CoPilot mutation surface yet.

## Phase 2

Add the technician-authenticated server command boundary and runtime capability gates together. That layer must resolve current shop/profile/role, enforce canonical work-order assignment, append ordered events atomically, rebuild or cache repair context, and prove persistent multi-turn text collaboration before continuous duplex voice is connected.
