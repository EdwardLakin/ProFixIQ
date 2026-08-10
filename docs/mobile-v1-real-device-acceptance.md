# Mobile V1 real-device acceptance

Run this on an iPhone or iPad against the preview/production candidate after CI is green. The goal is to measure the field workflow, not to prove backend contracts already covered by CI.

## Fake day

1. Open **Mobile Service → Setup** as the owner.
   - Select **We go to customers**.
   - Enable **I perform field work** and **Solo operator**.
   - Enable a service truck and optional truck inventory.
   - Save.
2. Start a stopwatch and tap **New call**.
   - Enter customer name and phone.
   - Enter vehicle and optional plate.
   - Enter service location.
   - Enter concern.
   - Pick ETA and optional quoted price.
   - Tap **Save call**.
   - Target: saved in 20–30 seconds without opening a work-order form.
3. Confirm the call appears as the current/next Mobile Service call.
4. Turn on Airplane Mode.
   - Tap **Start travel**.
   - Tap **I've arrived**.
   - Confirm both actions remain visible as queued/saved device state.
5. Restore connectivity.
   - Confirm queued transitions clear automatically without duplicate audit events.
6. Open the linked work order and perform the repair using the existing mobile work-order flow.
7. Add **Recommendation for later** (example: `Replace all four tires before winter`) and choose **Quote later**.
   - Confirm it is not added to today's invoice.
8. Complete the Service Visit.
   - Confirm field closeout opens.
   - Finalize invoice.
   - Collect payment by Stripe card or record a terminal/cash/EFT payment.
   - Confirm receipt number appears.
   - Tap **Done — next call**.
9. Repeat with a second call to confirm no stale customer/vehicle/service-call context leaks between jobs.

## Tap/time acceptance

Record:

- call intake elapsed seconds
- taps from saved call → Start travel
- taps from Arrived → linked work order
- taps from repair complete → paid receipt
- any desktop/advisor screen encountered (target: zero)
- any field that had to be entered twice (target: zero)
- any button that was not thumb-reachable or required horizontal scrolling (target: zero)

## Failure criteria

Do not call Mobile V1 pilot-ready if any of these occur:

- duplicate customer, booking, Service Visit, payment, or recommendation after retry
- offline transition overwrites a newer server/device state
- a field operator can invoice/pay a work order not assigned through their Service Visit
- preliminary quoted price becomes invoice truth without an explicit repair/invoice action
- recommendation changes today's invoice
- account switching exposes another user's cached call
- a normal solo call consistently takes more than 30 seconds to capture
