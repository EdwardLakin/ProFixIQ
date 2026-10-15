import { ASSET_OPERATING_STATUSES, type AssetOperatingStatus } from "@/features/equipment/lib/assetProfile";
import {
  equipmentAssetTitle,
  equipmentNeedsAttention,
  type EquipmentDirectoryRow,
  type EquipmentPmState,
} from "@/features/equipment/lib/equipmentDirectory";

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
  /** Assets by their latest completed inspection. `failed` is a subset of `findings`. */
  inspection: { none: number; clear: number; findings: number; failed: number };
  openWork: { assets: number; orders: number };
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

/** Why a machine needs attention, most urgent first, with a sortable score. */
export function equipmentAttentionReasons(
  row: Pick<EquipmentDirectoryRow, "pm" | "operatingStatus" | "openDefects">,
): { reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 0;
  if (row.operatingStatus === "down" || row.operatingStatus === "out_of_service") {
    reasons.push(row.operatingStatus === "down" ? "Down" : "Out of service");
    score += 40;
  }
  if (row.pm.state === "overdue") {
    reasons.push("PM overdue");
    score += 30;
  } else if (row.pm.state === "due") {
    reasons.push("PM due");
    score += 10;
  }
  if (row.openDefects.failed > 0) {
    reasons.push(`${row.openDefects.failed} failed finding${row.openDefects.failed === 1 ? "" : "s"}`);
    score += 30;
  }
  return { reasons, score };
}

/** Fold a batch of directory rows into the summary (mutates and returns it). */
export function accumulateFleetSummary(
  summary: EquipmentFleetSummary,
  rows: EquipmentDirectoryRow[],
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
    if (Number.isFinite(nextVisit) && nextVisit >= now.getTime() && nextVisit <= horizon) {
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
