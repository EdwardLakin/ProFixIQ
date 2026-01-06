// features/integrations/ai/shopBoost/healthScoring.ts
import { randomUUID } from "crypto";
import type { JobClassificationResult } from "./classifyJobTypeScope";
import type {
  ShopHealthTopRepair,
  ShopHealthComebackRisk,
  ShopHealthFleetMetric,
  ShopHealthMenuSuggestion,
  ShopHealthInspectionSuggestion,
} from "@/features/integrations/ai/shopBoostType";

export type ShopHealthScoringInput = {
  shopId: string;
  intakeId: string;
  questionnaire: unknown;
  customersRows: Record<string, unknown>[];
  vehiclesRows: Record<string, unknown>[];
  partsRows: Record<string, unknown>[];
  classifiedLines: JobClassificationResult[];
};

type StaffRole = "owner" | "service_advisor" | "tech";

type StaffInvite = {
  role: StaffRole;
  email?: string | null;
  notes?: string | null;
};

type SuggestionsBlock = {
  menuItems: Array<
    ShopHealthMenuSuggestion & {
      confidence: number;
      reason?: string | null;
      category?: string | null;
    }
  >;
  inspections: Array<ShopHealthInspectionSuggestion & { confidence: number }>;
  staffInvites: StaffInvite[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getBool(obj: unknown, key: string): boolean {
  if (!isRecord(obj)) return false;
  const v = obj[key];
  return v === true || v === "true" || v === 1 || v === "1";
}

export function computeShopHealthScores(input: ShopHealthScoringInput): {
  periodStart: string | null;
  periodEnd: string | null;
  timeRangeDescription: string;
  kpis: { totalRepairOrders: number; totalRevenue: number; averageRo: number };
  mostCommonRepairs: ShopHealthTopRepair[];
  highValueRepairs: ShopHealthTopRepair[];
  comebackRisks: ShopHealthComebackRisk[];
  fleetMetrics: ShopHealthFleetMetric[];
  metrics: Record<string, unknown>;
  scores: Record<string, unknown>;
  suggestions: SuggestionsBlock;
  narrativeSummary: string;
} {
  const { customersRows, vehiclesRows, partsRows, classifiedLines } = input;

  // ---- Period inference from occurredAt
  const dates = classifiedLines
    .map((x) => (x.occurredAt ? new Date(x.occurredAt).getTime() : null))
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
    .sort((a, b) => a - b);

  const periodStart = dates.length ? new Date(dates[0]).toISOString() : null;
  const periodEnd = dates.length ? new Date(dates[dates.length - 1]).toISOString() : null;

  const timeRangeDescription =
    periodStart && periodEnd
      ? `${new Date(periodStart).toLocaleDateString()} – ${new Date(
          periodEnd,
        ).toLocaleDateString()}`
      : "Recent history";

  // ---- Revenue totals (from totals.total)
  const totals = classifiedLines
    .map((x) => x.totals.total ?? 0)
    .filter((n) => typeof n === "number" && Number.isFinite(n));
  const totalRevenue = round2(totals.reduce((a, b) => a + b, 0));
  const totalRepairOrders = Math.max(vehiclesRows.length, classifiedLines.length);
  const averageRo = totalRepairOrders > 0 ? round2(totalRevenue / totalRepairOrders) : 0;

  // ---- Top repairs by count & revenue
  const byType = new Map<
    string,
    {
      label: string;
      count: number;
      revenue: number;
      laborHoursSum: number;
      laborHoursN: number;
    }
  >();

  for (const line of classifiedLines) {
    const key = line.jobType || "general";
    const label = prettyType(key);
    const rev = line.totals.total ?? 0;
    const hrs = line.totals.laborHours;

    const cur =
      byType.get(key) ?? {
        label,
        count: 0,
        revenue: 0,
        laborHoursSum: 0,
        laborHoursN: 0,
      };

    cur.count += 1;
    cur.revenue += typeof rev === "number" && Number.isFinite(rev) ? rev : 0;

    if (typeof hrs === "number" && Number.isFinite(hrs)) {
      cur.laborHoursSum += hrs;
      cur.laborHoursN += 1;
    }

    byType.set(key, cur);
  }

  const mostCommonRepairs: ShopHealthTopRepair[] = [...byType.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((x) => ({
      label: x.label,
      count: x.count,
      revenue: round2(x.revenue),
      averageLaborHours: x.laborHoursN ? round2(x.laborHoursSum / x.laborHoursN) : null,
    }));

  const highValueRepairs: ShopHealthTopRepair[] = [...byType.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)
    .map((x) => ({
      label: x.label,
      count: x.count,
      revenue: round2(x.revenue),
      averageLaborHours: x.laborHoursN ? round2(x.laborHoursSum / x.laborHoursN) : null,
    }));

  // ---- Comeback risk heuristic
  const comebackRisks: ShopHealthComebackRisk[] = [];
  const lowConf = classifiedLines.filter((x) => x.confidence < 0.65).length;

  if (lowConf > 0) {
    comebackRisks.push({
      label: "Unclear / misc descriptions (classification confidence)",
      count: lowConf,
      estimatedLostHours: round2(lowConf * 0.6),
      note: "Many lines are vague (ex: “misc”, “repair”). Better job notes improves accuracy.",
    });
  }

  // ---- Fleet metrics (simple signals today)
  const hasFleetFlag = getBool(input.questionnaire, "hasFleets");

  const fleetMetrics: ShopHealthFleetMetric[] = [
    {
      label: "Imports received",
      value: customersRows.length + vehiclesRows.length + partsRows.length,
      unit: "rows",
      note: hasFleetFlag ? "Fleet mode enabled in questionnaire" : null,
    },
  ];

  // ---- Component scoring (0-100)
  const completenessScore = scoreCompleteness(customersRows, vehiclesRows, partsRows);
  const classificationScore = scoreClassification(classifiedLines);
  const volumeScore = scoreVolume(totalRepairOrders);

  const overall = round0(
    completenessScore * 0.30 + classificationScore * 0.35 + volumeScore * 0.35,
  );

  const scores = {
    overall,
    status: overall >= 80 ? "green" : overall >= 60 ? "yellow" : "red",
    components: {
      completeness: { score: completenessScore, status: bucket(completenessScore) },
      classification: { score: classificationScore, status: bucket(classificationScore) },
      historyVolume: { score: volumeScore, status: bucket(volumeScore) },
    },
  };

  const metrics = {
    totals: { totalRepairOrders, totalRevenue, averageRo },
    import: {
      customersRows: customersRows.length,
      vehiclesRows: vehiclesRows.length,
      partsRows: partsRows.length,
    },
    classification: {
      totalLines: classifiedLines.length,
      lowConfidenceLines: lowConf,
      uniqueJobTypes: byType.size,
    },
  };

  const suggestions = buildSuggestions({
    mostCommonRepairs,
    averageRo,
    hasFleetFlag,
    totalRepairOrders,
  });

  const narrativeSummary = buildNarrative({
    overall,
    totalRevenue,
    averageRo,
    totalRepairOrders,
    top: mostCommonRepairs,
    high: highValueRepairs,
  });

  return {
    periodStart,
    periodEnd,
    timeRangeDescription,
    kpis: { totalRepairOrders, totalRevenue, averageRo },
    mostCommonRepairs,
    highValueRepairs,
    comebackRisks,
    fleetMetrics,
    metrics,
    scores,
    suggestions,
    narrativeSummary,
  };
}

/* --------------------- scoring helpers --------------------- */

function scoreCompleteness(
  customers: Record<string, unknown>[],
  vehicles: Record<string, unknown>[],
  parts: Record<string, unknown>[],
): number {
  // rough: presence + volume
  let s = 0;
  if (customers.length > 0) s += 35;
  if (vehicles.length > 0) s += 45;
  if (parts.length > 0) s += 20;
  // tiny boost for “enough” volume
  if (vehicles.length >= 50) s += 5;
  if (customers.length >= 25) s += 5;
  return clamp0_100(s);
}

function scoreClassification(lines: JobClassificationResult[]): number {
  if (!lines.length) return 0;
  const avg = lines.reduce((a, b) => a + b.confidence, 0) / lines.length;
  // map 0.5..0.95 => 40..100
  const scaled = 40 + (avg - 0.5) * (60 / 0.45);
  return clamp0_100(round0(scaled));
}

function scoreVolume(totalRos: number): number {
  if (totalRos <= 0) return 0;
  if (totalRos >= 150) return 100;
  if (totalRos >= 100) return 90;
  if (totalRos >= 60) return 75;
  if (totalRos >= 30) return 55;
  return 40;
}

function bucket(score: number): "green" | "yellow" | "red" {
  return score >= 80 ? "green" : score >= 60 ? "yellow" : "red";
}

/* --------------------- suggestions --------------------- */

function buildSuggestions(args: {
  mostCommonRepairs: ShopHealthTopRepair[];
  averageRo: number;
  hasFleetFlag: boolean;
  totalRepairOrders: number;
}): SuggestionsBlock {
  const { mostCommonRepairs, averageRo, hasFleetFlag, totalRepairOrders } = args;

  const menuItems: SuggestionsBlock["menuItems"] = mostCommonRepairs.slice(0, 5).map((r) => {
    const id = randomUUID();
    const basePrice = Math.max(95, Math.round((averageRo * 0.18) / 5) * 5);
    const conf = Math.min(0.92, 0.55 + r.count / Math.max(40, totalRepairOrders));
    return {
      id,
      name: `${r.label} Package`,
      description: `Pre-built service package based on your most common repair volume.`,
      targetVehicleYmm: null,
      estimatedLaborHours: r.averageLaborHours ?? 1.2,
      recommendedPrice: basePrice,
      basedOnJobs: [r.label],
      confidence: round2(conf),
      reason: `High repeat volume (${r.count} occurrences) and consistent revenue driver.`,
      category: "auto-generated",
    };
  });

  const inspections: SuggestionsBlock["inspections"] = [
    {
      id: randomUUID(),
      name: hasFleetFlag ? "Fleet PM + DOT Walkaround" : "Retail Multi-Point Inspection",
      usageContext: hasFleetFlag ? "fleet" : "retail",
      note: "Auto-generated from observed job mix and intake questionnaire.",
      confidence: 0.85,
    },
    {
      id: randomUUID(),
      name: "Brake & Tire Safety Check",
      usageContext: hasFleetFlag ? "mixed" : "retail",
      note: "Ties to common brake/tire categories and comeback reduction.",
      confidence: 0.78,
    },
  ];

  const staffInvites: SuggestionsBlock["staffInvites"] = [
    {
      role: "service_advisor",
      email: null,
      notes: "Invite your service advisor to approve work and send estimates.",
    },
    {
      role: "tech",
      email: null,
      notes: "Invite your lead technician to start punch time + job tracking.",
    },
  ];

  return { menuItems, inspections, staffInvites };
}

/* --------------------- narrative --------------------- */

function buildNarrative(args: {
  overall: number;
  totalRevenue: number;
  averageRo: number;
  totalRepairOrders: number;
  top: ShopHealthTopRepair[];
  high: ShopHealthTopRepair[];
}): string {
  const { overall, totalRevenue, averageRo, totalRepairOrders, top, high } = args;

  const topLine = top[0]?.label
    ? `Your most common work is **${top[0].label}**.`
    : "We identified your most common job categories.";

  const hvLine = high[0]?.label
    ? `Your highest revenue category is **${high[0].label}**.`
    : "We identified your top revenue categories.";

  return [
    `Overall Shop Health Score: **${overall}/100**`,
    `Based on ${totalRepairOrders} repair-order rows and an estimated total revenue of **$${totalRevenue.toLocaleString()}** (avg RO **$${averageRo.toLocaleString()}**).`,
    topLine,
    hvLine,
    `Next step: use the suggested menus/inspections to standardize quoting and reduce “misc” lines — that improves accuracy and speeds onboarding.`,
  ].join("\n\n");
}

/* --------------------- formatting --------------------- */

function prettyType(t: string): string {
  const map: Record<string, string> = {
    aftertreatment: "Aftertreatment / DPF",
    brakes: "Brakes",
    driveline: "Driveline",
    maintenance: "Maintenance / PM",
    tires: "Tires / Alignment",
    suspension: "Suspension / Steering",
    electrical: "Electrical",
    cooling: "Cooling System",
    hvac: "HVAC / A/C",
    engine: "Engine",
    transmission: "Transmission / Clutch",
    inspection: "Inspections",
    general: "General Repair",
  };
  return map[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function clamp0_100(n: number) {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round0(n: number) {
  return Math.round(n);
}