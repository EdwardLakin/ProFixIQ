import Link from "next/link";
import EquipmentPager from "@/features/equipment/components/EquipmentPager";
import {
  equipmentQueueQuery,
  type EquipmentQueueFilters,
  type EquipmentWorkQueue,
} from "@/features/equipment/lib/equipmentWorkQueue";
import { formatOperationalLabel } from "@/features/work-orders/lib/work-order-status";
import {
  WorkspaceShell,
  WorkspaceHeader,
  WorkspaceEmptyState,
  WORKSPACE_EYEBROW,
  WORKSPACE_ITEM,
} from "@/features/workspace/components";

const PATH = "/equipment/work-orders";
const BUTTON =
  "inline-flex min-h-11 items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold hover:bg-[color:var(--theme-surface-overlay)]";
const INPUT =
  "mt-1 min-h-11 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)]";

export default function EquipmentWorkQueueView({
  queue,
  filters,
  canCreateWorkOrder = false,
}: {
  queue: EquipmentWorkQueue;
  filters: EquipmentQueueFilters;
  canCreateWorkOrder?: boolean;
}) {
  return (
    <WorkspaceShell>
      <WorkspaceHeader className="!static lg:!sticky">
        <p className={WORKSPACE_EYEBROW}>Equipment</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Work queue</h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
              Equipment work orders and estimates.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/equipment" className={BUTTON}>Equipment assets</Link>
            {canCreateWorkOrder ? <Link href="/equipment/work-orders/new" className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--accent-copper)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">New Work Order</Link> : null}
          </div>
        </div>
        <form
          method="get"
          action={PATH}
          key={equipmentQueueQuery(filters)}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="min-w-0 text-sm">
            Search work
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Work number, customer or asset"
              className={INPUT}
            />
          </label>
          <label className="min-w-0 text-sm">
            Asset
            <select name="asset" defaultValue={filters.asset} className={INPUT}>
              <option value="">All Equipment assets</option>
              {filters.asset &&
              !queue.assets.some(([id]) => id === filters.asset) ? (
                <option value={filters.asset}>
                  Selected asset unavailable
                </option>
              ) : null}
              {queue.assets.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm">
            Record type
            <select name="kind" defaultValue={filters.kind} className={INPUT}>
              <option value="">Work orders and estimates</option>
              <option value="work_order">Work orders</option>
              <option value="estimate">Estimates</option>
            </select>
          </label>
          <label className="min-w-0 text-sm">
            Work queue
            <select name="stage" defaultValue={filters.stage ?? ""} className={INPUT}>
              <option value="">All work and estimates</option>
              <option value="ready_to_work">Ready to work</option>
              <option value="waiting_parts">Waiting on parts</option>
              <option value="ready_to_invoice">Ready to invoice</option>
            </select>
          </label>
          <label className="min-w-0 text-sm">
            Activity
            <select
              name="activity"
              defaultValue={filters.activity}
              className={INPUT}
            >
              <option value="">All activity</option>
              <option value="active">Active</option>
              <option value="closed">Not active</option>
            </select>
          </label>
          <label className="min-w-0 text-sm">
            Status
            <select
              name="status"
              defaultValue={filters.status}
              className={INPUT}
            >
              <option value="">All statuses</option>
              {filters.status && !queue.statuses.includes(filters.status) ? (
                <option value={filters.status}>
                  {formatOperationalLabel(filters.status)}
                </option>
              ) : null}
              {queue.statuses.map((status) => (
                <option key={status} value={status}>
                  {formatOperationalLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={BUTTON}>
              Apply filters
            </button>
            <Link href={PATH} className={BUTTON}>
              Clear
            </Link>
          </div>
        </form>
      </WorkspaceHeader>
      {queue.partial ? (
        <p
          role="status"
          className="text-sm text-[color:var(--theme-text-muted)]"
        >
          Limited scan: results and counts cover up to 20,000 work records and
          5,000 assets, read in asset batches. This may omit newer work on
          unscanned assets; these are not necessarily the newest records across
          all Equipment. Filter by an asset to narrow history, or open its
          Equipment profile.
        </p>
      ) : null}
      <section
        aria-label="Matching records"
        className="flex flex-wrap gap-4 text-sm"
      >
        <p>
          <strong>{queue.summary.records}</strong> matching records
          {queue.partial ? " in this scan" : ""}
        </p>
        <p>
          <strong>{queue.summary.workOrders}</strong> work orders
        </p>
        <p>
          <strong>{queue.summary.estimates}</strong> estimates
        </p>
        <p>
          <strong>{queue.summary.active}</strong> active records
        </p>
      </section>
      {queue.rows.length ? (
        <ul className="grid gap-3">
          {queue.rows.map((row) => (
            <li
              key={row.id}
              className={`${WORKSPACE_ITEM} flex flex-wrap items-center justify-between gap-3 p-4`}
            >
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="text-xs font-semibold text-[color:var(--theme-text-muted)]">
                  {formatOperationalLabel(row.status)}
                </p>
                <h2 className="mt-1 font-semibold">
                  {row.href ? (
                    <Link href={row.href} className="hover:underline">
                      {row.title}
                    </Link>
                  ) : (
                    row.title
                  )}
                </h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
                  {row.customerName ?? "Customer not recorded"}
                </p>
              </div>
              <Link href={row.assetHref} className={BUTTON}>
                {row.assetLabel}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <WorkspaceEmptyState>
          No Equipment work matches these filters.
        </WorkspaceEmptyState>
      )}
      <EquipmentPager
        info={queue.info}
        hrefFor={(page) => `${PATH}${equipmentQueueQuery(filters, page)}`}
      />
    </WorkspaceShell>
  );
}
