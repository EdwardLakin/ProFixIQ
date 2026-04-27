import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";
import { createHash } from "node:crypto";

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

export function stableUuidFromParts(parts: Array<string | number | null | undefined>): string {
  const seed = parts.map((part) => String(part ?? "")).join("|");
  const hex = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

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
  if (domain === "vehicles") return text(normalized.sourceVehicleId) || text(normalized.vin) || text(normalized.plate) || null;
  if (domain === "history") return text(normalized.sourceWorkOrderId) || text(normalized.invoiceId) || null;
  if (domain === "invoices") return text(normalized.invoiceNumber) || text(normalized.sourceWorkOrderId) || null;
  if (domain === "parts") return text(normalized.sku) || text(normalized.partNumber) || null;
  if (domain === "vendors") return text(normalized.accountNumber) || text(normalized.name) || null;
  if (domain === "staff") return text(normalized.email) || text(normalized.username) || text(normalized.name) || null;
  if (domain === "menu") return text(normalized.serviceName) || text(normalized.description) || null;
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

  if (domain === "unknown" || domain === "inspections") {
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
  let confidence = 0.62;
  let reviewReason: string | null = "missing_identity";
  const reviewItems: ReturnType<typeof makeReviewItem>[] = [];

  if (domain === "customers") {
    const hasIdentity = has(n.email) || has(n.phone) || has(n.sourceCustomerId) || has(n.name) || has(n.businessName);
    if (hasIdentity) {
      status = "ready";
      confidence = 0.9;
      reviewReason = null;
    }
  }

  if (domain === "vehicles") {
    const hasIdentity = has(n.vin) || has(n.plate) || has(n.unitNumber) || has(n.sourceVehicleId) || (has(n.year) && has(n.make) && has(n.model));
    if (hasIdentity) {
      status = "ready";
      confidence = 0.88;
      reviewReason = null;
    }
  }

  if (domain === "history") {
    const hasPrimary = has(n.sourceWorkOrderId) || has(n.invoiceId);
    const hasNarrative = has(n.complaint) || has(n.cause) || has(n.correction) || has(n.serviceDescription);
    const hasDate = has(n.openedDate) || has(n.closedDate);
    const hasOdometerNarrative = has(n.odometer) && hasNarrative;
    if (hasPrimary || (hasDate && hasNarrative) || hasOdometerNarrative) {
      status = "ready";
      confidence = 0.86;
      reviewReason = null;
    }
  }

  if (domain === "invoices") {
    const hasContext = has(n.sourceCustomerId) || has(n.customerEmail) || has(n.customerName)
      || has(n.sourceWorkOrderId) || has(n.sourceVehicleId) || has(n.vehicleVin) || has(n.vehiclePlate);
    const hasIdentity = has(n.invoiceNumber)
      || has(n.sourceWorkOrderId)
      || (has(n.invoiceDate) && hasNumber(n.total))
      || (hasContext && (has(n.invoiceDate) || hasNumber(n.total)));
    if (hasIdentity) {
      status = "ready";
      confidence = 0.86;
      reviewReason = null;
    }
  }

  if (domain === "parts") {
    if (has(n.sku) || has(n.partNumber) || has(n.description) || has(n.vendorPartNumber)) {
      status = "ready";
      confidence = 0.82;
      reviewReason = null;
    }
  }

  if (domain === "vendors") {
    if (has(n.name) || has(n.sourceVendorId) || has(n.accountNumber) || has(n.email) || has(n.phone)) {
      status = "ready";
      confidence = 0.84;
      reviewReason = null;
    }
  }

  if (domain === "staff") {
    if (has(n.name) || has(n.email) || has(n.username) || has(n.role)) {
      status = "ready";
      confidence = 0.82;
      reviewReason = null;
    }
  }

  if (domain === "menu") {
    if (has(n.serviceName) || has(n.description) || has(n.laborHours) || hasNumber(n.laborPrice)) {
      status = "ready";
      confidence = 0.8;
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
          details: { sourceRowIndex: input.sourceRowIndex, normalized: n },
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
        details: { sourceRowIndex: input.sourceRowIndex, normalized: n },
      }),
    );
  }

  const entityTypeByDomain: Record<string, string> = {
    customers: "customer",
    vehicles: "vehicle",
    history: "historical_work_order",
    invoices: "historical_invoice",
    parts: "part",
    vendors: "vendor",
    staff: "staff_candidate",
    menu: "menu_suggestion",
  };

  return {
    entity: {
      id: stableUuidFromParts([
        "onboarding_entity",
        input.shopId,
        input.sessionId,
        input.sourceFileId,
        input.sourceRowIndex,
        entityTypeByDomain[domain] ?? "unknown",
      ]),
      shop_id: input.shopId,
      session_id: input.sessionId,
      entity_type: entityTypeByDomain[domain] ?? "unknown",
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
          details: { canonicalFingerprint: fingerprint, duplicateCount: count, sourceRowIndex: entity.source_row_index },
        }),
      );
    }
  }

  return reviews;
}
