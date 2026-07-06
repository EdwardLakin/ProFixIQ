"use client";

import type { ReactNode } from "react";

type VehicleLike = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  unit_number?: string | null;
} | null;

export type ImportedHistoryRecordLike = {
  id: string;
  service_date?: string | null;
  created_at?: string | null;
  description?: string | null;
  notes?: string | null;
  work_order_number?: string | null;
  invoice_number?: string | null;
  odometer?: string | number | null;
  symptom?: string | null;
  cause?: string | null;
  correction?: string | null;
  labor_hours?: string | number | null;
  labor_sale?: number | null;
  parts_sale?: number | null;
  tax?: number | null;
  total?: number | null;
  advisor_name?: string | null;
  assigned_tech_name?: string | null;
  source_external_id?: string | null;
  source_row_id?: string | null;
  imported_from_session_id?: string | null;
  vehicles?: VehicleLike;
};

type Props = {
  row: ImportedHistoryRecordLike;
  serviceDateLabel: string;
  vehicleLabel?: string | null;
  vehicleIdentifiers?: string | null;
  summary?: string | null;
  compact?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  className?: string;
};

function formatMoney(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatNumberLike(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number")
    return Number.isFinite(value) ? value.toLocaleString() : "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(value.trim())
    ? numeric.toLocaleString()
    : value;
}

function textOrDash(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text.length > 0 ? text : "—";
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-[color:var(--desktop-border)] bg-black/15 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1 break-words text-xs text-neutral-100">{value}</div>
    </div>
  );
}

export function ImportedHistoryRecordCard({
  row,
  serviceDateLabel,
  vehicleLabel,
  vehicleIdentifiers,
  summary,
  compact = false,
  collapsed = false,
  onToggle,
  action,
  className = "",
}: Props): JSX.Element {
  const detailsId = `imported-history-details-${row.id}`;
  const serviceSummary =
    (summary ??
      [
        row.symptom ? `Complaint: ${row.symptom}` : null,
        row.cause ? `Cause: ${row.cause}` : null,
        row.correction ? `Correction: ${row.correction}` : null,
      ]
        .filter(Boolean)
        .join(" • ")) ||
    row.description?.trim() ||
    row.notes?.trim() ||
    "Imported historical service record";
  const moneyParts = [
    row.total != null ? `Total ${formatMoney(row.total)}` : null,
    row.labor_sale != null ? `Labor ${formatMoney(row.labor_sale)}` : null,
    row.labor_hours != null
      ? `${formatNumberLike(row.labor_hours)} labor hrs`
      : null,
  ].filter(Boolean);

  return (
    <article
      className={`rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">
            {serviceDateLabel}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            {[vehicleLabel, vehicleIdentifiers].filter(Boolean).join(" • ") ||
              "Vehicle not linked"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--accent-copper-soft)]/45 bg-[var(--accent-copper-soft)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-copper,#C57A4A)]">
            Read-only imported
          </span>
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-controls={detailsId}
              className="rounded-full border border-sky-400/35 bg-sky-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100 hover:border-sky-300/60"
            >
              {collapsed ? "View details" : "Hide details"}
            </button>
          ) : null}
          {action}
        </div>
      </div>

      {!collapsed ? (
        <div
          id={detailsId}
          className={compact ? "mt-3 space-y-3" : "mt-3 space-y-3"}
        >
          <div className="grid gap-2 text-xs text-neutral-300 sm:grid-cols-2 lg:grid-cols-4">
            <Detail
              label="Work order"
              value={textOrDash(row.work_order_number)}
            />
            <Detail label="Invoice" value={textOrDash(row.invoice_number)} />
            <Detail
              label="Odometer"
              value={
                row.odometer != null ? formatNumberLike(row.odometer) : "—"
              }
            />
            <Detail label="Amount" value={moneyParts.join(" • ") || "—"} />
          </div>
          <div className="rounded-lg border border-[color:var(--desktop-border)] bg-black/20 px-3 py-2 text-sm leading-6 text-neutral-200">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Service summary
            </div>
            {serviceSummary}
          </div>
        </div>
      ) : null}
    </article>
  );
}
