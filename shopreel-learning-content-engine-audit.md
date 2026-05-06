# ShopReel Learning Content Engine Audit

## Executive Summary

ShopReel foundations already exist for **shop-scoped operational event ingestion** (ProFixIQ -> ShopReel opportunities/drafts workflow), but the current architecture is **not yet a unified AI content engine** for standalone creators, manual uploads at scale, reusable asset libraries, or learning feedback loops.

Current implementation is strongest in:
- ProFixIQ-originated story events
- Opportunity queueing and draft lifecycle
- Owner-only RLS controls for shop-bound records

Major gaps to close:
- No canonical cross-tenant asset library model spanning manual + integrated sources
- No multi-asset bulk ingest/analyze pipeline designed for creator workflows
- No progress stream/project model for daily-to-weekly recap generation
- No explicit learning-signal schema that ties generated content + publication metadata + performance snapshots + optimization feedback
- Current model is heavily `shop_id`-first and does not yet clearly support non-shop standalone users/workspaces

Verdict: **Build a canonical Asset -> Content Unit -> Distribution Event -> Performance Signal -> Learning Profile model first**, then layer workflows in phases.

---

## Current Architecture Map

### 1) Data/Lifecycle foundation already in place
- `db/sql/2026-04-18_shopreel_lifecycle_foundation.sql` defines:
  - `shopreel_story_sources`
  - `shopreel_opportunities`
  - `shopreel_opportunity_status_history`
  - `shopreel_drafts`
  - enums for opportunity/draft status
  - RLS and owner policies (shop membership + `role = owner`)

This creates a clean ingestion-to-draft lifecycle but is **event/opportunity centric**, not yet **asset-library/learning centric**.

### 2) API surfaces present
- `app/api/shopreel/integration/route.ts`
  - shop integration config + test event
- `app/api/shopreel/operational-signals/route.ts`
  - owner-triggered push of operational story candidates
- `app/api/shopreel/opportunities/action/route.ts`
  - accept/dismiss/generate opportunity actions
- `app/api/shopreel/drafts/route.ts`
  - create draft from accepted/generated opportunity
- `app/api/shopreel/drafts/[id]/route.ts`
  - patch draft content/status
- `app/api/shopreel/retry/route.ts`
  - retry failed event delivery

### 3) Integration/server logic present
`features/integrations/shopreel/server/**` covers:
- payload sanitization/signing
- shop integration lookup/config
- lifecycle source persistence
- delivery retry telemetry
- operational candidate building/posting
- marketing dashboard aggregations

### 4) UI present
`features/integrations/shopreel/components/**` includes:
- owner marketing settings
- lifecycle queue (opportunities/drafts)
- delivery retry button
- marketing dashboard

### 5) Type surface indicates additional tables exist in schema types
`features/shared/types/types/supabase.ts` includes typed tables such as:
- `shopreel_manual_assets`
- `shopreel_manual_asset_files`
- `shopreel_publications`
- `shopreel_publish_jobs`
- `shopreel_social_connections`
- `shopreel_event_deliveries`
- `shopreel_integrations`

However, implementation usage appears concentrated around integrations + lifecycle, with limited end-to-end “creator library + learning loop” flows exposed in this repo.

---

## Existing Tables / Routes / Features Audit

## A) Current asset model

### What exists
- Manual asset tables are typed (`shopreel_manual_assets`, `shopreel_manual_asset_files`) and queried in dashboard aggregation.
- Lifecycle story source table (`shopreel_story_sources`) persists event payloads (JSONB).
- Opportunity/draft tables track downstream text/content-draft lifecycle.

### Scope + tenancy observations
- All known active ShopReel lifecycle tables are `shop_id`-scoped and foreign-keyed to `shops`.
- RLS policies in lifecycle foundation are owner + shop membership constrained.
- No clearly implemented standalone tenant key (e.g., `workspace_id` or `account_id`) in active lifecycle APIs.

### Canonical model state
- Today is **multiple parallel models**:
  1) operational story source lifecycle model
  2) manual asset model (typed, limited evidence of full workflow)
  3) publication/publish job/social connection model
