import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";

type DB = Database;

export const CANONICAL_ROW_LIFECYCLE = [
  "uploaded",
  "parsed",
  "normalized",
  "deterministic_identity",
  "linked_existing",
  "materialized_new",
  "review_required",
  "failed",
  "skipped",
] as const;

export type CanonicalLifecycleStage = (typeof CANONICAL_ROW_LIFECYCLE)[number];
export type CanonicalDomain = "customer" | "vehicle" | "work_order" | "history" | "invoice" | "part" | "vendor";

type CanonicalRow = Pick<
  DB["public"]["Tables"]["shop_boost_row_results"]["Row"],
  "target_domain" | "source_file" | "match_status" | "error_reason" | "review_required" | "match_details" | "normalized_payload"
>;

type ImportFileRow = Pick<
  DB["public"]["Tables"]["shop_import_files"]["Row"],
  "kind" | "parsed_row_count"
>;

export type CanonicalIntakeTruth = {
  intakeId: string;
  lifecycle: readonly CanonicalLifecycleStage[];
  readiness: "empty" | "in_progress" | "review_required" | "blocked" | "ready";
  rowCounts: {
    total: number;
    materialized: number;
    linked: number;
    ignored: number;
    unresolved: number;
    failed: number;
    skipped: number;
    totalCounted: number;
    mismatch: number;
  };
  review: {
    pending: number;
    failedMaterialization: number;
    ignored: number;
    resolved: number;
    materialized: number;
  };
  domainCounts: Record<CanonicalDomain, number>;
  byDomain: Record<CanonicalDomain, {
    uploaded: number;
    parsed: number;
    normalized: number;
    deterministicIdentity: number;
    linkedExisting: number;
    materializedNew: number;
    reviewRequired: number;
    failed: number;
    skipped: number;
    mismatch: number;
    reasons: Record<string, number>;
  }>;
  reasons: Record<string, number>;
  integrityFlags: string[];
  materializedEntities: {
    customers: number;
    vehicles: number;
    workOrders: number;
    invoices: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function countOf(result: { count: number | null } | null | undefined): number {
  return Number(result?.count ?? 0);
}

function mapToCanonicalDomain(domainOrFile: string): CanonicalDomain | null {
  const key = String(domainOrFile ?? "").trim().toLowerCase();
  if (!key) return null;
  if (key === "customer" || key === "customers") return "customer";
  if (key === "vehicle" || key === "vehicles") return "vehicle";
  if (key === "work_order" || key === "work_orders") return "work_order";
  if (key === "history") return "history";
  if (key === "invoice" || key === "invoices") return "invoice";
  if (key === "part" || key === "parts") return "part";
  if (key === "vendor" || key === "vendors") return "vendor";
  return null;
}

function normalizeReasonCode(row: CanonicalRow): string {
  const matchDetails = asRecord(row.match_details);
  const raw = String(matchDetails.reason_code ?? row.error_reason ?? "").trim().toLowerCase();
  if (!raw) return "none";
  return raw
    .replace(/[^a-z0-9_\-\s]+/g, "_")
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function hasNormalizedPayload(row: CanonicalRow): boolean {
  const normalized = asRecord(row.normalized_payload);
  return Object.keys(normalized).length > 0;
}

function hasDeterministicIdentity(row: CanonicalRow): boolean {
  const details = asRecord(row.match_details);
  const strategy = String(details.strategy ?? "").trim().toLowerCase();
  const resolutionType = String(details.resolutionType ?? "").trim().toLowerCase();
  const hasSourceId = Boolean(details.sourceCustomerId || details.sourceVehicleId || details.sourceVendorId || details.sourceInvoiceId);
  return (
    hasSourceId ||
    strategy.includes("id") ||
    strategy.includes("email") ||
    strategy.includes("phone") ||
    strategy.includes("vin") ||
    resolutionType.includes("matched_existing_by_")
  );
}

function baseDomainCounters() {
  return {
    uploaded: 0,
    parsed: 0,
    normalized: 0,
    deterministicIdentity: 0,
    linkedExisting: 0,
    materializedNew: 0,
    reviewRequired: 0,
    failed: 0,
    skipped: 0,
    mismatch: 0,
    reasons: {} as Record<string, number>,
  };
}

export async function buildCanonicalIntakeTruth(args: {
  admin: SupabaseClient<any>;
  shopId: string;
  intakeId: string;
}): Promise<CanonicalIntakeTruth> {
  const { admin, shopId, intakeId } = args;

  const [rowsRes, filesRes, reviewPending, reviewFailedMaterialization, reviewIgnored, reviewResolved, reviewMaterialized, customersMaterialized, vehiclesMaterialized, workOrdersMaterialized, invoicesMaterialized] = await Promise.all([
    admin
      .from("shop_boost_row_results")
      .select("target_domain,source_file,match_status,error_reason,review_required,match_details,normalized_payload")
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId),
    admin.from("shop_import_files").select("kind,parsed_row_count").eq("intake_id", intakeId),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "pending"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "failed_materialization"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "ignored"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "resolved"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "materialized"),
    admin.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
    admin.from("vehicles").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
    admin.from("work_orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("shop_id", shopId).contains("metadata", { source_intake_id: intakeId }),
  ]);

  const rows = (rowsRes.data ?? []) as CanonicalRow[];
  const files = (filesRes.data ?? []) as ImportFileRow[];

  const byDomain: CanonicalIntakeTruth["byDomain"] = {
    customer: baseDomainCounters(),
    vehicle: baseDomainCounters(),
    work_order: baseDomainCounters(),
    history: baseDomainCounters(),
    invoice: baseDomainCounters(),
    part: baseDomainCounters(),
    vendor: baseDomainCounters(),
  };

  for (const file of files) {
    const domain = mapToCanonicalDomain(file.kind ?? "");
    if (!domain) continue;
    byDomain[domain].uploaded += Number(file.parsed_row_count ?? 0);
  }

  const reasons: Record<string, number> = {};
  let linked = 0;
  let materialized = 0;
  let ignored = 0;
  let unresolved = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const domain = mapToCanonicalDomain(row.target_domain || row.source_file || "");
    if (!domain) continue;
    const bucket = byDomain[domain];
    bucket.parsed += 1;

    if (hasNormalizedPayload(row)) bucket.normalized += 1;
    if (hasDeterministicIdentity(row)) bucket.deterministicIdentity += 1;

    const status = String(row.match_status ?? "").trim().toLowerCase();
    const reason = normalizeReasonCode(row);

    if (row.review_required) {
      unresolved += 1;
      bucket.reviewRequired += 1;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      bucket.reasons[reason] = (bucket.reasons[reason] ?? 0) + 1;
    } else if (status === "created_new") {
      materialized += 1;
      bucket.materializedNew += 1;
    } else if (status === "matched_existing" || status === "partial_match") {
      linked += 1;
      bucket.linkedExisting += 1;
    } else if (status === "ignored") {
      ignored += 1;
      skipped += 1;
      bucket.skipped += 1;
    } else if (status === "invalid" || row.error_reason) {
      failed += 1;
      bucket.failed += 1;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      bucket.reasons[reason] = (bucket.reasons[reason] ?? 0) + 1;
    }
  }

  const domainCounts = {
    customer: byDomain.customer.parsed,
    vehicle: byDomain.vehicle.parsed,
    work_order: byDomain.work_order.parsed,
    history: byDomain.history.parsed,
    invoice: byDomain.invoice.parsed,
    part: byDomain.part.parsed,
    vendor: byDomain.vendor.parsed,
  };

  for (const domain of Object.keys(byDomain) as CanonicalDomain[]) {
    const counters = byDomain[domain];
    const totalCounted =
      counters.linkedExisting +
      counters.materializedNew +
      counters.reviewRequired +
      counters.failed +
      counters.skipped;
    counters.mismatch = Math.max(0, counters.parsed - totalCounted);
  }

  const total = rows.length;
  const totalCounted = materialized + linked + unresolved + failed + skipped;
  const mismatch = Math.max(0, total - totalCounted);

  const integrityFlags: string[] = [];
  if (mismatch > 0) integrityFlags.push("row_bucket_mismatch");
  if (Object.values(byDomain).some((domain) => domain.mismatch > 0)) integrityFlags.push("domain_bucket_mismatch");
  if (rowsRes.error) integrityFlags.push("row_results_read_failed");
  if (filesRes.error) integrityFlags.push("upload_counts_read_failed");

  const readiness: CanonicalIntakeTruth["readiness"] =
    total === 0
      ? "empty"
      : mismatch > 0 || failed > 0
        ? "blocked"
        : unresolved > 0
          ? "review_required"
          : "ready";

  return {
    intakeId,
    lifecycle: CANONICAL_ROW_LIFECYCLE,
    readiness,
    rowCounts: {
      total,
      materialized,
      linked,
      ignored,
      unresolved,
      failed,
      skipped,
      totalCounted,
      mismatch,
    },
    review: {
      pending: countOf(reviewPending),
      failedMaterialization: countOf(reviewFailedMaterialization),
      ignored: countOf(reviewIgnored),
      resolved: countOf(reviewResolved),
      materialized: countOf(reviewMaterialized),
    },
    domainCounts,
    byDomain,
    reasons,
    integrityFlags,
    materializedEntities: {
      customers: countOf(customersMaterialized),
      vehicles: countOf(vehiclesMaterialized),
      workOrders: countOf(workOrdersMaterialized),
      invoices: countOf(invoicesMaterialized),
    },
  };
}
