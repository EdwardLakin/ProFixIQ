import { buildActivationPlanSummary } from "@/features/onboarding-agent/lib/summaries";

export function buildDryRunActivationPlan(input: {
  sessionId: string;
  entityStatusCountsByType: Record<string, Record<string, number>>;
  linkRows: Array<{ link_type: string; status?: string | null }>;
  reviewCountsBySeverity: Record<string, number>;
}) {
  const summary = buildActivationPlanSummary({
    entityStatusCountsByType: input.entityStatusCountsByType,
    linkRows: input.linkRows,
    reviewCountsBySeverity: input.reviewCountsBySeverity,
  });

  const risks: string[] = [];
  if (summary.blockingIssues > 0) risks.push(`${summary.blockingIssues} high/blocking review items must be resolved before activation.`);
  if (summary.historicalInvoicesReady > 0 && !input.linkRows.some((row) => row.link_type === "work_order_invoice")) {
    risks.push("Historical invoices are staged but some work order links still need review.");
  }

  return {
    sessionId: input.sessionId,
    mode: "dry_run" as const,
    ...summary,
    risks,
  };
}
