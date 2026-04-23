# Shop Boost End-to-End Acceptance Audit (2026-04-23)

## Scope audited
- Intake creation/upload route
- Process trigger route
- Internal worker route
- Orchestrator execute/verify/activate flow
- Latest/report readiness payloads
- Onboarding route-forward behavior
- Shop Health panel data reads
- Customer detail hydration path
- Staff/menu/inspection suggestion reads

## Executive verdict
Shop Boost is **not yet day-one reliable** in current runtime codepaths.

Top blockers:
1. Cron worker success contract mismatch prevents trustworthy autonomous completion reporting.
2. Onboarding forward-routing poll window is short and can still send users to review until manual refresh.
3. Suggestion and customer-history read paths can surface stale/unscoped data that does not reflect canonical truth for the current intake.

## High-confidence blockers

### 1) Cron executor marks successful internal runs as failed
- Type: orchestration/reporting
- Severity: high
- Root cause: cron expects `{ ok: true, snapshot }` from internal worker endpoint, but internal endpoint returns run/job counters and no `snapshot` field.
- User-visible impact: background execution appears failed even when jobs were processed; reliability/observability is degraded and retry behavior can be misleading.
- Write vs read: read/reporting seam (success evaluation), not canonical write path.

### 2) Onboarding route-forward can still require manual refresh
- Type: routing
- Severity: high
- Root cause: onboarding page polls `/api/shop-boost/intakes/latest` for only 8 attempts (~9.6s) then hard-falls back to review route if readiness is not yet forwardable.
- User-visible impact: users can land in review despite eventual verify/activation success; route only updates after manual refresh/navigation.
- Write vs read: routing/polling read seam.

### 3) Suggestion surfaces are not intake-grounded
- Type: read/reporting
- Severity: high
- Root cause: menu/inspection suggestion pages and Shop Health panel query suggestion sets by `shop_id` + recency, not by the active intake as a hard filter.
- User-visible impact: staff/menu/inspection suggestions can reflect old imports, causing “not matching expected inputs” even when latest intake differs.
- Write vs read: read/query seam.

### 4) Shop Health canonical status can look optimistic while unknown
- Type: truth/reporting
- Severity: medium-high
- Root cause: panel sets `canonicalStatus: "unknown"` but renders non-partial states in green; unknown is visually treated as healthy.
- User-visible impact: UI optimism even when canonical truth is unresolved.
- Write vs read: read/presentation seam.

### 5) Customer detail fallback history query is not shop-scoped
- Type: read
- Severity: medium-high
- Root cause: fallback `work_orders` lookup by `ilike(customer_name, candidate)` does not constrain by `shop_id`.
- User-visible impact: wrong/empty customer history linkage in multi-tenant contexts; possible cross-tenant false matches under permissive policies.
- Write vs read: read/query seam.

### 6) History import intentionally allows partial linkage rows
- Type: write
- Severity: medium
- Root cause: importer creates work orders with `customer_id` but without `vehicle_id` when no vehicle match exists, while marking review required.
- User-visible impact: “no customer→vehicle linkage” and incomplete customer vehicle/work-order history until cleanup.
- Write vs read: write-path seam (materialization policy).

## Acceptance matrix
- Customer rows created: **Partial** (depends on parsable identifiers and conflicts; unmatched rows go to review).
- Vehicles linked to customers: **Partial** (some remain null and are post-linked best-effort).
- Work order history linked to customers: **Partial** (missing-customer rows are skipped).
- Invoices linked: **Partial** (depends on resolvable work order/customer keys).
- Staff suggestions visible: **Partial** (reads can miss/blur latest intake context).
- Menu suggestions grounded correctly: **Partial** (shop-wide recency query can include stale suggestions).
- Inspection suggestions grounded correctly: **Partial** (same as menu suggestions).
- Onboarding routes without manual refresh: **Partial** (short polling window; fallback to review).
- Dashboard only when canonical readiness passes: **No** (no hard route guard preventing dashboard access).
- Shop Health truth matches canonical state: **Partial** (readiness shown, but unknown canonical status can appear green).

## Minimal next patch plan
1. Align cron success contract with `/api/internal/shop-boost/run` response (`ok` + run/job counters), stop requiring `snapshot`.
2. Extend onboarding forward logic to continue polling from review screen or add lightweight SSE/poll loop that auto-forward when `ui_should_route_forward` flips true.
3. Intake-scope suggestion reads by default (active intake first, explicit “show all history” toggle second).
4. Render canonical `unknown` as neutral/warning, never green.
5. Add `shop_id` filter to fallback customer history `ilike(customer_name, ...)` query.
6. Optional small UX badge in customer detail for “history rows pending vehicle linkage” (no schema changes).

## Validation run
- `npx tsc --noEmit` passed.
- Targeted code-path grep audits completed for readiness, verify/activation, latest/report payloads, customer hydration, staff suggestions, and optimistic UI logic.
