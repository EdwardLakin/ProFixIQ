# ProFixIQ Parts System Audit (Audit-Only)
_Date: 2026-04-12_

## 1. Executive summary
The Parts system has broad route coverage and enough backend primitives to support a full operations lifecycle (requests, PO creation, receiving, stock movement, and allocation), but it is currently fragmented across parallel UIs, duplicate API routes, and inconsistent table assumptions. There are signs of active evolution (newer routes under `app/parts/*`) mixed with legacy/parallel artifacts (`features/dashboard/app/dashboard/parts/page.tsx`, `features/parts/app/parts/*`, and duplicate receiving endpoints), which creates low trust and unclear “source of truth” for users and maintainers.

The largest risks are: (1) data trust erosion from import/staging records leaking low-quality identities into live parts data, (2) duplicated receiving/request routes and status models that can drift, and (3) brown/copper-heavy visual treatments that make already-dense data feel muddy and less premium. The largest opportunities are to consolidate route ownership, tighten canonical data flow boundaries, and normalize the UI shell hierarchy while preserving the existing Supabase + shop-scoped architecture.

## 2. Route and page inventory

### A. Primary `app/parts/*` routes (active stack)

| Route | Main file(s) | Purpose | Strengths | Weaknesses | Priority |
|---|---|---|---|---|---|
| `/parts` | `app/parts/page.tsx` | Parts dashboard (KPIs, requests, moves) | Pulls core KPIs from `parts`, `stock_moves`, `part_requests`; includes quick links. | Heavy orange radial/alert treatment; broad client-side data fetch with no server composition; KPI logic shallow vs ops needs. | High |
| `/parts/requests` | `app/parts/requests/page.tsx` | Requests list grouped by work order | Good status bucketing, search, completeness checks. | Burnt-copper theme constants (`#8b5a2b`), large client file, mixed status semantics. | High |
| `/parts/requests/[id]` | `app/parts/requests/[id]/page.tsx`, `features/parts/components/ReceiveDrawer.tsx` | Request detail, line editing, PO attach/create, receive | Richest operational page in current stack; integrates suppliers, POs, locations, receive drawer. | Very large all-in-one client file; workflow complexity hidden in one component; copper/brown accents heavily embedded. | High |
| `/parts/receiving` | `app/parts/receiving/page.tsx` | Receiving inbox from request items | Clear “remaining qty” math and receive drawer flow. | Pulls only first 200 request items; potential queue truncation; visual style diverges from dashboard shell. | High |
| `/parts/receive` | `app/parts/receive/page.tsx`, `app/api/receive-scan/route.ts`, `features/parts/server/scanActions.ts` | Scan-to-receive (barcode) | Supports PO and manual receive modes; integrates scanner and fallback code resolution. | Scan resolution relies on optional columns and try/catch fallback; UX fragility when mapping missing; legacy comments indicate iterative patching. | High |
| `/parts/inventory` | `app/parts/inventory/page.tsx` | Inventory CRUD + adjustments/import helper | Deep feature surface (create/edit/import/adjust). | Monolithic page with modal stack + mixed responsibilities; many copper constants; admin-heavy table UX. | High |
| `/parts/po` | `app/parts/po/page.tsx` | PO list + create | Has supplier/parts lookup + line insertion path. | Heavy orange/copper gradients and radial background; unclear boundary vs `/parts/po/[id]`. | High |
| `/parts/po/[id]` | `app/parts/po/[id]/page.tsx` | Single PO management | Operationally useful totals/line editing. | Same copper-heavy theme and very dense state logic; route has duplicated patterns from list page. | High |
| `/parts/po/receive` | `app/parts/po/receive/page.tsx` | Receive center by PO | Focused receive list and action CTA. | Overlaps with `/parts/po/[id]/receive` and `/parts/receiving`; role of each receive page unclear. | Medium |
| `/parts/po/[id]/receive` | `app/parts/po/[id]/receive/page.tsx` | Receive specific PO lines | Granular PO receiving and remaining calculations. | Orange-heavy controls, duplicated receive concepts and UI with other receive routes. | High |
| `/parts/movements` | `app/parts/movements/page.tsx` | Stock movement feed/audit | Uses `stock_moves` as ledger-like view; links part/location context. | Visual hierarchy is mostly stacked cards; limited filtering/forensics depth. | Medium |
| `/parts/allocations` | `app/parts/allocations/page.tsx` | Work-order part allocations | Exposes consumed/allocated linkages. | Feels like internal table; weak action hierarchy and no corrective tools surfaced. | Medium |
| `/parts/quoting` | `app/parts/quoting/page.tsx` | Quoting queue for line/parts decisions | Connects to pending line workflows. | Copper/orange mixed palette; overlaps with request detail quoting states. | Medium |
| `/parts/pricing-refresh` | `app/parts/pricing-refresh/page.tsx` | Pricing batch export/import workflow | Includes staged supplier paste + review path. | UX isolated from core parts ops; copper tone and utility-first layout feels separate product. | Medium |
| `/parts/pricing-refresh/review/[batchId]` | `app/parts/pricing-refresh/review/[batchId]/page.tsx` | Batch row mapping review | Gives explicit review status transitions before apply. | Sparse context and weak guidance for bad matches; still visually/tooling isolated from inventory trust controls. | Medium |

