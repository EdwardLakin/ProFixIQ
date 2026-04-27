# Onboarding Agent Architecture Audit — 2026-04-27

## Addendum: Phase 1 consolidation completed

### Files removed/quarantined
- Retired legacy analyzer server path:
  - `features/onboarding-agent/server/runOnboardingAgentAnalysis.ts` (removed)
  - `features/onboarding-agent/server/prompts.ts` (removed)
  - `features/onboarding-agent/server/model.ts` (removed)
  - `features/onboarding-agent/lib/agentTypes.ts` (removed)
- Legacy route quarantines (410 Gone):
  - `POST /api/onboarding-agent/sessions/[sessionId]/agent-analysis`
  - `POST /api/onboarding-agent/sessions/[sessionId]/files`

### Canonical analyze/rerun route decision
- `POST /api/onboarding-agent/sessions/[sessionId]/analyze` is now canonical for first analysis only.
- `POST /api/onboarding-agent/sessions/[sessionId]/rerun` is canonical for reruns.
- Dashboard and session UI reruns now use the same `/rerun` endpoint contract.
- Analyze endpoint returns `409` once analysis artifacts are present, with guidance to rerun.

### Final status vocabulary (compatibility contract)
- `draft`
- `files_uploaded`
- `uploaded`
- `analyzing`
- `analyzing_started`
- `clearing_previous_analysis`
- `applying_analysis`
- `analysis_ready`
- `review_required`
- `ready_for_dry_run`
- `ready_for_activation`
- `activation_ready`
- `activating`
- `activated`
- `blocked`
- `cancelled`
- `deleted`
- `analysis_failed`

> TODO: shrink alias statuses in a later phase after production data normalization.

### Migration notes
- Added production-safe consolidation migration:
  - `db/sql/2026-04-27_onboarding_agent_phase1_consolidation.sql`
- Migration actions:
  1. Drops/recreates `onboarding_sessions_status_check` with compatibility statuses.
  2. Deduplicates `onboarding_review_items` by `(shop_id, session_id, domain, issue_type, severity, md5(coalesce(details::text,'')))`.
  3. Deduplicates `onboarding_entity_links` by `(shop_id, session_id, link_type, from_entity_id, to_entity_id)`.
  4. Deduplicates `onboarding_entities` by `(shop_id, session_id, source_file_id, source_row_index, entity_type)`.
  5. Recreates unique indexes only after dedupe.

### Remaining risks
- External consumers may still attempt legacy 410 routes until they migrate.
- Compatibility status set is intentionally broad; aliases should be reduced once production data is clean.
- Existing historical migrations remain in-repo for auditability and should not be re-run out of order.
