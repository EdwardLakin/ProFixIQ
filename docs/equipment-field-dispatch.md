# Equipment field dispatch (PR C1)

Backend for dispatching Equipment work in the field. UI is a later PR (E).

## Commands (all wrap existing canonical dispatch commands)
| Route | DB command | Who |
| --- | --- | --- |
| `POST /api/equipment/dispatch` | `equipment_dispatch_visit_atomic` | `canManageScheduling` roles |
| `POST /api/equipment/field-calls` | `equipment_create_field_call_atomic` (work order + visit in one transaction) | office work-order creators only; technicians cannot originate calls |
| `POST /api/equipment/dispatch/visits/[visitId]/acknowledge` | `equipment_acknowledge_visit_atomic` | a technician on that visit |

All require an active Equipment entitlement. Dispatch and field calls require an `Idempotency-Key` header.

## Behavior
- **Work order stays the same.** Visits link to the one work order. The command refuses a second *active* visit on a work order (`ACTIVE_SERVICE_VISIT_EXISTS`); a return trip is created after the prior visit is completed or cancelled.
- **Idempotency.** Per-key advisory lock + receipt in `scheduler_operation_keys` (request hash; a reused key with a different payload is refused). A field call is atomic: a failed dispatch rolls back the work order.
- **Technicians.** The lead is `service_visits.assigned_user_id` (the existing execution owner and the only person who can drive visit status with the existing commands). Supporting technicians are rows in `service_visit_participants`. Labor stays per technician on the existing labor segments; dispatch and acknowledgement never start labor.
- **Acknowledgement** is stored on the participant row, separate from push delivery. It does not change visit status.
- **Now vs scheduled.** `dispatchNow` creates the visit and moves it `scheduled -> dispatched` in the same transaction. Otherwise it stays `scheduled`. Now requires a technician and (for field visits) a jobsite.
- **Notifications.** One `dispatch.assigned` in-app notification per technician (never the dispatcher), key `equipment:dispatch.assigned:{visit}:{user}`, re-run on idempotent replays so a crash between commit and notify heals on retry. Phone push uses the shared platform with generic lock-screen text. No customer message is sent.

## Prerequisites inherited from existing contracts (not changed here)
Field visits already require, via existing commands: product access, completed Field onboarding (`mobile_service_settings`), and enabled `mobile_field_operators` for the dispatcher and each lead. Equipment tenants must complete that setup.

## Not in this PR
Reassign/reschedule/cancel with reasons, closeout and return-visit scheduling, unacknowledged-dispatch reminder (needs a per-shop threshold; no default chosen), per-technician travel, Equipment dispatch UI.
