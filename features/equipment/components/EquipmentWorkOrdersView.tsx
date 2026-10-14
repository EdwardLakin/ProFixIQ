import Link from "next/link";

import type { EquipmentWorkOrderRow } from "@/features/equipment/lib/equipmentWorkOrders";
import { formatOperationalLabel } from "@/features/work-orders/lib/work-order-status";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_ITEM as ITEM,
} from "@/features/workspace/components";

const BUTTON =
  "min-h-10 rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)]";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function EquipmentWorkOrdersView({
  rows,
  truncated,
}: {
  rows: EquipmentWorkOrderRow[];
  truncated: boolean;
}) {
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Work orders</h1>
            <p className="mt-1 max-w-3xl text-sm text-[color:var(--theme-text-muted)]">
              Recent canonical ProFixIQ work orders attached to Equipment assets. Execution, parts,
              inspections, approvals and billing continue through the existing work-order workspace.
            </p>
          </div>
          <Link className={BUTTON} href="/equipment">
            Equipment assets
          </Link>
        </div>
      </WorkspaceHeader>

      {rows.length ? (
        <ul className="grid gap-3">
          {rows.map((item) => (
            <li key={item.id} className={`${ITEM} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                    {formatOperationalLabel(item.status)}
                  </p>
                  <p className="mt-1 text-base font-semibold">
                    {item.href ? (
                      <Link href={item.href} className="hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
                    {[
                      item.customerName,
                      `Created ${formatDate(item.createdAt)}`,
                      item.scheduledAt ? `Scheduled ${formatDate(item.scheduledAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Link href={item.assetHref} className={BUTTON}>
                  {item.assetLabel}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No canonical work orders are recorded for Equipment assets yet.</EmptyState>
      )}

      {truncated ? (
        <p className="mt-3 text-xs text-[color:var(--theme-text-muted)]">
          Showing the 100 most recent Equipment work orders.
        </p>
      ) : null}
    </WorkspaceShell>
  );
}
