import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";

export type EntityStatus = "ready" | "needs_review" | "duplicate_candidate";

export type StageEntityInput = {
  domain: OnboardingDomain;
  normalized: Record<string, unknown>;
  displayName: string | null;
  sourceFileId: string;
  sourceRowId: string | null;
  sourceRowIndex: number;
  shopId: string;
  sessionId: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function has(value: unknown): boolean {
  return text(value).length > 0;
}

function hasNumber(value: unknown): boolean {
  return typeof value === "number" ? Number.isFinite(value) : has(value);
}

function sourceExternalIdForDomain(domain: OnboardingDomain, normalized: Record<string, unknown>): string | null {
  if (domain === "customers") return text(normalized.sourceCustomerId) || null;
  if (domain === "vehicles") return text(normalized.sourceVehicleId) || null;
  if (domain === "history") return text(normalized.sourceWorkOrderId) || null;
  if (domain === "invoices") return text(normalized.invoiceNumber) || null;
  if (domain === "parts") return text(normalized.sku) || text(normalized.partNumber) || null;
  if (domain === "vendors") return text(normalized.accountNumber) || null;
  return null;
}

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

export function stageEntityFromNormalized(input: StageEntityInput & { canonicalFingerprint: string | null }) {
  const n = input.normalized;
  const domain = input.domain;

  if (domain === "unknown" || domain === "menu" || domain === "inspections") {
    return {
      entity: null,
      reviewItems: [
        makeReviewItem({
          shopId: input.shopId,
          sessionId: input.sessionId,
          severity: "medium",
          domain,
          issueType: "unsupported_row",
          summary: "Row could not be mapped to a staged entity in this phase.",
          details: { sourceRowIndex: input.sourceRowIndex },
        }),
      ],
    };
  }

  let status: EntityStatus = "needs_review";
  let confidence = 0.6;
  let reviewReason: string | null = "missing_identity";
  const reviewItems: ReturnType<typeof makeReviewItem>[] = [];

  if (domain === "customers") {
    const identityName = has(n.name) || has(n.businessName);
    const identityContact = has(n.email) || has(n.phone);
    if (identityName && identityContact) {
      status = "ready";
      confidence = 0.9;
      reviewReason = null;
    }
  }

  if (domain === "vehicles") {
    const hasIdentity = has(n.vin) || has(n.plate) || has(n.unitNumber);
    const hasCustomerHint = has(n.sourceCustomerId) || has(n.customerEmail) || has(n.customerPhone) || has(n.customerName);
    if (hasIdentity && hasCustomerHint) {
      status = "ready";
      confidence = 0.9;
      reviewReason = null;
    }
  }

  if (domain === "history") {
    const hasWorkOrderId = has(n.sourceWorkOrderId);
    const hasLinkHint = has(n.sourceCustomerId) || has(n.sourceVehicleId) || has(n.vehicleVin) || has(n.vehiclePlate);
    const hasDescription = has(n.complaint) || has(n.cause) || has(n.correction);
    if (hasWorkOrderId && hasLinkHint && hasDescription) {
      status = "ready";
      confidence = 0.88;
      reviewReason = null;
    }
  }

  if (domain === "invoices") {
    const hasInvoiceId = has(n.invoiceNumber);
    const hasAmountOrRo = hasNumber(n.total) || has(n.sourceWorkOrderId);
    const invalidMoney = has(n.totalRaw) && typeof n.total === "number" && !Number.isFinite(n.total);
    if (invalidMoney) {
      reviewItems.push(
        makeReviewItem({
          shopId: input.shopId,
          sessionId: input.sessionId,
          severity: "high",
          domain: "invoices",
          issueType: "invalid_money",
          summary: `Invoice row ${input.sourceRowIndex + 1} has invalid money format`,
          details: { value: n.totalRaw },
        }),
      );
    }
    if (hasInvoiceId && hasAmountOrRo) {
      status = "ready";
      confidence = 0.88;
      reviewReason = null;
    }
  }

  if (domain === "parts") {
    if (has(n.sku) || has(n.partNumber) || has(n.description) || has(n.name)) {
      status = "ready";
      confidence = 0.82;
      reviewReason = null;
    }
  }

  if (domain === "vendors") {
    const hasName = has(n.name);
    const hasIdentity = has(n.email) || has(n.phone) || has(n.accountNumber);
    if (hasName && hasIdentity) {
      status = "ready";
      confidence = 0.86;
      reviewReason = null;
    }
  }

  if (domain === "staff") {
    const hasIdentity = has(n.email) || (has(n.name) && has(n.role));
    if (hasIdentity) {
      status = "ready";
      confidence = 0.84;
      reviewReason = null;
    }
  }

  if (!input.canonicalFingerprint && !has(input.displayName)) {
    return {
      entity: null,
      reviewItems: [
        ...reviewItems,
        makeReviewItem({
          shopId: input.shopId,
          sessionId: input.sessionId,
          severity: "high",
          domain,
          issueType: "missing_identity",
          summary: `${domain} row ${input.sourceRowIndex + 1} is missing identity fields`,
          details: { sourceRowIndex: input.sourceRowIndex },
        }),
      ],
    };
  }

  if (status === "needs_review") {
    reviewItems.push(
      makeReviewItem({
        shopId: input.shopId,
        sessionId: input.sessionId,
        severity: "medium",
        domain,
        issueType: "needs_review",
        summary: `${domain} row ${input.sourceRowIndex + 1} needs review before activation planning`,
      }),
    );
  }

  return {
    entity: {
      shop_id: input.shopId,
      session_id: input.sessionId,
      entity_type:
        domain === "history"
          ? "historical_work_order"
          : domain === "invoices"
            ? "historical_invoice"
            : domain === "parts"
              ? "part"
              : domain === "vendors"
                ? "vendor"
                : domain === "staff"
                  ? "staff_candidate"
                  : domain.slice(0, -1),
      source_file_id: input.sourceFileId,
      source_row_id: input.sourceRowId,
      source_row_index: input.sourceRowIndex,
      source_external_id: sourceExternalIdForDomain(domain, n),
      canonical_fingerprint: input.canonicalFingerprint,
      display_name: input.displayName,
      normalized: n,
      confidence,
      status,
      review_reason: reviewReason,
    },
    reviewItems,
  };
}

export function markDuplicateEntities(
  entities: Array<{ canonical_fingerprint: string | null; status: string; source_row_index: number; entity_type: string }>,
  context: { shopId: string; sessionId: string },
) {
  const reviews: ReturnType<typeof makeReviewItem>[] = [];
  const counts = new Map<string, number>();
  for (const entity of entities) {
    const fingerprint = text(entity.canonical_fingerprint);
    if (!fingerprint) continue;
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }

  for (const entity of entities) {
    const fingerprint = text(entity.canonical_fingerprint);
    const count = fingerprint ? counts.get(fingerprint) ?? 0 : 0;
    if (count > 1) {
      entity.status = "duplicate_candidate";
      reviews.push(
        makeReviewItem({
          shopId: context.shopId,
          sessionId: context.sessionId,
          severity: "medium",
          domain: entity.entity_type,
          issueType: "duplicate_candidate",
          summary: `${entity.entity_type} row ${entity.source_row_index + 1} is a duplicate candidate`,
          details: { canonicalFingerprint: fingerprint, duplicateCount: count },
        }),
      );
    }
  }

  return reviews;
}
