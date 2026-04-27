import { describe, expect, it } from "vitest";
import { fingerprintForDomain } from "@/features/onboarding-agent/lib/fingerprints";
import { buildStagedLinks } from "@/features/onboarding-agent/lib/graph";
import { normalizeRow } from "@/features/onboarding-agent/lib/normalization";
import { stageEntityFromNormalized } from "@/features/onboarding-agent/lib/staging";
import { buildDeterministicFallbackReport } from "@/features/onboarding-agent/server/runOnboardingAgentAnalysis";

function stage(domain: any, row: Record<string, string>, sourceRowIndex = 0) {
  const normalized = normalizeRow(domain, row);
  return stageEntityFromNormalized({
    domain,
    normalized: normalized.normalized,
    displayName: normalized.displayName,
    sourceFileId: "file-1",
    sourceRowId: `row-${sourceRowIndex}`,
    sourceRowIndex,
    shopId: "shop-1",
    sessionId: "session-1",
    canonicalFingerprint: fingerprintForDomain(domain, normalized.normalized),
  });
}

describe("onboarding staging", () => {
  it("analyze creates staged entities from customer rows", () => {
    const staged = stage("customers", { "Customer ID": "C-1", "Full Name": "Jane Doe", Email: "jane@example.com" });
    expect(staged.entity?.entity_type).toBe("customer");
    expect(staged.entity?.status).toBe("ready");
  });

  it("creates vehicle entities and customer_vehicle links when source ids match", () => {
    const customer = stage("customers", { "Customer ID": "C-1", Name: "Jane", Email: "jane@example.com" }).entity;
    const vehicle = stage("vehicles", { "Vehicle ID": "V-1", "Customer ID": "C-1", VIN: "1HGCM82633A004352" }).entity;
    const graph = buildStagedLinks({
      shopId: "shop-1",
      sessionId: "session-1",
      entities: [
        { id: "customer-1", entity_type: customer!.entity_type, normalized: customer!.normalized, source_external_id: customer!.source_external_id },
        { id: "vehicle-1", entity_type: vehicle!.entity_type, normalized: vehicle!.normalized, source_external_id: vehicle!.source_external_id },
      ],
    });

    expect(graph.links.some((link) => link.link_type === "customer_vehicle")).toBe(true);
  });

  it("creates historical_work_order and historical_invoice entities", () => {
    const wo = stage("history", { "Work Order": "RO-1", "Customer ID": "C-1", Complaint: "noise" }).entity;
    const invoice = stage("invoices", { Invoice: "INV-1", "Work Order": "RO-1", Total: "500" }).entity;
    expect(wo?.entity_type).toBe("historical_work_order");
    expect(invoice?.entity_type).toBe("historical_invoice");
  });

  it("creates work_order_invoice links when invoice references work order id", () => {
    const wo = stage("history", { "Work Order": "RO-1", "Customer ID": "C-1", Complaint: "noise" }).entity;
    const invoice = stage("invoices", { Invoice: "INV-1", "Work Order": "RO-1", Total: "500" }).entity;
    const graph = buildStagedLinks({
      shopId: "shop-1",
      sessionId: "session-1",
      entities: [
        { id: "wo-1", entity_type: wo!.entity_type, normalized: wo!.normalized },
        { id: "invoice-1", entity_type: invoice!.entity_type, normalized: invoice!.normalized },
      ],
    });
    expect(graph.links.some((link) => link.link_type === "work_order_invoice")).toBe(true);
  });

  it("missing identity creates review item instead of fake entity", () => {
    const staged = stage("customers", { Notes: "no identifying data" });
    expect(staged.entity).toBeNull();
    expect(staged.reviewItems.some((item) => item.issue_type === "missing_identity")).toBe(true);
  });

  it("repeated analysis inputs produce deterministic non-duplicated link set", () => {
    const customer = stage("customers", { "Customer ID": "C-1", Name: "Jane", Email: "jane@example.com" }).entity;
    const vehicle = stage("vehicles", { "Vehicle ID": "V-1", "Customer ID": "C-1", VIN: "1HGCM82633A004352" }).entity;

    const entities = [
      { id: "customer-1", entity_type: customer!.entity_type, normalized: customer!.normalized },
      { id: "vehicle-1", entity_type: vehicle!.entity_type, normalized: vehicle!.normalized },
      { id: "vehicle-1-dup", entity_type: vehicle!.entity_type, normalized: vehicle!.normalized },
    ];

    const graph = buildStagedLinks({ shopId: "shop-1", sessionId: "session-1", entities });
    expect(graph.links.filter((link) => link.link_type === "customer_vehicle").length).toBe(2);

    const graphAgain = buildStagedLinks({ shopId: "shop-1", sessionId: "session-1", entities });
    expect(graphAgain.links.length).toBe(graph.links.length);
  });

  it("liveRecordsCreated remains 0", () => {
    const report = buildDeterministicFallbackReport({
      sessionId: "session-1",
      shopId: "shop-1",
      files: [],
      deterministicDomainDetections: {},
      deterministicStagedEntityCounts: {},
      deterministicLinkCounts: {},
      deterministicReviewItems: [],
      activationPlanSummary: null,
    });
    expect(report.liveRecordsCreated).toBe(0);
  });

  it("deterministic report carries non-empty entity/link count input", () => {
    const report = buildDeterministicFallbackReport({
      sessionId: "session-1",
      shopId: "shop-1",
      files: [
        {
          id: "file-1",
          filename: "customers.csv",
          declaredDomain: "customers",
          detectedDomain: "customers",
          parseStatus: "parsed",
          headers: ["Customer ID"],
          rowCount: 2,
          sampleRows: [],
        },
      ],
      deterministicDomainDetections: { customers: 1 },
      deterministicStagedEntityCounts: { customer: 2 },
      deterministicLinkCounts: { customer_vehicle: 1 },
      deterministicReviewItems: [],
      activationPlanSummary: null,
    });

    expect(report.summary).toContain("customers: 2");
    expect(report.summary).toContain("confident links: 1");
  });
});