### B. Additional/parallel Parts entry points

| Route | File | Notes |
|---|---|---|
| `/dashboard/parts` (feature route) | `features/dashboard/app/dashboard/parts/page.tsx` | Appears legacy/parallel, references `parts_requests` (plural) while main app uses `part_requests`.
| `/parts` (feature route namespace) | `features/parts/app/parts/page.tsx` and child pages | Secondary app-style pages (`new`, `locations`, `suppliers`, `[id]`) that overlap current `app/parts/*` ownership.
| Dashboard widget | `features/dashboard/widgets/WaitingPartsWidget.tsx` | Parts blocker visibility exists, but no full parts role panel implementation.
| Parts role panel | `features/dashboard/components/role-panels/PartsPanel.tsx` | Stubbed (`return null`), so parts role surface is incomplete.

## 3. Architecture map

### Major components
- Parts operational UIs: `app/parts/*` pages with shared drawers/components (`PartsDrawer`, `ReceiveDrawer`, `PartPicker`, `PartsStaffQueue`).
- Work-order handoff surfaces: `PartsRequestModal`, `LinePartsSummary`, `UsePartButton`, work-order page integrations.
- Dashboard/alerts surfaces: waiting-parts widget + dashboard counts from `part_requests`.

### Major server loaders / APIs / server actions
- Request creation: `/api/parts/requests/create` calling RPC `create_part_request_with_items`.
- Receiving routes (duplicated):
  - `/api/parts/requests/items/[itemId]/receive`
  - `/api/parts/items/[itemId]/receive`
  - `/api/parts/receiving/receive-item`
  All call `receive_part_request_item`.
- Scan receive: `/api/receive-scan` using `receive_po_part_and_allocate` (PO mode) or `apply_stock_move` (manual mode).
- Consumption/allocation: `/api/parts/consume` -> `consumePart()` -> `apply_stock_move` + `work_order_part_allocations` insert.
- PO server actions: `features/parts/server/poActions.ts` (create PO, add line, receive PO via `apply_stock_move`).

### Major tables involved
- Core catalog/inventory: `parts`, `part_stock`, `stock_moves`, `stock_locations`, `parts_barcodes`.
- Request lifecycle: `part_requests`, `part_request_items`.
- Purchasing lifecycle: `purchase_orders`, `purchase_order_lines`, `suppliers`, optional `part_suppliers`.
- Work-order linkage: `work_order_part_allocations`, `work_order_lines`, `work_orders`.
- Import/onboarding: `shop_boost_intakes`, `shop_import_files`, `shop_import_rows`, `shop_parts_import_staging`, `shop_parts_import_match_candidates`, `shop_parts_source_aliases`.

