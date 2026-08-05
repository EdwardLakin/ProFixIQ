import type { Database } from "@shared/types/types/supabase";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "role">;

const ASSIGNABLE_TECH_ROLES = new Set([
  "mechanic",
  "tech",
  "technician",
  "lead_tech",
  "leadtech",
  "foreman",
  "lead_hand",
]);

export function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function resolvePrimaryTechDisplay(
  line: Pick<WorkOrderLine, "assigned_tech_id">,
  profile: Profile | null | undefined,
): string {
  if (!line.assigned_tech_id) return "Unassigned";
  const role = String(profile?.role ?? "").toLowerCase();
  if (
    profile?.id === line.assigned_tech_id &&
    profile.full_name &&
    ASSIGNABLE_TECH_ROLES.has(role)
  ) {
    return profile.full_name;
  }
  return "Unassigned";
}

export function resolveOperationalLineStatusLabel(
  line: Pick<
    WorkOrderLine,
    | "approval_state"
    | "assigned_tech_id"
    | "hold_reason"
    | "punched_in_at"
    | "punched_out_at"
    | "status"
  >,
  options?: { isActive?: boolean },
): string {
  const normalized = normalizeWorkOrderLineStatus(line.status);
  const approvalState = String(line.approval_state ?? "").trim().toLowerCase();
  const isActive =
    options?.isActive === true ||
    (Boolean(line.punched_in_at) && !line.punched_out_at);

  if (normalized === "completed" || normalized === "ready_to_invoice" || normalized === "invoiced") {
    return normalized === "completed"
      ? "Completed"
      : normalized === "invoiced"
        ? "Invoiced"
        : "Ready to invoice";
  }
  if (normalized === "declined") return "Declined";
  if (normalized === "deferred") return "Deferred";
  if (normalized === "on_hold" || line.hold_reason) return "On hold";
  if (normalized === "waiting_parts") return "Waiting parts";
  if (normalized === "awaiting_approval" || approvalState === "pending") {
    return "Awaiting approval";
  }
  // A line can retain the workflow status `in_progress` after approval or a
  // previous punch. The operational UI should only say it is in progress
  // while there is a live job punch; otherwise the primary action correctly
  // remains "Start job".
  if (isActive) return "In progress";
  if (!line.assigned_tech_id) return "Awaiting technician";
  if (
    ["awaiting", "pending", "queued", "approved", "assigned", "unassigned", "in_progress"].includes(
      normalized,
    )
  ) {
    return "Ready to start";
  }

  return normalized.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatLaborSummary(hours: number | null | undefined, laborTotal: number): string {
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    return `Labor ${hours.toFixed(1)}h · ${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(laborTotal)}`;
  }
  return "Estimate pending";
}

export function formatPartsSummary(args: { partsCount: number; partsTotal: number }): string {
  const { partsCount, partsTotal } = args;
  if (partsCount > 0) {
    const total = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(partsTotal);
    return `${partsCount} required · ${total} est.`;
  }
  if (partsTotal > 0) {
    return `Parts ${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(partsTotal)} est.`;
  }
  return "No parts estimate";
}

export function resolvePartsBottleneckDisplay(args: {
  hasRequestedMarker: boolean;
  partsTotal: number;
  holdReason?: string | null;
}): { heading: string; detail: string } | null {
  if (!args.hasRequestedMarker) return null;
  const status = String(args.holdReason ?? "").toLowerCase().includes("backorder") ? "Backordered" : "Requested";
  const estimate = args.partsTotal > 0
    ? ` · ${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(args.partsTotal)} est.`
    : "";
  return {
    heading: status === "Backordered" ? "Parts Waiting" : "Parts Requested",
    detail: `Parts ${status.toLowerCase()}${estimate}`,
  };
}
