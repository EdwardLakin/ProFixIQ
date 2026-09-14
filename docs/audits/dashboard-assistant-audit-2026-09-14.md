# Dashboard Assistant Audit — where ProFixIQ's AI actually stands

Date: 2026-09-14
Scope: every AI/assistant surface reachable from the dashboard app shell, and the
server-side systems that back them. Written against the "Tech Copilot / Operations
Agent / Manager Agent" split under discussion.

## 0. Headline finding

**The role split the vision describes is already largely built, not proposed.**
There are three distinct AI identities live in the app today, and the tool/domain
architecture underneath them is close to a 1:1 match with the "GREEN/YELLOW/RED"
autonomy model and most of the "high-value automation" list. What is missing is
narrower than it looks from the outside:

1. **No action in the system is ever fully autonomous today.** Every write path is
   gated behind an explicit human confirmation click, including ones that meet the
   vision's own definition of GREEN (predictable, reversible, already implied by an
   approved workflow). The GREEN class exists in the type system but nothing has
   been switched into it.
2. **Nothing runs proactively on a clock.** Every "operations" signal (blockers,
   overloaded techs, aging work orders, parts delays) is computed on demand when a
   person opens a panel or asks a question — never pushed ahead of an appointment,
   a shift, or a morning.
3. **Two overlapping agent stacks exist side by side** (`features/agent` and
   `features/shop-assistant`), exposed as two separate header buttons ("Agent
   Request" and "Assistant"). They duplicate several tools. This is technical debt
   worth resolving before adding the Operations Agent on top.

Everything below is sourced from the current `claude/dashboard-assistant-audit-tlv9m4`
checkout, not from documentation or memory.

## 1. What actually lives in the navbar today

`components/Navbar.tsx` is retired (`return null` — the top navbar was replaced by
the sidebar + header in `features/shared/components/AppShell.tsx`). The header
(`AppShell.tsx`) is the real "navbar" now, and it wires up four separate AI/assistant
entry points depending on role:

| Header control | Feature module | What it is |
|---|---|---|
| **Assistant** button | `features/assistant` → `features/shop-assistant` | Conversational "Ask Assistant" — the closest thing to the proposed Operations Agent |
| **Agent Request** button | `features/agent` | A separate, older goal/planner system (`agent_runs` table, 4 planner backends) |
| **Ops Console** button (internal ops emails only) | `features/agent` server + `/ops` | Internal ProFixIQ-team console, not shop-facing |
| `TechnicianCopilotShell` (auto-mounted for `mechanic` role, no header button) | `features/copilot/technician` | The Tech Copilot from the vision — inspect/document/punch/explain |

So the three-identity split (Tech / Operations / Manager) is **conceptually already
present**, just not named that way and not evenly built out:

- **Tech Copilot → `features/copilot/technician`.** Well-developed: chat, day
  agenda, shift punch, documentation drafting, voice, mobile dock, a governed-turn
  layer with spend/quota guards (`governedTurn.ts`) and a typed action contract
  (`actionContract.ts`). This is the most mature of the three and matches the
  vision's "task-focused" description closely.
- **Operations Agent → `features/shop-assistant`.** A real conversational agent with
  36 tools across 10 domains (work orders, scheduling, inventory, invoices,
  customers, fleet, inspections, workforce, communications, reporting). This is
  the natural home for the "Operations Agent" the vision describes — see §3.
- **Manager Agent → does not exist as a named surface**, but its raw material
  exists: `features/agent/server/getRoleDailySummary.ts` already produces a
  role-differentiated exception digest (owner/manager/advisor/tech/fleet each get a
  different summary built from the same notification set). It's just not exposed
  as its own identity or pushed anywhere — see §4.

## 2. The autonomy model: infrastructure exists, nothing is turned on

`features/ai/server/automationPolicy.ts` implements almost exactly the readiness
model the vision proposes — evidence-based promotion, not a manual toggle:

- 10 named automation capabilities (`appointment_intake`, `customer_status_updates`,
  `work_order_line_creation`, `quote_preparation`, `approval_request_delivery`,
  `parts_ordering`, `appointment_reminders`, `advisor_follow_up`,
  `invoice_preparation`, `payment_collection`).
- Each requires ≥100 observations (75/40 for parts), ≥95% agreement rate, ≤2%
  exception rate, zero critical failures, over a rolling 180-day window before it's
  considered `"ready"`.
- **`AI_AUTOMATION_EXECUTION_AVAILABLE` hardcodes every single capability to
  `false`.** Even a capability that scored 100% readiness could not execute
  automatically today — the execution wiring itself hasn't been built for any of
  the ten. This is an explicit, intentional gate, not a bug — but it means the
  "evidence and promotion" system is currently pure telemetry.

Separately, the **shop-assistant tool registry** (`features/shop-assistant/server/tools/registry.ts`)
already has the GREEN/YELLOW distinction the vision proposes, expressed as a
`confirmation` field on every tool: `"never"`, `"required"`, or `"owner_pin"`.
Sampling all ~90 tool definitions across the domain files:

- Every tool with `confirmation: "never"` is a **read-only** tool (fetch data,
  search, list). There is no write tool anywhere in the registry with
  `confirmation: "never"`.
- Every write tool — `create_part_request`, `receive_part_request_item`,
  `send_conversation_message`, `create_booking`, `reschedule_booking`,
  `add_work_order_line`, `record_approval_decision`, `assign_work_order`, invoice
  and payment actions, everything — is `"required"` (a few finance actions are
  `"owner_pin"`). All of them route through `previewShopAssistantWriteTool` →
  `createPendingAction`, which always produces a `confirmation_required` result
  that a human must click to execute (`orchestrateShopAssistantTurn.ts:250-300`).

**In the vision's own terms: today's Operations Agent has a fully-populated YELLOW
class and a RED boundary, but an empty GREEN class.** Nothing is "mechanically
implied by an already-approved workflow and executed without a click" yet — even
things that clearly qualify under the vision's own rule (e.g. turning a
technician-submitted parts requirement into a parts request; sending "your vehicle
is ready" once state says so).

## 3. Mapping the vision's automation targets to what exists

| Vision target | Current state | Detail |
|---|---|---|
| **Work-order readiness / blocker detection** | **Built, but pull-based** | `features/ai/server/domains/workOrders/workOrderRecommendationRules.ts` + `partsDelayRules.ts` + `technicianDispatchRules.ts` + `closeoutRiskRules.ts` generate exactly the blocker types described in the vision: aging WO with no next action, waiting-on-approval, waiting-on-parts, inspection incomplete, ready-for-closeout, technician blocked/stale, priority escalation. Every recommendation is explicitly tagged `side_effects: ["no_mutation"]` and `requires_approval: false` at the recommendation layer (it only *proposes*). It only runs when a specific work order's `/api/work-orders/[id]/ai/recommendations` route is hit — there is no shop-wide sweep and no cron trigger. |
| **Exception summary ("3 things blocking the shop")** | **Built and role-aware, but on-demand and not pushed** | `getRoleDailySummary.ts` + `getOpsNotifications.ts` already compute owner/advisor/manager/tech/fleet-specific digests from the same signal set (`approval_waiting`, `work_order_on_hold_too_long`, `parts_waiting_too_long`, `tech_overloaded`, `shop_overloaded`, `tech_underutilized_capacity`, `active_job_running_too_long`, `shop_throughput_below_capacity`). This is the closest thing to a Manager Agent that exists. Gap: it's computed only when a user requests it (`/api/planner/daily-summary` or the assistant), never proactively scheduled, and there's no push/SMS/email delivery. |
| **Appointment preparation (night-before staging)** | **Not built** | `listBookingsTool`/`createBookingTool`/`rescheduleBookingTool` exist for on-demand scheduling queries, but there is no job that walks tomorrow's appointments and stages parts, flags missing VIN/unit data, or surfaces deferred work ahead of arrival. |
| **Deferred/carried-forward work surfaced at intake** | **Exists as a manual UI panel, not an AI capability** | `PreviousDeferredWorkPanel.tsx` fetches `/api/work-orders/deferred-history` when a human opens it during WO creation. It is not agent-driven, not proactive, and not wired into the shop-assistant tool registry — the Operations Agent can't currently say "this vehicle has 3 carried-forward items" unasked. |
| **Parts automation (tech→advisor→parts→advisor→tech)** | **Tool surface exists; every step is human-confirmed** | `inventory.ts` (1,649 lines) has `create_part_request`, `receive_part_request_item`, `create_purchase_order`, `place_purchase_order`, `receive_purchase_order_line`, `list_parts_blockers`, `list_low_stock_parts`. All writes require confirmation; no auto-notify-tech-on-receipt, no auto-clear-waiting-for-parts, no duplicate-request detection surfaced through the agent. |
| **Customer communication (state-derived, factual)** | **One generic tool, gated** | `send_conversation_message` in `communications.ts` is `confirmation: "required"` and free-text, not a set of vetted state-triggered templates ("vehicle arrived", "estimate ready", "ready for pickup"). Nothing sends automatically on a state transition. |
| **Fleet monitoring** | **Real domain, on-demand only** | `fleet.ts` has `list_fleet_units`, `list_fleet_service_requests`, `create_fleet_service_request`, `convert_fleet_service_request`. Same shape as the rest: solid read/propose surface, nothing proactive, no PM-interval or overdue-inspection sweep exposed to the agent. |
| **Administrative cleanup (stale drafts, orphans, duplicates)** | **A different, adjacent system exists (ShopBoost), same posture** | `features/agent/server/opsRecommendations.ts` (`evaluateSmartMatchReadiness`, `buildMenuItemEfficiencyRecommendations`, `buildInspectionTemplateEfficiencyRecommendations`) does deterministic pattern-mining over completed work with an explicit "recommendation only, nothing is auto-created" stance — architecturally the right instinct, but it targets menu/inspection-template efficiency, not stale WOs/orphaned parts requests/duplicate customers as such. |
| **Scheduling optimization (capacity, conflicts, reassignment suggestions)** | **Partial** | `workforce.ts` has `list_technician_assignments`, `list_technician_load`, `recommend_work_assignments`, `assign_work_order` — genuinely close to the vision's "suggest technician assignments" item. No capacity-conflict detection across bookings, no "what can we pull ahead" query yet. |

## 4. The duplicate-agent problem

`features/agent` (older) and `features/shop-assistant` (newer) both exist in
production and overlap:

- Both have a `getStalledWorkOrders`/`list_stalled_work_orders` equivalent.
- Both have booking/reschedule tools.
- Both have approval-related tools (`recordWorkOrderApproval` vs
  `record_approval_decision`).
- `features/agent` uses a goal + planner (`simple`/`openai`/`fleet`/`approvals`)
  model against an `agent_runs` event log; `features/shop-assistant` uses a
  threaded conversation model against `pending_actions` with per-tool
  confirmation policy and RBAC capability gating
  (`ActorCapabilityKey`/`allowedRoles` on every tool).
- The shop-assistant design is materially more mature: typed input/output schemas
  per tool, per-tool risk tier, per-tool role/capability authorization, a single
  confirmation path, idempotency keys per turn. `features/agent`'s planners don't
  have that same uniform authorization/confirmation layer.
- Both are exposed simultaneously in the header today ("Agent Request" and
  "Assistant" buttons), which is confusing for exactly the reason the vision's
  three-identity framing is trying to avoid — two things claiming to be "the shop
  AI" from the same toolbar.

**Recommendation:** before building the Operations Agent's proactive layer on top
of `features/shop-assistant` (the right base — it already has the domain/tool
architecture the vision wants), retire or fold `features/agent`'s overlapping
tools into it, and collapse "Agent Request" + "Assistant" into one entry point.
`getRoleDailySummary`/`getOpsNotifications` (currently under `features/agent/server`)
are worth keeping and moving alongside the shop-assistant surface as the seed of
the Manager Agent, since they're the one piece of `features/agent` with no
shop-assistant equivalent yet.

## 5. What "Proactive Operations V1" needs that doesn't exist yet

Given the state above, the four things called out as the first build
(appointment prep, WO blocker detection, deterministic parts routing, actionable
summaries) break down as:

- **WO blocker detection**: rules engine exists (§3) — needs (a) a shop-wide sweep
  instead of per-WO on request, (b) a scheduler/event trigger instead of
  route-hit-only, (c) promotion of a defined subset from `requires_approval: false`
  *recommendation* to true GREEN *action* (e.g. auto-clearing "waiting for parts"
  when all blocking parts are marked received is exactly the kind of deterministic,
  reversible move the vision calls GREEN, and the underlying data already exists
  in `listPartsBlockersTool`/`receivePartRequestItemTool`).
- **Actionable summaries**: exists (`getRoleDailySummary`) — needs a schedule
  (cron already exists for six other jobs in `vercel.json`; this would be a
  seventh) and a delivery channel (push/email/in-app banner) instead of
  request-time computation only.
- **Appointment preparation**: does not exist — net-new. The building blocks
  (booking tools, deferred-history endpoint, parts blockers, VIN/vehicle lookups)
  are all present as manual/on-demand primitives; nothing walks tomorrow's
  schedule and calls them proactively.
- **Deterministic parts routing**: does not exist — net-new. The write tools exist;
  the "mechanically imply a parts request from a submitted technician parts
  requirement, without a click" GREEN path does not, because no write tool in the
  registry is currently allowed to skip confirmation.

## 6. Bottom line

This is meaningfully further along than a "we're starting from a chatbot"
assessment would suggest. The domain/tool separation, RBAC-scoped capabilities,
per-action risk tiers, and an evidence-based automation-readiness framework are
already in the codebase and reasonably well-designed. The gap between here and the
vision is specifically:

1. Turn on a real GREEN class (some write tools with `confirmation: "never"` under
   tight, explicit preconditions) instead of confirmation on every write.
2. Add a scheduler/event layer so blocker detection and summaries run ahead of
   need instead of only when asked.
3. Build the net-new appointment-prep and parts-routing automations on the
   existing tool primitives.
4. Resolve the `features/agent` vs `features/shop-assistant` duplication before
   layering more on top, and formally name/expose the Manager Agent using
   `getRoleDailySummary` as its seed.
