import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

export type ReviewIssueType =
  | "unmatched"
  | "conflict"
  | "invalid"
  | "missing_dependency"
  | "ambiguous_match"
  | "duplicate_candidate"
  | "failed_materialization";

export type CompletionState =
  | "COMPLETED_CLEAN"
  | "COMPLETED_WITH_REVIEW"
  | "COMPLETED_WITH_WARNINGS"
  | "PARTIAL_FAILURE"
  | "FAILED"
  | "READY_FOR_GO_LIVE"
  | "NOT_READY";

export type IntegrityStatus = "ready" | "ready_with_warnings" | "not_ready";

export type IgnoreReasonCode =
  | "duplicate"
  | "obsolete"
  | "invalid"
  | "test_data"
  | "intentionally_skipped"
  | "unsupported_format"
  | "other";
type StockRow = Pick<Database["public"]["Tables"]["part_stock"]["Row"], "part_id">;
type CustomerKeyRow = Pick<Database["public"]["Tables"]["customers"]["Row"], "email" | "phone" | "phone_number" | "name">;
type VehicleKeyRow = Pick<Database["public"]["Tables"]["vehicles"]["Row"], "vin" | "license_plate" | "year" | "make" | "model" | "customer_id">;
type PartKeyRow = Pick<Database["public"]["Tables"]["parts"]["Row"], "part_number" | "sku" | "name">;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizePhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function pick(payload: Record<string, unknown>, patterns: RegExp[]): string {
  for (const [key, value] of Object.entries(payload)) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) continue;
    if (patterns.some((pattern) => pattern.test(normalizedKey))) {
      const normalized = String(value ?? "").trim();
      if (normalized) return normalized;
    }
  }
  return "";
}

