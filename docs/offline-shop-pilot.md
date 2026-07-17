# Offline shop pilot

Run this matrix against the production-like pilot shop before general offline release. Record device, OS/browser version, installed-app version, user/shop, test time, result, and evidence for every row.

## Required devices

- Current iPhone and iPad installed from Safari
- Current Android phone and tablet installed from Chrome
- Windows desktop or shop tablet installed from Edge or Chrome
- Two devices signed into separate technician/advisor accounts in the same shop

## Test matrix

1. Download assigned work, close the app completely, disable networking, reopen, and verify the queue and job details load.
2. Repeat notes, cause/correction, inspection, shift, and job-punch actions twice; verify one stable receipt per action.
3. Queue several dependent actions offline, reconnect, and verify chronological replay and authoritative cache refresh.
4. Edit the same job from two devices, reconnect the older device, and verify an actionable conflict preserves both server and device values.
5. Expire or revoke the session while work is queued; reconnect and verify nothing replays until the original user/shop is re-verified.
6. Sign out and sign in as another user; verify the previous user's snapshots, drafts, photos, and queue are unavailable and removed by logout cleanup.
7. Stage at least 40 photos and repeat near the browser quota; verify the Sync Center warns before capture becomes unsafe.
8. Lose the network during every server mutation and immediately after the server commits; verify retries do not duplicate records.
9. Deploy an app update while work is queued; verify activation is held until the queue is synced or reviewed.
10. Evict browser storage where the platform allows it; verify missing staged files become explicit conflicts rather than silent success.
11. Export pilot diagnostics from Sync Center after each failure test; verify the report contains aggregate health only and no customer, vehicle, message, note, user, shop, or mutation identifiers.

## Release gate

Do not expand beyond the pilot until every critical workflow passes on every required device, no cross-user/shop data is visible, duplicate mutations remain idempotent, and all conflicts give the user a safe recovery action.
