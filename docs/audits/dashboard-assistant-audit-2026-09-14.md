# Dashboard Assistant Audit — Current State and Proactive Operations Plan

Date: 2026-09-14
Scope: AI and assistant surfaces reachable from the dashboard shell, their
server-side capabilities, and the implementation path toward the proposed Tech
Copilot / Operations Agent / Manager Agent product split.

## 0. Headline finding

ProFixIQ is not starting from a generic chatbot. The current Shop Assistant
already has durable conversations, contextual state, capability-aware tool
selection, confirmed actions, audit records, and broad read/write coverage of
shop workflows. Technician Copilot is already a separate, mature surface.

The proposed role split is **not yet fully implemented as a product experience**:

1. **Technician Copilot exists** and is the correct foundation for technician
   work.
2. **Shop Assistant exists** and is the correct foundation for front-end
   Operations and Manager experiences.
3. **Manager Agent does not exist as a named or proactive surface.** Role-aware
   summaries and operational signals provide useful building blocks.
4. **No Shop Assistant write is autonomous.** All 27 registered writes require
   explicit confirmation.
5. **Operational awareness is request-time or browser-poll driven.** There is no
   durable scheduled/event-driven observer that prepares tomorrow's work or
   pushes an exception into a conversation before a user asks.

The safest implementation is therefore to evolve the existing Shop Assistant,
not build another agent system and not broadly loosen confirmation policy on its
generic tools.

## 1. What actually lives in the dashboard header

`components/Navbar.tsx` is retired (`return null`). The active header and shell
are in `features/shared/components/AppShell.tsx`.

| Header/shell surface | Feature module | Actual purpose |
|---|---|---|
| **Assistant** / Ask Assistant | `features/assistant` → `features/shop-assistant` | Customer-facing conversational shop assistant and the natural base for Operations/Manager experiences |
| **Agent Request** | `features/agent/components/AgentRequestModal.tsx` | QA, bug, feature, catalog-add, and refactor intake sent to the ProFixIQ engineering agent; it is not a competing shop operations assistant |
| **Ops Console** | `/ops` plus `features/agent` server modules | Internal ProFixIQ-team tooling, restricted to internal operations users |
| `TechnicianCopilotShell` | `features/copilot/technician` | Technician-specific chat, voice, day agenda, documentation, and governed technician actions |

This means the dashboard currently has **two operational AI product surfaces**:
Technician Copilot and Shop Assistant. “Agent Request” should be labelled clearly
as product feedback/engineering intake so it is not mistaken for a shop agent.

### Intended identity split

- **Tech Copilot** — “What do I need to know or document to perform this work?”
- **ProFix Operations** — “What can be prepared or moved safely to keep the shop
  moving?”
- **Manager view** — “What requires management attention, and why?” This should
  initially be a role-specific experience on the same Shop Assistant engine, not
  a separate agent stack.

## 2. Current Shop Assistant capability surface

The registry under `features/shop-assistant/server/tools` currently contains
**57 tools across 12 domain modules**:

- 30 read tools with `confirmation: "never"`
- 27 write tools with `confirmation: "required"`
- 0 tools with `confirmation: "owner_pin"`
- 0 write tools with `confirmation: "never"`

The type system supports `"never"`, `"required"`, and `"owner_pin"`, but the
registered production tool definitions currently use only the first two. Every
registered write is staged through the shared confirmation/action path.

Durable assistant actions are stored in `shop_assistant_actions`, with
authorization, risk, status, idempotency, actor, shop, and related-resource
metadata. Threads and messages are also persisted. Conversation context retains
the active work order, vehicle, customer, booking, invoice, and recent domain or
intent; it is useful operational context, but not a general semantic long-term
memory system.

The domain coverage is already broad enough to support an Operations experience:
work orders, records, inventory/parts, customers, fleet, communications,
invoices, scheduling, workforce, inspections, technician context, and reporting.

## 3. Autonomy and proactive execution today