export function buildClusterDescriptor(args: {
  domain: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload?: Record<string, unknown>;
}): { clusterKey: string; confidence: number; issueHint: ReviewIssueType | null } {
  const payload = { ...(args.rawPayload ?? {}), ...(args.normalizedPayload ?? {}) };

  if (args.domain === "customer") {
    const external = normalizeToken(pick(payload, [/external/, /legacy id/, /customer id/]));
    const email = normalizeToken(pick(payload, [/^email$/, /customer email/]));
    const phone = normalizePhone(pick(payload, [/^phone$/, /customer phone/, /mobile/]));
    const name = normalizeText(pick(payload, [/^name$/, /customer name/, /full name/]));
    const address = normalizeText(pick(payload, [/address/, /street/]));

    if (external) return { clusterKey: `customer:external:${external}`, confidence: 1, issueHint: null };
    if (email) return { clusterKey: `customer:email:${email}`, confidence: 0.98, issueHint: null };
    if (phone) return { clusterKey: `customer:phone:${phone}`, confidence: 0.95, issueHint: null };
    if (name && address) return { clusterKey: `customer:name_address:${name}:${address}`, confidence: 0.78, issueHint: null };
    if (name) return { clusterKey: `customer:name:${name}`, confidence: 0.58, issueHint: "ambiguous_match" };
    return { clusterKey: "customer:unknown", confidence: 0.2, issueHint: "invalid" };
  }

  if (args.domain === "vehicle") {
    const vin = normalizeToken(pick(payload, [/^vin$/, /vehicle vin/]));
    const plate = normalizeToken(pick(payload, [/plate/, /license/]));
    const year = normalizeToken(pick(payload, [/^year$/, /model year/]));
    const make = normalizeText(pick(payload, [/^make$/]));
    const model = normalizeText(pick(payload, [/^model$/]));
    const customer = normalizeToken(pick(payload, [/customer id/, /customer email/, /customer phone/]));

    if (vin) return { clusterKey: `vehicle:vin:${vin}`, confidence: 1, issueHint: null };
    if (plate) return { clusterKey: `vehicle:plate:${plate}`, confidence: 0.92, issueHint: null };
    if (year && make && model && customer) {
      return {
        clusterKey: `vehicle:ymm_customer:${year}:${make}:${model}:${customer}`,
        confidence: 0.76,
        issueHint: null,
      };
    }
    return { clusterKey: `vehicle:fallback:${year}:${make}:${model}:${customer}`, confidence: 0.45, issueHint: "ambiguous_match" };
  }

  if (args.domain === "part") {
    const partNumber = normalizeToken(pick(payload, [/part number/, /^pn$/, /part #/]));
    const sku = normalizeToken(pick(payload, [/^sku$/, /stock code/]));
    const vendor = normalizeText(pick(payload, [/vendor/, /supplier/]));
    const description = normalizeText(pick(payload, [/description/, /name/, /part name/]));

    if (partNumber) return { clusterKey: `part:number:${partNumber}`, confidence: 1, issueHint: null };
    if (sku) return { clusterKey: `part:sku:${sku}`, confidence: 0.95, issueHint: null };
    if (description && vendor) return { clusterKey: `part:desc_vendor:${description}:${vendor}`, confidence: 0.7, issueHint: null };
    return { clusterKey: `part:desc:${description}`, confidence: 0.45, issueHint: "ambiguous_match" };
  }

  const invoiceNumber = normalizeToken(pick(payload, [/invoice number/, /ro number/, /work order/]));
  if (invoiceNumber) return { clusterKey: `${args.domain}:invoice:${invoiceNumber}`, confidence: 0.92, issueHint: null };

  return {
    clusterKey: `${args.domain}:generic:${normalizeToken(JSON.stringify(payload).slice(0, 120))}`,
    confidence: 0.4,
    issueHint: "ambiguous_match",
  };
}

export async function runPostMigrationIntegrityValidation(args: {
  shopId: string;
  intakeId: string;
}): Promise<{
  status: IntegrityStatus;
  graphReady: boolean;
  blockingIssuesCount: number;
  warningsCount: number;
  checks: Record<string, number>;
  integrityErrors: string[];
}> {
  const supabase = createAdminSupabase();

  const [
    vehiclesMissingCustomer,
    workOrdersMissingCustomer,
    workOrdersMissingVehicle,
    orphanLines,
    stockWithoutPart,
    intakeReviewPending,
    intakeReviewFailed,
    duplicateCustomers,
    duplicateVehicles,
    duplicateParts,
    invoicesMissingWorkOrder,
  ] = await Promise.all([
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("shop_id", args.shopId).eq("source_intake_id", args.intakeId).is("customer_id", null),
    supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("shop_id", args.shopId).eq("source_intake_id", args.intakeId).is("customer_id", null),
    supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("shop_id", args.shopId).eq("source_intake_id", args.intakeId).is("vehicle_id", null),
    supabase
      .from("work_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", args.shopId)
      .eq("source_intake_id", args.intakeId)
      .is("work_order_id", null),
    supabase
      .from("part_stock")
      .select("id,part_id")
      .limit(5000),
    supabase.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", args.shopId).eq("intake_id", args.intakeId).eq("status", "pending"),
    supabase
      .from("shop_boost_review_items")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", args.shopId)
      .eq("intake_id", args.intakeId)
      .eq("status", "failed_materialization"),
    supabase.from("customers").select("id,name,email,phone,phone_number").eq("shop_id", args.shopId).eq("source_intake_id", args.intakeId).limit(5000),
    supabase.from("vehicles").select("id,vin,license_plate,year,make,model,customer_id").eq("shop_id", args.shopId).eq("source_intake_id", args.intakeId).limit(5000),
    supabase.from("parts").select("id,part_number,sku,name").eq("shop_id", args.shopId).eq("source_intake_id", args.intakeId).limit(5000),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("shop_id", args.shopId).contains("metadata", { source_intake_id: args.intakeId }).is("work_order_id", null),
  ]);

  const stockRows = (stockWithoutPart.data ?? []) as StockRow[];
  const stockMissingPart = stockRows.filter((row) => !row.part_id).length;

  const dupCustomers = new Map<string, number>();
  for (const c of (duplicateCustomers.data ?? []) as CustomerKeyRow[]) {
    const key = [normalizeToken(c.email), normalizePhone(c.phone ?? c.phone_number), normalizeText(c.name)].filter(Boolean).join("|");
    if (!key) continue;
    dupCustomers.set(key, (dupCustomers.get(key) ?? 0) + 1);
  }
  const customerDuplicateRisk = Array.from(dupCustomers.values()).filter((n) => n > 1).length;

  const dupVehicles = new Map<string, number>();
  for (const v of (duplicateVehicles.data ?? []) as VehicleKeyRow[]) {
    const key = normalizeToken(v.vin) || normalizeToken(v.license_plate) || [normalizeToken(v.year), normalizeText(v.make), normalizeText(v.model), normalizeToken(v.customer_id)].join("|");
    if (!key) continue;
    dupVehicles.set(key, (dupVehicles.get(key) ?? 0) + 1);
  }
  const vehicleDuplicateRisk = Array.from(dupVehicles.values()).filter((n) => n > 1).length;

  const dupParts = new Map<string, number>();
  for (const p of (duplicateParts.data ?? []) as PartKeyRow[]) {
    const key = normalizeToken(p.part_number) || normalizeToken(p.sku) || normalizeText(p.name);
    if (!key) continue;
    dupParts.set(key, (dupParts.get(key) ?? 0) + 1);
  }
  const partDuplicateRisk = Array.from(dupParts.values()).filter((n) => n > 1).length;

  const checks = {
    vehicles_missing_customer_linkage: vehiclesMissingCustomer.count ?? 0,
    work_orders_missing_customer_linkage: workOrdersMissingCustomer.count ?? 0,
    work_orders_missing_vehicle_linkage: workOrdersMissingVehicle.count ?? 0,
    orphan_work_order_lines: orphanLines.count ?? 0,
    inventory_without_part_linkage: stockMissingPart,
    duplicate_customer_risk: customerDuplicateRisk,
    duplicate_vehicle_risk: vehicleDuplicateRisk,
    duplicate_part_risk: partDuplicateRisk,
    unresolved_review_items: intakeReviewPending.count ?? 0,
    failed_review_materialization: intakeReviewFailed.count ?? 0,
    invoices_missing_work_order_linkage: invoicesMissingWorkOrder.count ?? 0,
  };

  const blockingIssuesCount =
    checks.vehicles_missing_customer_linkage +
    checks.work_orders_missing_customer_linkage +
    checks.work_orders_missing_vehicle_linkage +
    checks.orphan_work_order_lines +
    checks.inventory_without_part_linkage +
    checks.invoices_missing_work_order_linkage;

  const warningsCount = checks.duplicate_customer_risk + checks.duplicate_vehicle_risk + checks.duplicate_part_risk;

  const status: IntegrityStatus =
    blockingIssuesCount > 0
      ? "not_ready"
      : warningsCount > 0 || checks.unresolved_review_items > 0 || checks.failed_review_materialization > 0
        ? "ready_with_warnings"
        : "ready";

  const graphReady = status !== "not_ready";
  const integrityErrors: string[] = [];
  if (checks.vehicles_missing_customer_linkage > 0) integrityErrors.push(`Vehicles without customer: ${checks.vehicles_missing_customer_linkage}`);
  if (checks.work_orders_missing_customer_linkage > 0) integrityErrors.push(`Work orders without customer: ${checks.work_orders_missing_customer_linkage}`);
  if (checks.work_orders_missing_vehicle_linkage > 0) integrityErrors.push(`Work orders without vehicle: ${checks.work_orders_missing_vehicle_linkage}`);
  if (checks.invoices_missing_work_order_linkage > 0) integrityErrors.push(`Invoices without work order: ${checks.invoices_missing_work_order_linkage}`);
  if (checks.inventory_without_part_linkage > 0) integrityErrors.push(`Inventory rows without part: ${checks.inventory_without_part_linkage}`);
  if (checks.orphan_work_order_lines > 0) integrityErrors.push(`Orphan work-order lines: ${checks.orphan_work_order_lines}`);
  if (checks.unresolved_review_items > 0) integrityErrors.push(`Unresolved review items: ${checks.unresolved_review_items}`);
  if (checks.failed_review_materialization > 0) integrityErrors.push(`Failed review materializations: ${checks.failed_review_materialization}`);

  await supabase.from("shop_boost_integrity_reports").insert({
    shop_id: args.shopId,
    intake_id: args.intakeId,
    status,
    graph_ready: graphReady,
    blocking_issues_count: blockingIssuesCount,
    warnings_count: warningsCount,
    checks,
  });

  return {
    status,
    graphReady,
    blockingIssuesCount,
    warningsCount,
    checks,
    integrityErrors,
  };
}

export function computeCompletionState(args: {
  failedCount: number;
  pendingReviewCount: number;
  failedReviewCount: number;
  integrityStatus: IntegrityStatus;
  integrityErrorsCount?: number;
}): CompletionState {
  if ((args.integrityErrorsCount ?? 0) > 0) return "NOT_READY";
  if (args.failedCount > 0) return "PARTIAL_FAILURE";
  if (args.integrityStatus === "not_ready") return "NOT_READY";
  if (args.pendingReviewCount > 0 || args.failedReviewCount > 0) return "COMPLETED_WITH_REVIEW";
  if (args.integrityStatus === "ready_with_warnings") return "COMPLETED_WITH_WARNINGS";
  return "READY_FOR_GO_LIVE";
}
