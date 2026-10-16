# ProFixIQ Equipment — product definition

Status: owner-stated direction. Pricing is **not** final.

ProFixIQ Equipment is a dedicated heavy-equipment repair management platform
that combines shop operations, service-truck dispatch, field repair, equipment
maintenance, customer approvals, parts, invoicing, and customer fleet access in
one workflow. A machine can move between the shop and the field without the
workflow breaking or creating a second system.

## Product boundaries

| Product | Purpose |
| --- | --- |
| Shop | Automotive / heavy-duty repair shop operations. |
| Fleet | A fleet owner's internal maintenance operation. |
| Field Service | Standalone mobile-service product. **Unchanged by Equipment.** |
| Equipment | Heavy-equipment repair business: shop + field service + equipment maintenance, built together. |

- Equipment is a standalone subscription. It is never included in Complete
  Operations and requires neither a Shop nor a Fleet subscription.
- Field Service remains a separate product exactly as it is. Equipment includes
  field capability natively; it does not grant, bundle, or depend on the Field
  Service package, and the Field product's gates, routes, and plans do not change.
- Existing Shop, Fleet, Field, Mobile, Customer Portal, and billing behavior is
  preserved. The legacy Complete + Equipment add-on keeps working until a
  separately approved retirement step.

## Who it is for

Businesses that repair customer-owned machinery: excavators, loaders, dozers,
graders, skid steers, forklifts, man lifts, mining, agricultural/off-road,
industrial machinery. Work happens in the shop and on the jobsite as equal
operating modes.

## Architecture principle

Equipment-specific UI and workflows over canonical engines. No second
work-order, invoice, parts, approval, or payment system, and no "field work
order" model. Canonical engines: customers, vehicles/assets, work orders,
inspections, parts, inventory, purchasing, labor, approvals, scheduling,
invoicing, payments, messaging, AI, audit events.

Field is native to Equipment by **reusing the field engines** (service visits
with `mode` shop|mobile on the canonical work order, service vehicles,
scheduling resources, dispatch board and mobile technician workflow) through
Equipment-owned routes and an Equipment capability, not by giving Equipment
tenants the `field_service` package.

## Target flow

service request → machine / customer / location → select truck + technician →
one-click dispatch → technician mobile job → inspect / diagnose → parts / labor
→ customer approval if needed → repair → complete → advisor review → invoice /
payment. One canonical work order throughout.

### One-click dispatch

The dispatcher sees machine, customer, location, complaint, priority,
machine-down status, available trucks and technicians (with skills), and current
assignments, then picks e.g. "Truck 03 — Mike — Available" and presses
**Dispatch**. One action: assigns technician and truck, attaches the jobsite,
creates/updates the field assignment, notifies the technician, places the job in
the active field queue, preserves the canonical work order, and writes the audit
event. It must be idempotent and safe under retry.

### Technician job card (mobile)

Customer, equipment, location, complaint, previous repairs, PM/history, service
request, required parts, authorization status. From the same workflow: en route,
arrived, inspect (including voice inspection), photos, diagnosis, parts and
labor, request parts, request customer approval, complete, customer signature,
submit. Work returns to the advisor/office for review and invoicing.

## Dashboard (operational, not asset-health-first)

Machines down, incoming service requests, active field jobs, available service
trucks, technicians in the field, shop work, waiting on parts, waiting on
customer approval, PM due, completed jobs awaiting invoice, downtime. Each card
shows real data or says it is not connected; no placeholder numbers.

## Customer access

Equipment businesses invite customer/fleet organizations into a portal to
request service, see their machines, report defects, upload photos, check job
status, approve work, view history and invoices, and pay online. Invited
customers do not need a Fleet subscription and are not granted Fleet product
access. ProFixIQ Fleet remains a separate product if they want internal fleet
management.

## Subscription direction (not final)

Standalone; 10 users included; additional users priced like Shop; base priced
above Shop because field is included; Voice Copilot separate; voice inspections
included with usage controls and accounting handled separately.

## Shared-contract work this implies (needs explicit approval before editing)

1. A standalone Equipment package/entitlement and the checkout, acquisition,
   webhook, and reconciliation paths that carry it.
2. `profixiq_shop_has_product_access` and the work-order command guards
   recognizing an Equipment capability that covers both shop-engine and
   field-engine access, **without** widening what the `field_service` package or
   any Shop/Fleet/Field role can do.
3. Field-service access contract accepting an Equipment tenant for the reused
   dispatch/technician surfaces.
4. A customer-portal access path for invited customers that does not route
   through the fleet owner's `fleet_maintenance` package.
5. Equipment-aware dispatch action (one-click) as a canonical service-visit
   command; any change to the `work_orders` reassignment trigger stays out of
   scope without separate approval.

## Open decisions

- Final Equipment price and plan contents. A live Stripe price at $399/month was
  created earlier at the owner's instruction; confirm or archive it.
- Whether technicians use the existing `/mobile` surface or an Equipment-branded
  mobile entry that wraps it.
- Whether Equipment has its own sign-in door or continues through Shop sign-in
  until the access PR.
