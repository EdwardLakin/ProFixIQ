import { buildClusterDescriptor, computeCompletionState, type CompletionState, type IntegrityStatus } from "@/features/integrations/shopBoost/migrationReliability";

type ImportRowLite = {
  entity_type: string | null;
  raw: unknown;
  normalized: unknown;
};

export type PreflightDomainSummary = {
  domain: string;
  detected: number;
  likelyAutoImport: number;
  likelyNeedsReview: number;
  potentialBlockers: number;
  confidence: number;
};

export type PreflightBlocker = {
  code: "missing_identifier" | "ambiguous_match";
  count: number;
  guidance: string;
};

export type ShopBoostPreflightReport = {
  totals: {
    detectedRecords: number;
    estimatedAutoImportCoverage: number;
    likelyAutoImportCount: number;
    likelyReviewNeededCount: number;
    likelyBlockerCount: number;
  };
  confidence: {
    score: number;
    label: "high" | "medium" | "low";
    readiness: CompletionState;
    integrityStatus: IntegrityStatus;
  };
  blockers: PreflightBlocker[];
  domains: PreflightDomainSummary[];
  projectedPreparation: string[];
  reviewNotes: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function confidenceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function toDescriptorDomain(entityType: string): string {
  if (entityType === "customers") return "customer";
  if (entityType === "vehicles") return "vehicle";
  if (entityType === "parts") return "part";
  if (entityType === "history") return "work_order";
  return entityType || "unknown";
}

function prettyDomain(entityType: string): string {
  if (entityType === "customers") return "Customers";
  if (entityType === "vehicles") return "Vehicles";
  if (entityType === "parts") return "Parts";
  if (entityType === "history") return "Work orders";
  if (entityType === "invoices") return "Invoices";
  if (entityType === "staff") return "Staff";
  return entityType;
}

export function buildShopBoostPreflightReport(args: {
  rows: ImportRowLite[];
  hasHistoryData: boolean;
  hasVehicleData: boolean;
  hasCustomerData: boolean;
  menuSuggestionCount: number;
  inspectionSuggestionCount: number;
}): ShopBoostPreflightReport {
  const domainAccumulator = new Map<
    string,
    {
      detected: number;
      auto: number;
      review: number;
      blockers: number;
      confidenceTotal: number;
      confidenceCount: number;
    }
  >();

  let likelyAutoImportCount = 0;
  let likelyReviewNeededCount = 0;
  let likelyBlockerCount = 0;
  let ambiguousCount = 0;
  let missingIdentifierCount = 0;

  for (const row of args.rows) {
    const entityType = String(row.entity_type ?? "unknown");
    const domain = prettyDomain(entityType);
    const descriptor = buildClusterDescriptor({
      domain: toDescriptorDomain(entityType),
      rawPayload: asRecord(row.raw),
      normalizedPayload: asRecord(row.normalized),
    });

    const bucket =
      domainAccumulator.get(domain) ??
      {
        detected: 0,
        auto: 0,
        review: 0,
        blockers: 0,
        confidenceTotal: 0,
        confidenceCount: 0,
      };

    bucket.detected += 1;
    bucket.confidenceTotal += descriptor.confidence;
    bucket.confidenceCount += 1;

    if (descriptor.issueHint === "invalid") {
      bucket.blockers += 1;
      likelyBlockerCount += 1;
      missingIdentifierCount += 1;
    } else if (descriptor.issueHint === "ambiguous_match") {
      bucket.review += 1;
      likelyReviewNeededCount += 1;
      ambiguousCount += 1;
    } else if (descriptor.confidence >= 0.85) {
      bucket.auto += 1;
      likelyAutoImportCount += 1;
    } else {
      bucket.review += 1;
      likelyReviewNeededCount += 1;
    }

    domainAccumulator.set(domain, bucket);
  }

  const detectedRecords = args.rows.length;
  const coverage =
    detectedRecords > 0 ? Math.round((likelyAutoImportCount / detectedRecords) * 100) : 0;

  const blockerRate = detectedRecords > 0 ? likelyBlockerCount / detectedRecords : 0;
  const reviewRate = detectedRecords > 0 ? likelyReviewNeededCount / detectedRecords : 0;
  const autoRate = detectedRecords > 0 ? likelyAutoImportCount / detectedRecords : 0;

  const score = Math.round(
    clamp(autoRate * 100 * 0.65 + (1 - blockerRate) * 100 * 0.25 + (1 - reviewRate) * 100 * 0.1, 1, 99),
  );

  const integrityStatus: IntegrityStatus =
    likelyBlockerCount > 0 ? "not_ready" : likelyReviewNeededCount > 0 ? "ready_with_warnings" : "ready";

  const readiness = computeCompletionState({
    failedCount: likelyBlockerCount,
    pendingReviewCount: likelyReviewNeededCount,
    failedReviewCount: 0,
    integrityStatus,
    integrityErrorsCount: likelyBlockerCount,
  });

  const blockers: PreflightBlocker[] = [];
  if (missingIdentifierCount > 0) {
    blockers.push({
      code: "missing_identifier",
      count: missingIdentifierCount,
      guidance: "Some rows are missing stable identifiers (for example VIN, customer contact, or part number).",
    });
  }
  if (ambiguousCount > 0) {
    blockers.push({
      code: "ambiguous_match",
      count: ambiguousCount,
      guidance: "Some rows have multiple plausible matches and should be routed to review before materialization.",
    });
  }

  const projectedPreparation: string[] = [];
  if (args.hasHistoryData) projectedPreparation.push("Service menu recommendations from historical repair patterns");
  if (args.hasHistoryData || args.hasVehicleData) {
    projectedPreparation.push("Inspection template drafts aligned to your vehicle mix");
  }
  if (args.hasCustomerData && args.hasVehicleData) {
    projectedPreparation.push("Customer + vehicle linkage map for work-order routing");
  }
  if (args.menuSuggestionCount > 0) {
    projectedPreparation.push(`${args.menuSuggestionCount} menu suggestions are ready for guided review`);
  }
  if (args.inspectionSuggestionCount > 0) {
    projectedPreparation.push(`${args.inspectionSuggestionCount} inspection suggestions are ready for guided review`);
  }
  if (projectedPreparation.length === 0) {
    projectedPreparation.push("Foundational import mapping and identifier checks");
  }

  const reviewNotes = [
    "Nothing has been imported yet — this is a preview of how Shop Boost expects to interpret your files.",
    "High-confidence rows are candidates for auto-materialization after activation.",
    "Rows marked for review will be sent to the Shop Boost review queue before go-live.",
  ];

  const domains: PreflightDomainSummary[] = Array.from(domainAccumulator.entries())
    .map(([domain, bucket]) => ({
      domain,
      detected: bucket.detected,
      likelyAutoImport: bucket.auto,
      likelyNeedsReview: bucket.review,
      potentialBlockers: bucket.blockers,
      confidence:
        bucket.confidenceCount > 0
          ? Math.round((bucket.confidenceTotal / bucket.confidenceCount) * 100)
          : 0,
    }))
    .sort((a, b) => b.detected - a.detected);

  return {
    totals: {
      detectedRecords,
      estimatedAutoImportCoverage: coverage,
      likelyAutoImportCount,
      likelyReviewNeededCount,
      likelyBlockerCount,
    },
    confidence: {
      score,
      label: confidenceLabel(score),
      readiness,
      integrityStatus,
    },
    blockers,
    domains,
    projectedPreparation,
    reviewNotes,
  };
}
