# Equipment mobile & dispatch — inspection, gaps, and PR plan

Status: planning baseline from `main` @ 8e3aeef (after Equipment PRs #1888/#1890).
This document changes no behavior. It records what exists, what is missing, and
the dependency order of the implementation PRs. Verified items cite code or
migrations; anything not verified is marked **unverified**. No migration in this
plan is applied to production without separate authorization (this overrides the
standing "apply after gates" instruction in `AGENTS.md` for this work).

## 1. Existing canonical infrastructure (reuse, do not rebuild)

| Concern | Canonical object | Notes |
| --- | --- | --- |
| Physical dispatch | `service_visits` (+ `service_visit_events`), `dispatch_*_atomic` RPCs via `features/dispatch/server/commands.ts` | `mode` shop\|mobile, `version` optimistic lock, `operation_key` idempotency, travel timestamps and `actual_travel_minutes` already on the visit. Single `assigned_user_id` per visit. |
| Visit state machine | `features/scheduling/lib/service-visit-contract.ts` | `scheduled→dispatched→en_route→arrived→working⇄paused→completed`; `cancelled` from scheduled/dispatched/en_route/arrived/paused. |
| Visit transition API | `POST /api/mobile/service-visits/[id]/transition` | Expected version + operation key; offline replay conflicts when source state moved. |
| Line technicians | `work_order_line_technicians` (set) + `work_order_lines.assigned_tech_id` (primary) | Contract: `docs/phase-7-technician-assignment-contract.md`. Primary == lead. Assignment never creates labor. Clear/remove blocked while the tech has active labor. |
| Labor / time | `work_order_line_labor_segments` (per technician) + corrections table, payroll time entries | Per-technician labor already separate from assignment. |
| Approval / quote / invoice / parts | Existing quote, advisor review, customer approval, parts request, invoice finalization paths | Unchanged. |
| Equipment access | `equipment_operations` package; `profixiq_shop_has_product_access(..., 'equipment')`; `/equipment/field` entry (PR #1890) | Shop and field engine access already include `equipment_operations` in the product guard (migration `20261016183053`). |
| PWA | `app/manifest.ts` (single ProFixIQ manifest, `/launch?source=pwa`), `app/sw.ts` → Serwist `public/sw.js`, `PwaRuntime`, private-navigation cache guard | Service worker has **no** `push`, `notificationclick` or `pushsubscriptionchange` handlers. |
| Offline | `features/shared/lib/offline/*` (queue, receipts, conflicts, replay, session, storage-health), field snapshots, shift/line/parts/inspection drafts | Documented in `docs/mobile-v1-architecture.md`, `docs/offline-shop-pilot.md`. Visit transitions already replay state-aware. |
| In-app notifications | `assistant_notifications`, `portal_notifications`, `fleet_notification_dismissals`; hooks `useNotificationPreferences` (stored in auth user metadata), `MobileNotificationListeners`, `claimNotificationPopup` | Preferences are three booleans (indicators, message popups, assistant popups). |

## 2. Actual gaps (only these should be built)

1. **Phone push does not exist.** No Web Push library, VAPID config, subscription table, send path, or SW handlers. Needs a shared platform PR.
2. **No dispatch-specific notification events** (assignment, change, cancellation, unacknowledged) and no acknowledgement record separate from delivery.
3. **Visit supports one technician.** Multi-tech visits need an additive participants table; line-level multi-tech already exists.
4. **Equipment dispatch UI is a placeholder** (`/equipment/dispatch` renders `EquipmentPlannedPage`). No "New field call" action.
5. **No visit-level acknowledgement, reassignment/cancel-with-reason, or closeout record** (completed work, remaining work, reason, office next actions). Visit completion does not close the work order (to be locked by test).
6. **Lead completion rule** ("lead completes only after all active timers on the line stop"; office override with recorded reason) is not confirmed in existing labor completion. **Unverified** — audit in the multi-tech PR.
7. **Travel charges: no billing policy exists.** A search of migrations/features found no call-out/travel fee or rate setting (hits were Stripe fees only). See blockers.
8. **PWA identity is single.** One manifest/start URL; Equipment has no branded manifest/icon. Reconcile via a scoped manifest (e.g. `/equipment/field` scope) without altering the existing one.
9. **Offline Equipment gaps (to confirm on device):** Equipment job-card snapshot, offline notes/findings/time for multi-tech lines, pending vs server-confirmed labels for dispatch changes, sign-out cleanup of any new stores.

## 3. Proposed visit lifecycle mapping (no new state machine)

| Office/tech action | Mapping onto existing states |
| --- | --- |
| Dispatch Now / scheduled | create visit (`scheduled`) → `dispatched`; one operation key per user intent |
| Acknowledge | new `acknowledged_at` per participant; **no** status change, **no** labor start |
| Start travel / Arrived | `en_route` / `arrived`; travel recorded separately from labor segments |
| Start work / pause | `working` / `paused` (labor remains per-line segments) |
| Complete visit | `completed` + closeout record; work order status untouched |
| Return trip | new `service_visits` row on the **same** `work_order_id`; prior visits and closeout retained |
| Reassign / reschedule | `dispatch_update/assign` with expected version; if visit is `en_route`/`arrived`/`working`/`paused`, require a reason and warn; history and time preserved |
| Cancel visit | `cancelled` for that visit only. Cancel is not allowed from `working` today. Proposal: block while any labor segment or travel is open; the actor must stop/complete or use the office override-with-reason path first. Nothing is discarded. |

## 4. Notification event / recipient matrix (proposed)

Recipients are derived server-side from tenant, product, role and assignment; never broadcast.

| Event | Recipients | Existing producer? |
| --- | --- | --- |
| Visit dispatched / technician added | assigned technician(s) | no (new) |
| Visit rescheduled / reassigned / cancelled | affected current and removed technicians; office dispatcher who owns it | no (new) |
| Dispatch unacknowledged past threshold | dispatchers/managers with `canManageScheduling` | no (new); threshold is a per-shop setting with **no default chosen** |
| Parts ready | assigned technician(s) on the line | existing workflow event, **producer to be mapped** |
| Work approved / declined | assigned technician(s) and advisor | existing event, **producer to be mapped** |
| Customer ETA/dispatch messages | — | **Out of scope: not approved** |

Delivery: reuse in-app notification surfaces; Web Push is an additional channel keyed to the same notification record. Push payloads carry a generic title and an opaque id only; the target page re-authorizes on open.

## 5. Offline expectations (reuse existing queue)

Capture offline: notes, findings, time. Require server confirmation: dispatch changes, customer approvals, assignment changes. Replays use existing receipts/operation keys; stale assignment or version differences become conflicts. No second queue.

## 6. Blockers and approvals required (AGENTS.md "Contract change")

1. **Travel/call-out billing contract is absent.** Any customer-facing travel charge needs a product decision (policy shape, rates, per-visit vs per-tech). Until decided: record travel time only; no financial behavior change.
2. **Reminder threshold** for unacknowledged dispatch: not selected; ship as a required per-shop setting, off until configured.
3. **Visit participants** adds a new table (isolated addition). Any change to `service_visits` columns/triggers, `dispatch_*_atomic` RPCs, or the `work_orders` reassignment trigger is a shared-contract change needing explicit approval before editing; the plan prefers new tables/RPCs wrapping the existing ones.
4. **Push needs a VAPID key pair and env vars** provisioned by the owner (no paid provider). `web-push` npm dependency is new.
5. **Real-device validation** (iPhone installed PWA push, iPad layout) cannot be done from this environment; will be reported as not tested.

## 7. PR order (small, draft, stacked)

1. **PR A — this document** (docs only).
2. **PR B — shared notification + Web Push platform:** subscription table (per user/device, shop-scoped, revocable on sign-out), notification event + delivery + ack tables, send worker with dedupe/retry/expiry, SW push handlers added to `app/sw.ts`, enable/disable UI with iPhone Home Screen guidance, preference extension. Independent of Equipment.
3. **PR C — dispatch core:** field-call + dispatch-from-work-order command (wrapping existing idempotent RPCs), visit participants, acknowledgement, reassignment/cancel with reasons, closeout record, return visits. Depends on B for notifications only through events.
4. **PR D — multi-tech lines and completion rules:** "+ Add tech", lead completion gating, office override with reason.
5. **PR E — technician job card and Equipment dispatch UI** (phone/iPad), travel start/arrived.
6. **PR F — PWA/offline Equipment integration:** Equipment manifest/start scope, snapshots, pending/confirmed states, sign-out cleanup.

Out of scope everywhere: Equipment checkout/price, customer sends, ledger, Voice Copilot, Vercel previews.
