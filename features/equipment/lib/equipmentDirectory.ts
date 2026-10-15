import type {
  AssetOperatingStatus,
  AssetPrimaryMeter,
} from "@/features/equipment/lib/assetProfile";

/** Roles that may browse the shop-wide Equipment directory. Assigned-work-only
 * roles (mechanics) reach individual assets through their work orders. */
export const EQUIPMENT_DIRECTORY_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "lead_hand",
  "foreman",
] as const;

export type EquipmentPmState = "overdue" | "due" | "ok" | "not_evaluated";
export type EquipmentInspectionState = "none" | "clear" | "findings";

export const EQUIPMENT_INSPECTION_STATE_LABELS: Record<EquipmentInspectionState, string> = {
  none: "No inspection",
  clear: "No findings",
  findings: "Findings",
};

/** True when the machine needs a manager's attention: PM overdue/due, down, failed findings. */
export function equipmentNeedsAttention(row: {
  pm: { state: EquipmentPmState };
  operatingStatus: AssetOperatingStatus;
  openDefects: { failed: number };
}): boolean {
  return (
    row.pm.state === "overdue" ||
    row.pm.state === "due" ||
    row.operatingStatus === "down" ||
    row.operatingStatus === "out_of_service" ||
    row.openDefects.failed > 0
  );
}

export type EquipmentDirectoryRow = {
  assetId: string;
  href: string;
  unitNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  equipmentClass: string;
  equipmentClassLabel: string;
  serialNumber: string | null;
  primaryMeter: AssetPrimaryMeter;
  engineHours: number | null;
  odometer: string | null;
  odometerUnit: string | null;
  currentCycles: number | null;
  customerId: string | null;
  customerName: string | null;
  siteName: string | null;
  operatingStatus: AssetOperatingStatus;
  /** Findings on the latest completed canonical inspection (the asset's current recorded condition). */
  openDefects: { total: number; failed: number };
  pm: { state: EquipmentPmState; dueCount: number };
  /** Canonical work orders (and active estimates) that are not yet closed out. */
  openWorkOrderCount: number;
  /** Latest completed canonical inspection: none recorded, clean, or carrying findings. */
  inspection: { state: EquipmentInspectionState; recordedAt: string | null };
  /** Role-gated shortcuts into the canonical flows; null/false hides the action. */
  actions: {
    createWorkOrderHref: string | null;
    /** Opens the asset's meter panel, where the canonical reading API is called. */
    recordMeterHref: string | null;
  };
  lastServiceAt: string | null;
  nextService: { startsAt: string; status: string } | null;
  /** href is null when the viewer's role may not open the record. */
  activeWorkOrder: { title: string; status: string; href: string | null } | null;
  mountedOnAssetId: string | null;
};

export type EquipmentDirectory = {
  rows: EquipmentDirectoryRow[];
  /** True when the shop has more Equipment assets than one page shows. */
  truncated: boolean;
};

export const EQUIPMENT_PM_STATE_LABELS: Record<EquipmentPmState, string> = {
  overdue: "Overdue",
  due: "Due",
  ok: "Up to date",
  not_evaluated: "Not evaluated",
};

export function equipmentAssetTitle(row: {
  unitNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}): string {
  const machine = [row.year, row.make, row.model].filter(Boolean).join(" ");
  if (row.unitNumber && machine) return `Unit ${row.unitNumber} · ${machine}`;
  if (row.unitNumber) return `Unit ${row.unitNumber}`;
  return machine || "Unnamed asset";
}
