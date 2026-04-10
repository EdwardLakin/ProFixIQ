import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type {
  OptimizationEngineOutput,
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

function buildPriceNormalizationSignals(params: {
  lines: LineWithOrder[];
  menuById: Map<string, MenuItemSlim>;
  partsCostByLineId: Map<string, number>;
}): OptimizationOpportunity[] {
  const { lines, menuById, partsCostByLineId } = params;
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
    const currentMenu = lineSeed.menu_item_id ? toNum(menuById.get(lineSeed.menu_item_id)?.total_price) : null;
    const confidence = clamp01(0.52 + Math.min(priceValues.length, 26) / 58 + Math.min(variationRatio, 0.5) * 0.4);

    opportunities.push({
      id: `pricing:${key}`,
      optimizationType: "pricing_normalization",
      title: `Normalize pricing for ${serviceLabel}`,
      summary:
        `${priceValues.length} historical jobs show meaningful price spread. ` +
        `Median is $${med.toFixed(2)} with ${under} underpriced and ${over} overpriced outliers.`,
      confidence,
      impactLevel: inferImpactLevel(confidence * Math.min(1, (under + over) / 5)),
      estimatedValue:
        under > 0
          ? roundMoney(
              priceValues
                .filter((v) => v < med)
                .reduce((sum, value) => sum + Math.max(0, med - value), 0) /
                Math.max(1, priceValues.length),
            )
          : undefined,
      sourceBasis: [
        `${priceValues.length} shop-scoped work-order lines in matching service cluster`,
        `Robust center: median $${med.toFixed(2)} (IQR $${iqr.toFixed(2)})`,
        currentMenu ? `Current menu price observed at $${currentMenu.toFixed(2)}` : "No direct menu anchor found",
      ],
      suggestedAction:
        `Review this cluster and set a standard target near $${roundMoney(med).toFixed(2)} ` +
        `(keep exceptions documented by severity/vehicle class).`,
      targetRefs: [
        ...(lineSeed.menu_item_id
          ? [{ entityType: "menu_item" as const, id: lineSeed.menu_item_id, label: serviceLabel }]
          : []),
        { entityType: "service_family", id: key, label: serviceLabel },
      ],
      meta: {
        jobsAnalyzed: priceValues.length,
        recommendedPrice: roundMoney(med),
        underpricedOutliers: under,
        overpricedOutliers: over,
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
          optimizationType: "pricing_normalization",
          title: `Labor-hour variance on ${serviceLabel}`,
          summary:
            `${laborValues.length} jobs have labor-time entries with a wide spread. ` +
            `Median labor is ${laborMed.toFixed(2)}h and band variance is high.`,
          confidence: laborConfidence,
          impactLevel: inferImpactLevel(laborConfidence * 0.8),
          sourceBasis: [
            `${laborValues.length} comparable jobs with recorded labor_time`,
            `Median labor ${laborMed.toFixed(2)}h (IQR ${laborIqr.toFixed(2)}h)`,
          ],
          suggestedAction:
            `Review estimator consistency and define a default labor baseline around ${laborMed.toFixed(2)}h for this service family.`,
          targetRefs: [{ entityType: "service_family", id: key, label: serviceLabel }],
          meta: {
            laborMedianHours: Number(laborMed.toFixed(2)),
            laborIqrHours: Number(laborIqr.toFixed(2)),
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
          optimizationType: "pricing_normalization",
          title: `Part markup variance on ${serviceLabel}`,
          summary:
            `Markup proxy varies more than expected on low-labor cases. ` +
            `Median is ${markupMedian.toFixed(2)}x with notable spread.`,
          confidence: markupConfidence,
          impactLevel: inferImpactLevel(markupConfidence * 0.75),
          sourceBasis: [
            `${partMarkupValues.length} low-labor jobs with captured part cost`,
            `Markup median ${markupMedian.toFixed(2)}x (IQR ${markupIqr.toFixed(2)}x)`,
            "Markup signal only uses low-labor lines to keep inference conservative",
          ],
          suggestedAction:
            `Review parts matrix for this service and align advisor quoting to a target near ${markupMedian.toFixed(2)}x when parts-only patterns apply.`,
          targetRefs: [{ entityType: "service_family", id: key, label: serviceLabel }],
          meta: {
            markupMedian: Number(markupMedian.toFixed(2)),
            markupIqr: Number(markupIqr.toFixed(2)),
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
}): OptimizationOpportunity[] {
  const { lines, menuById, inspectionTemplates, templateSuggestions } = params;

  const familyStats = new Map<
    string,
    {
      jobs: number;
      withInspection: number;
      linkedTemplateCount: number;
      menuRefs: Set<string>;
      sampleLabel: string;
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
      optimizationType: "inspection_coverage_gap",
      title: `Inspection coverage gap: ${familyLabel}`,
      summary:
        `${stats.jobs} jobs mapped to ${familyLabel}, but only ${Math.round(coverageRate * 100)}% ` +
        `show inspection linkage. This suggests inconsistent inspection usage for a repeat service family.`,
      confidence,
      impactLevel: inferImpactLevel(confidence * (1 - coverageRate)),
      sourceBasis: [
        `${stats.jobs} work-order lines observed in this family`,
        `${stats.withInspection} lines had inspection session/template/work-order inspection linkage`,
        `${templateMatches.length} matching templates currently published; ${suggestionMatches.length} pending template suggestions`,
      ],
      suggestedAction:
        `Review ${familyLabel} defaults and attach a standard inspection template to the most common menu items before expanding coverage rules.`,
      targetRefs: [
        ...[...stats.menuRefs].slice(0, 3).map((menuId) => ({
          entityType: "menu_item" as const,
          id: menuId,
          label: menuById.get(menuId)?.name ?? stats.sampleLabel,
        })),
        ...templateMatches.slice(0, 2).map((template) => ({
          entityType: "inspection_template" as const,
          id: template.id,
          label: template.template_name,
        })),
        { entityType: "service_family", id: family, label: familyLabel },
      ],
      meta: {
        jobs: stats.jobs,
        coverageRate: Number(coverageRate.toFixed(2)),
        inspectionLinkedRate: Number(linkedRate.toFixed(2)),
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
}): OptimizationOpportunity[] {
  const { lines, menuById, inspectionResults, inspectionResultItems } = params;
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

    opportunities.push({
      id: `revenue:pair:${a}:${b}`,
      optimizationType: "missed_revenue",
      title: `Companion service often missed: ${a.replaceAll("_", " ")} → ${b.replaceAll("_", " ")}`,
      summary:
        `${bothCount} of ${aCount} similar jobs included both service families. ` +
        `${missingCount} jobs included ${a.replaceAll("_", " ")} but not ${b.replaceAll("_", " ")}.`,
      confidence,
      impactLevel: inferImpactLevel(confidence * Math.min(1, missingCount / 10)),
      estimatedValue: roundMoney(missingCount * 18),
      sourceBasis: [
        `${aCount} historical work orders containing ${a.replaceAll("_", " ")}`,
        `${bothCount} work orders also contained ${b.replaceAll("_", " ")}`,
        `Association confidence ${(confidenceAB * 100).toFixed(0)}%`,
      ],
      suggestedAction:
        `Add a review checklist prompt: when ${a.replaceAll("_", " ")} is sold, confirm whether ${b.replaceAll("_", " ")} should also be quoted.`,
      targetRefs: [
        { entityType: "service_pair", id: `${a}:${b}`, label: `${a} -> ${b}` },
        { entityType: "service_family", id: a, label: a.replaceAll("_", " ") },
        { entityType: "service_family", id: b, label: b.replaceAll("_", " ") },
      ],
      meta: {
        sourceFamilyCount: aCount,
        pairCount: bothCount,
        missingCount,
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
      optimizationType: "missed_revenue",
      title: "Inspection findings without matching line items",
      summary:
        `${findingMisses} flagged inspection findings had no matching service-family line item in the same work order. ` +
        `This indicates likely missed recommendation capture on some visits.`,
      confidence,
      impactLevel: inferImpactLevel(confidence * Math.min(1, findingMisses / 8)),
      estimatedValue: roundMoney(findingMisses * 45),
      sourceBasis: [
        `${findingSignals} flagged inspection result items reviewed`,
        `${findingMisses} findings lacked matching service-family lines in the same RO`,
        "Heuristic uses conservative keyword family mapping to avoid forced precision",
      ],
      suggestedAction:
        "Add an advisor review step for flagged findings before finalizing the quote so recommendable work is explicitly accepted or declined.",
      targetRefs: [{ entityType: "service_family", id: "inspection_findings", label: "Inspection findings" }],
      meta: {
        flaggedFindings: findingSignals,
        missingCapturedRecommendations: findingMisses,
      },
    });
  }

  return opportunities;
}

export async function buildOptimizationOpportunities(
  input: EngineInput,
): Promise<OptimizationEngineOutput> {
  const { supabase, shopId, lookbackDays = 365, limit = 12 } = input;
  const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: menuItems, error: menuErr }, { data: suggestionRows, error: suggErr }, { data: templateRows, error: templateErr }] =
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
    ]);

  if (menuErr) throw menuErr;
  if (suggErr) throw suggErr;
  if (templateErr) throw templateErr;

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
  });

  const coverage = buildInspectionCoverageSignals({
    lines: validLines,
    menuById,
    inspectionTemplates: ((templateRows ?? []) as InspectionTemplateRow[]).map((row) => ({ id: row.id, template_name: row.template_name, tags: row.tags })),
    templateSuggestions: (suggestionRows ?? []) as InspectionTemplateSuggestionRow[],
  });

  const missedRevenue = buildMissedRevenueSignals({
    lines: validLines,
    menuById,
    inspectionResults: (inspectionResults ?? []) as InspectionResultRow[],
    inspectionResultItems: (resultItems ?? []) as InspectionResultItemRow[],
  });

  const opportunities = [...pricing, ...coverage, ...missedRevenue]
    .sort((a, b) => {
      const impactScore = (impact: OptimizationImpactLevel): number =>
        impact === "high" ? 1 : impact === "medium" ? 0.65 : 0.35;
      return b.confidence * impactScore(b.impactLevel) - a.confidence * impactScore(a.impactLevel);
    })
    .slice(0, Math.max(1, limit));

  return {
    generatedAt: new Date().toISOString(),
    shopId,
    opportunities,
  };
}
