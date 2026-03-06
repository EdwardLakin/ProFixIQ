"use client";

import Link from "next/link";
import {
  buildBlockers,
  formatStageLabel,
  stageAccent,
  timeAgoLabel,
} from "../../lib/workboard/utils";
import type { WorkOrderBoardRow, WorkOrderBoardVariant } from "../../lib/workboard/types";

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
            <div className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${accent.badge}`}>
              {stageLabel}
            </div>
          </div>

          <div className="mt-1 truncate text-sm font-semibold text-neutral-200">
            {row.display_name ?? "Customer"}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
            {row.unit_label ? <span>Unit {row.unit_label}</span> : null}
            {row.vehicle_label ? <span>{row.vehicle_label}</span> : null}
            {variant !== "portal" && row.assigned_summary ? <span>{row.assigned_summary}</span> : null}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            In state
          </div>
          <div className="mt-1 text-sm font-bold text-neutral-200">
            {timeAgoLabel(row.time_in_stage_seconds ?? null)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span>
            {row.jobs_completed}/{row.jobs_total} jobs complete
          </span>
          <span>{row.progress_pct}%</span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full ${accent.progress}`}
            style={{ width: `${Math.max(0, Math.min(100, row.progress_pct))}%` }}
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
        <div className="mt-3 text-xs text-neutral-300">{row.portal_status_note}</div>
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
