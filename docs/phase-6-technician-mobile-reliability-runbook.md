# Phase 6 — Technician Mobile Reliability

## Scope

Phase 6 protects technician mobile actions across unstable connections and repeated submissions.

Included:

- Stable idempotency keys for start, pause, resume, release-hold, and finish.
- User/shop-scoped offline mutations.
- Retryable network failure classification separated from permanent API rejection.
- Atomic inspection progress saves.
- Canonical work-order media registration for mobile and desktop job photos.
- Migration compatibility post-check.

## Migration order

Run these files in order:

1. `supabase/migrations/20260715070000_phase6_atomic_inspection_progress.sql`
2. `supabase/migrations/20260715070200_phase6_canonical_job_photo_evidence.sql`
3. `supabase/migrations/20260715070300_phase6_mobile_reliability_postcheck.sql`

The final migration must print:

```text
Phase 6 technician mobile reliability postcheck passed.
```

## Controlled validation

1. Open a technician job with an active same-shop shift.
2. Start, pause, resume, and finish the job.
3. Confirm each action succeeds and a repeated identical request does not create duplicate labor state.
4. Save inspection progress while online and confirm the session is updated once.
5. Simulate offline mode, save inspection progress, restore connectivity, and confirm one replayed save.
6. Sign out with a pending mutation, sign in as another user, and confirm the old mutation is not replayed.
7. Trigger a permanent API rejection and confirm it appears as failed/conflicted rather than queued for endless retry.
8. Capture a job photo from mobile.
9. Confirm the object exists in `job-photos` and one matching `work_order_media` row exists with the correct shop, work order, line, path, and source.
10. Retry the same photo mutation and confirm no duplicate media row is created.

## Tables and objects to inspect

- `inspection_sessions`
- `work_order_media`
- `storage.objects`
- `work_order_lines`
- `job_labor_segments`
- `workforce_operation_keys`

Do not merge until the dedicated Phase 6 workflow and Vercel build are green.
