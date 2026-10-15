import Link from "next/link";
import type { ReactNode } from "react";

import {
  ASSET_OPERATING_STATUSES,
  ASSET_OPERATING_STATUS_LABELS,
} from "@/features/equipment/lib/assetProfile";
import {
  DASHBOARD_UPCOMING_DAYS,
  type EquipmentFleetSummary,
} from "@/features/equipment/lib/equipmentDashboard";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

const TONE = {
  bad: "text-red-400",
  warn: "text-amber-400",
  good: "text-emerald-400",
  muted: "text-[color:var(--theme-text-muted)]",
} as const;

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: keyof typeof TONE;
}) {
  return (
    <div>
      <dd className={`text-2xl font-bold tabular-nums ${value > 0 ? TONE[tone] : ""}`}>
        {value.toLocaleString()}
      </dd>
      <dt className="text-xs text-[color:var(--theme-text-muted)]">{label}</dt>
    </div>
  );
}

function Tile({
  title,
  href,
  cta,
  children,
}: {
  title: string;
  href: string;
  cta: string;
  children: ReactNode;
}) {
  return (
    <section className={`${PANEL} flex flex-col gap-3 p-4`} aria-label={title}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="grid grid-cols-2 gap-3">{children}</dl>
      <Link href={href} className="mt-auto text-xs font-semibold underline">
        {cta}
      </Link>
    </section>
  );
}

export default function EquipmentDashboardView({ summary }: { summary: EquipmentFleetSummary }) {
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment</p>
        <h1 className="mt-1 text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
          What needs attention across your machines, from the same PM, inspection, meter and work
          order records as the Assets list.
        </p>
      </WorkspaceHeader>

      {summary.total === 0 ? (
        <EmptyState>
          No Equipment assets yet. <Link className="underline" href="/equipment">Add one from Assets.</Link>
        </EmptyState>
      ) : (
        <>
          {summary.partial ? (
            <div className={`${PANEL} p-3 text-sm text-amber-400`} role="status">
              Counted the {summary.total.toLocaleString()} most recently updated assets. This shop has
              more, so these totals are incomplete.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Tile title="Fleet" href="/equipment" cta="Open Assets">
              <Stat label="Assets" value={summary.total} />
              <Stat label="Need attention" value={summary.needsAttention} tone="bad" />
              {ASSET_OPERATING_STATUSES.filter((status) => status === "down" || status === "out_of_service" || status === "limited").map((status) => (
                <Stat
                  key={status}
                  label={ASSET_OPERATING_STATUS_LABELS[status]}
                  value={summary.status[status]}
                  tone={status === "limited" ? "warn" : "bad"}
                />
              ))}
            </Tile>
            <Tile title="Preventive maintenance" href="/equipment/pm" cta="Open PM">
              <Stat label="Overdue" value={summary.pm.overdue} tone="bad" />
              <Stat label="Due" value={summary.pm.due} tone="warn" />
              <Stat label="Up to date" value={summary.pm.ok} tone="good" />
              <Stat label="Not evaluated" value={summary.pm.not_evaluated} />
            </Tile>
            <Tile title="Inspections" href="/equipment/inspections" cta="Open Inspections">
              <Stat label="Assets with failed findings" value={summary.inspection.failed} tone="bad" />
              <Stat label="Assets with findings" value={summary.inspection.findings} tone="warn" />
              <Stat label="No findings" value={summary.inspection.clear} tone="good" />
              <Stat label="No inspection" value={summary.inspection.none} />
            </Tile>
            <Tile title="Work" href="/equipment/work-orders" cta="Open Work Orders">
              <Stat label="Open work orders" value={summary.openWork.orders} />
              <Stat label="Assets with open work" value={summary.openWork.assets} />
              <Stat
                label={`Service now or in ${DASHBOARD_UPCOMING_DAYS} days`}
                value={summary.upcomingService}
              />
            </Tile>
          </div>

          <section className={`${PANEL} p-4`} aria-label="Needs attention">
            <h2 className="text-sm font-semibold">Needs attention</h2>
            {summary.attention.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--theme-text-muted)]">
                No machine is overdue, down, or carrying failed findings.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[color:var(--theme-border-soft)]">
                {summary.attention.map((item) => (
                  <li key={item.assetId}>
                    <Link
                      href={item.href}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 hover:underline"
                    >
                      <span className="min-w-0 truncate font-semibold">{item.title}</span>
                      <span className="text-xs text-red-400">{item.reasons.join(" · ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {summary.needsAttention > summary.attention.length ? (
              <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
                Showing the {summary.attention.length} most urgent of{" "}
                {summary.needsAttention.toLocaleString()}.
              </p>
            ) : null}
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
