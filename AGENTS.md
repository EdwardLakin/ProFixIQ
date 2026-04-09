# CODEX.md

## Project
ProFixIQ is an AI-native shop operating system for automotive, heavy-duty, and fleet repair shops.

Core areas:
- work orders
- inspections
- technician workflows
- customer approvals
- fleet workflows
- parts / quotes / invoices
- portals
- branding
- dashboard widgets
- AI-assisted service operations

Tech stack:
- Next.js App Router
- TypeScript
- Supabase (Postgres, Auth, Storage, RLS)
- Vercel
- Stripe
- SendGrid

This is a multi-tenant app.
`shop_id` is a core boundary and must be preserved.

---

## Primary Operating Rules

1. Do not make broad architectural rewrites unless explicitly asked.
2. Prefer incremental, non-breaking changes.
3. Preserve existing business flows unless the task explicitly changes them.
4. Do not remove multi-tenant protections.
5. Do not weaken or bypass RLS patterns.
6. Do not casually change auth, billing, portals, or approval flows.
7. Do not rename large groups of files unless explicitly requested.
8. Prefer existing feature-based organization over introducing a new structure.
9. Keep patches focused on the requested scope.
10. When touching database behavior, assume existing live data may be imperfect.

---

## Database Rules

1. Prefer SQL migrations that are:
   - additive
   - reversible where practical
   - safe for existing production-like data

2. Before adding:
   - `NOT NULL`
   - foreign keys
   - check constraints
   - unique constraints

   always:
   - inspect for violating existing rows
   - provide backfill SQL first if needed
   - avoid breaking current flows

3. Do not redesign the schema unless explicitly asked.
4. Preserve current tenant shape and `shop_id` propagation.
5. For RLS-sensitive tables, be conservative.
6. If a migration is risky, explain the risk clearly before applying it.

When doing DB work, output in this order:
1. explanation of issue
2. exact SQL migration
3. any required backfill SQL
4. affected app files
5. validation steps

---

## Frontend / UI Rules

1. Preserve the ProFixIQ premium dark industrial/glass direction.
2. Respect the branding system and active brand variables.
3. Do not hardcode colors if brand/theme variables already exist.
4. Prefer reusable shells, cards, and shared UI primitives over one-off styling.
5. Keep desktop, tablet, and mobile usability in mind.
6. For dashboard work, prefer widget-based architecture over hardcoded layouts.
7. New UI should feel cohesive with the rest of ProFixIQ, not like a separate product.
8. Avoid introducing visually inconsistent components.

When changing UI:
- keep existing behavior unless requested otherwise
- remove dead imports/components if they become unused
- prefer simple, maintainable implementations

---

## Dashboard-Specific Rules

The dashboard is moving toward a customizable widget system.

When working on dashboard features:
1. Treat widgets as first-class modules.
2. Support default layouts plus user customization.
3. Prefer move/resize/persist architecture over hardcoded card placement.
4. Ensure branding/theme support applies to widgets.
5. Keep mobile usable even if desktop becomes more advanced.
6. Do not bake business logic directly into layout containers.
7. Prefer a widget registry pattern if adding multiple widgets.

If persistence is needed:
- prefer a non-breaking schema addition
- keep user/shop scoping explicit
- do not assume a single device size

---

## Work Order / Inspection Rules

These flows are critical.

Preserve the intended ProFixIQ flow:
- advisor creates work order
- technician inspects / builds recommendations
- parts and labor are attached correctly
- advisor reviews
- customer or fleet approves
- downstream parts / invoice / portal state stays consistent

When editing work order or inspection code:
1. Do not break line creation paths.
2. Keep inserts consistent across all entry points.
3. Respect status normalization and existing enums.
4. Be careful with completion flows, approvals, and evidence/media handling.
5. Remove duplicated logic only when safe and well-scoped.

---

## Branding Rules

Branding is a first-class system.

1. Respect active brand assets and brand profile settings.
2. New surfaces should read from branding/theme variables where possible.
3. Do not introduce parallel branding logic unless explicitly requested.
4. If working on PDFs, invoices, inspections, or dashboard rendering, check whether branding should apply.
5. Prefer one source of truth for logo/brand colors.

---

## Code Quality Rules

After making changes, always run relevant validation.

Minimum validation:
- `npx tsc --noEmit`

When applicable also run:
- repo lint command
- targeted tests for touched areas

If validation fails:
- fix the failure if it is within scope
- otherwise clearly report:
  - what failed
  - where it failed
  - whether it was pre-existing or introduced

Do not claim success if validation was not run.

---

## Output Format for Tasks

Unless told otherwise, respond with:

1. Summary of what was changed
2. Exact files changed
3. Full SQL migration first, when DB changes are involved
4. Patch or full file replacements
5. Validation commands run
6. Result of validation
7. Risks / follow-up items

For code patches:
- prefer complete, usable code
- avoid pseudo-code
- avoid vague guidance

---

## What to Avoid

Do not:
- break auth persistence
- weaken tenant isolation
- remove `shop_id` logic
- casually alter Stripe flows
- casually alter portal approval logic
- silently change schema assumptions
- introduce duplicate systems when one already exists
- over-engineer abstractions for simple tasks
- rewrite unrelated files “while here”

---

## Task Prioritization Heuristic

When multiple approaches are possible, prefer this order:

1. safest non-breaking fix
2. consistency with existing ProFixIQ architecture
3. maintainability
4. UX quality
5. deeper refactor only if clearly justified

---

## Preferred Working Style

For ProFixIQ, prefer:
- exact fixes over theory
- one-shot patches where practical
- concrete file edits
- SQL first for schema work
- minimal blast radius
- honest reporting of uncertainty or risk

If something is unclear, infer from the existing codebase patterns instead of inventing a parallel system.

---

## Good Example Tasks

- Fix TypeScript errors in dashboard widgets without changing behavior
- Audit all `work_order_lines` insert paths and normalize them safely
- Add a non-breaking migration for widget layout persistence
- Remove obsolete inspection UI panels and dead imports
- Apply branding variables to invoice or dashboard rendering
- Refactor hardcoded dashboard cards into a widget registry

## Bad Example Tasks

- Redesign the whole app
- Make the database perfect
- Rewrite the architecture
- Replace all styling systems
- Remove old code without checking dependencies

---

## Model / Execution Guidance

Use the strongest coding/reasoning mode available for:
- architecture-sensitive refactors
- multi-file feature work
- database + app coordination
- debugging complex regressions

Use faster/lighter modes for:
- repetitive cleanup
- dead import removal
- simple typing fixes
- low-risk formatting or consistency tasks