`features/ai/server/automationPolicy.ts` defines ten automation-readiness
capabilities with observation, agreement, exception, critical-failure, and
time-window thresholds. However,
`AI_AUTOMATION_EXECUTION_AVAILABLE` explicitly sets all ten capabilities to
`false`. The readiness layer is telemetry/promotion infrastructure, not active
automation execution.

The dashboard also builds useful live operational state—alerts, metrics, and
suggestions—but it is evaluated when requested and refreshed in a visible browser
session. The role-aware daily summary is similarly generated on demand. Neither
is a durable proactive worker.

As a result, ProFixIQ can currently answer many operational questions and propose
many actions, but it does not yet:

- prepare tomorrow's appointments on a schedule;
- sweep the whole shop for new blockers outside an active browser session;
- deliver morning or event-driven exception summaries into an assistant inbox;
- execute a narrowly defined, deterministic GREEN write automatically.

## 4. Mapping the proposed automations to current state

| Proposed capability | Current state | Implementation gap |
|---|---|---|
| **WO blocker detection** | Per-WO recommendation rules and shop-state alerts exist | Add a shop-wide, idempotent observer and durable findings; begin in shadow mode |
| **Role-aware exception summary** | `getRoleDailySummary` and operational notification logic exist | Persist/deliver scheduled summaries and connect them to the assistant experience |
| **Appointment preparation** | Booking, vehicle, history, deferred-work, and parts primitives exist separately | Build a read-only appointment-preparation projection before any automatic write |
| **Deferred work at intake** | Available through a manual UI flow | Include prior deferred/declined context in appointment preparation without making it approved or punchable |
| **Parts workflow** | Strong read/write tool surface; writes require confirmation | Add a dedicated deterministic preparation command with exact eligibility and duplicate protection |
| **Customer communication** | Generic confirmed messaging exists | Add vetted state-derived templates later; do not allow free-text autonomous messages |
| **Fleet monitoring** | Fleet data and service-request tools exist | Add role-scoped exception rules and scheduled observation |
| **Scheduling/capacity** | Assignments, load, and recommendations exist | Add booking conflict/capacity observation before any automatic assignment |
| **Administrative cleanup** | Some recommendation-only pattern analysis exists | Add explicit stale/orphan rules; keep destructive or ambiguous repair human-controlled |

## 5. `features/agent` is a mixed namespace, not a live duplicate product

The `features/agent` directory contains several different concerns:

- the live Agent Request engineering-intake flow;
- internal Ops Console support;
- role-aware summaries/notifications;
- older goal/planner code and an `agent_runs` model.

The older `startAgent()` planner entry point has no repository caller beyond its
definition. Its existence does not establish that a second shop agent is live or
that the “Agent Request” header button exposes it.

Therefore, removing or folding `features/agent` is **not a prerequisite** for
Proactive Operations V1. Before retiring any code, perform a separate consumer and
production-usage audit. Preserve useful summaries and internal engineering intake,
and move modules only when there is a clear ownership benefit. This follows the
repository's additive-first compatibility posture and avoids an unrelated broad
rewrite.

The immediate UI correction is simply to make “Agent Request” unmistakably a
feedback/engineering action rather than another shop-assistant identity.

## 6. Autonomy policy for this implementation

The AI can remove clicks; it cannot remove accountability.

### GREEN — narrowly automatic

Only dedicated commands with deterministic inputs, explicit shop enablement,
idempotency, audit records, and a kill switch qualify. Initial examples:

- create/update a read-only appointment-preparation projection;
- prefill internal staging data from authoritative records;
- create an internal parts request for an explicitly booked service only when an
  active, vehicle-compatible menu repair provides an exact parts mapping and no
  equivalent request already exists;
- emit an internal operational notification from a verified state transition.

GREEN does **not** mean changing a generic write tool such as
`create_part_request` to `confirmation: "never"`. It means introducing a narrower
command such as `prepare_appointment_parts_request` whose contract makes unsafe
inputs impossible.

