type TrustStatus = "READY" | "NEEDS REVIEW" | "PARTIAL" | "BLOCKED";

export type MigrationStory = {
  total_rows: number;
  materialized_count: number;
  linked_count: number;
  review_resolved_count: number;
  ignored_count: number;
  failed_count: number;
  key_fixes: string[];
  risk_flags: {
    duplicates_detected: boolean;
    missing_identifiers: boolean;
    inconsistent_data_patterns: boolean;
  };
  trust_statement: string;
  trust_status: TrustStatus;
  blockers: string[];
  confidence_score: number;
};

export function computeTrustStatus(args: {
  blockers: number;
  pendingReviewCount: number;
  failedCount: number;
  integrityErrorsCount: number;
}): TrustStatus {
  if (args.blockers > 0 || args.integrityErrorsCount > 0) return "BLOCKED";
  if (args.failedCount > 0) return "PARTIAL";
  if (args.pendingReviewCount > 0) return "NEEDS REVIEW";
  return "READY";
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

export function buildMigrationStory(args: {
  totalRows: number;
  outcomeBuckets: {
    materialized: number;
    linked: number;
    ignored: number;
    failed: number;
  };
  reviewResolvedCount: number;
  pendingReviewCount: number;
  failedReviewCount: number;
  failedCount: number;
  integrityErrorsCount: number;
  confidenceScore: number;
  integrityChecks?: Record<string, unknown>;
  keyFixCounts: {
    duplicateCustomersMerged: number;
    vehiclesLinkedToCustomers: number;
    workOrdersRecoveredVehicleLinks: number;
  };
}): MigrationStory {
  const checks = args.integrityChecks ?? {};
  const duplicatesDetected =
    Number(checks.duplicate_customer_risk ?? 0) > 0 ||
    Number(checks.duplicate_vehicle_risk ?? 0) > 0 ||
    Number(checks.duplicate_part_risk ?? 0) > 0 ||
    args.keyFixCounts.duplicateCustomersMerged > 0;
  const missingIdentifiers =
    Number(checks.vehicles_missing_customer_linkage ?? 0) > 0 ||
    Number(checks.work_orders_missing_customer_linkage ?? 0) > 0 ||
    Number(checks.work_orders_missing_vehicle_linkage ?? 0) > 0;
  const inconsistentPatterns = args.integrityErrorsCount > 0;

  const blockers: string[] = [];
  if (Number(checks.vehicles_missing_customer_linkage ?? 0) > 0) blockers.push("Vehicles missing customer linkage");
  if (Number(checks.work_orders_missing_customer_linkage ?? 0) > 0) blockers.push("Work orders missing customer linkage");
  if (Number(checks.work_orders_missing_vehicle_linkage ?? 0) > 0) blockers.push("Work orders missing vehicle linkage");
  if (Number(checks.orphan_work_order_lines ?? 0) > 0) blockers.push("Orphan work order lines detected");
  if (Number(checks.inventory_without_part_linkage ?? 0) > 0) blockers.push("Inventory rows missing part linkage");
  if (args.integrityErrorsCount > 0) blockers.push("Integrity validation errors require review");

  const keyFixes: string[] = [];
  if (args.keyFixCounts.duplicateCustomersMerged > 0) {
    keyFixes.push(`Merged ${args.keyFixCounts.duplicateCustomersMerged} duplicate customers`);
  }
  if (args.keyFixCounts.vehiclesLinkedToCustomers > 0) {
    keyFixes.push(`Linked ${args.keyFixCounts.vehiclesLinkedToCustomers} vehicles to existing customers`);
  }
  if (args.keyFixCounts.workOrdersRecoveredVehicleLinks > 0) {
    keyFixes.push(`Recovered ${args.keyFixCounts.workOrdersRecoveredVehicleLinks} work orders missing vehicle links`);
  }
  if (keyFixes.length === 0) keyFixes.push("Validated imported records and preserved source traceability");

  const confidenceScore = clampScore(args.confidenceScore);
  const unresolvedReview = args.pendingReviewCount + args.failedReviewCount;
  const trustStatus = computeTrustStatus({
    blockers: blockers.length,
    pendingReviewCount: args.pendingReviewCount,
    failedCount: args.failedCount + args.failedReviewCount,
    integrityErrorsCount: args.integrityErrorsCount,
  });
  const trustStatement =
    unresolvedReview > 0
      ? `We successfully migrated your data with ${Math.round(confidenceScore * 100)}% confidence. ${unresolvedReview} record${unresolvedReview === 1 ? "" : "s"} still need manual review.`
      : `We successfully migrated your data with ${Math.round(confidenceScore * 100)}% confidence. All flagged records were validated.`;

  return {
    total_rows: Math.max(0, args.totalRows),
    materialized_count: Math.max(0, args.outcomeBuckets.materialized),
    linked_count: Math.max(0, args.outcomeBuckets.linked),
    review_resolved_count: Math.max(0, args.reviewResolvedCount),
    ignored_count: Math.max(0, args.outcomeBuckets.ignored),
    failed_count: Math.max(0, args.outcomeBuckets.failed + args.failedReviewCount),
    key_fixes: keyFixes,
    risk_flags: {
      duplicates_detected: duplicatesDetected,
      missing_identifiers: missingIdentifiers,
      inconsistent_data_patterns: inconsistentPatterns,
    },
    trust_statement: trustStatement,
    trust_status: trustStatus,
    blockers,
    confidence_score: confidenceScore,
  };
}
