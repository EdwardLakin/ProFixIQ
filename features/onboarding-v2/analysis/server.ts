import "server-only";

import { createAiRecommendation } from "@/features/ai/server/recommendations";
import type { AiActorContext, AiRecommendationRecord, AiServerClient } from "@/features/ai/server/types";
import type { Json } from "@shared/types/types/supabase";

export const GUIDED_ANALYSIS_DOMAIN = "onboarding";
export const GUIDED_ANALYSIS_SUBJECT_TYPE = "guided_onboarding_session";
export const GUIDED_ANALYSIS_SOURCE = "guided_onboarding_analysis";
const DUPLICATE_STATUSES = ["open", "acknowledged", "resolved"];

// Supabase query builders are intentionally loose here because this service probes optional
// onboarding tables/columns that may vary across import paths.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GuidedQuery = any;
type SupabaseLike = AiServerClient & { from(table: string): GuidedQuery };

export type GuidedOnboardingEvidence = {
  customerCount: number;
  vehicleCount: number;
  historyCount: number;
  invoiceCount: number;
  partsCount: number;
  lowStockPartsCount: number;
  zeroStockPartsCount: number;
  partsMissingVendorCount: number;
  partsWithVendorCount: number;
  partsMissingCategoryCount: number;
  commonServiceCategories: string[];
  commonJobs: string[];
  inspectionTemplateCount: number;
  menuItemCount: number;
  shopSettings: {
    laborRateConfigured: boolean;
    hoursConfigured: boolean;
    shopSuppliesConfigured: boolean;
    taxRateConfigured: boolean;
    workflowDefaultsConfigured: boolean;
  };
};

type RecommendationDraft = {
  recommendationType: string;
  category: string;
  title: string;
  summary: string;
  priority: "low" | "normal" | "high" | "urgent";
  confidence: number;
  missingData?: Json;
  recommendedAction: Json;
};

type RunInput = {
  supabase: SupabaseLike;
  actor: AiActorContext;
  sessionId: string;
};

async function countRows(supabase: SupabaseLike, table: string, shopId: string, build?: (query: GuidedQuery) => GuidedQuery): Promise<number> {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  if (build) query = build(query);
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

async function sampleColumn(supabase: SupabaseLike, table: string, shopId: string, columns: string, limit = 100): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(table).select(columns).eq("shop_id", shopId).limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as Record<string, unknown>[];
}

function topStrings(rows: Record<string, unknown>[], keys: string[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = keys.map((key) => row[key]).find((item) => typeof item === "string" && item.trim().length > 0);
    if (typeof value !== "string") continue;
    const cleaned = value.trim().slice(0, 80);
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);
}

export async function collectGuidedOnboardingEvidence(supabase: SupabaseLike, shopId: string): Promise<GuidedOnboardingEvidence> {
  const [
    customerCount, vehicleCount, historyCount, invoiceCount, partsCount,
    lowStockPartsCount, zeroStockPartsCount, partsMissingVendorCount, partsWithVendorCount, partsMissingCategoryCount,
    inspectionTemplateCount, menuItemCount, hoursCount,
  ] = await Promise.all([
    countRows(supabase, "customers", shopId),
    countRows(supabase, "vehicles", shopId),
    countRows(supabase, "work_order_lines", shopId),
    countRows(supabase, "invoices", shopId),
    countRows(supabase, "parts", shopId),
    countRows(supabase, "parts", shopId, (q) => q.lt("quantity_on_hand", 3)),
    countRows(supabase, "parts", shopId, (q) => q.lte("quantity_on_hand", 0)),
    countRows(supabase, "parts", shopId, (q) => q.or("vendor.is.null,vendor.eq.")),
    countRows(supabase, "parts", shopId, (q) => q.not("vendor", "is", null)),
    countRows(supabase, "parts", shopId, (q) => q.or("category.is.null,category.eq.")),
    countRows(supabase, "inspection_templates", shopId),
    countRows(supabase, "menu_items", shopId),
    countRows(supabase, "shop_hours", shopId),
  ]);

  const [lineSamples, invoiceSamples, shopRows] = await Promise.all([
    sampleColumn(supabase, "work_order_lines", shopId, "description,name,category,service_category", 200),
    sampleColumn(supabase, "invoices", shopId, "service_category,category,description", 100),
    sampleColumn(supabase, "shops", shopId, "labor_rate,tax_rate,shop_supplies_enabled,shop_supplies_percent,supplies_percent,workflow_defaults,default_workflow_status", 1),
  ]);
  const shop = shopRows[0] ?? {};

  return {
    customerCount, vehicleCount, historyCount, invoiceCount, partsCount,
    lowStockPartsCount, zeroStockPartsCount, partsMissingVendorCount, partsWithVendorCount, partsMissingCategoryCount,
    commonServiceCategories: topStrings([...lineSamples, ...invoiceSamples], ["service_category", "category"], 6),
    commonJobs: topStrings(lineSamples, ["description", "name"], 6),
    inspectionTemplateCount,
    menuItemCount,
    shopSettings: {
      laborRateConfigured: typeof shop.labor_rate === "number" && shop.labor_rate > 0,
      hoursConfigured: hoursCount > 0,
      shopSuppliesConfigured: Boolean(shop.shop_supplies_enabled) || Number(shop.shop_supplies_percent ?? shop.supplies_percent ?? 0) > 0,
      taxRateConfigured: typeof shop.tax_rate === "number" && shop.tax_rate >= 0,
      workflowDefaultsConfigured: Boolean(shop.workflow_defaults) || Boolean(shop.default_workflow_status),
    },
  };
}

