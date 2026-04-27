export type PendingReviewItem = {
  id?: string;
  severity: "low" | "medium" | "high" | "blocking";
  domain?: string | null;
  issue_type?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  status?: string | null;
};

export type CanonicalEntityRow = { entity_type: string; status?: string | null };
export type CanonicalLinkRow = { link_type: string; status?: string | null };

export const ENTITY_BUCKETS = [
  "customer",
  "vehicle",
  "historical_work_order",
  "historical_invoice",
  "part",
  "vendor",
  "staff_candidate",
  "menu_suggestion",
  "inspection_suggestion",
  "unknown",
] as const;

export const LINK_BUCKETS = ["customer_vehicle", "customer_work_order", "vehicle_work_order", "work_order_invoice", "vendor_part", "service_menu_suggestion"] as const;

const ENTITY_STATUSES = ["ready", "needs_review", "duplicate_candidate", "rejected", "ignored"] as const;

function topExamples(values: unknown[], max = 3) {
  return values.filter(Boolean).slice(0, max);
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function deriveReadiness(input: {
  rowsParsed: number;
  analysisCompleted: boolean;
  readyEntities: number;
  blockingOrHighReviewItems: number;
  planReadyTotal: number;
}) {
  if (!input.analysisCompleted) return "not_ready" as const;
  if (input.rowsParsed === 0) return "empty" as const;
  if (input.readyEntities === 0) return "review_required" as const;
  if (input.blockingOrHighReviewItems > 0) return "review_required" as const;
  if (input.planReadyTotal === 0) return "review_required" as const;
  return "ready_for_dry_run" as const;
}

function emptyEntityStatusCounts() {
  return ENTITY_STATUSES.reduce<Record<string, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});
}

function mapDomainReviewCount(entityStatusCountsByType: Record<string, Record<string, number>>) {
  const domainCounts: Record<string, number> = {};
  for (const [entityType, statusCounts] of Object.entries(entityStatusCountsByType)) {
    const reviewCount = toNumber(statusCounts.needs_review) + toNumber(statusCounts.duplicate_candidate);
    if (reviewCount > 0) domainCounts[entityType] = reviewCount;
  }
  return domainCounts;
}

export function buildActivationPlanSummary(input: {
  entityStatusCountsByType: Record<string, Record<string, number>>;
  linkRows: CanonicalLinkRow[];
  reviewCountsBySeverity: Record<string, number>;
}) {
  const ready = (entityType: string) => toNumber(input.entityStatusCountsByType[entityType]?.ready);
  const needsReview = (entityType: string) => toNumber(input.entityStatusCountsByType[entityType]?.needs_review);
  const duplicateCandidate = (entityType: string) => toNumber(input.entityStatusCountsByType[entityType]?.duplicate_candidate);

  const linksReady = input.linkRows.filter((row) => (row.status ?? "staged") === "staged").length;
  const linksNeedReview = input.linkRows.filter((row) => (row.status ?? "staged") !== "staged").length;

  const blockingIssues = toNumber(input.reviewCountsBySeverity.blocking) + toNumber(input.reviewCountsBySeverity.high);
  const reviewNeeded =
    toNumber(input.reviewCountsBySeverity.medium)
    + toNumber(input.reviewCountsBySeverity.low)
    + linksNeedReview
    + Object.values(input.entityStatusCountsByType).reduce(
      (sum, counts) => sum + toNumber(counts.needs_review) + toNumber(counts.duplicate_candidate),
      0,
    );

  return {
    customersReady: ready("customer"),
    vehiclesReady: ready("vehicle"),
    historicalWorkOrdersReady: ready("historical_work_order"),
    historicalInvoicesReady: ready("historical_invoice"),
    partsReady: ready("part"),
    vendorsReady: ready("vendor"),
    staffCandidatesReady: ready("staff_candidate"),
    menuSuggestionsReady: ready("menu_suggestion"),
    inspectionSuggestionsReady: ready("inspection_suggestion"),
    linksReady,
    blockingIssues,
    reviewNeeded,
    activationDisabled: true as const,
    liveRecordsCreated: 0 as const,
    byEntityType: {
      customer: { ready: ready("customer"), needs_review: needsReview("customer"), duplicate_candidate: duplicateCandidate("customer") },
      vehicle: { ready: ready("vehicle"), needs_review: needsReview("vehicle"), duplicate_candidate: duplicateCandidate("vehicle") },
      historical_work_order: { ready: ready("historical_work_order"), needs_review: needsReview("historical_work_order"), duplicate_candidate: duplicateCandidate("historical_work_order") },
      historical_invoice: { ready: ready("historical_invoice"), needs_review: needsReview("historical_invoice"), duplicate_candidate: duplicateCandidate("historical_invoice") },
      part: { ready: ready("part"), needs_review: needsReview("part"), duplicate_candidate: duplicateCandidate("part") },
      vendor: { ready: ready("vendor"), needs_review: needsReview("vendor"), duplicate_candidate: duplicateCandidate("vendor") },
      staff_candidate: { ready: ready("staff_candidate"), needs_review: needsReview("staff_candidate"), duplicate_candidate: duplicateCandidate("staff_candidate") },
      menu_suggestion: { ready: ready("menu_suggestion"), needs_review: needsReview("menu_suggestion"), duplicate_candidate: duplicateCandidate("menu_suggestion") },
      inspection_suggestion: { ready: ready("inspection_suggestion"), needs_review: needsReview("inspection_suggestion"), duplicate_candidate: duplicateCandidate("inspection_suggestion") },
    },
  };
}

