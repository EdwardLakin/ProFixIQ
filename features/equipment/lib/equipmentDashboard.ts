import { ASSET_OPERATING_STATUSES, type AssetOperatingStatus } from "@/features/equipment/lib/assetProfile";
import {
  equipmentAssetTitle,
  equipmentNeedsAttention,
  type EquipmentDirectoryRow,
  type EquipmentPmState,
} from "@/features/equipment/lib/equipmentDirectory";

/**
 * The per-asset signals the dashboard folds. A directory row satisfies this
 * structurally, which is how the tests prove both read the same values.
 */
export type FleetSignalRow = Pick<
  EquipmentDirectoryRow,
  | "assetId"
  | "href"
  | "unitNumber"
  | "year"
  | "make"
  | "model"
  | "operatingStatus"
  | "openDefects"
  | "inspection"
  | "openWorkOrderCount"
  | "nextService"
> & { pm: { state: EquipmentPmState } };

/** Assets listed under "Needs attention". */
export const DASHBOARD_ATTENTION_LIMIT = 10;
/** A scheduled visit within this many days counts as upcoming. */
export const DASHBOARD_UPCOMING_DAYS = 7;

export type DashboardAttentionItem = {
  assetId: string;
  href: string;
  title: string;
  reasons: string[];
  score: number;
};

/**
 * Shop-wide counts folded from the same directory rows `/equipment` shows, so
 * the dashboard can never disagree with the list. Built by `accumulate`
 * one batch of rows at a time, so it never needs every row in memory.
 */
export type EquipmentFleetSummary = {
  /** Assets the caller can see and that were counted. */
  total: number;
  /** True when the shop has more assets than the scan limit covered. */
  partial: boolean;
  status: Record<AssetOperatingStatus, number>;
  pm: Record<EquipmentPmState, number>;
  /** Assets by their latest completed inspection. `failed` counts assets with a failed finding (a subset of `findings`). */
  inspection: { none: number; clear: number; findings: number; failed: number };
  openWork: { assets: number; orders: number };
  /** Assets with a visit in progress or starting within the next few days. */
  upcomingService: number;
  needsAttention: number;
  attention: DashboardAttentionItem[];
};

export function emptyFleetSummary(): EquipmentFleetSummary {
  return {
    total: 0,
    partial: false,
    status: Object.fromEntries(ASSET_OPERATING_STATUSES.map((status) => [status, 0])) as Record<
      AssetOperatingStatus,
      number
    >,
    pm: { overdue: 0, due: 0, ok: 0, not_evaluated: 0 },
    inspection: { none: 0, clear: 0, findings: 0, failed: 0 },
    openWork: { assets: 0, orders: 0 },
    upcomingService: 0,
    needsAttention: 0,
    attention: [],
  };
}

/**
 * Why a machine needs attention, most urgent first. `score` is a severity
 * tuple packed into one number (down, then PM overdue, then failed findings,
 * then PM due), so a lower condition can never outrank a higher one.
 */
export function equipmentAttentionReasons(
  row: Pick<FleetSignalRow, "pm" | "operatingStatus" | "openDefects">,
): { reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 0;
  if (row.operatingStatus === "down" || row.operatingStatus === "out_of_service") {
    reasons.push(row.operatingStatus === "down" ? "Down" : "Out of service");
    score += 1000;
  }
  if (row.pm.state === "overdue") {
    reasons.push("PM overdue");
    score += 100;
  }
  if (row.openDefects.failed > 0) {
    reasons.push(`${row.openDefects.failed} failed finding${row.openDefects.failed === 1 ? "" : "s"}`);
    score += 10;
  }
  if (row.pm.state === "due") {
    reasons.push("PM due");
    score += 1;
  }
  return { reasons, score };
}

/** Fold a batch of asset signal rows into the summary (mutates and returns it). */
export function accumulateFleetSummary(
  summary: EquipmentFleetSummary,
  rows: FleetSignalRow[],
  now: Date = new Date(),
): EquipmentFleetSummary {
  const horizon = now.getTime() + DASHBOARD_UPCOMING_DAYS * 24 * 60 * 60 * 1000;
  for (const row of rows) {
    summary.total += 1;
    summary.status[row.operatingStatus] += 1;
    summary.pm[row.pm.state] += 1;
    summary.inspection[row.inspection.state] += 1;
    if (row.openDefects.failed > 0) summary.inspection.failed += 1;
    if (row.openWorkOrderCount > 0) {
      summary.openWork.assets += 1;
      summary.openWork.orders += row.openWorkOrderCount;
    }
    const nextVisit = row.nextService ? Date.parse(row.nextService.startsAt) : NaN;
    // The booking read keeps only visits that have not ended, so a start in the
    // past is a visit in progress, which counts.
    if (Number.isFinite(nextVisit) && nextVisit <= horizon) {
      summary.upcomingService += 1;
    }
    if (!equipmentNeedsAttention(row)) continue;
    summary.needsAttention += 1;
    const { reasons, score } = equipmentAttentionReasons(row);
    summary.attention.push({
      assetId: row.assetId,
      href: row.href,
      title: equipmentAssetTitle(row),
      reasons,
      score,
    });
  }
  // Keep only the top few so a large shop never holds every flagged row.
  summary.attention.sort((a, b) => b.score - a.score);
  summary.attention.length = Math.min(summary.attention.length, DASHBOARD_ATTENTION_LIMIT);
  return summary;
}
