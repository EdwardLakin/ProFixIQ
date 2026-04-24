import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiEvidenceSnapshot, type AiActorContext, type AiEvidenceSnapshotRecord } from "@/features/ai/server";
import type { ShopBoostAiEvidence } from "./types";

type DB = Database;

type IntakeRow = Pick<
  DB["public"]["Tables"]["shop_boost_intakes"]["Row"],
  "id" | "shop_id" | "status" | "created_at" | "processed_at" | "intake_basics"
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampConfidence(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function pullLinkage(basics: Record<string, unknown>) {
  const importSummary = asRecord(basics.importSummary);
  const linkageSummary = asRecord(importSummary.linkageSummary);
  const linked = asRecord(linkageSummary.linked);
  const unresolved = asRecord(linkageSummary.unresolved);

  return {
    customersLinked: asNumber(linked.customers) ?? asNumber(linked.customersLinked),
    vehiclesLinked: asNumber(linked.vehicles) ?? asNumber(linked.vehiclesCustomerId),
    workOrdersLinked: asNumber(linked.workOrders) ?? asNumber(linked.workOrdersCustomerId),
    invoicesLinked: asNumber(linked.invoices) ?? asNumber(linked.invoicesCustomerId),
    unresolvedCustomers: asNumber(unresolved.customers) ?? asNumber(unresolved.customersMissingLink),
    unresolvedVehicles: asNumber(unresolved.vehicles) ?? asNumber(unresolved.vehiclesCustomerId),
    unresolvedWorkOrders: asNumber(unresolved.workOrders) ?? asNumber(unresolved.workOrdersCustomerId) ?? asNumber(unresolved.workOrdersVehicleId),
    unresolvedInvoices: asNumber(unresolved.invoices) ?? asNumber(unresolved.invoicesCustomerId),
  };
}

async function countSuggestions(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  intakeId: string;
}) {
  const [menu, inspection, staff] = await Promise.all([
    input.supabase
      .from("menu_item_suggestions")
      .select("confidence", { count: "exact" })
      .eq("shop_id", input.shopId)
      .eq("intake_id", input.intakeId),
    input.supabase
      .from("inspection_template_suggestions")
      .select("confidence", { count: "exact" })
      .eq("shop_id", input.shopId)
      .eq("intake_id", input.intakeId),
    input.supabase
      .from("staff_invite_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", input.shopId)
      .eq("intake_id", input.intakeId),
  ]);

  if (menu.error) throw new Error(menu.error.message);
  if (inspection.error) throw new Error(inspection.error.message);
  if (staff.error) throw new Error(staff.error.message);

  const menuRows = menu.data ?? [];
  const inspectionRows = inspection.data ?? [];

  const menuHigh = menuRows.filter((row) => Number(row.confidence ?? 0) >= 0.85).length;
  const inspectionHigh = inspectionRows.filter((row) => Number(row.confidence ?? 0) >= 0.85).length;

  return {
    menuCount: menu.count ?? 0,
    inspectionCount: inspection.count ?? 0,
    staffCount: staff.count ?? 0,
    menuHigh,
    inspectionHigh,
  };
}

