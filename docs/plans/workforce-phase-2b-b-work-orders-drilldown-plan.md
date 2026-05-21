# Workforce Phase 2B-B Plan: Work Order Drilldown Filter Support

## Scope
- Plan-only audit for supporting Workforce Overview drilldown links to:
  - `/dashboard/work-orders?assignment=unassigned&status=active`
- No implementation in this phase.

## Audit Findings

### 1) Current owner of work order list rendering
- `/work-orders/view` is the current list/board page users interact with for browsing/managing work orders.
- Route chain:
  - `app/work-orders/view/page.tsx` re-exports the feature page.
  - `features/work-orders/app/work-orders/view/page.tsx` contains the main client-side list implementation.
- `app/work-orders/page.tsx` is a role-tile launcher page, not the list renderer.

### 2) Existing filters and visibility currently supported
- **Status filter**: supported via a `status` `<select>`.
  - Default (`status === ""`) loads active-like statuses from `ACTIVE_FLOW_STATUSES`.
  - Seeded shops use `SEEDED_DEFAULT_STATUSES` (adds `completed`) when status is blank.
- **Search filter (`q`)**: supported via client-side text input against loaded rows (work order id/custom_id/customer/plate/YMM).
- **Assigned tech filter**:
  - No list-level assigned-tech filter exists today.
  - Assignment actions exist (assign all), but not filtering by assigned/unassigned.
- **Active/completed behavior**:
  - Active-like behavior exists only as implicit default status set when no explicit status selected.
  - Completed/invoiced are available as explicit status picks.
- **Role-based visibility**:
  - Route visibility is role-gated in route metadata (`/work-orders/view`).
  - Data access uses Supabase client queries and existing policies; no custom bypass path in this page.

### 3) URL query param support today
- The list page does **not** currently parse URL query params for filters.
- Current filter state is purely local React state.

### 4) Safest minimal query contract for Workforce drilldown
- Recommended contract:
  - `assignment=unassigned`
  - `status=active`
  - optional: `source=workforce`
- Safety constraints:
  - Ignore unknown values.
  - Apply only when values match exact allowed tokens.
  - Keep non-Workforce entry behavior unchanged when params are absent.

### 5) Definition of “active”
- Reuse the same excluded status set already used in Workforce Overview:
  - `completed`, `cancelled`, `closed`, `invoiced`, `declined`.
- Practical implication:
  - “active” should include work order lines whose normalized status is **not** in the excluded set.
  - For work-order list UX, this likely requires line-aware filtering logic (not only work-order header status).

### 6) Definition of “unassigned”
- Must be line-level and tenant-scoped:
  - `work_order_lines.assigned_tech_id IS NULL`
  - **and** no rows in `work_order_line_technicians` for that line.
  - scope all queries by `shop_id` and existing access model.
- This mirrors Workforce Overview logic that combines direct line assignment and join-table technician assignments.

### 7) Can this be done client-side only?
- Not safely at scale with current loading behavior.
- Current page loads max 100 work orders, then applies client-side search, then loads lines only for filtered IDs.
- Pure client filtering risks:
  - false negatives/positives due to pagination cap.
  - mismatch with Workforce metric counts (which scan active lines shop-wide).

### 8) Should this use server/API filtering?
- Recommended: yes, for the Workforce drilldown mode.
- Minimal-risk options:
  1. Add a dedicated API endpoint (or extend existing fetch path) that returns work-order IDs matching unassigned active line criteria.
  2. Then constrain the list query using those IDs.
- This avoids loading broad datasets client-side and keeps logic consistent with overview semantics.

### 9) Permissions
- Preserve existing role and data visibility:
  - Do not bypass current route role checks.
  - Do not use elevated access in client path.
  - Keep shop/tenant scoping intact (`shop_id` boundary).
- Workforce Overview itself already limits access to owner/admin/manager for that API; list page should still respect its own route/data permissions once navigated.

## Recommended Implementation Plan (single PR)

1. **Workforce href update**
   - Update `unassigned_jobs` href in `app/api/workforce/overview/route.ts` from `/dashboard/work-orders` to:
     - `/dashboard/work-orders?assignment=unassigned&status=active&source=workforce`
   - Keep fallback behavior for non-supporting pages during rollout if needed.

2. **Work-orders query param parser**
   - In `features/work-orders/app/work-orders/view/page.tsx`, parse `useSearchParams()` once on mount and on URL changes.
   - Recognize only:
     - `assignment=unassigned`
     - `status=active`
     - optional `source=workforce`
   - Invalid/unknown values no-op.

3. **Initial filter state application**
   - If params present and valid, set initial list state for “Workforce drilldown mode.”
   - Avoid overriding manual user filter changes after initial hydration unless URL changes intentionally.

4. **Server-backed unassigned-active filter**
   - Implement a targeted fetch path for matching work orders by line criteria:
     - active line status (excluded set)
     - no `assigned_tech_id`
     - no line-tech assignment rows
     - tenant scoped
   - Feed resulting work-order IDs into existing UI render pipeline.

5. **Active filter banner + clear action**
   - Show contextual banner when drilldown filter is active:
     - “Showing unassigned active jobs from Workforce.”
   - Provide a clear/reset control that removes query params and restores normal default list behavior.

6. **Safe empty state**
   - If no matches, show explicit empty-state copy indicating no unassigned active jobs currently.
   - Keep existing generic empty-state for non-drilldown filtering.

## Regression Test Plan

1. Normal `/dashboard/work-orders` or `/work-orders/view` without params behaves exactly as today.
2. `/dashboard/work-orders?assignment=unassigned&status=active` applies drilldown filter on first render.
3. Lines with technician assignment rows are excluded from “unassigned”.
4. Lines with statuses in excluded set (`completed/cancelled/closed/invoiced/declined`) are excluded.
5. Shop/tenant scoping remains intact.
6. Role/permission behavior remains unchanged for manager/advisor/tech paths.

## Likely Files Touched in Implementation
- `app/api/workforce/overview/route.ts` (href update)
- `features/work-orders/app/work-orders/view/page.tsx` (query parsing, initial state, banner/reset, filter integration)
- Potential new helper/API file for server-side filtered ID retrieval (path to choose based on existing API patterns)
- Optional route alias handling for `/dashboard/work-orders` if needed (only if routing layer currently requires explicit mapping)

## Blockers / Gaps
- Confirm how `/dashboard/work-orders` resolves to `/work-orders/view` in current routing shell; if implicit aliasing is external, parser must run in the resolved page regardless.
- Confirm whether work-order header status alone is acceptable for active filtering, or whether strict line-level active semantics are required (recommended: line-level for parity with Workforce Overview).
- Confirm upper bounds/perf expectations for large shops to finalize whether filtered IDs should be paginated or capped.

## PR Slicing Recommendation
- Recommended as **one PR**:
  - Scope is cohesive (drilldown contract + filter handling + UI indicator + clear action).
  - Risk can be contained with strict parameter whitelist and no broad architecture changes.
