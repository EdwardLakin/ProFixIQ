import type { Database } from "@shared/types/types/supabase";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "role">;

export function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function resolvePrimaryTechDisplay(
  line: Pick<WorkOrderLine, "assigned_tech_id">,
  profile: Profile | null | undefined,
): string {
  if (!line.assigned_tech_id) return "Unassigned";
  const role = String(profile?.role ?? "").toLowerCase();
  if (profile?.full_name && ["tech", "lead_tech", "leadtech", "foreman", "lead_hand"].includes(role)) {
    return profile.full_name;
  }
  return "Unassigned";
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
