# Mobile V1 canonical boundaries

Mobile V1 is a productization layer over the existing ProFixIQ platform. It must not create parallel repair, scheduling, inventory, or financial truth.

- **Customer / vehicle:** existing `customers` and `vehicles`.
- **Appointment / capacity:** existing `bookings` plus Universal Scheduler events/reservations.
- **Physical field execution:** existing `service_visits` and Dispatch commands.
- **Service truck:** existing `service_vehicles`; optional inventory points to canonical `stock_locations`.
- **Repair/commercial truth:** existing work order, line, parts, inspection and invoice lifecycle.
- **Payments:** existing invoice-version/payment-event/receipt ledger and Stripe Connect checkout.
- **Mobile field capability:** `mobile_field_operators` is an explicit capability and never rewrites `profiles.role`.
- **Future opportunity:** `mobile_service_followups` stores user-authored future work separately from today's invoice.
- **Offline field state:** lifecycle actions use the existing user/shop-scoped offline mutation queue and replay through a state-aware adapter into the canonical Dispatch state machine.

## Field ownership boundary

A standalone Field subscription (`shops.subscription_package = 'field_service'`)
is its own owner-controlled workspace. The single owner is also its Field
operator, receives every Field capability, and owns the required My Truck
assignment created during setup. No Shop role, Shop administrator, or separate
tenant can gate those capabilities. The `shops` relation is shared tenant
storage; it does not make a standalone Field subscription Shop-controlled.

A Shop-linked Field workspace is a different mode. It uses the Shop's existing
memberships, role-aware capabilities, and explicit truck assignments. Linking
Field from a Shop may add those capabilities, but standalone Field must remain
independent unless that activation occurs.

## Intake principle

The conversation is the intake form. Rapid intake records only what is needed to get to the customer: identity, vehicle, location, concern, ETA, time allocation, and optional preliminary price. It creates a normal mobile booking; existing scheduler/dispatch projection creates the Service Visit. It does not create a work order or invoice merely because the phone call was saved.

## Financial principle

A preliminary field quote is context, not invoice truth. Invoice finalization still runs the existing invoice review/snapshot/finalization path. Field operators receive only assignment-scoped authority for the work order linked to their Service Visit. Payment continues through the existing payment-event ledger and receipt model.

## Offline principle

Offline Service Visit transitions preserve `fromStatus`, `toStatus`, operation key and order/dependency. Reconnect replay succeeds only if the server is still in the persisted source state, or if the target state is already present. A different newer state becomes an explicit conflict rather than last-write-wins.