### Source-of-truth posture
- Canonical stock ledger: `stock_moves` (writes via `apply_stock_move`).
- Operational on-hand snapshot: `part_stock` (read by consumption logic for best-bin; implied derived state).
- Request truth: `part_request_items` quantities/status.
- Allocation truth: `work_order_part_allocations` for consumed/charged usage.
- Import staging truth: `shop_parts_import_staging` + match candidates; promoted aliases in `shop_parts_source_aliases`.

### End-to-end data flow (actual)
1. Import/onboarding writes raw rows (`shop_import_rows`) and staged normalized parts rows (`shop_parts_import_staging`).
2. Exact part-number matches may auto-promote metadata/aliases; ambiguous rows remain staged for review.
3. Live catalog rows in `parts` are used by request detail, inventory, PO, and scan flows.
4. Work-order job creates part request via RPC (`create_part_request_with_items`) -> `part_requests` + `part_request_items`.
5. Parts team quotes/approves/assigns PO context from request detail pages.
6. PO lines receive via PO-specific pages or scan/manual receive API (`receive_part_request_item`, `receive_po_part_and_allocate`, or direct `apply_stock_move`).
7. Stock movement ledger updates (`stock_moves`) and request item `qty_received` progresses.
8. Job consumption uses `consumePart()` -> negative stock move + `work_order_part_allocations` row.

## 4. Import/onboarding audit

### How imported parts enter
- Shop Boost intake collects CSV uploads and runs full import; parts file is processed by `runPartsImportPipeline`.
- Raw CSV rows land in `shop_import_rows`; normalized candidate rows land in `shop_parts_import_staging` with confidence, status, and matching metadata.

### Where staged pipeline is working
- Normalization/matching logic is explicit and conservative for auto-promote (exact part number + parse clean + matched ID).
- Candidate table (`shop_parts_import_match_candidates`) exists for non-auto-promoted rows.
- Alias table (`shop_parts_source_aliases`) supports traceability of legacy identifiers.

### Where it still fails / likely causes low trust
- Ambiguous and pending rows are common by design and require review flow that is not tightly integrated into main inventory UX.
- Parts import currently updates matched existing parts metadata but does not clearly expose a first-class review queue in `/parts/inventory`.
- If imported rows with weak identity are created/merged inconsistently elsewhere, users can see near-duplicate names/SKUs without clear lineage in live tables.

### Architectural safety for automation
- Current architecture is close to safe automation (staging + candidates + aliases), but lacks a unified operator review cockpit tied directly to inventory and request flows.
- Automation is partially present; trust UX is the missing layer.

## 5. Workflow audit

### Requests
- **User goal:** capture needed parts from work-order jobs, quote/approve, and track fulfillment.
- **Current behavior:** modal creates request via RPC; `/parts/requests` groups by WO; detail page handles quoting/PO/receive transitions.
- **Weaknesses:** status taxonomy spread across pages + item/request levels; very large single-page logic; duplicate receive endpoints create maintenance risk.
- **Fix later:** central status state machine contract + split detail page into composable modules.

### Receiving Inbox
- **User goal:** quickly process inbound parts against requested items.
- **Current behavior:** `/parts/receiving` shows remaining qty and opens shared receive drawer.
- **Weaknesses:** capped data pull (`limit(200)`), potential missed queue items, competing receiving pages.
- **Fix later:** queue paging + canonical receive surface decision (inbox vs PO-receive split with clear intent).

### Scan to Receive
- **User goal:** scan and book stock with minimal friction.
- **Current behavior:** `/parts/receive` with Quagga scanner, resolves barcode -> part, then receive API.
- **Weaknesses:** code resolution depends on mapping quality and optional schema (`upc` fallback try/catch); poor failure recovery workflow.
- **Fix later:** explicit unresolved-scan queue + one-click map flow.

### Inventory
- **User goal:** trust catalog, edit part records, and adjust stock.
- **Current behavior:** monolithic client page handles CRUD/import/adjustment.
- **Weaknesses:** overloaded admin CRUD feel; no strongly visible quality flags for suspect imported records.
- **Fix later:** split into catalog quality + stock operations sub-surfaces while retaining current route.

