# ShopReel Learning Content Engine Summary

## 1) Executive verdict
ShopReel has a solid **shop-scoped lifecycle foundation** (source -> opportunity -> draft), but it is not yet a full AI content engine. The next step is a **canonical asset/content/learning model** that unifies manual uploads and connected integrations.

## 2) What already exists
- ShopReel integration config/test endpoints
- Operational signal ingestion path
- Opportunity queue actions (accept/dismiss/generate)
- Draft creation/editing flow
- Lifecycle foundation SQL with owner-focused RLS
- Typed schema entries for manual assets, publications, publish jobs, social connections

## 3) Main architecture gaps
- No complete bulk upload + reusable media library workflow
- No explicit progress stream/project timeline model
- No canonical metrics snapshot + learning signal loop
- No clear standalone (non-shop) tenant path in active ShopReel APIs
- Parallel data models not yet converged

## 4) Recommended canonical model
Adopt canonical tables:
- `content_tenants`
- `content_assets`
- `content_asset_tags`
- `progress_streams`
- `progress_stream_assets`
- `content_units`
- `content_asset_links`
- `content_distributions`
- `content_metric_snapshots`
- `content_learning_signals`
- `learning_profiles`

Principle: **manual upload and connected integration data both map to the same canonical records**.

## 5) Phase 1 build list (MVP asset library)
- Multi-file upload sessions + ingestion API
- Canonical asset persistence + metadata
- AI classification/tagging/use-case extraction
- Library browse/filter/multi-select UI
- “Create from selected assets” generation flow

## 6) Phase 2 progress/vlog plan
- Add progress stream entity (project/story/journey)
- Group uploads by day + stream
- Generate daily recap reels and weekly vlog drafts
- Support before/after and milestone content outputs

## 7) Analytics learning engine plan
- Track generated content features (hook/caption/CTA/hashtags/style/format/time)
- Track distribution events (manual export vs connected publish)
- Persist metric snapshots (manual + API)
- Build per-tenant learning profiles from signal history
- Feed learned patterns into next generation prompts

## 8) Connected business integration plan
- Keep ProFixIQ operational ingestion in place
- Add canonical ingestion adapters so other businesses can upload manually and get equivalent learning value
- Ensure connected + manual sources use one learning pipeline

## 9) File-level targets
- New APIs under `app/api/shopreel/library/*`, `create/from-assets`, `progress-streams/*`, `performance/manual`, `metrics/sync`
- New feature modules under `features/shopreel/library`, `progress`, `learning`, `analytics`
- Extend `features/integrations/shopreel/server/*` with canonical adapter logic
- Add additive SQL migrations for canonical tables

## 10) Next recommended terminal patch batch
1. Add migration for `content_tenants`, `content_assets`, `content_asset_tags`, `content_units`, `content_asset_links`.
2. Scaffold upload session + asset list API routes.
3. Implement storage ingest service + AI tag job enqueue.
4. Build library UI shell (browse/filter/select).
5. Add create-from-assets endpoint and first generation prompt template.
6. Add manual distribution + manual metrics endpoints to bootstrap learning loop.
