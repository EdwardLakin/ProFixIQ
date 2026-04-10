import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type {
  OptimizationEngineOutput,
  OptimizationGroup,
  OptimizationImpactLevel,
  OptimizationOpportunity,
} from "@/features/optimization/types";

type DB = Database;

type MenuItemSlim = Pick<
  DB["public"]["Tables"]["menu_items"]["Row"],
  "id" | "name" | "service_key" | "category" | "total_price" | "part_cost" | "labor_hours" | "labor_time" | "inspection_template_id"
>;
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type InspectionTemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];
type InspectionTemplateSuggestionRow =
  DB["public"]["Tables"]["inspection_template_suggestions"]["Row"];
type InspectionResultRow = DB["public"]["Tables"]["inspection_results"]["Row"];
type InspectionResultItemRow = DB["public"]["Tables"]["inspection_result_items"]["Row"];
type OptimizationActionRow = Pick<
  DB["public"]["Tables"]["optimization_actions"]["Row"],
  "opportunity_id" | "action" | "created_at" | "payload"
>;

type EngineInput = {
  supabase: SupabaseClient<DB>;
  shopId: string;
  lookbackDays?: number;
  limit?: number;
};

type LineWithOrder = Pick<
  WorkOrderLineRow,
  | "id"
  | "work_order_id"
  | "menu_item_id"
  | "service_code"
  | "description"
  | "price_estimate"
  | "labor_time"
  | "inspection_template_id"
  | "inspection_session_id"
  | "created_at"
  | "status"
> & {
  work_orders: Pick<DB["public"]["Tables"]["work_orders"]["Row"], "id" | "created_at" | "inspection_id"> | null;
};

