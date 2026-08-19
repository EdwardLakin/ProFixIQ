# Shop Vehicle Workspace — Foundation and Canonical Read Model

Status: first vertical slice implementation
Audit date: 2026-08-19

## Milestone

The foundation proves one narrow flow without replacing existing records pages:

1. Search a customer, company, contact value, vehicle identifier, or work-order number.
2. Resolve every match to its canonical `vehicles.id` without choosing a first vehicle.
3. Open a role-shaped, server-side Vehicle Workspace.
4. Start the existing Create Work Order flow with the canonical customer and vehicle IDs preselected.

The workspace is a read model. It does not persist copied history, balances, findings,
maintenance results, documents, or lifecycle state.

## Repository audit findings

- The Shop shell has no authoritative database-backed global record search today. The tab
  bar search only filters device-local open tabs, while Customer and Vehicle Files previously
  loaded records into the browser and filtered them locally. This slice upgrades the existing
  `/vehicles` records entrance instead of adding a second search silo.
- The old vehicle search opened a customer route, and that route could default to the first
  vehicle. The new result and workspace always carry the matched canonical `vehicles.id`.
- Create Work Order is the only existing action with a complete customer-and-vehicle prefill
  contract and same-shop relationship validation. Booking, Estimate, and Message have partial
  backend or form support but no complete query-handoff contract, so they are not advertised
  as working quick actions in this PR.

## Canonical relationship contract

| Domain | Canonical source | Vehicle relationship and workspace rule |
| --- | --- | --- |
| Customer or business account | `customers.id` | `vehicles.customer_id` is the nullable current-account relationship. Commercial settings remain account-owned. |
| Vehicle | `vehicles.id` | The only workspace key. Sources that carry `shop_id` are explicitly shop-scoped; relation-only sources are limited to RLS-visible canonical vehicle/WO IDs. |
| Appointment | `bookings.id` | Direct `vehicle_id`; optional `customer_id` and `work_order_id`. Return every current appointment. Scheduling-authorized roles deep-link by source ID into the existing appointment UI; other cards retain the source ID without offering an unauthorized navigation. |
| Work order | `work_orders.id` | Direct `vehicle_id`. Return every non-terminal record rather than selecting one; dated timeline events retain the WO `odometer_km` reading when present. |
| Repair line | `work_order_lines.id` | Connected through both `work_order_id` and `vehicle_id`. The line remains the repair source. |
| Installed part | `work_order_parts.id` | Connected through `work_order_id`, with an optional focused `work_order_line_id`. Timeline evidence includes only active rows whose net `quantity_consumed - quantity_returned` is positive, retains the canonical part-row ID, and never projects price or cost. |
| Parts request | `part_requests.id` | Connected through `work_order_id`. Active-now cards are queried only for roles accepted by the existing Parts Requests layout, exclude terminal request states, and retain the request ID and canonical detail route. |
| Inspection | `inspections.id` | Direct `vehicle_id`, optional WO/line IDs. Canonical findings remain in `inspections.summary`; a workspace finding retains the inspection ID. |
| Estimate and approval | `work_orders.id`, `work_order_quote_lines.id` | An estimate is a pre-authorization work order; nonempty canonical quote-line decisions become approval timeline events that retain their quote-line IDs and source line IDs. |
| Deferred work | `work_order_quote_lines.id` or independently deferred `work_order_lines.id` | Linked quote/repair representations are not rendered twice. AI recommendation tables are not operational truth. |
| Invoice | `invoices.id`, with issued truth in `invoice_versions.id` | Vehicle attribution exists only through `invoice.work_order_id -> work_orders.vehicle_id`. Account-wide invoices are never assigned to a vehicle. |
| Payment | `payments.id` and append-only `payment_events.id` | Included only when its WO resolves to the vehicle and the actor can view financials. |
| Vehicle/repair media | `vehicle_media.id`, `work_order_media.id` | Counts and links only; no blob or metadata copying. |
| Imported history | `history.id` | Query by `vehicle_id`, not current customer. Skip a history mirror when its canonical live WO is already rendered; retain imported odometer readings and differing historical customer IDs as evidence. |
| Maintenance | `maintenance_rules`, `maintenance_services`, completed repair lines; `maintenance_suggestions.work_order_id` is a deterministic cache | Show only non-suppressed, due evidence with a recorded `whyDue`, service code, and source WO. Never turn generated prose into unexplained maintenance truth. |

## Ownership and ambiguity rules

- A vehicle with no current account has a valid workspace. Customer-dependent actions are unavailable.
- A customer search returns all matching vehicles. For account-authorized roles, an account with no vehicles remains an account result and does not get a fabricated workspace.
- Multiple active WOs, appointments, inspections, deferred items, and vehicle-related invoices remain arrays.
- A historical WO whose `customer_id` differs from `vehicles.customer_id` stays linked to its historical source. The workspace does not infer a prior-owner ledger that the schema does not have.
- Inactive/archived/merged accounts and archived/duplicate/inactive vehicle status are visible warnings.
- Duplicate VINs are possible because normalized VIN lookup is not a unique ownership constraint. Search deduplicates only by canonical `vehicles.id`.
- A WO match without a canonical `vehicle_id` is unresolved; it is never attached using denormalized vehicle text.
- Failed/recommended inspection findings remain dated source evidence. The workspace does not claim they are unresolved when no canonical repair-to-finding resolution link exists.

