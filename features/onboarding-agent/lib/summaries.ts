export type PendingReviewItem = {
  id?: string;
  severity: "low" | "medium" | "high" | "blocking";
  domain?: string | null;
  issue_type?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  status?: string | null;
};

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

function topExamples(values: unknown[], max = 3) {
  return values.filter(Boolean).slice(0, max);
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
  entityRows: Array<{ entity_type: string }>;
  linkRows: Array<{ link_type: string }>;
  reviewRows: PendingReviewItem[];
  groupedExceptionCount?: number;
  activationReadiness?: string;
}) {
  const entityCounts = ENTITY_BUCKETS.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
  for (const row of input.entityRows) entityCounts[row.entity_type] = (entityCounts[row.entity_type] ?? 0) + 1;

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

  return {
    files_count: input.filesCount,
    rows_parsed: input.rowsParsed,
    total_entities: totalEntities,
    entity_counts_by_type: entityCounts,
    total_links: totalLinks,
    link_counts_by_type: linkCounts,
    total_review_items: totalReviewItems,
    review_counts_by_domain: reviewCountsByDomain,
    review_counts_by_severity: reviewCountsBySeverity,
    grouped_exception_count: input.groupedExceptionCount ?? 0,
    activation_readiness: input.activationReadiness ?? "review_required",
    liveRecordsCreated: 0 as const,
  };
}
