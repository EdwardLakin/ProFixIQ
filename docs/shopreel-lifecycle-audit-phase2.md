# ShopReel Lifecycle Audit — Phase 2 (Canonical System)

## Snapshot

This pass confirms that ProFixIQ currently implements **ShopReel integration observability + outbound event bridge**, not a complete in-app ShopReel product lifecycle.

Canonical lifecycle currently implemented in-repo is:

`ProFixIQ operational/work-order/inspection events -> sanitized ShopReel payload delivery -> delivery log + integration status`

The following lifecycle stages are **not implemented as canonical in-app flows** (only schema hints exist):
- story source management UI
- opportunity queue with generated/dismissed lifecycle persistence
- creator/build editor
- draft/review workflow
- render jobs
- publish/schedule orchestration
- campaign lifecycle management
- autopilot orchestration state machine
- first-class analytics rollups tied to publication/render tables

## Canonical Route/File Map

### Canonical user surfaces
- `/dashboard/owner/marketing` (owner settings)
- `/dashboard/marketing` (owner monitoring view)

### Canonical API surfaces
- `GET|POST|PUT /api/shopreel/integration`
- `POST /api/shopreel/retry`
- `POST /api/shopreel/operational-signals`

### Canonical event source entry points
- `POST /api/inspections/complete`
- `POST /api/inspections/photos/upload`
- `POST /api/work-orders/[id]/mark-ready`
- `POST /api/work-orders/quotes/[id]/approval`

### Canonical bridge runtime files
- `features/integrations/shopreel/server/buildProFixIQStoryEvents.ts`
- `features/integrations/shopreel/server/buildOperationalStoryCandidates.ts`
- `features/integrations/shopreel/server/mapOperationalStoryCandidateToStoryEvent.ts`
- `features/integrations/shopreel/server/postOperationalStoryCandidatesToShopReel.ts`
- `features/integrations/shopreel/server/postStoryEventToShopReel.ts`
- `features/integrations/shopreel/server/recordShopReelDelivery.ts`
- `features/integrations/shopreel/server/sanitizeProFixIQStoryEvent.ts`

## Partially Wired / Stale / Parallel Paths

1. **Schema-forward but app-missing lifecycle tables**
   - `shopreel_manual_assets`
   - `shopreel_manual_asset_files`
   - `shopreel_publications`
   - `shopreel_publish_jobs`
   - `shopreel_social_connections`

   These exist in generated Supabase types, but no canonical App Router surfaces or API routes currently operate them in this repo.

2. **Parallel type output trees**
   - `shared/types/types/supabase.ts`
   - `features/shared/types/types/supabase.ts`

   Both advertise ShopReel lifecycle tables, which can cause confusion during audits if one path is treated as canonical source-of-truth by mistake.

3. **Discoverability mismatch (resolved in this pass)**
   - Admin role tile previously exposed `/dashboard/marketing` even though route access gates to owner membership only.

## Phase 2 Fixes Implemented in This Pass

1. Canonicalized allowed ShopReel event types into one source of truth.
2. Added event-type sanitization so API persistence cannot drift with invalid event names.
3. Fixed integration API test-event route compile/runtime issue (`crypto` import missing).
4. Hardened outbound delivery lifecycle to surface missing `remote_shop_id` as integration error state instead of silent attempted lifecycle continuity.
5. Preserved `last_success_at` on failed delivery/retry attempts (prevents trust regression in monitoring history).
6. Blocked retry flow when integration is disabled (status consistency).
7. Removed non-owner discoverability to Marketing tile (owner-only route now owner-only in navigation).

## Remaining Gaps (Explicit)

To become a true in-repo end-to-end ShopReel lifecycle system, this codebase still needs canonical implementations for:

1. Opportunity persistence model (`generated`, `dismissed`, `accepted`, `expired`) with audit trail.
2. Creator/build entities and edit session contracts.
3. Draft/review approval state machine and reviewer attribution.
4. Render job orchestration + durable state transitions (`queued -> rendering -> completed/failed`).
5. Publication scheduler + status transitions tied to publish jobs and connections.
6. Campaign/autopilot orchestration engine with explicit transitions and retry semantics.
7. Analytics rollups derived from render/publication/campaign lifecycle tables (not inferred from delivery logs alone).
8. Consolidation policy for duplicate generated Supabase type trees to avoid drift during future lifecycle work.