const PRICE_MIN_SAMPLES = 6;
const LABOR_MIN_SAMPLES = 6;
const PART_MARKUP_MIN_SAMPLES = 5;
const DISMISS_SUPPRESSION_DAYS = 14;
const MATERIAL_CONFIDENCE_DELTA = 0.08;
const MATERIAL_IMPACT_DELTA = 120;
const MATERIAL_VOLUME_DELTA_RATIO = 0.2;

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(nums: number[], q: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function roundMoney(value: number): number {
  return Math.round(value * 20) / 20;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function familyFromText(input: string): string {
  const text = slugify(input);
  if (!text) return "general_service";

  const rules: Array<{ family: string; tokens: string[] }> = [
    { family: "brake_service", tokens: ["brake", "rotor", "pad", "caliper"] },
    { family: "pm_service", tokens: ["oil", "pm", "maintenance", "lube", "filter"] },
    { family: "tire_service", tokens: ["tire", "alignment", "rotate", "balance"] },
    { family: "battery_electrical", tokens: ["battery", "alternator", "starter", "electrical"] },
    { family: "cooling_system", tokens: ["coolant", "radiator", "thermostat", "cooling"] },
    { family: "suspension_steering", tokens: ["suspension", "strut", "shock", "tie rod", "steering"] },
  ];

  for (const rule of rules) {
    if (rule.tokens.some((token) => text.includes(token))) {
      return rule.family;
    }
  }

  return "general_service";
}

function inferImpactLevel(score: number): OptimizationImpactLevel {
  if (score >= 0.72) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function groupKey(line: LineWithOrder): string | null {
  if (line.menu_item_id) return `menu:${line.menu_item_id}`;
  const serviceCode = slugify(line.service_code ?? "");
  if (serviceCode.length >= 3) return `svc:${serviceCode}`;

  const desc = slugify(line.description ?? "");
  if (desc.length < 8) return null;
  const trimmed = desc.split(" ").slice(0, 5).join(" ");
  if (trimmed.length < 8) return null;
  return `desc:${trimmed}`;
}

function labelForGroup(line: LineWithOrder, menuById: Map<string, MenuItemSlim>): string {
  if (line.menu_item_id) {
    const menu = menuById.get(line.menu_item_id);
    if (menu?.name?.trim()) return menu.name.trim();
  }
  return line.service_code?.trim() || line.description?.trim() || "Service";
}

function normalizeFrequency(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  return clamp01(count / maxCount);
}

function countRecentBaselineFromLines(
  lines: LineWithOrder[],
  nowMs: number,
  recentDays: number,
  baselineDays: number,
): { recentCount: number; baselineCount: number; recentWindowDays: number; baselineWindowDays: number } {
  const recentMs = recentDays * 24 * 60 * 60 * 1000;
  const baselineMs = baselineDays * 24 * 60 * 60 * 1000;
  let recentCount = 0;
  let baselineCount = 0;

  for (const line of lines) {
    const createdMs = new Date(line.created_at ?? line.work_orders?.created_at ?? 0).getTime();
    if (!Number.isFinite(createdMs) || createdMs <= 0) continue;
    const age = nowMs - createdMs;
    if (age >= 0 && age <= recentMs) {
      recentCount += 1;
    } else if (age > recentMs && age <= recentMs + baselineMs) {
      baselineCount += 1;
    }
  }

  return { recentCount, baselineCount, recentWindowDays: recentDays, baselineWindowDays: baselineDays };
}

function classifyPriorityBand(score: number): OptimizationOpportunity["priorityBand"] {
  if (score >= 0.85) return "critical";
  if (score >= 0.65) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function impactWeight(impactLevel: OptimizationImpactLevel): number {
  if (impactLevel === "high") return 1;
  if (impactLevel === "medium") return 0.6;
  return 0.3;
}

function getOpportunityJobCount(opportunity: OptimizationOpportunity): number {
  const meta = opportunity.meta ?? {};
  return (
    toNum(meta.jobsAnalyzed) ??
    toNum(meta.jobs) ??
    toNum(meta.sourceFamilyCount) ??
    toNum(meta.flaggedFindings) ??
    0
  );
}

function getServiceGroupKey(opportunity: OptimizationOpportunity): string {
  const meta = opportunity.meta ?? {};
  const explicitGroup = typeof meta.serviceGroupKey === "string" ? meta.serviceGroupKey : null;
  if (explicitGroup) return explicitGroup;
  return opportunity.type;
}

function opportunityClusterKey(opportunity: OptimizationOpportunity): string {
  const serviceGroup = getServiceGroupKey(opportunity);
  return `${opportunity.type}:${serviceGroup}`;
}

function getMetaCount(opportunity: OptimizationOpportunity): number {
  return getOpportunityJobCount(opportunity);
}

function computeConfidenceLabel(opportunity: OptimizationOpportunity): string {
  const jobs = getMetaCount(opportunity);
  const strength = opportunity.confidence;
  if (jobs >= 24 && strength >= 0.78) {
    return `High confidence (based on ${jobs} jobs)`;
  }
  if (jobs >= 10 && strength >= 0.55) {
    return `Moderate confidence (based on ${jobs} jobs)`;
  }
  return "Low confidence (early signal)";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function computeImpactLabel(opportunity: OptimizationOpportunity): string {
  if (typeof opportunity.estimatedValue === "number" && opportunity.estimatedValue > 0) {
    return `+${formatCurrency(opportunity.estimatedValue)}/month potential`;
  }

  if (opportunity.type === "inspection_coverage_gap") {
    return "Reduce missed inspections";
  }

  if (opportunity.type === "pricing_normalization") {
    return "Improve consistency across technicians";
  }

  return "Increase captured recommended work";
}

function computeWhyNow(opportunity: OptimizationOpportunity): string | undefined {
  const meta = opportunity.meta ?? {};
  const recent = toNum(meta.recentCount) ?? 0;
  const baseline = toNum(meta.baselineCount) ?? 0;
  const recentDays = toNum(meta.recentWindowDays) ?? 0;
  const baselineDays = toNum(meta.baselineWindowDays) ?? 0;
  const isNewService = Boolean(meta.newServiceCluster);

  if (isNewService && recent >= 6) {
    return "Newly introduced service with inconsistent pricing";
  }

  if (recentDays > 0 && baselineDays > 0 && recent >= 5) {
    const recentRate = recent / recentDays;
    const baselineRate = baselineDays > 0 ? baseline / baselineDays : 0;
    if (baselineRate > 0 && recentRate >= baselineRate * 1.6) {
      return "Trending upward in last 30 days";
    }
    if (baselineRate === 0 && recent >= 6) {
      return "Recently increased in frequency";
    }
  }

  if (recent >= 10 && recentDays <= 10) {
    return `Repeated ${recent} times this week`;
  }

  return undefined;
}

function parseSnapshotFromPayload(payload: unknown): {
  confidence?: number;
  estimatedValue?: number;
  jobs?: number;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as { originalPayload?: unknown };
  const source = raw.originalPayload && typeof raw.originalPayload === "object" ? (raw.originalPayload as Record<string, unknown>) : null;
  if (!source) return null;
  return {
    confidence: toNum(source.confidence) ?? toNum((source.suggestionData as { confidence?: unknown } | undefined)?.confidence) ?? undefined,
    estimatedValue:
      toNum(source.estimatedValue) ??
      toNum((source.suggestionData as { estimatedValue?: unknown } | undefined)?.estimatedValue) ??
      undefined,
    jobs: toNum(source.jobsAnalyzed) ?? undefined,
  };
}

function filterOutStaleOpportunities(params: {
  opportunities: OptimizationOpportunity[];
  actions: OptimizationActionRow[];
}): OptimizationOpportunity[] {
  const parseOpportunityIdCluster = (id: string): string => {
    if (id.startsWith("pricing:")) {
      const parts = id.split(":");
      return `pricing_normalization:${parts[parts.length - 1] ?? id}`;
    }
    if (id.startsWith("inspection:")) {
      return `inspection_coverage_gap:${id.replace(/^inspection:/, "")}`;
    }
    if (id.startsWith("revenue:pair:")) {
      const [, , , a = "", b = ""] = id.split(":");
      return `missed_revenue:${[a, b].sort().join("__")}`;
    }
    if (id.startsWith("revenue:inspection-finding-gaps")) {
      return "missed_revenue:inspection_findings";
    }
    return id;
  };

  const nowMs = Date.now();
  const cutoffMs = nowMs - DISMISS_SUPPRESSION_DAYS * 24 * 60 * 60 * 1000;
  const byCluster = new Map<string, OptimizationActionRow>();
  const byOpportunity = new Map<string, OptimizationActionRow>();

  for (const action of params.actions) {
    const cluster = parseOpportunityIdCluster(action.opportunity_id);
    const existingCluster = byCluster.get(cluster);
    if (!existingCluster || new Date(action.created_at).getTime() > new Date(existingCluster.created_at).getTime()) {
      byCluster.set(cluster, action);
    }
    const existingId = byOpportunity.get(action.opportunity_id);
    if (!existingId || new Date(action.created_at).getTime() > new Date(existingId.created_at).getTime()) {
      byOpportunity.set(action.opportunity_id, action);
    }
  }

  return params.opportunities.filter((opportunity) => {
    const direct = byOpportunity.get(opportunity.id);
    const clusterAction = byCluster.get(opportunityClusterKey(opportunity));
    const latest = direct ?? clusterAction;
    if (!latest) return true;

    if (latest.action === "dismissed") {
      return new Date(latest.created_at).getTime() < cutoffMs;
    }

    if (latest.action !== "applied") return true;

    const snapshot = parseSnapshotFromPayload(latest.payload);
    if (!snapshot) return false;
    const currentJobs = getMetaCount(opportunity);
    const currentImpact = opportunity.estimatedValue ?? 0;
    const baselineJobs = snapshot.jobs ?? 0;
    const baselineImpact = snapshot.estimatedValue ?? 0;
    const baselineConfidence = snapshot.confidence ?? opportunity.confidence;

    const confidenceDelta = opportunity.confidence - baselineConfidence;
    const impactDelta = currentImpact - baselineImpact;
    const volumeDeltaRatio =
      baselineJobs > 0 ? (currentJobs - baselineJobs) / baselineJobs : currentJobs > 0 ? 1 : 0;

    return (
      confidenceDelta >= MATERIAL_CONFIDENCE_DELTA ||
      impactDelta >= MATERIAL_IMPACT_DELTA ||
      volumeDeltaRatio >= MATERIAL_VOLUME_DELTA_RATIO
    );
  });
}

function buildPriceNormalizationSignals(params: {
  lines: LineWithOrder[];
  menuById: Map<string, MenuItemSlim>;
  partsCostByLineId: Map<string, number>;
  nowMs: number;
}): OptimizationOpportunity[] {
  const { lines, menuById, partsCostByLineId, nowMs } = params;
  const grouped = new Map<string, LineWithOrder[]>();

  for (const line of lines) {
    const key = groupKey(line);
    if (!key) continue;
    const arr = grouped.get(key) ?? [];
    arr.push(line);
    grouped.set(key, arr);
  }

  const opportunities: OptimizationOpportunity[] = [];

  for (const [key, group] of grouped.entries()) {
    const priceValues = group
      .map((line) => toNum(line.price_estimate))
      .filter((v): v is number => v !== null && v > 0);

    if (priceValues.length < PRICE_MIN_SAMPLES) continue;

    const med = median(priceValues);
    const q1 = quantile(priceValues, 0.25);
    const q3 = quantile(priceValues, 0.75);
    const iqr = Math.max(0.01, q3 - q1);
    const lowerBand = med - Math.max(med * 0.15, iqr * 1.3);
    const upperBand = med + Math.max(med * 0.15, iqr * 1.3);
    const under = priceValues.filter((v) => v < lowerBand).length;
    const over = priceValues.filter((v) => v > upperBand).length;
    const variationRatio = med > 0 ? (q3 - q1) / med : 0;

    if (under + over < 2 && variationRatio < 0.22) continue;

    const lineSeed = group[0];
    const serviceLabel = labelForGroup(lineSeed, menuById);
    const trendCounts = countRecentBaselineFromLines(group, nowMs, 30, 30);
    const currentMenu = lineSeed.menu_item_id ? toNum(menuById.get(lineSeed.menu_item_id)?.total_price) : null;
    const confidence = clamp01(0.52 + Math.min(priceValues.length, 26) / 58 + Math.min(variationRatio, 0.5) * 0.4);

    opportunities.push({
      id: `pricing:${key}`,
      type: "pricing_normalization",
      title: `Normalize pricing for ${serviceLabel}`,
      summary:
        `${priceValues.length} historical jobs show meaningful price spread. ` +
        `Median is $${med.toFixed(2)} with ${under} underpriced and ${over} overpriced outliers.`,
      confidence,
      impactLevel: inferImpactLevel(confidence * Math.min(1, (under + over) / 5)),
      priorityScore: 0,
      priorityBand: "low",
      estimatedValue:
        under > 0
          ? roundMoney(
              priceValues
                .filter((v) => v < med)
                .reduce((sum, value) => sum + Math.max(0, med - value), 0) /
                Math.max(1, priceValues.length),
            )
          : undefined,
      reasoning: [
        `Observed across ${priceValues.length} jobs in this service cluster`,
        `Price variance is ${(variationRatio * 100).toFixed(0)}% around a median of $${med.toFixed(2)}`,
        `${under + over} outliers detected outside the expected pricing band`,
      ],
      sourceBasis: `Price clustering from ${priceValues.length} work-order lines with median $${med.toFixed(2)} and IQR $${iqr.toFixed(2)}.`,
      suggestedAction:
        `Review this cluster and set a standard target near $${roundMoney(med).toFixed(2)} ` +
        `(keep exceptions documented by severity/vehicle class).`,
      targetRefs: {
        menuItemId: lineSeed.menu_item_id ?? undefined,
      },
      meta: {
        jobsAnalyzed: priceValues.length,
        recommendedPrice: roundMoney(med),
        underpricedOutliers: under,
        overpricedOutliers: over,
        currentMenuPrice: currentMenu ?? undefined,
        serviceGroupKey: key,
        ...trendCounts,
        newServiceCluster: trendCounts.baselineCount === 0 && trendCounts.recentCount >= 6,
      },
    });

    const laborValues = group
      .map((line) => toNum(line.labor_time))
      .filter((v): v is number => v !== null && v > 0.05 && v <= 25);

    if (laborValues.length >= LABOR_MIN_SAMPLES) {
      const laborMed = median(laborValues);
      const laborIqr = Math.max(0.05, quantile(laborValues, 0.75) - quantile(laborValues, 0.25));
      const laborDeviation = laborIqr / Math.max(0.2, laborMed);
      if (laborDeviation >= 0.22) {
        const laborConfidence = clamp01(0.45 + Math.min(laborValues.length, 24) / 60 + Math.min(laborDeviation, 0.8) * 0.35);
        opportunities.push({
          id: `pricing:labor:${key}`,
          type: "pricing_normalization",
          title: `Labor-hour variance on ${serviceLabel}`,
          summary:
            `${laborValues.length} jobs have labor-time entries with a wide spread. ` +
            `Median labor is ${laborMed.toFixed(2)}h and band variance is high.`,
          confidence: laborConfidence,
          impactLevel: inferImpactLevel(laborConfidence * 0.8),
          priorityScore: 0,
          priorityBand: "low",
          reasoning: [
            `Observed across ${laborValues.length} jobs with labor-time capture`,
            `Labor spread is ${laborIqr.toFixed(2)}h around a ${laborMed.toFixed(2)}h median`,
          ],
          sourceBasis: `Labor-time distribution shows median ${laborMed.toFixed(2)}h with IQR ${laborIqr.toFixed(2)}h.`,
          suggestedAction:
            `Review estimator consistency and define a default labor baseline around ${laborMed.toFixed(2)}h for this service family.`,
          targetRefs: {
            menuItemId: lineSeed.menu_item_id ?? undefined,
          },
          meta: {
            jobsAnalyzed: laborValues.length,
            laborMedianHours: Number(laborMed.toFixed(2)),
            laborIqrHours: Number(laborIqr.toFixed(2)),
            serviceGroupKey: key,
          },
        });
      }
    }

    const partMarkupValues = group
      .map((line) => {
        const partsCost = partsCostByLineId.get(line.id) ?? 0;
        const price = toNum(line.price_estimate) ?? 0;
        const labor = toNum(line.labor_time) ?? 0;
        const laborHeavy = labor > 0.3;
        if (partsCost <= 0 || price <= 0 || laborHeavy) return null;
        return price / partsCost;
      })
      .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);

    if (partMarkupValues.length >= PART_MARKUP_MIN_SAMPLES) {
      const markupMedian = median(partMarkupValues);
      const markupIqr = Math.max(0.05, quantile(partMarkupValues, 0.75) - quantile(partMarkupValues, 0.25));
      if (markupIqr >= 0.2) {
        const markupConfidence = clamp01(0.44 + Math.min(partMarkupValues.length, 18) / 54 + Math.min(markupIqr, 1.2) * 0.22);
        opportunities.push({
          id: `pricing:markup:${key}`,
          type: "pricing_normalization",
          title: `Part markup variance on ${serviceLabel}`,
          summary:
            `Markup proxy varies more than expected on low-labor cases. ` +
            `Median is ${markupMedian.toFixed(2)}x with notable spread.`,
          confidence: markupConfidence,
          impactLevel: inferImpactLevel(markupConfidence * 0.75),
          priorityScore: 0,
          priorityBand: "low",
          reasoning: [
            `Observed across ${partMarkupValues.length} low-labor jobs with part-cost capture`,
            `Part markup spread is ${markupIqr.toFixed(2)}x around ${markupMedian.toFixed(2)}x median`,
            "Signal constrained to low-labor jobs to reduce mixed-cost noise",
          ],
          sourceBasis: `Parts-only markup signal from ${partMarkupValues.length} jobs with median ${markupMedian.toFixed(2)}x markup.`,
          suggestedAction:
            `Review parts matrix for this service and align advisor quoting to a target near ${markupMedian.toFixed(2)}x when parts-only patterns apply.`,
          targetRefs: {
            menuItemId: lineSeed.menu_item_id ?? undefined,
          },
          meta: {
            jobsAnalyzed: partMarkupValues.length,
            markupMedian: Number(markupMedian.toFixed(2)),
            markupIqr: Number(markupIqr.toFixed(2)),
            serviceGroupKey: key,
          },
        });
      }
    }
  }

  return opportunities;
}

function buildInspectionCoverageSignals(params: {
  lines: LineWithOrder[];
  menuById: Map<string, MenuItemSlim>;
  inspectionTemplates: Array<Pick<InspectionTemplateRow, "id" | "template_name" | "tags">>;
  templateSuggestions: InspectionTemplateSuggestionRow[];
  nowMs: number;
}): OptimizationOpportunity[] {
  const { lines, menuById, inspectionTemplates, templateSuggestions, nowMs } = params;

  const familyStats = new Map<
    string,
    {
      jobs: number;
      withInspection: number;
      linkedTemplateCount: number;
      menuRefs: Set<string>;
      sampleLabel: string;
      recentCount: number;
      baselineCount: number;
    }
  >();

  for (const line of lines) {
    const sourceLabel = labelForGroup(line, menuById);
    const family = familyFromText(sourceLabel);
    const cur = familyStats.get(family) ?? {
      jobs: 0,
      withInspection: 0,
      linkedTemplateCount: 0,
      menuRefs: new Set<string>(),
      sampleLabel: sourceLabel,
      recentCount: 0,
      baselineCount: 0,
    };

    cur.jobs += 1;
    const hasInspection =
      Boolean(line.inspection_template_id) ||
      Boolean(line.inspection_session_id) ||
      Boolean(line.work_orders?.inspection_id);
    if (hasInspection) cur.withInspection += 1;

    if (line.menu_item_id) {
      cur.menuRefs.add(line.menu_item_id);
      if (menuById.get(line.menu_item_id)?.inspection_template_id) {
        cur.linkedTemplateCount += 1;
      }
    }

    const createdMs = new Date(line.created_at ?? line.work_orders?.created_at ?? 0).getTime();
    if (Number.isFinite(createdMs) && createdMs > 0) {
      const ageDays = (nowMs - createdMs) / (24 * 60 * 60 * 1000);
      if (ageDays >= 0 && ageDays <= 30) {
        cur.recentCount += 1;
      } else if (ageDays > 30 && ageDays <= 60) {
        cur.baselineCount += 1;
      }
    }

    familyStats.set(family, cur);
  }

  const opportunities: OptimizationOpportunity[] = [];

  for (const [family, stats] of familyStats.entries()) {
    if (stats.jobs < 8) continue;

    const coverageRate = stats.withInspection / stats.jobs;
    const linkedRate = stats.linkedTemplateCount / Math.max(1, stats.jobs);

    if (coverageRate >= 0.5 && linkedRate >= 0.3) continue;

    const familyLabel = family.replaceAll("_", " ");
    const templateMatches = inspectionTemplates.filter((template) => {
      const name = slugify(template.template_name ?? "");
      const tags = (template.tags ?? []).join(" ");
      return `${name} ${slugify(tags)}`.includes(familyLabel.split(" ")[0]);
    });

    const suggestionMatches = templateSuggestions.filter((suggestion) =>
      slugify(suggestion.name).includes(familyLabel.split(" ")[0]),
    );

    const confidence = clamp01(0.48 + Math.min(stats.jobs, 40) / 100 + (0.5 - coverageRate) * 0.5);

    opportunities.push({
      id: `inspection:${family}`,
      type: "inspection_coverage_gap",
      title: `Inspection coverage gap: ${familyLabel}`,
      summary:
        `${stats.jobs} jobs mapped to ${familyLabel}, but only ${Math.round(coverageRate * 100)}% ` +
        `show inspection linkage. This suggests inconsistent inspection usage for a repeat service family.`,
      confidence,
      impactLevel: inferImpactLevel(confidence * (1 - coverageRate)),
      priorityScore: 0,
      priorityBand: "low",
      reasoning: [
        `Observed across ${stats.jobs} jobs in ${familyLabel}`,
        `Inspection linkage is ${Math.round(coverageRate * 100)}% for this family`,
        `${templateMatches.length} related templates exist with ${suggestionMatches.length} pending suggestions`,
      ],
      sourceBasis: `${stats.withInspection} of ${stats.jobs} lines include inspection linkage in this service family.`,
      suggestedAction:
        `Review ${familyLabel} defaults and attach a standard inspection template to the most common menu items before expanding coverage rules.`,
      targetRefs: {
        menuItemId: [...stats.menuRefs][0],
        inspectionTemplateId: templateMatches[0]?.id,
      },
      meta: {
        jobs: stats.jobs,
        coverageRate: Number(coverageRate.toFixed(2)),
        inspectionLinkedRate: Number(linkedRate.toFixed(2)),
        serviceGroupKey: family,
        recentCount: stats.recentCount,
        baselineCount: stats.baselineCount,
        recentWindowDays: 30,
        baselineWindowDays: 30,
      },
    });
  }

  return opportunities;
}

function buildMissedRevenueSignals(params: {
  lines: LineWithOrder[];
  menuById: Map<string, MenuItemSlim>;
  inspectionResults: InspectionResultRow[];
  inspectionResultItems: InspectionResultItemRow[];
  nowMs: number;
}): OptimizationOpportunity[] {
  const { lines, menuById, inspectionResults, inspectionResultItems, nowMs } = params;
  const linesByWorkOrder = new Map<string, LineWithOrder[]>();

  for (const line of lines) {
    const arr = linesByWorkOrder.get(line.work_order_id) ?? [];
    arr.push(line);
    linesByWorkOrder.set(line.work_order_id, arr);
  }

  const countA = new Map<string, number>();
  const pairCount = new Map<string, number>();

  for (const [, woLines] of linesByWorkOrder.entries()) {
    const families = [...new Set(woLines.map((line) => familyFromText(labelForGroup(line, menuById))))];
    for (const fam of families) {
      countA.set(fam, (countA.get(fam) ?? 0) + 1);
    }

    for (let i = 0; i < families.length; i += 1) {
      for (let j = i + 1; j < families.length; j += 1) {
        const key = `${families[i]}__${families[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const opportunities: OptimizationOpportunity[] = [];

  for (const [pairKey, bothCount] of pairCount.entries()) {
    const [a, b] = pairKey.split("__");
    const aCount = countA.get(a) ?? 0;
    if (bothCount < 6 || aCount < 8) continue;

    const confidenceAB = bothCount / aCount;
    if (confidenceAB < 0.55) continue;

    const missingCount = aCount - bothCount;
    if (missingCount < 4) continue;

    const confidence = clamp01(0.42 + confidenceAB * 0.5 + Math.min(missingCount, 30) / 160);
    const aLines = lines.filter((line) => familyFromText(labelForGroup(line, menuById)) === a);
    const trendCounts = countRecentBaselineFromLines(aLines, nowMs, 30, 30);

    opportunities.push({
      id: `revenue:pair:${a}:${b}`,
      type: "missed_revenue",
      title: `Companion service often missed: ${a.replaceAll("_", " ")} → ${b.replaceAll("_", " ")}`,
      summary:
        `${bothCount} of ${aCount} similar jobs included both service families. ` +
        `${missingCount} jobs included ${a.replaceAll("_", " ")} but not ${b.replaceAll("_", " ")}.`,
      confidence,
      impactLevel: inferImpactLevel(confidence * Math.min(1, missingCount / 10)),
      priorityScore: 0,
      priorityBand: "low",
      estimatedValue: roundMoney(missingCount * 18),
      reasoning: [
        `${bothCount} of ${aCount} ${a.replaceAll("_", " ")} jobs also sold ${b.replaceAll("_", " ")}`,
        `${missingCount} jobs included ${a.replaceAll("_", " ")} without ${b.replaceAll("_", " ")}`,
        `Association confidence is ${(confidenceAB * 100).toFixed(0)}%`,
      ],
      sourceBasis: `Companion-service correlation measured from ${aCount} work orders with ${bothCount} paired occurrences.`,
      suggestedAction:
        `Add a review checklist prompt: when ${a.replaceAll("_", " ")} is sold, confirm whether ${b.replaceAll("_", " ")} should also be quoted.`,
      targetRefs: {},
      meta: {
        sourceFamilyCount: aCount,
        pairCount: bothCount,
        missingCount,
        serviceGroupKey: [a, b].sort().join("__"),
        ...trendCounts,
      },
    });
  }

  const lineById = new Map(lines.map((line) => [line.id, line] as const));
  const resultToItems = new Map<string, InspectionResultItemRow[]>();
  for (const item of inspectionResultItems) {
    const arr = resultToItems.get(item.result_id) ?? [];
    arr.push(item);
    resultToItems.set(item.result_id, arr);
  }

  let findingMisses = 0;
  let findingSignals = 0;

  for (const result of inspectionResults) {
    const anchorLine = lineById.get(result.work_order_line_id);
    if (!anchorLine) continue;

    const woLines = linesByWorkOrder.get(anchorLine.work_order_id) ?? [];
    const orderFamilies = new Set(woLines.map((line) => familyFromText(labelForGroup(line, menuById))));
    const items = resultToItems.get(result.id) ?? [];

    for (const item of items) {
      const joined = slugify(`${item.section_title ?? ""} ${item.item_label ?? ""} ${item.notes ?? ""}`);
      if (!joined) continue;
      const status = slugify(item.status ?? "");
      const flagged =
        ["fail", "attention", "recommend", "warn", "bad", "replace", "red"].some((token) =>
          `${status} ${joined}`.includes(token),
        ) && !["pass", "good", "ok", "green"].some((token) => status.includes(token));

      if (!flagged) continue;

      const hintedFamily = familyFromText(joined);
      if (hintedFamily === "general_service") continue;

      findingSignals += 1;
      if (!orderFamilies.has(hintedFamily)) {
        findingMisses += 1;
      }
    }
  }

  if (findingSignals >= 8 && findingMisses >= 3) {
    const missRate = findingMisses / findingSignals;
    const confidence = clamp01(0.4 + missRate * 0.55 + Math.min(findingSignals, 40) / 200);

    opportunities.push({
      id: "revenue:inspection-finding-gaps",
      type: "missed_revenue",
      title: "Inspection findings without matching line items",
      summary:
        `${findingMisses} flagged inspection findings had no matching service-family line item in the same work order. ` +
        `This indicates likely missed recommendation capture on some visits.`,
      confidence,
      impactLevel: inferImpactLevel(confidence * Math.min(1, findingMisses / 8)),
      priorityScore: 0,
      priorityBand: "low",
      estimatedValue: roundMoney(findingMisses * 45),
      reasoning: [
        `${findingSignals} flagged inspection findings were analyzed`,
        `${findingMisses} flagged findings had no matching service line`,
        `Gap rate is ${(findingMisses / findingSignals * 100).toFixed(0)}% across reviewed findings`,
      ],
      sourceBasis: `Inspection finding-to-line reconciliation found ${findingMisses} missed captures out of ${findingSignals} flagged items.`,
      suggestedAction:
        "Add an advisor review step for flagged findings before finalizing the quote so recommendable work is explicitly accepted or declined.",
      targetRefs: {},
      meta: {
        flaggedFindings: findingSignals,
        missingCapturedRecommendations: findingMisses,
        serviceGroupKey: "inspection_findings",
        recentCount: Math.round(findingSignals * 0.5),
        baselineCount: Math.round(findingSignals * 0.5),
        recentWindowDays: 30,
        baselineWindowDays: 30,
      },
    });
  }

  return opportunities;
}

export async function buildOptimizationOpportunities(
  input: EngineInput,
): Promise<OptimizationEngineOutput> {
  const { supabase, shopId, lookbackDays = 365, limit = 12 } = input;
  const nowMs = Date.now();
  const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: menuItems, error: menuErr },
    { data: suggestionRows, error: suggErr },
    { data: templateRows, error: templateErr },
    { data: actionRows, error: actionErr },
  ] =
    await Promise.all([
      supabase
        .from("menu_items")
        .select("id, name, service_key, category, total_price, part_cost, labor_hours, labor_time, inspection_template_id")
        .eq("shop_id", shopId),
      supabase
        .from("inspection_template_suggestions")
        .select("id, name, confidence, created_at, shop_id, applies_to, items, intake_id, template_key")
        .eq("shop_id", shopId)
        .limit(100),
      supabase
        .from("inspection_templates")
        .select("id, template_name, tags, sections, shop_id")
        .eq("shop_id", shopId),
      supabase
        .from("optimization_actions")
        .select("opportunity_id, action, created_at, payload")
        .eq("shop_id", shopId),
    ]);

  if (menuErr) throw menuErr;
  if (suggErr) throw suggErr;
  if (templateErr) throw templateErr;
  if (actionErr) throw actionErr;

  const { data: lines, error: linesErr } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, menu_item_id, service_code, description, price_estimate, labor_time, inspection_template_id, inspection_session_id, created_at, status, work_orders!inner(id, created_at, inspection_id)",
    )
    .eq("shop_id", shopId)
    .gte("created_at", startDate)
    .limit(1800);

  if (linesErr) throw linesErr;

  const normalizedLines = ((lines ?? []) as Array<Omit<LineWithOrder, "work_orders"> & { work_orders: LineWithOrder["work_orders"] | LineWithOrder["work_orders"][] }>).map((line) => ({
    ...line,
    work_orders: Array.isArray(line.work_orders) ? (line.work_orders[0] ?? null) : line.work_orders ?? null,
  })) as LineWithOrder[];

  const validLines = normalizedLines.filter((line) => {
    const status = slugify(line.status ?? "");
    return !status.includes("void") && !status.includes("cancel");
  });

  const lineIds = validLines.map((line) => line.id);

  const [{ data: partsRows, error: partsErr }, { data: inspectionResults, error: resultErr }] = await Promise.all([
    lineIds.length
      ? supabase
          .from("work_order_parts")
          .select("work_order_line_id, total_price")
          .in("work_order_line_id", lineIds)
          .eq("shop_id", shopId)
      : Promise.resolve({ data: [], error: null }),
    lineIds.length
      ? supabase
          .from("inspection_results")
          .select("id, work_order_line_id, session_id, sections")
          .in("work_order_line_id", lineIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (partsErr) throw partsErr;
  if (resultErr) throw resultErr;

  const resultIds = (inspectionResults ?? []).map((row) => row.id);
  const { data: resultItems, error: resultItemsErr } = resultIds.length
    ? await supabase
        .from("inspection_result_items")
        .select("result_id, item_label, notes, section_title, status")
        .in("result_id", resultIds)
    : { data: [], error: null };

  if (resultItemsErr) throw resultItemsErr;

  const menuById = new Map((menuItems ?? []).map((row) => [row.id, row as MenuItemSlim] as const));

  const partsCostByLineId = new Map<string, number>();
  for (const row of (partsRows ?? []) as Pick<WorkOrderPartRow, "work_order_line_id" | "total_price">[]) {
    if (!row.work_order_line_id) continue;
    const current = partsCostByLineId.get(row.work_order_line_id) ?? 0;
    partsCostByLineId.set(row.work_order_line_id, current + (toNum(row.total_price) ?? 0));
  }

  const pricing = buildPriceNormalizationSignals({
    lines: validLines,
    menuById,
    partsCostByLineId,
    nowMs,
  });

  const coverage = buildInspectionCoverageSignals({
    lines: validLines,
    menuById,
    inspectionTemplates: ((templateRows ?? []) as InspectionTemplateRow[]).map((row) => ({ id: row.id, template_name: row.template_name, tags: row.tags })),
    templateSuggestions: (suggestionRows ?? []) as InspectionTemplateSuggestionRow[],
    nowMs,
  });

  const missedRevenue = buildMissedRevenueSignals({
    lines: validLines,
    menuById,
    inspectionResults: (inspectionResults ?? []) as InspectionResultRow[],
    inspectionResultItems: (resultItems ?? []) as InspectionResultItemRow[],
    nowMs,
  });

  const scoredOpportunities = [...pricing, ...coverage, ...missedRevenue];
  const maxJobCount = scoredOpportunities.reduce((max, item) => Math.max(max, getOpportunityJobCount(item)), 0);

  const opportunitiesWithPriority = scoredOpportunities.map((opportunity) => {
    const frequencyWeight = normalizeFrequency(getOpportunityJobCount(opportunity), maxJobCount);
    const priorityScore = clamp01(
      opportunity.confidence * 0.4 + impactWeight(opportunity.impactLevel) * 0.4 + frequencyWeight * 0.2,
    );

    return {
      ...opportunity,
      priorityScore: Number(priorityScore.toFixed(4)),
      priorityBand: classifyPriorityBand(priorityScore),
      reasoning: opportunity.reasoning.slice(0, 5),
      whyNow: computeWhyNow(opportunity),
      confidenceLabel: computeConfidenceLabel(opportunity),
      impactLabel: computeImpactLabel(opportunity),
    };
  });

  const dedupedByCluster = new Map<string, OptimizationOpportunity>();
  for (const opportunity of opportunitiesWithPriority) {
    const dedupeKey =
      opportunity.type === "pricing_normalization"
        ? `pricing:${getServiceGroupKey(opportunity)}`
        : opportunity.type === "inspection_coverage_gap"
          ? `inspection:${getServiceGroupKey(opportunity)}`
          : `revenue:${getServiceGroupKey(opportunity)}`;

    const existing = dedupedByCluster.get(dedupeKey);
    if (!existing || opportunity.priorityScore > existing.priorityScore) {
      dedupedByCluster.set(dedupeKey, opportunity);
    }
  }

  const bandWeight: Record<OptimizationOpportunity["priorityBand"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const staleFiltered = filterOutStaleOpportunities({
    opportunities: [...dedupedByCluster.values()],
    actions: (actionRows ?? []) as OptimizationActionRow[],
  });

  const opportunities = staleFiltered
    .sort((a, b) => {
      const bandDelta = bandWeight[b.priorityBand] - bandWeight[a.priorityBand];
      if (bandDelta !== 0) return bandDelta;
      const scoreDelta = b.priorityScore - a.priorityScore;
      if (scoreDelta !== 0) return scoreDelta;
      return (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0);
    })
    .slice(0, Math.max(1, limit));

  const relatedById = new Map<string, string[]>();
  for (const source of opportunities) {
    const sourceGroup = getServiceGroupKey(source);
    const sourceTargets = JSON.stringify(source.targetRefs ?? {});
    const related = opportunities
      .filter((candidate) => {
        if (candidate.id === source.id) return false;
        if (getServiceGroupKey(candidate) === sourceGroup) return true;
        return JSON.stringify(candidate.targetRefs ?? {}) === sourceTargets;
      })
      .map((item) => item.id)
      .slice(0, 3);
    if (related.length > 0) {
      relatedById.set(source.id, related);
    }
  }

  const opportunitiesWithRelated = opportunities.map((opportunity) => ({
    ...opportunity,
    relatedIds: relatedById.get(opportunity.id) ?? undefined,
  }));

  const grouped = opportunitiesWithRelated.reduce<Map<string, OptimizationGroup>>((acc, opportunity) => {
    const serviceGroup = getServiceGroupKey(opportunity);
    const key = `${opportunity.type}:${serviceGroup}`;
    const current = acc.get(key) ?? {
      groupKey: serviceGroup,
      type: opportunity.type,
      opportunities: [],
      totalEstimatedValue: 0,
      avgConfidence: 0,
    };

    current.opportunities.push(opportunity);
    current.totalEstimatedValue = (current.totalEstimatedValue ?? 0) + (opportunity.estimatedValue ?? 0);
    current.avgConfidence =
      current.opportunities.reduce((sum, item) => sum + item.confidence, 0) / current.opportunities.length;

    acc.set(key, current);
    return acc;
  }, new Map());

  const groups = [...grouped.values()].map((group) => ({
    ...group,
    totalEstimatedValue: group.totalEstimatedValue && group.totalEstimatedValue > 0 ? roundMoney(group.totalEstimatedValue) : undefined,
    avgConfidence: Number(group.avgConfidence.toFixed(3)),
  }));

  const summary = {
    totalOpportunities: opportunitiesWithRelated.length,
    criticalCount: opportunitiesWithRelated.filter((item) => item.priorityBand === "critical").length,
    highCount: opportunitiesWithRelated.filter((item) => item.priorityBand === "high").length,
    potentialMonthlyValue: roundMoney(
      opportunitiesWithRelated.reduce((sum, item) => sum + (item.estimatedValue && item.estimatedValue > 0 ? item.estimatedValue : 0), 0),
    ),
    lastAnalyzedAt: new Date(nowMs).toISOString(),
    dataFreshness: validLines.length >= 20 ? ("fresh" as const) : ("stale" as const),
  };

  return {
    generatedAt: new Date().toISOString(),
    shopId,
    summary,
    groups,
  };
}
