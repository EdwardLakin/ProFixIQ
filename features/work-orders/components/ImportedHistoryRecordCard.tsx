"use client";

import type { ReactNode } from "react";
import { resolveHistoryNarratives } from "@/features/work-orders/lib/display/historyNarratives";

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
  shop_supplies?: number | null;
  discount?: number | null;
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
  badgeLabel?: string;
  currency?: "CAD" | "USD";
};

function formatMoney(
  value: number | null | undefined,
  currency: "CAD" | "USD",
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
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
    <div className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 break-words text-xs text-[color:var(--theme-text-primary)]">{value}</div>
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
  badgeLabel = "Read-only imported",
  currency = "CAD",
}: Props): JSX.Element {
  const detailsId = `imported-history-details-${row.id}`;
  const resolvedNarratives = resolveHistoryNarratives(row);
  const narratives = [
    ["Complaint", resolvedNarratives.complaint],
    ["Cause", resolvedNarratives.cause],
    ["Correction", resolvedNarratives.correction],
  ] as const;
  const hasNarratives = narratives.some(([, value]) => Boolean(value?.trim()));
  const serviceSummary =
    summary?.trim() ||
    row.description?.trim() ||
    row.notes?.trim() ||
    "Imported historical service record";
  const moneyParts = [
    row.total != null ? `Total ${formatMoney(row.total, currency)}` : null,
    row.labor_sale != null
      ? `Labor ${formatMoney(row.labor_sale, currency)}`
      : null,
    row.parts_sale != null
      ? `Parts ${formatMoney(row.parts_sale, currency)}`
      : null,
    row.shop_supplies != null && row.shop_supplies !== 0
      ? `Supplies ${formatMoney(row.shop_supplies, currency)}`
      : null,
    row.tax != null && row.tax !== 0
      ? `Tax ${formatMoney(row.tax, currency)}`
      : null,
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
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {serviceDateLabel}
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
            {[vehicleLabel, vehicleIdentifiers].filter(Boolean).join(" • ") ||
              "Vehicle not linked"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--accent-copper-soft)]/45 bg-[var(--accent-copper-soft)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-copper,#C57A4A)]">
            {badgeLabel}
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
          <div className="grid gap-2 text-xs text-[color:var(--theme-text-secondary)] sm:grid-cols-2 lg:grid-cols-4">
            <Detail
              label="Work order"
              value={textOrDash(row.work_order_number)}
            />
            <Detail label="Invoice" value={textOrDash(row.invoice_number)} />
            <Detail
              label="Odometer"
              value={
                row.odometer != null
                  ? formatNumberLike(row.odometer)
                  : "Not recorded"
              }
            />
            <Detail label="Amount" value={moneyParts.join(" • ") || "—"} />
          </div>
          <div className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm leading-6 text-[color:var(--theme-text-primary)]">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
              Service summary
            </div>
            {hasNarratives ? (
              <dl className="grid gap-2">
                {narratives.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3"
                  >
                    <dt className="font-medium text-[color:var(--theme-text-secondary)]">
                      {label}
                    </dt>
                    <dd>{value?.trim() || "Not recorded"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              serviceSummary
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