- Not yet unified around a single canonical asset/content/learning graph.

### Metadata/tagging/reuse
- Lifecycle payload JSONB can hold rich source metadata, but no explicit reusable tagging/classification model is evident in active routes.
- Draft creation currently references opportunities rather than selected media-asset sets.

## B) Bulk upload readiness

### Current readiness
- No explicit bulk-upload API routes under `app/api/shopreel/manual-assets/**` or `media/**` found.
- No dedicated library UI path (`src/app/shopreel/library/**`) found in repo.
- Manual assets likely exist at schema/type level but bulk ingest UX/pipeline is not evident in active app routes.

### What likely breaks for standalone users
- Current owner context helper and most routes depend on shop membership (`shop_members.role = owner`).
- Non-shop users cannot reach the same flow without additional tenant abstraction.

### Storage bucket readiness
- Not enough direct in-repo route evidence to confirm bucket conventions for ShopReel media uploads.
- Must audit Supabase storage bucket policies and upload endpoints before implementing.

### Needed additions
- Batch upload session + per-file ingestion records
- Async analysis jobs (classification/tagging/use-case extraction)
- Asset library browse/search/filter endpoints
- Multi-select “create from selected assets” generation linkage table

## C) Progress/vlog readiness

### Current state
- No explicit progress stream/project/story grouping table surfaced in inspected code.
- No route-level pipeline for daily media grouping, weekly summary assembly, before/after sequences.

### MVP smallest viable path
- Introduce progress stream entity + daily upload grouping (date bucketing)
- Reuse asset library items with stream membership links
- Generate recap prompts from grouped assets and store as draft content units

## D) Analytics/performance model

### What exists
- Publication/publish jobs/social connection tables are typed.
- Marketing dashboard aggregates publication/job counts and statuses.

### Missing for learning loop
- No clear canonical performance snapshot table tying:
  - generated content metadata (hook/CTA/style/etc.)
  - platform post identifiers
  - periodic metric snapshots
  - manual metric entry provenance
- No explicit per-user/per-brand feature store or learned preference profile tables in current ShopReel paths.

## E) Learning engine readiness

### Current state
- Current flow appears lifecycle queue oriented, not adaptive optimization oriented.
- No explicit prompt adaptation mechanism based on past performance discovered in inspected ShopReel files.

### Canonical learning signal recommendation
- A single append-only `content_learning_signals` table (or similarly named) should unify:
  - generation events
  - publish/export actions
  - manual metric reports
  - connected-platform metric snapshots
  - recommendation outcomes

## F) Connected business support

### Current ProFixIQ support
- Strongest existing capability: ProFixIQ operational story events are sanitized/signed/delivered and persisted into ShopReel lifecycle.

### Convergence gap
- Manual uploads and integrated events are not yet visibly converged into one canonical asset model.
- Needed: common ingestion contract where source can be `manual_upload` or `connected_integration` but both map into same asset/content/learning tables.

---

## G) Recommended MVP UX / Product Flows

## 1) Bulk Upload -> Library -> Create from selected assets
1. User starts bulk upload session.
2. Files ingest to storage + `asset_items` rows with source metadata.
3. AI analysis job enriches tags/classification/use-cases.
4. Library screen supports filters (type/project/date/tag/source).
5. User multi-selects assets -> “Create from this”.
6. Generator creates `content_units` linked via `content_asset_links`.

## 2) Daily Progress Upload -> AI Recap/Vlog -> Review
1. User uploads daily media and assigns/auto-detects progress stream.
2. System groups by stream + day window.
3. AI creates daily recap reel + weekly vlog draft options.
4. User reviews/edits/schedules/exports.

## 3) Manual Post/Export -> Manual Performance Entry -> AI learns
1. User marks content as exported/posted.
2. If platform not connected, user enters summary metrics manually.
3. Metrics persist as signal snapshots with provenance `manual`.
4. Next generation prompts consult recent top-performing patterns.