export function groupReviewItems(items: PendingReviewItem[]) {
  const grouped = new Map<string, {
    severity: PendingReviewItem["severity"];
    domain: string;
    issue_type: string;
    count: number;
    sampleRows: number[];
    sampleValues: unknown[];
    examples: Array<{ summary: string; details: Record<string, unknown> }>;
  }>();

  for (const item of items) {
    const domain = item.domain ?? "unknown";
    const issueType = item.issue_type ?? "issue";
    const key = `${domain}|${issueType}|${item.severity}`;
    const details = (item.details ?? {}) as Record<string, unknown>;
    const sourceRowIndex = Number(details.sourceRowIndex ?? -1);
    const sampleValue = details.value ?? details.sourceCustomerId ?? details.sourceWorkOrderId ?? details.vendorName ?? details.customerEmail;

    if (!grouped.has(key)) {
      grouped.set(key, {
        severity: item.severity,
        domain,
        issue_type: issueType,
        count: 0,
        sampleRows: [],
        sampleValues: [],
        examples: [],
      });
    }
    const target = grouped.get(key)!;
    target.count += 1;
    if (sourceRowIndex >= 0 && target.sampleRows.length < 5) target.sampleRows.push(sourceRowIndex + 1);
    if (sampleValue && target.sampleValues.length < 5) target.sampleValues.push(sampleValue);
    if (target.examples.length < 3) target.examples.push({ summary: item.summary, details });
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.count - a.count)
    .map((group) => ({
      id: `${group.domain}:${group.issue_type}:${group.severity}`,
      severity: group.severity,
      domain: group.domain,
      issue_type: group.issue_type,
      summary: `${group.count.toLocaleString()} ${group.domain} rows: ${group.issue_type.replace(/_/g, " ")}`,
      count: group.count,
      sampleRowIndexes: group.sampleRows,
      sampleNormalizedValues: topExamples(group.sampleValues),
      recommended_action: "Review examples, adjust mappings where needed, then rerun analysis.",
      details: { examples: group.examples },
    }));
}

