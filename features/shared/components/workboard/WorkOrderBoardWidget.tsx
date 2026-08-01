"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Package,
  RefreshCw,
  Wrench,
} from "lucide-react";

import { useWorkOrderBoard } from "../../hooks/useWorkOrderBoard";
import type {
  WorkOrderBoardRow,
  WorkOrderBoardStage,
  WorkOrderBoardVariant,
} from "../../lib/workboard/types";
import {
  buildBlockers,
  formatStageLabel,
  timeAgoLabel,
} from "../../lib/workboard/utils";

const stageIcon: Partial<Record<WorkOrderBoardStage, typeof Clock3>> = {
  awaiting: Clock3,
  in_progress: Wrench,
  awaiting_approval: AlertTriangle,
  waiting_parts: Package,
  on_hold: Clock3,
  completed: CheckCircle2,
};

function attentionCount(rows: WorkOrderBoardRow[]) {
  return rows.filter(
    (row) => row.risk_level === "warn" || row.risk_level === "danger",
  ).length;
}

export default function WorkOrderBoardWidget(props: {
  variant?: WorkOrderBoardVariant;
  fleetId?: string | null;
  href?: string;
}) {
  const variant = props.variant ?? "shop";
  const { rows, loading, error, refetch } = useWorkOrderBoard(variant, {
    limit: 5,
    fleetId: props.fleetId,
  });

  const title =
    variant === "fleet"
      ? "Active fleet work"
      : variant === "portal"
        ? "Live repair status"
        : "Active shop work";

  const subtitle =
    variant === "fleet"
      ? "A compact operational view of units currently moving through the shop."
      : variant === "portal"
        ? "Track progress, approvals, and next steps."
        : "Current work that needs attention.";

  const href =
    props.href ??
    (variant === "fleet"
      ? "/portal/fleet/board"
      : variant === "portal"
        ? "/portal/status"
        : "/work-orders/board");

  const atRisk = attentionCount(rows);
  const inProgress = rows.filter(
    (row) => row.overall_stage === "in_progress",
  ).length;
  const waitingParts = rows.filter(
    (row) => row.overall_stage === "waiting_parts",
  ).length;

  return (
    <section aria-labelledby="compact-work-board-title" className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
            Shop operations
          </p>
          <h2
            id="compact-work-board-title"
            className="mt-1 text-xl font-bold text-[color:var(--theme-text-primary)]"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refetch}
            aria-label="Refresh active work"
            className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)] transition hover:text-[color:var(--theme-text-primary)]"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            href={href}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-primary,#C1663B)] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            Open full board
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Active", rows.length, "text-sky-500"],
          ["In progress", inProgress, "text-violet-500"],
          ["Waiting parts", waitingParts, "text-amber-500"],
          ["Need attention", atRisk, "text-red-500"],
        ].map(([label, value, tone]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5"
          >
            <div className={`text-xl font-bold ${tone}`}>{value}</div>
            <div className="text-[11px] text-[color:var(--theme-text-muted)]">
              {label}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-4 py-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
          Loading active work…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Active work could not be loaded. The fleet dashboard remains available.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-4 py-8 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
            No active shop work
          </p>
          <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
            New fleet work will appear here as it enters the shop.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--theme-border-soft)] overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
          {rows.map((row) => {
            const Icon = stageIcon[row.overall_stage ?? "awaiting"] ?? Clock3;
            const blockers = buildBlockers(row, variant);
            return (
              <div
                key={row.work_order_id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[color:var(--theme-text-primary)]">
                      {row.custom_id ?? "Work order"}
                    </span>
                    {row.unit_label ? (
                      <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-200">
                        Unit {row.unit_label}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-[color:var(--theme-text-secondary)]">
                    {row.vehicle_label || row.display_name || "Vehicle details unavailable"}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--theme-text-primary)]">
                    <Icon className="h-4 w-4 text-[var(--brand-primary,#C1663B)]" />
                    {formatStageLabel(row, variant)}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-[color:var(--theme-text-muted)]">
                    {blockers[0] ?? `${row.jobs_completed} of ${row.jobs_total} jobs complete`}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <div className="w-24">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
                      <div
                        className="h-full rounded-full bg-[var(--brand-primary,#C1663B)]"
                        style={{
                          width: `${Math.min(100, Math.max(0, row.progress_pct))}%`,
                        }}
                      />
                    </div>
                    <div className="mt-1 text-right text-[10px] text-[color:var(--theme-text-muted)]">
                      {timeAgoLabel(row.time_in_stage_seconds)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
