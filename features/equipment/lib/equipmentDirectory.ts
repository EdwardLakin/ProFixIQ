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
  currentCycles: number | null;
  customerName: string | null;
  siteName: string | null;
  operatingStatus: AssetOperatingStatus;
  /** Inspection findings recorded against the asset (same source as the vehicle workspace). */
  openDefects: { total: number; failed: number };
  pm: { state: EquipmentPmState; dueCount: number };
  lastServiceAt: string | null;
  nextService: { startsAt: string; status: string } | null;
  activeWorkOrder: { title: string; status: string; href: string } | null;
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
