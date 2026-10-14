import Link from "next/link";

import {
  equipmentAssetTitle,
  type EquipmentDirectoryRow,
} from "@/features/equipment/lib/equipmentDirectory";
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

type ActiveEquipmentWork = {
  assetId: string;
  assetHref: string;
  assetTitle: string;
  customerName: string | null;
  siteName: string | null;
  title: string;
  status: string;
  href: string | null;
};

function activeWork(rows: EquipmentDirectoryRow[]): ActiveEquipmentWork[] {
  return rows.flatMap((row) =>
    row.activeWorkOrder
      ? [
          {
            assetId: row.assetId,
            assetHref: row.href,
            assetTitle: equipmentAssetTitle(row),
            customerName: row.customerName,
            siteName: row.siteName,
            title: row.activeWorkOrder.title,
            status: row.activeWorkOrder.status,
            href: row.activeWorkOrder.href,
          },
        ]
      : [],
  );
}

export default function EquipmentWorkOrdersView({
  rows,
  truncated,
}: {
  rows: EquipmentDirectoryRow[];
  truncated: boolean;
}) {
  const work = activeWork(rows);

  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Work orders</h1>
            <p className="mt-1 max-w-3xl text-sm text-[color:var(--theme-text-muted)]">
              Active canonical ProFixIQ work orders attached to Equipment assets. Work-order execution,
              parts, inspections, approvals and billing continue through the existing work-order workspace.
            </p>
          </div>
          <Link className={BUTTON} href="/equipment">
            Equipment assets
          </Link>
        </div>
      </WorkspaceHeader>

      {work.length ? (
        <ul className="grid gap-3">
          {work.map((item) => (
            <li key={`${item.assetId}-${item.title}`} className={`${ITEM} p-4`}>
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
                    {[item.customerName, item.siteName].filter(Boolean).join(" · ") || "Equipment asset"}
                  </p>
                </div>
                <Link href={item.assetHref} className={BUTTON}>
                  {item.assetTitle}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          No active work orders are attached to the Equipment assets currently in the directory.
        </EmptyState>
      )}

      {truncated ? (
        <p className="mt-3 text-xs text-[color:var(--theme-text-muted)]">
          The Equipment directory is currently truncated, so this view reflects only the assets loaded by
          the canonical directory service.
        </p>
      ) : null}
    </WorkspaceShell>
  );
}