### Purchase Orders
- **User goal:** build/send/track POs and receiving status.
- **Current behavior:** list + detail pages with supplier/line management.
- **Weaknesses:** duplicated logic between `/parts/po` and `/parts/po/[id]`; receive flows distributed across three pages.
- **Fix later:** tighten PO lifecycle boundaries and define single receive entrypoint per PO.

### Receive from PO
- **User goal:** receive full/partial PO lines accurately.
- **Current behavior:** PO-specific receive pages plus generic receive API/RPC.
- **Weaknesses:** UX overlap and ambiguity in where to execute receive actions.
- **Fix later:** consolidated receive action model + shared receive line component.

### Allocations
- **User goal:** verify parts consumed/linked to jobs for billing and audit.
- **Current behavior:** allocation list from `work_order_part_allocations`.
- **Weaknesses:** limited correction workflows; surface feels read-only and internal.
- **Fix later:** add reconciliation actions and drill-down to source move/request.

### Stock Movements
- **User goal:** trust inventory changes over time.
- **Current behavior:** movement feed with part/location lookup.
- **Weaknesses:** limited anomaly highlighting, weak filtering by reference type/path.
- **Fix later:** movement reason integrity checks + anomaly badges.

### Vendor Integrations
- **User goal:** connect suppliers and automate quote/PO ingest.
- **Current behavior:** supplier tables/forms exist; pricing refresh batch flow exists for menu repair pricing.
- **Weaknesses:** no coherent “vendor integration” operational hub in parts; feels fragmented.
- **Fix later:** vendor console with mapping health, last sync, unmatched rows.

## 6. Visual/UI audit

### Brown / muddy / copper findings (explicit)
1. `app/parts/requests/page.tsx` defines global copper tokens (`#8b5a2b`, `#c88a4d`) used across controls and pills.
2. `app/parts/requests/[id]/page.tsx` repeats burnt-copper theme constants and copper-focused controls.
3. `app/parts/inventory/page.tsx` embeds copper focus/border constants in modal/forms.
4. `app/parts/quoting/page.tsx` hardcodes same copper tokens.
5. `app/parts/pricing-refresh/page.tsx` and review page use copper CTA styling (`border-[#8b5a2b]`, `text-[#c88a4d]`).
6. `app/parts/po/[id]/page.tsx` uses copper status/chips/buttons and copper text highlights for key totals.
7. `features/parts/components/ReceiveDrawer.tsx` and `features/parts/components/PartsDrawer.tsx` include copper buttons and warm radial overlays.
8. `app/parts/page.tsx` and `app/parts/po/page.tsx` apply orange radial page backdrops and warm alert sections that push the muddy/brown-red direction.

### Consistency/hierarchy problems
- Parts pages mix multiple visual dialects: black glass shell, orange utility, copper metallic, and legacy gray admin cards.
- Some pages feel first-class (request detail, PO detail) while adjacent ones feel utility/placeholder (allocations, legacy dashboard parts page).
- Header/actions/table hierarchies are inconsistent across requests/receiving/PO pages, making cross-flow cognition harder.

### Pages that feel unfinished or stacked
- `PartsPanel` is a stub (`return null`) so parts role has no curated dashboard panel.
- `features/dashboard/app/dashboard/parts/page.tsx` appears legacy, style-inconsistent, and schema-inconsistent.
- Allocations and movements pages behave like raw operational dumps rather than guided operations surfaces.

## 7. Data integrity / trust audit

### Duplicates and identifier risk
- Import pipeline flags `missing_part_number_and_sku`; rows without strong identity are expected and can stay ambiguous.
- Matching uses part number > SKU > name heuristic; name-only matching creates ambiguous candidate paths with lower confidence.
- If ambiguous rows are not rigorously resolved before surfacing in inventory, duplicate-looking parts are likely.