## 4) Connected Platform -> Auto metrics pull -> AI learns
1. OAuth social connection established.
2. Scheduled sync pulls post-level metrics.
3. Metrics appended as `platform_snapshot` signals.
4. Recommender updates per-tenant heuristics.

## 5) Connected Business Integration -> Auto media ingestion -> AI opportunities
1. Connected app pushes media/events.
2. Ingestion maps payload into canonical assets/content opportunities.
3. Opportunity ranking combines operational freshness + learned performance priors.

---

## H) Canonical Data Model Recommendations

> Design principle: support both **shop/workspace tenants** and **standalone creators** without duplicating systems.

## 1) `content_tenants` (new or adapter)
- Purpose: canonical tenant boundary across shop-connected and standalone users.
- Key columns: `id`, `tenant_type` (`shop`,`workspace`,`individual`), `shop_id` nullable, `owner_user_id`, `created_at`.
- Standalone support: yes (`tenant_type=individual/workspace`).
- Shop support: yes (`tenant_type=shop`, link to `shop_id`).
- RLS notes: all content tables scoped by `tenant_id`; policies map memberships.
- Migration risk: medium (requires adapter layer from existing `shop_id` tables).

## 2) `content_assets`
- Purpose: canonical reusable media library entries.
- Columns: `id`, `tenant_id`, `origin_type` (`manual`,`integration`,`generated`), `storage_path`, `mime_type`, `duration_ms`, `width`, `height`, `captured_at`, `source_payload`, `created_by`.
- Supports both tenant modes.
- RLS: tenant membership check.
- Risk: low-medium if additive.

## 3) `content_asset_tags`
- Purpose: AI/user tagging/classification.
- Columns: `asset_id`, `tag_type` (`topic`,`style`,`scene`,`use_case`,`brand_object`), `tag_value`, `confidence`, `source` (`ai`,`user`).
- RLS inherited via asset join.
- Risk: low.

## 4) `progress_streams`
- Purpose: represent project/story/journey timelines.
- Columns: `id`, `tenant_id`, `title`, `stream_type`, `status`, `started_at`, `ended_at`, `metadata`.
- Standalone + shop compatible.
- Risk: low.

## 5) `progress_stream_assets`
- Purpose: many-to-many mapping assets to stream/day/milestone.
- Columns: `stream_id`, `asset_id`, `day_key`, `milestone_label`, `sequence_rank`.
- Risk: low.

## 6) `content_units`
- Purpose: canonical generated or authored content object.
- Columns: `id`, `tenant_id`, `content_type` (`reel`,`post`,`blog`,`vlog`,`story`,`campaign_item`), `status`, `hook`, `caption`, `cta`, `hashtags`, `script`, `duration_target`, `style_profile`, `created_from`.
- Risk: medium (ties multiple systems).

## 7) `content_asset_links`
- Purpose: connect selected assets to generated content.
- Columns: `content_unit_id`, `asset_id`, `role` (`primary`,`broll`,`before`,`after`,`supporting`).
- Risk: low.

## 8) `content_distributions`
- Purpose: publish/export/schedule events per content unit.
- Columns: `id`, `content_unit_id`, `channel_type` (`manual_export`,`platform_publish`,`scheduled_publish`), `platform`, `external_post_id`, `posted_at`, `scheduled_at`, `payload`.
- Risk: low-medium.

## 9) `content_metric_snapshots`
- Purpose: append-only metrics over time.
- Columns: `distribution_id`, `snapshot_at`, `views`, `likes`, `comments`, `shares`, `saves`, `click_throughs`, `watch_time_ms`, `retention_pct`, `conversions`, `source` (`manual`,`api`).
- Risk: low.

## 10) `content_learning_signals`
- Purpose: canonical learning event log.
- Columns: `id`, `tenant_id`, `signal_type` (`generation`,`distribution`,`metric_snapshot`,`feedback`,`recommendation_outcome`), `content_unit_id`, `distribution_id`, `features jsonb`, `outcomes jsonb`, `recorded_at`.
- Risk: medium (future model dependency).

