"use client";

import Link from "next/link";
import {
  buildBlockers,
  formatStageLabel,
  stageAccent,
  timeAgoLabel,
} from "../../lib/workboard/utils";
import type {
  WorkOrderBoardRow,
  WorkOrderBoardVariant,
} from "../../lib/workboard/types";

function priorityLabel(priority: number | null | undefined): string | null {
  if (priority === 1) return "Urgent";
  if (priority === 2) return "High";
  if (priority === 3) return "Normal";
  if (priority === 4) return "Low";
  return null;
}

function priorityChipClass(priority: number | null | undefined): string {
  if (priority === 1) {
    return "border-red-500/50 bg-red-500/15 text-red-200";
  }
  if (priority === 2) {
    return "border-orange-500/50 bg-orange-500/15 text-orange-200";
  }
  if (priority === 3) {
    return "border-white/10 bg-white/5 text-neutral-300";
  }
  if (priority === 4) {
    return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  }
  return "border-white/10 bg-white/5 text-neutral-300";
}

export default function WorkOrderBoardCard(props: {
  row: WorkOrderBoardRow;
  variant: WorkOrderBoardVariant;
  href?: string | null;
  compact?: boolean;
}) {
  const { row, variant, href, compact = false } = props;
  const accent = stageAccent(row.overall_stage, row.risk_level);
  const blockers = buildBlockers(row, variant);
  const stageLabel = formatStageLabel(row, variant);
  const progressWidth = Math.max(0, Math.min(100, row.progress_pct));
  const priority = priorityLabel(row.priority);

  const content = (
    <div
      className={[
        "rounded-2xl border bg-black/25 backdrop-blur transition",
        accent.border,
        compact ? "p-3" : "p-4",
      ].join(" ")}
      style={{
        boxShadow:
          row.risk_level === "danger"
            ? "0 0 0 1px rgba(239,68,68,0.18) inset, 0 0 24px rgba(239,68,68,0.08)"
            : "0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-extrabold text-white">
              {row.custom_id ?? "Work order"}
            </div>

            <div
              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${accent.badge}`}
            >
              {stageLabel}
            </div>

            {row.is_waiter ? (
              <div className="rounded-full border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                Waiting
              </div>
            ) : null}

            {priority ? (
              <div
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${priorityChipClass(row.priority)}`}
              >
                {priority}
              </div>
            ) : null}
          </div>

          <div className="mt-1 truncate text-sm font-semibold text-neutral-200">
            {row.display_name ?? "Customer"}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
            {row.unit_label ? <span>Unit {row.unit_label}</span> : null}
            {row.vehicle_label ? <span>{row.vehicle_label}</span> : null}
            {variant !== "portal" && row.assigned_summary ? (
              <span>{row.assigned_summary}</span>
            ) : null}
          </div>

          {variant !== "portal" && (row.advisor_name || row.first_tech_name) ? (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-400">
              {row.advisor_name ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                  Advisor: {row.advisor_name}
                </span>
              ) : null}
              {row.first_tech_name ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                  Tech: {row.first_tech_name}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            In state
          </div>
          <div
            className={[
              "mt-1 text-sm font-bold",
              row.risk_level === "danger"
                ? "text-red-200"
                : row.risk_level === "warn"
                  ? "text-amber-200"
                  : "text-neutral-200",
            ].join(" ")}
          >
            {timeAgoLabel(row.time_in_stage_seconds ?? null)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span>
            {row.jobs_completed}/{row.jobs_total} jobs complete
          </span>
          {!compact ? <span>{row.progress_pct}%</span> : null}
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full ${accent.progress}`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      {blockers.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {blockers.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-neutral-200"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      {variant === "portal" && row.portal_status_note ? (
        <div className="mt-3 text-xs text-neutral-300">
          {row.portal_status_note}
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}