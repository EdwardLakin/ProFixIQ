export function makeReviewItem(params: {
  shopId: string;
  sessionId: string;
  entityId?: string;
  severity: "low" | "medium" | "high" | "blocking";
  domain?: string;
  issueType: string;
  summary: string;
  details?: Record<string, unknown>;
}) {
  return {
    shop_id: params.shopId,
    session_id: params.sessionId,
    entity_id: params.entityId ?? null,
    severity: params.severity,
    domain: params.domain ?? null,
    issue_type: params.issueType,
    summary: params.summary,
    details: params.details ?? {},
    status: "pending",
  };
}