### YELLOW — prepare, then confirm

- technician assignment or reassignment;
- booking/rescheduling;
- customer estimate or approval request;
- selecting a supplier or quote;
- placing a purchase order;
- changing a promised time;
- free-text customer communication;
- changing a work-order status or hold where physical readiness is not proven.

### RED — prohibited

- inventing or overriding a technician diagnosis/finding;
- assuming that parts are required;
- customer approval or safety acceptance;
- bypassing capabilities, signatures, evidence, or tenant boundaries;
- autonomous discounts, refunds, payments, or financial closeout;
- representing a part as correct, received, or fitted without authoritative
  workflow evidence.

Automatically clearing **waiting for parts** is not an initial GREEN action.
“Received” may still mean partial quantity, incorrect part, unverified fitment, or
another unresolved blocker. The existing status-based hold behavior remains the
source of truth unless a later, separately proven rule can establish all required
conditions safely.

## 7. Implementation plan

### Phase 1 — Product identity and role boundary

- Keep Technician Copilot as the technician identity.
- Present the existing Shop Assistant as **ProFix Operations** for owner, admin,
  manager, advisor, and parts roles.
- Give managers a role-specific summary/exception view on the same engine rather
  than creating another backend agent.
- Rename/clarify **Agent Request** as product feedback or issue reporting.
- Preserve current routes, APIs, authorization, and compatibility paths; make no
  schema or workflow changes in this phase.
- Add focused tests for role visibility, labels, route targets, and mobile/header
  behavior.

### Phase 2 — Unified assistant inbox

- Bring role-aware daily summary, live alerts, pending confirmations, and recent
  assistant activity into one front-end experience.
- Link each exception to the existing authoritative workspace rather than building
  duplicate management screens.

### Phase 3 — Proactive observation in shadow mode

- Add an idempotent shop-wide observer triggered on a schedule and, where useful,
  existing domain events.
- Persist detected blockers, deduplicate them, record why they fired, and measure
  false positives.
- Do not mutate shop workflow state.

### Phase 4 — Appointment preparation projection

- Inspect upcoming appointments, booked services, vehicle data, deferred history,
  known menu repairs, parts readiness, and missing information.
- Produce a reviewable preparation record and morning summary.
- Do not create repair findings, approvals, orders, or punchable work.

### Phase 5 — First deterministic GREEN command

- Implement a dedicated `prepare_appointment_parts_request` command.
- Require an explicit booked service, exact active menu-repair mapping,
  vehicle compatibility, shop opt-in, and duplicate/idempotency protection.
- Create only the internal request needed to start the existing Parts workflow.
- Never choose a supplier or place a purchase order.
- Roll out behind telemetry, a kill switch, and per-shop enablement after shadow
  evidence meets the approved threshold.

### Phase 6 — Day-of deterministic orchestration

- Add internal notifications and other narrowly proven transitions one at a time.
- Keep technician findings, customer approvals, assignments, ordering, holds,
  safety decisions, and financial actions under existing human authority.

### Phase 7 — Proactive conversation delivery

- Deliver morning summaries and event-driven exceptions into durable assistant
  threads/activity.
- Record what the system observed, what it staged, what it executed, whose
  authority applied, and what still requires human action.

## 8. Recommended first release boundary

The first meaningful release should contain:

1. Role-correct product identity and a unified Operations/Manager inbox.
2. A shadow-mode shop-wide blocker evaluator.
3. Read-only appointment preparation.
4. At most one narrowly scoped automatic internal parts-request command after its
   shadow evidence is acceptable.
5. Complete auditability, idempotency, owner enablement, and a kill switch.

It should not include autonomous diagnosis, customer approval, parts ordering,
technician assignment, work-order hold/status clearing, or financial execution.

That path builds on the strongest existing ProFixIQ foundations while preserving
the core operating rule: **the technician remains the source of truth, and AI
interprets or moves authoritative information without inventing it.**
