// /features/integrations/ai/shopBoost/healthScoring.ts
import { randomUUID } from "crypto";
import type { JobClassificationResult } from "./classifyJobTypeScope";
import type {
  ShopHealthTopRepair,
  ShopHealthComebackRisk,
  ShopHealthFleetMetric,
  ShopHealthMenuSuggestion,
  ShopHealthInspectionSuggestion,
  ShopHealthTopTech,
  ShopHealthIssue,
  ShopHealthIssueSeverity,
  ShopHealthRecommendation,
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

type ShopHealthScoresResult = {
  periodStart: string | null;
  periodEnd: string | null;
  timeRangeDescription: string;

  kpis: { totalRepairOrders: number; totalRevenue: number; averageRo: number };

  mostCommonRepairs: ShopHealthTopRepair[];
  highValueRepairs: ShopHealthTopRepair[];

  comebackRisks: ShopHealthComebackRisk[];
  fleetMetrics: ShopHealthFleetMetric[];

  // ✅ NEW (required by ShopHealthSnapshot)
  topTechs: ShopHealthTopTech[];
  issuesDetected: ShopHealthIssue[];
  recommendations: ShopHealthRecommendation[];

  metrics: Record<string, unknown>;
  scores: Record<string, unknown>;
  suggestions: SuggestionsBlock;

  narrativeSummary: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getBool(obj: unknown, key: string): boolean {
  if (!isRecord(obj)) return false;
  const v = obj[key];
  return v === true || v === "true" || v === 1 || v === "1";
}

function normName(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  // normalize whitespace + strip double spaces
  return s.replace(/\s+/g, " ");
}

function severityRank(s: ShopHealthIssueSeverity): number {
  if (s === "high") return 3;
  if (s === "medium") return 2;
  return 1;
}

export function computeShopHealthScores(input: ShopHealthScoringInput): ShopHealthScoresResult {
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
      ? `${new Date(periodStart).toLocaleDateString()} – ${new Date(periodEnd).toLocaleDateString()}`
      : "Recent history";

  // ---- Revenue totals (from totals.total)
  const totals = classifiedLines
    .map((x) => x.totals.total ?? 0)
    .filter((n) => typeof n === "number" && Number.isFinite(n));
  const totalRevenue = round2(totals.reduce((a, b) => a + b, 0));

  // IMPORTANT: vehiclesRows may be "RO history rows"
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

  // ---- Comeback risk heuristic (today: low classification confidence proxy)
  const comebackRisks: ShopHealthComebackRisk[] = [];
  const lowConf = classifiedLines.filter((x) => x.confidence < 0.65).length;

  if (lowConf > 0) {
    comebackRisks.push({
      label: "Unclear / misc descriptions (low classification confidence)",
      count: lowConf,
      estimatedLostHours: round2(lowConf * 0.6),
      note: "Many lines are vague (ex: “misc”, “repair”). Better job notes improves reporting and AI accuracy.",
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

  // ✅ NEW: Top Techs aggregation (from classifiedLines techName + totals)
  const topTechs = deriveTopTechsFromClassifiedLines(classifiedLines);

  // ✅ NEW: Issues detected (comebacks proxy, low ARO, bay imbalance)
  const issuesDetected = detectIssues({
    totalRepairOrders,
    averageRo,
    lowConfLines: lowConf,
    topTechs,
  });

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
    tech: {
      topTechs,
    },
    issuesDetected,
  };

  const suggestions = buildSuggestions({
    mostCommonRepairs,
    averageRo,
    hasFleetFlag,
    totalRepairOrders,
  });

  // ✅ NEW: Recommendations tied to menus + inspections + operations
  const recommendations = buildRecommendations({
    issuesDetected,
    suggestions,
    averageRo,
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

    // ✅ NEW required fields
    topTechs,
    issuesDetected,
    recommendations,

    metrics,
    scores,
    suggestions,
    narrativeSummary,
  };
}

/* -------------------------------------------------------------------------- */
/* NEW: tech aggregation                                                       */
/* -------------------------------------------------------------------------- */

function deriveTopTechsFromClassifiedLines(lines: JobClassificationResult[]): ShopHealthTopTech[] {
  const byName = new Map<
    string,
    {
      name: string;
      jobs: number;
      revenue: number;
      clockedHours: number;
    }
  >();

  for (const line of lines) {
    const name = normName((line as unknown as { techName?: unknown }).techName);
    if (!name) continue;

    const rev = typeof line.totals.total === "number" && Number.isFinite(line.totals.total) ? line.totals.total : 0;
    const hrs =
      typeof line.totals.laborHours === "number" && Number.isFinite(line.totals.laborHours)
        ? line.totals.laborHours
        : 0;

    const cur = byName.get(name) ?? { name, jobs: 0, revenue: 0, clockedHours: 0 };
    cur.jobs += 1;
    cur.revenue += rev;
    cur.clockedHours += hrs; // proxy: billed/estimated labor hours (not true punches)
    byName.set(name, cur);
  }

  const rows: ShopHealthTopTech[] = Array.from(byName.values())
    .map((t) => ({
      techId: t.name, // we don't have ids from CSV; use stable string (or leave empty)
      name: t.name,
      role: "tech",
      jobs: t.jobs,
      revenue: round2(t.revenue),
      clockedHours: round2(t.clockedHours),
      revenuePerHour: t.clockedHours > 0 ? round2(t.revenue / t.clockedHours) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return rows;
}

/* -------------------------------------------------------------------------- */
/* NEW: issues + recommendations                                                */
/* -------------------------------------------------------------------------- */

function detectIssues(args: {
  totalRepairOrders: number;
  averageRo: number;
  lowConfLines: number;
  topTechs: ShopHealthTopTech[];
}): ShopHealthIssue[] {
  const { totalRepairOrders, averageRo, lowConfLines, topTechs } = args;

  const issues: ShopHealthIssue[] = [];

  // 1) Comebacks proxy: lots of low-confidence lines means messy writeups
  if (lowConfLines >= 20) {
    issues.push({
      key: "comebacks",
      title: "Job notes are too vague (risk of repeat work / poor reporting)",
      severity: "medium",
      detail:
        "A large portion of rows have unclear descriptions (ex: “misc”, “repair”). This usually correlates with comebacks, missed upsells, and poor accountability.",
      evidence: `${lowConfLines} low-confidence rows detected`,
    });
  } else if (lowConfLines >= 8) {
    issues.push({
      key: "comebacks",
      title: "Some job notes are vague",
      severity: "low",
      detail:
        "Several lines are hard to classify because the description is too generic. Cleaner writeups improve analytics and AI suggestions.",
      evidence: `${lowConfLines} low-confidence rows detected`,
    });
  }

  // 2) Low ARO heuristic: thresholding (tune later)
  // Use a conservative default if volume exists
  if (totalRepairOrders >= 20) {
    const lowAroThreshold = 420; // adjust per market later (CAD/USD)
    if (averageRo > 0 && averageRo < lowAroThreshold) {
      issues.push({
        key: "low_aro",
        title: "Average RO looks low (missed packaging / inspections)",
        severity: averageRo < 300 ? "high" : "medium",
        detail:
          "Your average repair order value is below what we typically see for shops with consistent inspections + service packages. Packaging common work into menus and running MPI/PM checks can raise RO safely.",
        evidence: `Avg RO ≈ $${Math.round(averageRo).toLocaleString()}`,
      });
    }
  }

  // 3) Bay imbalance: one tech doing most of the work (proxy via job share)
  // We only have topTechs counts, not full staff list; still useful.
  const top = topTechs[0];
  const totalTopJobs = topTechs.reduce((s, t) => s + (t.jobs || 0), 0);
  if (top && totalTopJobs >= 25) {
    const share = totalTopJobs > 0 ? top.jobs / totalTopJobs : 0;
    if (share >= 0.55) {
      issues.push({
        key: "bay_imbalance",
        title: "Work may be imbalanced across bays",
        severity: share >= 0.7 ? "high" : "medium",
        detail:
          "One tech appears to carry a large share of the work. That can create bottlenecks, longer cycle times, and uneven quality. Dispatch rules + clearer job splitting can help.",
        evidence: `${top.name} ≈ ${Math.round(share * 100)}% of attributed jobs`,
      });
    }
  }

  // Sort high→low severity for cleaner UI
  issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return issues.slice(0, 6);
}

function buildRecommendations(args: {
  issuesDetected: ShopHealthIssue[];
  suggestions: SuggestionsBlock;
  averageRo: number;
  totalRepairOrders: number;
}): ShopHealthRecommendation[] {
  const { issuesDetected, suggestions, averageRo, totalRepairOrders } = args;

  const recs: ShopHealthRecommendation[] = [];

  // Publish menus if we have menu suggestions
  if ((suggestions.menuItems ?? []).length > 0) {
    recs.push({
      key: "publish_menus",
      title: "Publish your top service menus (1-click upsell packages)",
      why: "Your history shows repeatable work categories. Menus standardize quoting and raise consistency.",
      actionSteps: [
        "Review the auto-generated menu packages",
        "Adjust pricing/labor to match your shop",
        "Publish to advisor + tech tablets",
      ],
      expectedImpact: totalRepairOrders >= 30 ? "Higher ARO + faster estimates" : null,
    });
  }

  // Publish inspections if we have inspection suggestions
  if ((suggestions.inspections ?? []).length > 0) {
    recs.push({
      key: "publish_inspections",
      title: "Standardize inspections for every visit",
      why: "Inspections catch safety/maintenance items early and reduce missed opportunities.",
      actionSteps: [
        "Enable the suggested inspection templates",
        "Require an inspection on check-in (or at least for first-time customers)",
        "Use fail-to-quote automation to build consistent estimates",
      ],
      expectedImpact: "More consistent work recommendations + better customer trust",
    });
  }

  // Issue-driven recs
  const hasComebacks = issuesDetected.some((i) => i.key === "comebacks");
  if (hasComebacks) {
    recs.push({
      key: "reduce_comebacks_qc",
      title: "Reduce comebacks with QC + better job notes",
      why: "Vague lines and inconsistent notes make repeat failures more likely and hurt reporting.",
      actionSteps: [
        "Add a required complaint/cause/correction structure for RO lines",
        "Enable end-of-job QC checklist for safety-related work",
        "Use advisor review before invoice close-out",
      ],
      expectedImpact: "Lower redo work + cleaner analytics",
    });
  }

  const lowAro = issuesDetected.find((i) => i.key === "low_aro");
  if (lowAro) {
    recs.push({
      key: "raise_aro_packages",
      title: "Raise ARO by bundling common work into packages",
      why: `Avg RO is currently around $${Math.round(averageRo).toLocaleString()}. Packaging repeat work reduces “one-off” quoting and increases approval rate.`,
      actionSteps: [
        "Bundle the top 3 repeat repairs into fixed-price packages",
        "Attach the correct inspection to each package",
        "Auto-suggest packages when matching job types appear",
      ],
      expectedImpact: "Higher approvals + safer maintenance compliance",
    });
  }

  const imbalance = issuesDetected.find((i) => i.key === "bay_imbalance");
  if (imbalance) {
    recs.push({
      key: "dispatch_balance",
      title: "Balance dispatch across bays to reduce bottlenecks",
      why: "If one bay is overloaded, cycle times increase and quality can drop.",
      actionSteps: [
        "Use a dispatcher view with WIP limits per tech",
        "Split jobs into clear sub-lines (brakes, diag, parts, road test)",
        "Track clocked vs billed hours per tech to identify blockers",
      ],
      expectedImpact: "Faster throughput + more predictable delivery times",
    });
  }

  // de-dupe by key
  const seen = new Set<string>();
  const out: ShopHealthRecommendation[] = [];
  for (const r of recs) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    out.push(r);
  }

  return out.slice(0, 6);
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
    `Next step: publish the suggested menus/inspections to standardize quoting and reduce “misc” lines — that improves accuracy and speeds onboarding.`,
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