import type { TimeRange } from "./getShopStats";

export type TechLeaderboardRow = {
  techId: string;
  name: string;
  role: string | null;

  jobs: number;
  revenue: number;
  laborCost: number;
  profit: number;

  billedHours: number;
  clockedHours: number;
  flaggedHours: number;
  actualJobHours: number;
  attendanceHours: number;
  revenuePerHour: number;
  efficiencyPct: number;
  productivityPct: number;
  overallPerformancePct: number;
};

export type TechLeaderboardResult = {
  shop_id: string;
  start: string;
  end: string;
  rows: TechLeaderboardRow[];
};

/**
 * Normalize role strings so "Technician", "tech", "Lead Tech", etc all match.
 */
export function isTechRole(role: string | null): boolean {
  const r = (role ?? "").trim().toLowerCase();
  if (!r) return false;

  if (r === "tech" || r === "technician" || r === "mechanic") return true;
  if (r.includes("tech")) return true;
  if (r.includes("mechanic")) return true;

  return false;
}

export async function getTechLeaderboard(
  shopId: string,
  timeRange: TimeRange,
  technicianId?: string,
): Promise<TechLeaderboardResult> {
  const res = await fetch("/api/stats/tech-leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ shopId, timeRange, technicianId }),
  });

  const json = (await res.json().catch(() => null)) as
    | (Partial<TechLeaderboardResult> & { error?: string })
    | null;

  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to load tech leaderboard (${res.status})`);
  }

  return {
    shop_id: String(json?.shop_id ?? shopId),
    start: String(json?.start ?? ""),
    end: String(json?.end ?? ""),
    rows: Array.isArray(json?.rows) ? json.rows : [],
  };
}
