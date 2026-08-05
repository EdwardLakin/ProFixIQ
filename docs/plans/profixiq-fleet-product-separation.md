# ProFixIQ Fleet product separation

## Decision

ProFixIQ Shop and ProFixIQ Fleet remain in `EdwardLakin/ProFixIQ`.

They are separate products with separate application shells, navigation, actors,
settings, billing ownership and domain entry points. They continue to share the
canonical Supabase data platform, repair records, approval pipeline, API security
helpers and design primitives.

Do not create a second GitHub repository. That would duplicate schema types,
migrations, authorization code and the Shop/Fleet exchange contract.

## Deployment boundary

The separation keeps the existing Next.js project and promotes the fleet-scoped
`/portal/fleet` surface into the ProFixIQ Fleet application shell.
`fleet.profixiq.com` is the public entry point; host-aware middleware rewrites
clean Fleet URLs to the existing authorized implementation without duplicating
pages, APIs or business logic.

Do not create a second Vercel project from the current repository root yet. The
root `vercel.json` owns production cron jobs; connecting the same root to another
project would provision those schedules twice. A second Vercel project is safe
only after the repository has dedicated app roots, for example:

```text
apps/shop
apps/fleet
packages/auth
packages/data
packages/ui
```

That physical extraction is optional. Product separation does not require
duplicating the deployable application before the shared contracts have clean
package boundaries.

## Product ownership

### ProFixIQ Shop

- Repairs, work orders, technicians, labor, parts and invoicing
- Shop-side relationship to a fleet customer
- Fleet access invitation entry point
- Estimate, authorization and repair-status exchange with Fleet

### ProFixIQ Fleet

- Fleet organization and fleet memberships
- Assets, drivers and assignments
- Pre-trips and reported defects
- Preventive-maintenance policies, programs and due events
- Maintenance calendar and downtime planning
- Service requests, estimates and authorization decisions
- Maintenance history, invoices and asset costs
- Fleet reporting, users, roles and settings

## Route transition

`/portal/fleet` remains the internal canonical route prefix while the product is
separated inside the current Next.js application. It is not exposed as the Fleet
product's public information architecture.

The intended public mappings on `fleet.profixiq.com` are:

| Public route | Current internal route |
| --- | --- |
| `/` | `/portal/fleet` |
| `/assets` | `/portal/fleet/units` |
| `/drivers` | `/portal/fleet/drivers` |
| `/pre-trips` | `/portal/fleet/pretrip-history` |
| `/pre-trips/start/:unitId` | `/portal/fleet/pretrip/:unitId` |
| `/maintenance` | `/portal/fleet/maintenance` |
| `/calendar` | `/portal/fleet/calendar` |
| `/requests` | `/portal/fleet/service-requests` |
| `/requests/new` | `/portal/fleet/request/build` |
| `/dispatch` | `/portal/fleet/board` |
| `/history` | `/portal/fleet/billing` |
| `/reports` | `/portal/fleet/reports` |
| `/settings` | `/portal/fleet/settings` |
| `/sign-in` | `/portal/auth/fleet-sign-in` |

Host routing preserves query strings, nested asset/pre-trip routes and password
recovery. Fleet invitation creation and activation remain on the primary
ProFixIQ domain. The Fleet host rejects Shop page routes and continues through
the canonical fleet membership authorization before rendering data.

## Current checkpoint

- Fleet has a dedicated ProFixIQ Fleet shell.
- Fleet navigation is organized around operating, maintaining and understanding
  a fleet rather than around shop work orders.
- Manager and driver navigation are distinct.
- Light and dark mode use the canonical ProFixIQ theme contract.
- Shop navigation no longer exposes Fleet operations.
- Shop retains one `Fleet Access Invites` entry point.
- Existing fleet-scoped APIs and RLS-backed actor resolution remain canonical.
- `fleet.profixiq.com` owns clean Fleet routes and redirects legacy prefixed URLs.
- Unknown Shop page routes cannot render on the Fleet hostname.
- Fleet sign-in and password recovery preserve clean deep-link destinations.

## Remaining build sequence

1. Replace the temporary module foundations for Drivers, Calendar, Reports and
   Fleet Settings with complete database-backed workflows.
2. Move fleet creation, asset enrollment and user management into Fleet.
3. Convert Shop's invite screen into a relationship invitation rather than a
   fleet administration screen.
4. Add a Fleet-owned subscription record and Stripe checkout while preserving the
   single canonical webhook and replay-safe billing synchronization.
5. Redirect or retire the remaining legacy Shop `/fleet/*` operational routes
   only after their Fleet replacements are complete.
6. Run the end-to-end acceptance test: a fleet manager can operate maintenance
   without opening ProFixIQ Shop.

## Domain activation checklist

1. Add `fleet.profixiq.com` to the existing ProFixIQ Vercel project.
2. Create the DNS record Vercel provides for that domain.
3. Add `https://fleet.profixiq.com/auth/reset` to the Supabase Auth redirect URL
   allowlist so Fleet password recovery returns to the Fleet product.
4. Verify `/`, `/sign-in`, an asset deep link, a service-request deep link and
   password recovery on the production hostname.
5. Keep the primary-domain `/portal/fleet/*` routes available until all existing
   invite emails, bookmarks and operational links have transitioned.