export function buildShopBoostAiEvidence(input: {
  shopId: string;
  intake: IntakeRow;
  sourceRunId?: string | null;
  suggestionCounts: {
    menuCount: number;
    inspectionCount: number;
    staffCount: number;
    menuHigh: number;
    inspectionHigh: number;
  };
}): ShopBoostAiEvidence {
  const basics = asRecord(input.intake.intake_basics);
  const orchestrator = asRecord(basics.orchestrator);
  const migrationProgress = asRecord(basics.migrationProgress);
  const roi = asRecord(migrationProgress.roi ?? basics.roi_summary);
  const trust = asRecord(migrationProgress.trustStatement ?? basics.trust_statement);
  const linkageSummary = pullLinkage(basics);

  const missingData: string[] = [];
  const unresolvedDataCategories: string[] = [];

  if (linkageSummary.unresolvedVehicles == null && linkageSummary.unresolvedWorkOrders == null) {
    missingData.push("linkage_unresolved_counts_missing");
  }

  const reviewQueueCount = asNumber(asRecord(basics.importSummary).reviewQueueCount ?? migrationProgress.reviewQueueCount);
  const blockerCount = asNumber(asRecord(basics.importSummary).blockerCount ?? migrationProgress.blockerCount);
  if (reviewQueueCount == null) missingData.push("review_queue_count_missing");
  if (blockerCount == null) missingData.push("blocker_count_missing");

  if ((linkageSummary.unresolvedCustomers ?? 0) > 0) unresolvedDataCategories.push("customers");
  if ((linkageSummary.unresolvedVehicles ?? 0) > 0) unresolvedDataCategories.push("vehicles");
  if ((linkageSummary.unresolvedWorkOrders ?? 0) > 0) unresolvedDataCategories.push("work_orders");
  if ((linkageSummary.unresolvedInvoices ?? 0) > 0) unresolvedDataCategories.push("invoices");

  const staleWarnings: string[] = [];
  if ((reviewQueueCount ?? 0) > 0) staleWarnings.push("pending_review_queue_items_detected");
  if ((blockerCount ?? 0) > 0) staleWarnings.push("import_blockers_detected");

  const confidence = clampConfidence(
    asNumber(trust.confidence_score) ?? asNumber(trust.confidence) ?? asNumber(migrationProgress.confidenceScore),
  );

  return {
    shopId: input.shopId,
    intakeId: input.intake.id,
    sourceRunId: input.sourceRunId ?? (typeof orchestrator.run_id === "string" ? orchestrator.run_id : null),
    activationStatus: typeof orchestrator.activation_status === "string" ? orchestrator.activation_status : null,
    readinessStatus: typeof migrationProgress.readiness === "string" ? migrationProgress.readiness : null,
    generatedAt: new Date().toISOString(),
    confidence,
    confidenceSummary: {
      trustScore: asNumber(trust.confidence_score) ?? asNumber(trust.confidence),
      trustMessage: typeof trust.message === "string" ? trust.message : null,
      confidenceScore: asNumber(migrationProgress.confidenceScore),
    },
    linkageSummary,
    suggestionsSummary: {
      inspectionTemplateSuggestions: input.suggestionCounts.inspectionCount,
      inspectionTemplateHighConfidenceCount: input.suggestionCounts.inspectionHigh,
      menuItemSuggestions: input.suggestionCounts.menuCount,
      menuItemHighConfidenceCount: input.suggestionCounts.menuHigh,
      staffSuggestions: input.suggestionCounts.staffCount,
      customerSuggestions: null,
      historySuggestions: null,
      highConfidenceCount: input.suggestionCounts.menuHigh + input.suggestionCounts.inspectionHigh,
      reviewNeededCount: reviewQueueCount ?? 0,
    },
    roiImpactSummary: {
      estimatedMonthlyImpact: asNumber(roi.estimated_monthly_impact),
      approvalSpeedGain: asNumber(roi.approval_speed_gain),
      laborRecoveryHours: asNumber(roi.labor_recovery_hours),
      partsLeakageReduction: asNumber(roi.parts_leakage_reduction),
      confidence: asNumber(roi.confidence),
    },
    unresolvedDataCategories,
    staleOrUnscopedSuggestionWarnings: staleWarnings,
    sourceRefs: [
      { table: "shop_boost_intakes", id: input.intake.id },
      { table: "shop_boost_intakes", field: "intake_basics.importSummary" },
      { table: "menu_item_suggestions", id: input.intake.id, field: "intake_id" },
      { table: "inspection_template_suggestions", id: input.intake.id, field: "intake_id" },
      { table: "staff_invite_suggestions", id: input.intake.id, field: "intake_id" },
    ],
    missingData,
  };
}

export async function createShopBoostPostActivationEvidenceSnapshot(input: {
  supabase: SupabaseClient<DB>;
  actorContext: AiActorContext;
  intakeId?: string | null;
  sourceRunId?: string | null;
}): Promise<{
  intake: IntakeRow;
  evidence: AiEvidenceSnapshotRecord;
  snapshot: ShopBoostAiEvidence;
  missingData: string[];
}> {
  const { supabase, actorContext } = input;
  const shopId = actorContext.shopId;
  if (!shopId) throw new Error("shopId is required in actor context");

  let intakeQuery = supabase
    .from("shop_boost_intakes")
    .select("id,shop_id,status,created_at,processed_at,intake_basics")
    .eq("shop_id", shopId)
    .order("processed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (input.intakeId) {
    intakeQuery = intakeQuery.eq("id", input.intakeId);
  }

  const { data: intake, error: intakeError } = await intakeQuery.maybeSingle<IntakeRow>();
  if (intakeError) throw new Error(intakeError.message);
  if (!intake) throw new Error("No Shop Boost intake found for this shop.");

  const suggestions = await countSuggestions({ supabase, shopId, intakeId: intake.id });
  const snapshot = buildShopBoostAiEvidence({
    shopId,
    intake,
    sourceRunId: input.sourceRunId,
    suggestionCounts: suggestions,
  });

  const evidence = await createAiEvidenceSnapshot(supabase, actorContext, {
    domain: "shop_boost",
    subjectType: "shop_boost_intake",
    subjectId: isUuid(intake.id) ? intake.id : null,
    evidenceKind: "shop_boost_post_activation_state",
    snapshot: snapshot as unknown as Json,
    sourceRefs: snapshot.sourceRefs as unknown as Json,
    missingData: snapshot.missingData,
    confidence: snapshot.confidence,
    freshnessAt: intake.processed_at ?? intake.created_at,
    metadata: {
      intakeId: intake.id,
      sourceRunId: snapshot.sourceRunId,
      advisory_only: true,
    },
  });

  return { intake, evidence, snapshot, missingData: snapshot.missingData };
}
