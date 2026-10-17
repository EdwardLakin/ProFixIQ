import Link from "next/link";
import EquipmentPager from "./EquipmentPager";
import { equipmentAssetTitle } from "@/features/equipment/lib/equipmentDirectory";
import {
  paginate,
  type EquipmentDirectoryFilters,
} from "@/features/equipment/lib/equipmentDirectoryQuery";
import type { EquipmentCustomer } from "@/features/equipment/lib/equipmentCustomers";
import {
  WorkspaceShell,
  WorkspaceHeader,
  WorkspaceEmptyState,
  WORKSPACE_EYEBROW,
  WORKSPACE_ITEM,
} from "@/features/workspace/components";

const PATH = "/equipment/customers";
const BUTTON =
  "inline-flex min-h-11 items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold hover:bg-[color:var(--theme-surface-overlay)]";

export default function EquipmentCustomersView({
  customers = [],
  capped = false,
  error = false,
  filters,
  canOpenAccount,
}: {
  customers?: EquipmentCustomer[];
  capped?: boolean;
  error?: boolean;
  filters: EquipmentDirectoryFilters;
  canOpenAccount: boolean;
}) {
  const selected = customers.find(
    (customer) => customer.id === filters.customerId,
  );
  const matches = customers.filter((customer) =>
    customer.name.toLowerCase().includes(filters.q.toLowerCase()),
  );
  const directory = paginate(matches, filters.page);
  const assets = paginate(selected?.assets ?? [], filters.page);
  const hrefFor = (page: number) => {
    const query = new URLSearchParams();
    if (filters.customerId) query.set("customer", filters.customerId);
    else if (filters.q) query.set("q", filters.q);
    if (page > 1) query.set("page", String(page));
    return `${PATH}?${query}`;
  };
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={WORKSPACE_EYEBROW}>Equipment</p>
        <h1 className="mt-1 text-2xl font-bold">
          {selected?.name ?? "Customers"}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--theme-text-muted)]">
          Customers with linked Equipment assets visible to you.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {filters.customerId ? (
            <Link className={BUTTON} href={PATH}>
              Back to Customers
            </Link>
          ) : null}
          {canOpenAccount ? (
            <Link
              className={BUTTON}
              href={
                selected
                  ? `/customers/${encodeURIComponent(selected.id)}`
                  : "/customers"
              }
            >
              {selected
                ? "Open shared customer account ↗"
                : "Manage customers in shared workspace ↗"}
            </Link>
          ) : null}
          {selected ? (
            <Link
              className={BUTTON}
              href={`/equipment?customer=${encodeURIComponent(selected.id)}`}
            >
              Open assets with maintenance and work
            </Link>
          ) : null}
        </div>
        {selected && canOpenAccount ? (
          <p className="mt-3 text-sm text-[color:var(--theme-text-muted)]">
            Contacts, account settings, pricing and portal access are managed on
            the shared customer account, subject to your permissions. That
            account includes all of this customer’s vehicles and work.
          </p>
        ) : null}
        {!filters.customerId ? (
          <form
            action={PATH}
            method="get"
            className="mt-4 flex flex-wrap items-end gap-3"
            key={filters.q}
          >
            <label className="min-w-0 flex-1 text-sm">
              Search customers
              <input
                name="q"
                defaultValue={filters.q}
                className="mt-1 min-h-11 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-[color:var(--theme-text-primary)]"
              />
            </label>
            <button className={BUTTON} type="submit">
              Search
            </button>
            {filters.q ? (
              <Link className={BUTTON} href={PATH}>
                Clear
              </Link>
            ) : null}
          </form>
        ) : null}
      </WorkspaceHeader>
      {error ? (
        <div role="alert" className={`${WORKSPACE_ITEM} p-4`}>
          Customers could not be loaded.{" "}
          <Link className={BUTTON} href={hrefFor(filters.page)}>
            Retry
          </Link>
        </div>
      ) : (
        <>
          {capped ? (
            <p role="status" className="mb-4 text-sm">
              Limited results from the newest updated Equipment assets.
              Customers, asset counts and search results may be incomplete;
              older assets may be missing.
            </p>
          ) : null}
          {filters.customerId ? (
            selected ? (
              <>
                <h2 className="mb-3 text-lg font-semibold">
                  Equipment assets · {selected.assets.length}
                  {capped ? " in loaded results" : ""}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {assets.items.map((asset) => (
                    <li key={asset.assetId} className={`${WORKSPACE_ITEM} p-4`}>
                      <Link
                        className="inline-flex min-h-11 items-center font-semibold underline"
                        href={`/equipment/${encodeURIComponent(asset.assetId)}`}
                      >
                        {equipmentAssetTitle(asset)}
                      </Link>
                      <dl className="mt-2 space-y-1 break-words text-sm text-[color:var(--theme-text-muted)]">
                        <div>
                          <dt className="inline">Class: </dt>
                          <dd className="inline">
                            {asset.equipmentClassLabel}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">Serial: </dt>
                          <dd className="inline">
                            {asset.serialNumber || "Not recorded"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">Site: </dt>
                          <dd className="inline">
                            {asset.siteName || "Not recorded"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">Status: </dt>
                          <dd className="inline">
                            {asset.operatingStatus.replaceAll("_", " ")}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <EquipmentPager info={assets.info} hrefFor={hrefFor} />
              </>
            ) : (
              <WorkspaceEmptyState>
                This customer is not available in the loaded Equipment results.
                Return to Customers or Assets to find a visible linked account.
              </WorkspaceEmptyState>
            )
          ) : (
            <>
              <p className="mb-3 text-sm">
                {directory.info.total} customers
                {capped ? " in loaded results" : ""}
              </p>
              {directory.items.length ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {directory.items.map((customer) => (
                    <li key={customer.id} className={`${WORKSPACE_ITEM} p-4`}>
                      <Link
                        className="inline-flex min-h-11 items-center break-words font-semibold underline"
                        href={`${PATH}?customer=${encodeURIComponent(customer.id)}`}
                      >
                        {customer.name}
                      </Link>
                      <p className="text-sm text-[color:var(--theme-text-muted)]">
                        {customer.assets.length} Equipment assets
                        {capped ? " in loaded results" : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <WorkspaceEmptyState>
                  No matching customers with visible Equipment assets. Accounts
                  without linked Equipment assets remain in the shared customer
                  workspace.
                </WorkspaceEmptyState>
              )}
              <EquipmentPager info={directory.info} hrefFor={hrefFor} />
            </>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}
