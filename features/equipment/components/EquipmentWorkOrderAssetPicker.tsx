import Link from "next/link";

import EquipmentPager from "@/features/equipment/components/EquipmentPager";
import { equipmentAssetTitle } from "@/features/equipment/lib/equipmentDirectory";
import {
  directoryQueryString,
  type EquipmentDirectoryFilters,
} from "@/features/equipment/lib/equipmentDirectoryQuery";
import type { EquipmentDirectoryPage } from "@/features/equipment/server/loadEquipmentDirectoryPage";
import {
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW,
  WORKSPACE_ITEM,
} from "@/features/workspace/components";

const PATH = "/equipment/work-orders/new";
const BUTTON =
  "inline-flex min-h-11 items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)]";
const PRIMARY =
  "inline-flex min-h-11 items-center rounded-lg bg-[color:var(--accent-copper)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90";
const INPUT =
  "min-h-11 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)]";

/** Selection only: eligibility and customer/vehicle handoffs belong to the directory. */
export default function EquipmentWorkOrderAssetPicker({
  directory,
  filters,
}: {
  directory: EquipmentDirectoryPage;
  filters: EquipmentDirectoryFilters;
}) {
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={WORKSPACE_EYEBROW}>Equipment</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">New Work Order</h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
              Choose an Equipment asset to continue with its customer in
              work-order creation.
            </p>
          </div>
          <Link href="/equipment/work-orders" className={BUTTON}>
            Back to Work
          </Link>
        </div>
        <form
          action={PATH}
          method="get"
          className="mt-4 flex flex-wrap items-end gap-3"
          key={directoryQueryString(filters)}
        >
          <label className="min-w-0 flex-1 basis-64 text-sm">
            Search assets
            <input
              className={`${INPUT} mt-1`}
              name="q"
              defaultValue={filters.q}
              placeholder="Unit, make, model, serial or site"
            />
          </label>
          <label className="min-w-0 flex-1 basis-48 text-sm">
            Customer
            <select
              className={`${INPUT} mt-1`}
              name="customer"
              defaultValue={filters.customerId}
            >
              <option value="">All customers</option>
              {directory.facets.customers.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={BUTTON}>
            Search
          </button>
          {filters.q || filters.customerId ? (
            <Link href={PATH} className={BUTTON}>
              Clear
            </Link>
          ) : null}
        </form>
      </WorkspaceHeader>
      {directory.indexCapped ? (
        <p
          role="status"
          className="mb-3 text-sm text-[color:var(--theme-text-muted)]"
        >
          This asset list is limited. If an asset is missing, open its Equipment
          profile to create work.
        </p>
      ) : null}
      {directory.rows.length ? (
        <ul className="grid gap-3">
          {directory.rows.map((row) => (
            <li
              key={row.assetId}
              className={`${WORKSPACE_ITEM} flex flex-wrap items-center justify-between gap-3 p-4`}
            >
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <h2 className="font-semibold">{equipmentAssetTitle(row)}</h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
                  {[
                    row.customerName ?? "No customer linked",
                    row.siteName,
                    row.serialNumber ? `Serial ${row.serialNumber}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {!row.actions.createWorkOrderHref ? (
                  <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
                    Creation is unavailable for this asset or linked customer.
                    Open the asset to review its details.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={row.href} className={BUTTON}>
                  Open asset
                </Link>
                {row.actions.createWorkOrderHref ? (
                  <Link
                    href={row.actions.createWorkOrderHref}
                    className={PRIMARY}
                    aria-label={`Create work order for ${equipmentAssetTitle(row)}`}
                  >
                    Create work order
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <WorkspaceEmptyState>
          <span className="block">
            {directory.totalAssets
              ? "No Equipment assets match this search."
              : "Add an Equipment asset and link its customer before creating work."}
          </span>
          <Link href="/equipment" className={`${BUTTON} mt-3`}>
            Equipment assets
          </Link>
        </WorkspaceEmptyState>
      )}
      <div className="mt-4">
        <EquipmentPager
          info={directory.info}
          hrefFor={(page) =>
            `${PATH}${directoryQueryString(filters, { page })}`
          }
        />
      </div>
    </WorkspaceShell>
  );
}
