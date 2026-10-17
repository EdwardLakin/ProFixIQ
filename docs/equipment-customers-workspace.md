# Equipment Customers

Compatible integration based on main `7193918018d07766829491cc5b18375f898b6e30`.

The Customers placeholder becomes a server-rendered directory and customer asset
view at `/equipment/customers?customer=<canonical-id>`. Search and 50-row paging
apply after Equipment and tenant scoping and grouping by canonical customer ID.
Asset details include class, serial, site and current operating status, with
links to Equipment asset health and the existing customer-filtered Assets view.

The existing `loadEquipmentAssetList` owns every read and canonical display name:
shop-scoped Equipment profiles through its privileged client, then shop-scoped
vehicles and customers through the authenticated RLS client. The page authenticates
staff and checks Equipment entitlement before constructing clients or reading data.
Accounts absent from the RLS-visible customer projection are excluded. No financial
or contact fields are loaded by this surface. Existing directory roles are retained.

The identity index has its existing 5,000-asset cap. When capped, the directory,
search, customer asset counts and detail remain explicitly partial, biased toward
newest updated assets. An account outside the loaded index is unavailable here,
not asserted nonexistent. Accounts without Equipment assets are intentionally absent.
Failed reads have a retry state, separate from a successful empty result.

## Shared account reuse

Inspected `CustomerAccountDetails`, `CustomerPortalAccess`, `CustomerPricingPanel`,
their API gates and `vehicleWorkspacePermissionsForRole`. The account center combines
whole-customer vehicle/work/invoice counts and commercial settings; embedding it would
misrepresent Equipment scope. Portal and pricing panels retain independent command
permissions. This slice links to the existing `/customers/<id>` account, where these
components already run, only when canonical `canOpenAccount` allows it. The UI states
that the destination includes all of the customer's vehicles/work. No invitations,
pricing mutations, contacts or lifecycle commands are implemented or executed here.

## Existing surfaces changed

- Equipment Customers page replaces its explicitly approved placeholder.
- Navigation registry marks Customers live; destination and role gates are unchanged.
- Shell regressions update only the approved placeholder inventory/count and assert
  Customers is live. Other role, shell and planned-section assertions remain.

All shared loaders, helpers, components, API/RPC contracts, tables, migrations,
policies, grants, roles and financial behavior remain unchanged. PR #1899, Dispatch
availability and Billing are outside scope. Revert this application PR to roll back.
No database or manual deployment action is needed. Browser/device/production and
actual account mutations are not verified by mocked component tests.
