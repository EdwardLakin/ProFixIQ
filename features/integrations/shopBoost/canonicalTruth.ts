import type { SupabaseClient } from "@supabase/supabase-js";

type CanonicalDomain = "customer" | "vehicle" | "work_order" | "history" | "invoice" | "part";

export type CanonicalIntakeTruth = {
  intakeId: string;
  rowCounts: {
    total: number;
    materialized: number;
    linked: number;
    ignored: number;
    unresolved: number;
    failed: number;
    totalCounted: number;
    mismatch: number;
  };
  domainCounts: Record<CanonicalDomain, number>;
  review: {
    pending: number;
    failedMaterialization: number;
    ignored: number;
    resolved: number;
    materialized: number;
  };
  materializedEntities: {
    customers: number;
    vehicles: number;
    workOrders: number;
    invoices: number;
  };
};

function countOf(result: { count: number | null } | null | undefined): number {
  return Number(result?.count ?? 0);
}

export async function buildCanonicalIntakeTruth(args: {
  admin: SupabaseClient<any>;
  shopId: string;
  intakeId: string;
}): Promise<CanonicalIntakeTruth> {
  const { admin, shopId, intakeId } = args;

  const [
    totalRows,
    reviewRequiredRows,
    failedRows,
    linkedRows,
    materializedRows,
    ignoredRows,
    reviewPending,
    reviewFailedMaterialization,
    reviewIgnored,
    reviewResolved,
    reviewMaterialized,
    customerDomain,
    vehicleDomain,
    workOrderDomain,
    historyDomain,
    invoiceDomain,
    partDomain,
    customersMaterialized,
    vehiclesMaterialized,
    workOrdersMaterialized,
    invoicesMaterialized,
  ] = await Promise.all([
    admin.from("shop_boost_row_results").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("review_required", true),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("review_required", false)
      .or("error_reason.not.is.null,match_status.eq.invalid"),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("review_required", false)
      .is("error_reason", null)
      .in("match_status", ["matched_existing", "partial_match"]),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("review_required", false)
      .is("error_reason", null)
      .eq("match_status", "created_new"),
    admin
      .from("shop_boost_row_results")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("intake_id", intakeId)
      .eq("match_status", "ignored"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "pending"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "failed_materialization"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "ignored"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "resolved"),
    admin.from("shop_boost_review_items").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("status", "materialized"),
    admin.from("shop_boost_row_results").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("target_domain", "customer"),
    admin.from("shop_boost_row_results").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("target_domain", "vehicle"),
    admin.from("shop_boost_row_results").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("target_domain", "work_order"),
    admin.from("shop_boost_row_results").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("target_domain", "history"),
    admin.from("shop_boost_row_results").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("target_domain", "invoice"),
    admin.from("shop_boost_row_results").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("intake_id", intakeId).eq("target_domain", "part"),
    admin.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
    admin.from("vehicles").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
    admin.from("work_orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("source_intake_id", intakeId),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("shop_id", shopId).contains("metadata", { source_intake_id: intakeId }),
  ]);

  const total = countOf(totalRows);
  const reviewRequired = countOf(reviewRequiredRows);
  const failed = countOf(failedRows);
  const linked = countOf(linkedRows);
  const materialized = countOf(materializedRows);
  const ignored = countOf(ignoredRows);
  const totalCounted = materialized + linked + ignored + reviewRequired + failed;

  return {
    intakeId,
    rowCounts: {
      total,
      materialized,
      linked,
      ignored,
      unresolved: countOf(reviewPending) + countOf(reviewFailedMaterialization),
      failed,
      totalCounted,
      mismatch: Math.max(0, total - totalCounted),
    },
    domainCounts: {
      customer: countOf(customerDomain),
      vehicle: countOf(vehicleDomain),
      work_order: countOf(workOrderDomain),
      history: countOf(historyDomain),
      invoice: countOf(invoiceDomain),
      part: countOf(partDomain),
    },
    review: {
      pending: countOf(reviewPending),
      failedMaterialization: countOf(reviewFailedMaterialization),
      ignored: countOf(reviewIgnored),
      resolved: countOf(reviewResolved),
      materialized: countOf(reviewMaterialized),
    },
    materializedEntities: {
      customers: countOf(customersMaterialized),
      vehicles: countOf(vehiclesMaterialized),
      workOrders: countOf(workOrdersMaterialized),
      invoices: countOf(invoicesMaterialized),
    },
  };
}