### Missing identifiers / suspicious rows
- Any rows lacking stable part number + SKU can still enter user-visible contexts indirectly if downstream flows rely on `name`/description.
- Scan-to-receive fallback paths (SKU/optional UPC) can fail silently into manual mapping burden, reducing trust under messy imports.

### User-visible trust degradation points
- Receiving and request workflows rely heavily on clean `part_id` linkage; weak imported records can degrade quote/receive confidence.
- Inventory UI currently lacks prominent data-quality state indicators tied to import provenance (`source_intake_id`, alias coverage, match confidence).

## 8. Fix plan (implementation plan, no code in this pass)

### Phase 1: critical trust / broken UX (highest urgency)
1. Canonicalize receiving API surface (deprecate duplicate endpoints, keep one route contract).
2. Add visible data-quality flags to inventory rows (missing identifiers, ambiguous import lineage).
3. Add unresolved scan queue + direct mapping flow from scan errors.
4. Remove brown-heavy page-level backdrops/overlays from core parts routes first (`/parts`, `/parts/po`, request surfaces).

### Phase 2: structural workflow improvements
1. Split `requests/[id]` into modules (header/state, items table, PO assignment, receive drawer orchestration).
2. Define clear receive IA: inbox receive vs PO receive, with explicit role-based entry points.
3. Unify status model docs/constants for request/item/PO receive progression.
4. Add queue pagination and stale-state handling for receiving/inventory tables.

### Phase 3: visual system unification
1. Replace copper/brown hardcodes with brand/theme tokens aligned to premium dark industrial shell.
2. Standardize page shells: hero, KPI strip, filter/action rail, content card hierarchy.
3. Remove warm muddy gradients from tables, drawers, and CTA backgrounds.
4. Align empty/loading/error states across all parts surfaces.

### Phase 4: staged import review + automation hardening
1. Build first-class “Parts Import Review” queue inside `/parts/inventory` (not isolated utility page).
2. Require explicit promotion/resolution for ambiguous rows with merge/create guidance.
3. Add duplicate candidate detection on create/edit using alias + normalized keys.
4. Instrument post-import quality metrics (resolved %, duplicate rate, missing identity count).

## 9. Exact files and tables to target first

### Files (first wave)
1. `app/api/parts/requests/items/[itemId]/receive/route.ts`
2. `app/api/parts/items/[itemId]/receive/route.ts`
3. `app/api/parts/receiving/receive-item/route.ts`
4. `app/parts/requests/[id]/page.tsx`
5. `app/parts/receiving/page.tsx`
6. `app/parts/inventory/page.tsx`
7. `app/parts/po/page.tsx`
8. `app/parts/po/[id]/page.tsx`
9. `features/parts/components/ReceiveDrawer.tsx`
10. `features/integrations/imports/runPartsImportPipeline.ts`
11. `features/dashboard/components/role-panels/PartsPanel.tsx`
12. `features/dashboard/app/dashboard/parts/page.tsx` (legacy/parallel decision)

### Tables / RPCs (first wave)
- `parts`
- `part_requests`
- `part_request_items`
- `purchase_orders`
- `purchase_order_lines`
- `stock_moves`
- `part_stock`
- `work_order_part_allocations`
- `shop_parts_import_staging`
- `shop_parts_import_match_candidates`
- `shop_parts_source_aliases`
- RPCs: `create_part_request_with_items`, `receive_part_request_item`, `apply_stock_move`, `receive_po_part_and_allocate`

## 10. Validation
Commands run during audit:
1. `find . -maxdepth 3 -name 'AGENTS.md' -o -name 'CODEX.md'`
2. `find app components lib supabase -type f | ... | rg ...`
3. `find features -type f | ... | rg ...`
4. Multiple `nl -ba <file> | sed -n ...` inspections for Parts, API, dashboard, work-order, and import files.
5. `rg -n ...` queries for table/RPC usage and visual tokens.

Type/lint status for this audit pass:
- No code-path behavior changes were implemented in this pass.
- `npx tsc --noEmit` was executed after writing this audit document and completed successfully (no TypeScript errors reported).