function buildDrafts(e: GuidedOnboardingEvidence): RecommendationDraft[] {
  const drafts: RecommendationDraft[] = [];
  const hasHistory = e.historyCount > 0 || e.invoiceCount > 0 || e.commonJobs.length > 0 || e.commonServiceCategories.length > 0;
  if (hasHistory && e.inspectionTemplateCount < 2) drafts.push({ recommendationType: "inspection_templates_first", category: "Inspection templates first", title: "Build inspection templates from completed onboarding history", summary: "Completed service history exists, but inspection template coverage is light. Review templates before canned services so future jobs can attach the right inspection workflow.", priority: "high", confidence: 0.82, recommendedAction: { type: "review_inspection_template_opportunities", autoCreate: false } });
  if ((e.commonJobs.length > 0 || e.commonServiceCategories.length > 0) && e.menuItemCount < 5) drafts.push({ recommendationType: "menu_items_canned_services", category: "Menu items and canned services second", title: "Review repeated jobs for menu items and canned services", summary: "Repeated onboarding job data can be converted into reviewed menu items after inspection templates are selected.", priority: "normal", confidence: 0.78, recommendedAction: { type: "review_menu_item_candidates", autoCreate: false } });
  if (e.partsCount > 0 && (e.zeroStockPartsCount > 0 || e.lowStockPartsCount > 0 || e.partsMissingCategoryCount > 0)) drafts.push({ recommendationType: "inventory_improvements", category: "Inventory improvements", title: "Clean up low-stock and uncategorized imported parts", summary: "Parts data includes low or zero stock items, or missing categories. Review reorder and categorization settings before go-live.", priority: e.zeroStockPartsCount > 0 ? "high" : "normal", confidence: 0.84, recommendedAction: { type: "review_inventory_cleanup", autoCreate: false } });
  if (e.partsCount > 0 && (e.partsWithVendorCount > 0 || e.partsMissingVendorCount > 0)) drafts.push({ recommendationType: "vendor_suggestions", category: "Vendor suggestions", title: "Review vendor coverage for imported parts", summary: "Parts inventory has vendor signals or vendor gaps. Review vendor coverage so purchasing workflows are ready.", priority: "low", confidence: 0.7, recommendedAction: { type: "review_vendor_coverage", autoCreate: false } });
  if (e.customerCount > 0 && (e.vehicleCount > 0 || hasHistory)) drafts.push({ recommendationType: "customer_fleet_segments", category: "Customer and fleet segments", title: "Define customer and fleet launch segments", summary: "Customer, vehicle, and history data can support owner-reviewed segments for retention, fleet handling, and follow-up.", priority: "normal", confidence: 0.76, recommendedAction: { type: "review_segment_opportunities", autoCreate: false } });
  if (e.commonServiceCategories.length > 0 || e.commonJobs.length >= 3) drafts.push({ recommendationType: "maintenance_packages", category: "Maintenance packages", title: "Review recurring services for maintenance packages", summary: "Recurring services in onboarding data can inform maintenance packages once reviewed by the shop.", priority: "normal", confidence: 0.74, recommendedAction: { type: "review_maintenance_package_candidates", autoCreate: false } });
  if (e.customerCount > 0 || e.invoiceCount > 0 || !e.shopSettings.workflowDefaultsConfigured) drafts.push({ recommendationType: "automation_rules", category: "Automation rules", title: "Review launch automation opportunities", summary: "Onboarding data suggests reminder, follow-up, or workflow default opportunities. Review rules before enabling any automation.", priority: "low", confidence: 0.68, missingData: !e.shopSettings.workflowDefaultsConfigured ? ["workflow_defaults"] : [], recommendedAction: { type: "review_automation_rule_candidates", autoCreate: false } });
  return drafts;
}

async function findDuplicate(supabase: SupabaseLike, shopId: string, sessionId: string, recommendationType: string) {
  const { data, error } = await supabase.from("ai_recommendations").select("*").eq("shop_id", shopId).eq("domain", GUIDED_ANALYSIS_DOMAIN).eq("subject_type", GUIDED_ANALYSIS_SUBJECT_TYPE).eq("subject_id", sessionId).eq("recommendation_type", recommendationType).eq("source", GUIDED_ANALYSIS_SOURCE).in("status", DUPLICATE_STATUSES).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as AiRecommendationRecord | null;
}

export async function runGuidedOnboardingAnalysis({ supabase, actor, sessionId }: RunInput) {
  const evidence = await collectGuidedOnboardingEvidence(supabase, actor.shopId);
  const drafts = buildDrafts(evidence);
  const created: AiRecommendationRecord[] = [];
  const skipped: AiRecommendationRecord[] = [];
  const sourceRunId = `${GUIDED_ANALYSIS_SOURCE}:${sessionId}`;
  for (const draft of drafts) {
    const existing = await findDuplicate(supabase, actor.shopId, sessionId, draft.recommendationType);
    if (existing) { skipped.push(existing); continue; }
    created.push(await createAiRecommendation(supabase as AiServerClient, actor, {
      domain: GUIDED_ANALYSIS_DOMAIN,
      recommendationType: draft.recommendationType,
      subjectType: GUIDED_ANALYSIS_SUBJECT_TYPE,
      subjectId: sessionId,
      title: draft.title,
      summary: draft.summary,
      priority: draft.priority,
      confidence: draft.confidence,
      riskTier: "low",
      missingData: draft.missingData ?? [],
      recommendedAction: draft.recommendedAction,
      sideEffects: [],
      requiresApproval: false,
      requiresOwnerPin: false,
      source: GUIDED_ANALYSIS_SOURCE,
      sourceRunId,
      metadata: { guidedSessionId: sessionId, sessionId, evidence, category: draft.category, deterministic: true, noAutoCreate: true },
    }));
  }
  return { createdCount: created.length, skippedCount: skipped.length, recommendations: [...created, ...skipped], evidence, categories: drafts.map((d) => d.category) };
}
