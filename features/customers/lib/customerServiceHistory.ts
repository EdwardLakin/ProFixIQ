import {
  formatOperationalLabel,
  isEstimateRecord,
  normalizeWorkOrderStatus,
} from "@/features/work-orders/lib/work-order-status";

type CustomerServiceHistoryRecord = {
  id: string;
  custom_id?: string | null;
  status?: string | null;
  record_type?: string | null;
  estimate_number?: string | null;
  estimate_status?: string | null;
};

const ODOMETER_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export type CustomerServiceHistoryPresentation = {
  href: string;
  lifecycleLabel: "Active" | "Closed" | "Completed" | "Estimate" | "In progress";
  statusKey: string;
  statusLabel: string;
  title: string;
};

export function formatOdometer(
  value: string | number | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw.replace(/,/g, ""));
  const formatted = Number.isFinite(numeric)
    ? ODOMETER_NUMBER_FORMATTER.format(numeric)
    : raw;
  const cleanUnit = String(unit ?? "").trim();
  return cleanUnit ? `${formatted} ${cleanUnit}` : formatted;
}

function normalizedStatusKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_") || "new";
}

function workOrderTitle(record: CustomerServiceHistoryRecord): string {
  const customId = record.custom_id?.trim();
  return customId
    ? `WO-${customId.replace(/^wo-?/i, "")}`
    : `WO ${record.id.slice(0, 8)}`;
}

export function customerServiceHistoryPresentation(
  record: CustomerServiceHistoryRecord,
): CustomerServiceHistoryPresentation {
  const isEstimate = isEstimateRecord(record);
  const statusValue = isEstimate
    ? record.estimate_status ?? record.status
    : record.status;
  const statusKey = normalizedStatusKey(statusValue);
  const canonicalStatus = normalizeWorkOrderStatus(record.status);

  const lifecycleLabel = isEstimate
    ? "Estimate"
    : canonicalStatus === "cancelled"
      ? "Closed"
      : canonicalStatus === "completed" || canonicalStatus === "invoiced"
        ? "Completed"
        : canonicalStatus === "in_progress"
          ? "In progress"
          : "Active";

  return {
    href: isEstimate ? `/estimates/${record.id}` : `/work-orders/${record.id}`,
    lifecycleLabel,
    statusKey,
    statusLabel: formatOperationalLabel(statusValue),
    title: isEstimate
      ? record.estimate_number?.trim()
        ? `Estimate ${record.estimate_number.trim()}`
        : `Estimate ${record.id.slice(0, 8)}`
      : workOrderTitle(record),
  };
}