export function buildOnboardingSummary(input: {
  filesCount: number;
  rowsParsed: number;
  entityRows: CanonicalEntityRow[];
  linkRows: CanonicalLinkRow[];
  reviewRows: PendingReviewItem[];
  groupedExceptionCount?: number;
  analysisCompleted?: boolean;
}) {
  const entityCounts = ENTITY_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

  const entityStatusCountsByType = ENTITY_BUCKETS.reduce<Record<string, Record<string, number>>>((acc, key) => {
    acc[key] = emptyEntityStatusCounts();
    return acc;
  }, {});

  for (const row of input.entityRows) {
    const entityType = row.entity_type;
    entityCounts[entityType] = (entityCounts[entityType] ?? 0) + 1;
    const status = String(row.status ?? "ready");
    const statusCounts = entityStatusCountsByType[entityType] ?? (entityStatusCountsByType[entityType] = emptyEntityStatusCounts());
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  const linkCounts = LINK_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
  for (const row of input.linkRows) linkCounts[row.link_type] = (linkCounts[row.link_type] ?? 0) + 1;

  const pending = input.reviewRows.filter((row) => !row.status || row.status === "pending");
  const reviewCountsByDomain: Record<string, number> = {};
  const reviewCountsBySeverity: Record<string, number> = { blocking: 0, high: 0, medium: 0, low: 0 };
  for (const row of pending) {
    reviewCountsBySeverity[row.severity] = (reviewCountsBySeverity[row.severity] ?? 0) + 1;
    const domain = row.domain ?? "unknown";
    reviewCountsByDomain[domain] = (reviewCountsByDomain[domain] ?? 0) + 1;
  }

  const totalEntities = Object.values(entityCounts).reduce((sum, count) => sum + count, 0);
  const totalLinks = Object.values(linkCounts).reduce((sum, count) => sum + count, 0);
  const totalReviewItems = Object.values(reviewCountsBySeverity).reduce((sum, count) => sum + count, 0);
  const readyEntityTotal = Object.values(entityStatusCountsByType).reduce((sum, counts) => sum + toNumber(counts.ready), 0);

  const activationPlanSummary = buildActivationPlanSummary({
    entityStatusCountsByType,
    linkRows: input.linkRows,
    reviewCountsBySeverity,
  });

  const activationReadiness = deriveReadiness({
    rowsParsed: input.rowsParsed,
    analysisCompleted: Boolean(input.analysisCompleted ?? true),
    readyEntities: readyEntityTotal,
    blockingOrHighReviewItems: activationPlanSummary.blockingIssues,
    planReadyTotal:
      activationPlanSummary.customersReady
      + activationPlanSummary.vehiclesReady
      + activationPlanSummary.historicalWorkOrdersReady
      + activationPlanSummary.historicalInvoicesReady
      + activationPlanSummary.partsReady
      + activationPlanSummary.vendorsReady
      + activationPlanSummary.staffCandidatesReady
      + activationPlanSummary.menuSuggestionsReady
      + activationPlanSummary.inspectionSuggestionsReady,
  });

  return {
    files_count: input.filesCount,
    rows_parsed: input.rowsParsed,
    total_entities: totalEntities,
    entity_counts_by_type: entityCounts,
    entity_status_counts_by_type: entityStatusCountsByType,
    total_links: totalLinks,
    link_counts_by_type: linkCounts,
    total_review_items: totalReviewItems,
    review_counts_by_domain: {
      ...reviewCountsByDomain,
      ...mapDomainReviewCount(entityStatusCountsByType),
    },
    review_counts_by_severity: reviewCountsBySeverity,
    grouped_exception_count: input.groupedExceptionCount ?? 0,
    activation_readiness: activationReadiness,
    activation_plan_summary: activationPlanSummary,
    liveRecordsCreated: 0 as const,
    summaryCounts: {
      uploadedFiles: input.filesCount,
      rowsParsed: input.rowsParsed,
      entitiesDiscovered: totalEntities,
      linksFound: totalLinks,
      reviewExceptions: totalReviewItems,
      groupedExceptionCount: input.groupedExceptionCount ?? 0,
      liveRecordsCreated: 0 as const,
    },
  };
}