## Authorization contract

The page and search API use the cookie-backed authenticated Supabase client, so RLS is
always in the query path. They do not use a service-role client.

The server projection reuses current application capabilities:

| Data/action | Authority or safe-link rule |
| --- | --- |
| Financial summary | `getActorCapabilities(role).canViewFinancials` (currently owner/admin/manager) |
| Parts requests | Existing `/parts/requests` layout roles (owner/admin/manager/parts) |
| Open legacy account page | Existing Vehicle/Customer Files roles (owner/admin/manager/advisor); broader contact viewers get plain contact shortcuts without a mutation-capable account link |
| Open work-order-family detail | Existing dynamic WO roles (owner/admin/manager/advisor/mechanic/lead_hand/foreman); service and parts retain source IDs without links |
| Open estimate or quote detail | `ESTIMATE_VIEW_ROLES`; mechanics retain estimate and decision evidence without links |
| Open inspection detail | Owner/admin/manager/advisor/lead_hand/foreman; service, parts, and mechanics retain evidence without links until the legacy inspection payload is role-shaped |
| Open imported-history detail | Financial viewers only until the legacy detail page has a role-shaped projection; other roles retain the history source ID without a link |
| Open appointment detail | `canManageScheduling`; other workspace readers retain the booking ID without a link |
| Create WO | `ROLE_GROUPS.workOrderCreators` |
| Appointment action contract (deferred) | `canManageScheduling` |
| Estimate action contract (deferred) | `estimateActorForRole(role).canCreate` |
| Customer messaging contract (deferred) | `isCustomerMessagingRole(role)` |
| Mechanic workspace | At least one RLS-visible assigned WO for the vehicle; otherwise return the same not-found result as an unknown/cross-shop ID |

Once that assigned-WO anchor exists, the mechanic receives the vehicle-level service context
already allowed by the current table policies. Tightening that context to only the assigned WO
would be a separate authorization-policy change, not an implicit workspace rule.

Restricted projections do not query invoices or payments and do not select account contact
fields. The route does not accept a request-provided shop, role, customer, or permission value.

### Existing database-policy compatibility gate

The audit found a pre-existing mismatch between TypeScript capabilities and direct table
access: several invoice, payment, invoice-version, payment-event, and customer-settings
policies permit broader same-shop access than `canViewFinancials` does. The new workspace
does not widen that access and does not expose those fields to restricted roles, but React or
server projection alone cannot make a broader direct-table claim true.

Tightening those policies requires a separate forward security migration after product owners
choose the exact advisor/service/billing role matrix and affected legacy billing flows are
compatibility-tested. Until then, the workspace payload and cross-tenant direct access can be
certified; a claim that every restricted same-shop actor is blocked from every legacy financial
table cannot.

The audit also found that imported `history` rows with `work_order_id is null` are excluded by
the current WO-based history select policy. The read model does not bypass RLS to fill that gap.
A forward policy change needs a role-aware vehicle/customer tenant rule before those orphaned
imports can be certified as complete workspace history.

## First-PR scope

Included:

- one bounded, server-backed search contract mounted in the existing `/vehicles` entry;
- guarded `/vehicles/[vehicleId]` workspace;
- Vehicle header, Active now, Needs attention, and Recent timeline;
- canonical source IDs on every operational item, with canonical links only
  when the destination page authorizes the current role;
- explicit ambiguity/warning cards;
- role-shaped account and financial projection;
- the existing `/work-orders/create?customerId=...&vehicleId=...` handoff.

Deliberately deferred:

- Book, Estimate, and Message quick actions, because their existing UIs do not yet consume a durable customer+vehicle prefill contract;
- any replacement or removal of Customers, Vehicles, History, Invoice, Inspection, Appointment, or Work Order pages;
- a new workspace table, rewritten migration, lifecycle-state change, or production mutation;
- Field/Fleet behavior, sidebar redesign, and AI-written operational truth;
- performance indexes until production-like query plans justify a forward migration.

For odometer display, dated work-order readings take precedence over the undated
`vehicles.mileage` master field; the vehicle field is the fallback when no WO reading exists.
The current schema has no `vehicles.updated_at`, so claiming a stricter cross-source timestamp
ordering would invent recency that the data cannot prove.
Engine hours remain a current vehicle-header value because the audited sources do not provide
dated engine-hour evidence suitable for a historical timeline.

## Verification gates

- search deduplicates by vehicle ID and preserves all matched vehicles for a multi-vehicle account;
- snapshot queries use authenticated `shop_id` scope, and mechanics require an assigned-WO anchor;
- a malformed, unassigned, missing, or cross-shop vehicle produces no workspace disclosure;
- invoice/payment queries do not execute for restricted roles;
- authorized source references open the canonical WO, estimate, invoice, inspection, or history page, while restricted roles retain the same source IDs as non-links;
- Create Work Order passes both canonical IDs and the existing destination validates them;
- focused tests, integration tests, type-check, lint, build, responsive browser checks, and regression inventory pass before merge.