## 11) `learning_profiles`
- Purpose: user/brand-specific learned preferences.
- Columns: `tenant_id`, `best_posting_windows`, `top_hook_patterns`, `top_cta_patterns`, `top_formats`, `confidence_scores`, `updated_at`.
- Risk: medium (needs careful transparency/explainability).

---

## I) Implementation Phases

## Phase 1: MVP Asset Library (highest priority)
- Build upload session + multi-file ingest API
- Persist canonical assets
- Run AI classification/tagging jobs
- Build library browse/filter/multi-select UI
- Add “Create from selected assets” flow producing content units + links

## Phase 2: Progress Streams
- Add stream model + day grouping
- Daily recap generation templates
- Weekly vlog/progress recap generation
- Before/after and milestone artifacts

## Phase 3: Manual Performance Learning
- Add content distribution tracking for export/manual posting
- Manual metric entry UX + API
- Signal ingestion + first-pass recommendations

## Phase 4: Connected Metrics
- Social OAuth connectors
- Periodic metrics sync jobs
- Snapshot persistence + reconciliation
- Platform-specific optimization hints

## Phase 5: Auto-post Learning Loop
- Scheduler/posting orchestration
- Closed-loop monitoring
- Recommendation-to-generation automation
- Guardrails and explainability controls

---

## File-Level Targets (next implementation wave)

### API / App
- `app/api/shopreel/library/upload-session/route.ts` (new)
- `app/api/shopreel/library/assets/route.ts` (new)
- `app/api/shopreel/library/assets/[id]/analyze/route.ts` (new)
- `app/api/shopreel/create/from-assets/route.ts` (new)
- `app/api/shopreel/progress-streams/route.ts` (new)
- `app/api/shopreel/progress-streams/[id]/recap/route.ts` (new)
- `app/api/shopreel/performance/manual/route.ts` (new)
- `app/api/shopreel/metrics/sync/route.ts` (new, phase 4)

### Feature modules
- `features/integrations/shopreel/server/*` (extend with canonical tenant adapters)
- `features/shopreel/library/*` (new)
- `features/shopreel/progress/*` (new)
- `features/shopreel/learning/*` (new)
- `features/shopreel/analytics/*` (new/extend)

### DB / migrations
- add additive migrations for canonical content tables listed above
- keep existing lifecycle tables intact
- bridge lifecycle tables into canonical content units over time via adapters, not rewrites

---

## Migration Targets & Risk

1. **Low-risk additive first**: new canonical tables, no destructive changes.
2. **Bridge layer second**: map `shopreel_story_sources/opportunities/drafts` to canonical content records.
3. **Backfill optional**: historical lifecycle rows can be backfilled incrementally.
4. **RLS caution**: preserve strict owner/shop behavior while introducing standalone tenant path.
5. **High-risk area**: tenant abstraction migration (`shop_id`-only to generalized tenant) if done abruptly.

---

## Final Recommendations

### Build first
1. Canonical asset library + bulk upload + AI tags/classification
2. Create-from-selected-assets generation linkage
3. Manual performance capture and learning signals (before full OAuth metrics)

### Avoid for now
- Full autonomous auto-posting before robust learning signal quality
- Premature cross-platform optimization complexity
- Hard dependency on ProFixIQ-only signals

### Must be schema-backed now
- canonical assets
- content units + asset links
- distribution records
- metric snapshots
- learning signals

### Can start as UI/API only (temporary)
- basic recommendation explanations
- simple rule-based hook/CTA suggestions using recent manual metrics

### Highest risk
- conflating shop-only tenancy with future standalone creator model
- insufficient provenance in metrics (manual vs platform API) causing misleading learning output

## Final Verdict

Proceed with a **canonical tenant-aware content graph** as the unifying substrate. Keep existing ShopReel lifecycle integration intact, and layer new library/progress/learning capabilities additively. This gives immediate value to both connected ProFixIQ shops and non-connected standalone businesses while protecting multi-tenant/RLS safety.
