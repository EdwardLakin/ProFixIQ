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
  vendorCount?: number;
  evidenceWarnings?: string[];
  yearsOfHistory?: number;
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

type EvidenceQueryResult<T> = { value: T; reliable: boolean; warning?: string };

function warnEvidenceQuery(warning: string, error?: unknown) {
  if (process.env.NODE_ENV !== "production") console.warn(`[guided-onboarding-evidence] ${warning}`, error);
}

function queryWarning(table: string, purpose: string): string {
  return `${purpose} could not be verified from ${table}`;
}

async function countRows(supabase: SupabaseLike, table: string, shopId: string, build?: (query: GuidedQuery) => GuidedQuery, purpose = `${table} count`): Promise<EvidenceQueryResult<number>> {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  if (build) query = build(query);
  const { count, error } = await query;
  if (error) {
    const warning = queryWarning(table, purpose);
    warnEvidenceQuery(warning, error);
    return { value: 0, reliable: false, warning };
  }
  return { value: count ?? 0, reliable: true };
}

async function sampleColumn(supabase: SupabaseLike, table: string, shopId: string, columns: string, limit = 100, purpose = `${table} sample`): Promise<EvidenceQueryResult<Record<string, unknown>[]>> {
  const { data, error } = await supabase.from(table).select(columns).eq("shop_id", shopId).limit(limit);
  if (error) {
    const warning = queryWarning(table, purpose);
    warnEvidenceQuery(warning, error);
    return { value: [], reliable: false, warning };
  }
  return { value: (data ?? []) as unknown as Record<string, unknown>[], reliable: true };
}

function validDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateYearsOfHistory(rows: Record<string, unknown>[]): number | undefined {
  const dates = rows
    .flatMap((row) => [row.service_date, row.completed_at, row.created_at, row.invoice_date, row.date])
    .map(validDate)
    .filter((date): date is Date => date != null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length < 2) return undefined;
  const years = (dates[dates.length - 1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(1, Math.round(years * 10) / 10);
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
    customerRows, vehicleRows, historyRows, invoiceRows, partsRows,
    inspectionTemplateRows, menuItemRows, hoursRows, vendorRows,
  ] = await Promise.all([
    countRows(supabase, "customers", shopId, undefined, "shop-scoped customer count"),
    countRows(supabase, "vehicles", shopId, undefined, "shop-scoped vehicle count"),
    countRows(supabase, "history", shopId, undefined, "canonical service-history count"),
    countRows(supabase, "invoices", shopId, (q) => q.contains("metadata", { import_type: "invoice_csv" }), "historical invoice_csv count"),
    countRows(supabase, "parts", shopId, undefined, "canonical inventory part count"),
    countRows(supabase, "inspection_templates", shopId),
    countRows(supabase, "menu_items", shopId),
    countRows(supabase, "shop_hours", shopId),
    countRows(supabase, "vendors", shopId, undefined, "canonical vendor-record count"),
  ]);

  const [historySamplesRes, invoiceSamplesRes, partsRes, stockMovesRes, shopRowsRes] = await Promise.all([
    sampleColumn(supabase, "history", shopId, "description,service_date,created_at,historical_status,source_payload", 500, "canonical service-history samples"),
    sampleColumn(supabase, "invoices", shopId, "metadata,issued_at,created_at", 100, "historical invoice_csv samples"),
    sampleColumn(supabase, "parts", shopId, "id,name,category,supplier,low_stock_threshold", 10000, "canonical inventory parts"),
    sampleColumn(supabase, "stock_moves", shopId, "part_id,qty_change", 10000, "inventory stock movement totals"),
    sampleColumn(supabase, "shops", shopId, "labor_rate,tax_rate,shop_supplies_enabled,shop_supplies_percent,supplies_percent,workflow_defaults,default_workflow_status", 1),
  ]);
  const warnings = [customerRows, vehicleRows, historyRows, invoiceRows, partsRows, inspectionTemplateRows, menuItemRows, hoursRows, vendorRows, historySamplesRes, invoiceSamplesRes, partsRes, stockMovesRes, shopRowsRes].flatMap((r) => r.warning ? [r.warning] : []);
  const historySamples = historySamplesRes.value;
  const parts = partsRes.value;
  const stockByPart = new Map<string, number>();
  for (const move of stockMovesRes.value) {
    const partId = typeof move.part_id === "string" ? move.part_id : "";
    if (!partId) continue;
    stockByPart.set(partId, (stockByPart.get(partId) ?? 0) + Number(move.qty_change ?? 0));
  }
  const normalizedVendors = new Set(parts.map((p) => typeof p.supplier === "string" ? p.supplier.trim().toLowerCase() : "").filter(Boolean));
  const partsMissingVendorCount = partsRes.reliable ? parts.filter((p) => !(typeof p.supplier === "string" && p.supplier.trim())).length : 0;
  const partsWithVendorCount = partsRes.reliable ? parts.length - partsMissingVendorCount : 0;
  const partsMissingCategoryCount = partsRes.reliable ? parts.filter((p) => !(typeof p.category === "string" && p.category.trim())).length : 0;
  const lowStockPartsCount = partsRes.reliable && stockMovesRes.reliable ? parts.filter((p) => (stockByPart.get(String(p.id)) ?? 0) > 0 && (stockByPart.get(String(p.id)) ?? 0) < Number(p.low_stock_threshold ?? 3)).length : 0;
  const zeroStockPartsCount = partsRes.reliable && stockMovesRes.reliable ? parts.filter((p) => (stockByPart.get(String(p.id)) ?? 0) <= 0).length : 0;
  const vendorCount = vendorRows.value > 0 ? vendorRows.value : normalizedVendors.size > 0 ? normalizedVendors.size : vendorRows.reliable ? 0 : undefined;
  const shop = shopRowsRes.value[0] ?? {};

  return {
    customerCount: customerRows.value, vehicleCount: vehicleRows.value, historyCount: historyRows.value, invoiceCount: invoiceRows.value, partsCount: partsRows.value,
    lowStockPartsCount, zeroStockPartsCount, partsMissingVendorCount, partsWithVendorCount, partsMissingCategoryCount,
    vendorCount,
    evidenceWarnings: warnings,
    yearsOfHistory: calculateYearsOfHistory(historySamples),
    commonServiceCategories: topStrings(historySamples.map((row) => ({ ...row, service_category: typeof row.source_payload === "object" && row.source_payload ? (row.source_payload as Record<string, unknown>).service_category : undefined })), ["service_category"], 6),
    commonJobs: topStrings(historySamples, ["description"], 6),
    inspectionTemplateCount: inspectionTemplateRows.value,
    menuItemCount: menuItemRows.value,
    shopSettings: {
      laborRateConfigured: typeof shop.labor_rate === "number" && shop.labor_rate > 0,
      hoursConfigured: hoursRows.value > 0,
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
      metadata: { guidedSessionId: sessionId, sessionId, sourceRunId, evidence, category: draft.category, deterministic: true, noAutoCreate: true },
    }));
  }
  return { createdCount: created.length, skippedCount: skipped.length, recommendations: [...created, ...skipped], evidence, categories: drafts.map((d) => d.category) };
}
