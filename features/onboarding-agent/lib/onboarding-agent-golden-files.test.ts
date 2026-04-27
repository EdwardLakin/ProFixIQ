import { describe, expect, it } from "vitest";
import { detectFileDomain } from "@/features/onboarding-agent/lib/fileDetection";
import { buildEffectiveHeaderMap } from "@/features/onboarding-agent/lib/headerMapping";
import { normalizeRow } from "@/features/onboarding-agent/lib/normalization";
import { stageEntityFromNormalized } from "@/features/onboarding-agent/lib/staging";
import { fingerprintForDomain } from "@/features/onboarding-agent/lib/fingerprints";
import { buildStagedLinks } from "@/features/onboarding-agent/lib/graph";
import { buildOnboardingSummary } from "@/features/onboarding-agent/lib/summaries";
import { GOLDEN_FILE_FIXTURES } from "@/features/onboarding-agent/lib/goldenFixtures";

function remapHeaders(raw: Record<string, string>, map: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = map[key] ?? key;
    if (!out[mapped] || !out[mapped].trim()) out[mapped] = value;
  }
  return out;
}

describe("onboarding golden file contract", () => {
  it("stages all 8 golden files with deterministic domain + mapping contract", () => {
    const entities: Array<{ id: string; entity_type: string; status?: string | null; normalized: Record<string, unknown>; fileName: string }> = [];
    const allReviewItems: Array<{ severity: "low" | "medium" | "high" | "blocking"; domain?: string | null; issue_type?: string | null; summary: string; status?: string | null }> = [];

    for (const fixture of GOLDEN_FILE_FIXTURES) {
      const domain = detectFileDomain({
        filename: fixture.fileName,
        headers: fixture.headers,
        declaredDomain: "customers",
      });
      expect(domain).toBe(fixture.expectedDomain);

      const effective = buildEffectiveHeaderMap({
        domain,
        headers: fixture.headers,
        aiHeaderMap: {},
      });
      expect(effective.mappedColumnCount).toBeGreaterThan(0);
      for (const field of fixture.minimumCanonicalFields) {
        expect(Object.values(effective.headerMap)).toContain(field);
      }

      const stagedForFixture: Array<{ id: string; entity_type: string; status?: string | null; normalized: Record<string, unknown>; fileName: string }> = [];
      fixture.rows.forEach((row, index) => {
        const remapped = remapHeaders(row, effective.headerMap);
        const normalized = normalizeRow(domain, remapped);

        if (index === 0) {
          for (const field of fixture.minimumCanonicalFields) {
            expect(Object.keys(normalized.normalized)).toContain(field);
          }
        }

        const staged = stageEntityFromNormalized({
          domain,
          normalized: normalized.normalized,
          displayName: normalized.displayName,
          sourceFileId: fixture.fileName,
          sourceRowId: `${fixture.fileName}-${index}`,
          sourceRowIndex: index,
          shopId: "shop-1",
          sessionId: "session-1",
          canonicalFingerprint: fingerprintForDomain(domain, normalized.normalized),
        });

        if (staged.entity) {
          const entity = {
            id: `${fixture.fileName}-entity-${index}`,
            entity_type: staged.entity.entity_type,
            status: staged.entity.status,
            normalized: staged.entity.normalized,
            fileName: fixture.fileName,
          };
          entities.push(entity);
          stagedForFixture.push(entity);
        }
        allReviewItems.push(...staged.reviewItems.map((item) => ({
          severity: item.severity,
          domain: item.domain,
          issue_type: item.issue_type,
          summary: item.summary,
          status: "pending",
        })));
      });

      const readyCount = stagedForFixture.filter((entity) => entity.status === "ready").length;
      expect(readyCount).toBeGreaterThanOrEqual(2);
      expect(stagedForFixture.every((entity) => entity.entity_type === fixture.expectedEntityType)).toBe(true);
      expect(stagedForFixture.some((entity) => entity.entity_type === "customer" && fixture.expectedEntityType !== "customer")).toBe(false);
    }

    const graph = buildStagedLinks({
      entities: entities.map((entity) => ({
        id: entity.id,
        entity_type: entity.entity_type,
        status: entity.status,
        normalized: entity.normalized,
      })),
      shopId: "shop-1",
      sessionId: "session-1",
    });

    expect(graph.links.some((link) => link.link_type === "customer_vehicle")).toBe(true);
    expect(graph.links.some((link) => link.link_type === "vehicle_work_order")).toBe(true);
    expect(graph.links.some((link) => link.link_type === "work_order_invoice")).toBe(true);
    expect(graph.links.some((link) => link.link_type === "vendor_part")).toBe(true);

    const noVehicles = buildStagedLinks({
      entities: entities.filter((entity) => entity.entity_type !== "vehicle").map((entity) => ({ id: entity.id, entity_type: entity.entity_type, status: entity.status, normalized: entity.normalized })),
      shopId: "shop-1",
      sessionId: "session-1",
    });
    expect(noVehicles.links.filter((link) => link.link_type === "customer_vehicle")).toHaveLength(0);
    expect(noVehicles.links.filter((link) => link.link_type === "vehicle_work_order")).toHaveLength(0);

    const noWorkOrders = buildStagedLinks({
      entities: entities.filter((entity) => entity.entity_type !== "historical_work_order").map((entity) => ({ id: entity.id, entity_type: entity.entity_type, status: entity.status, normalized: entity.normalized })),
      shopId: "shop-1",
      sessionId: "session-1",
    });
    expect(noWorkOrders.links.filter((link) => link.link_type === "work_order_invoice")).toHaveLength(0);

    const noParts = buildStagedLinks({
      entities: entities.filter((entity) => entity.entity_type !== "part").map((entity) => ({ id: entity.id, entity_type: entity.entity_type, status: entity.status, normalized: entity.normalized })),
      shopId: "shop-1",
      sessionId: "session-1",
    });
    expect(noParts.links.filter((link) => link.link_type === "vendor_part")).toHaveLength(0);
    expect(noParts.reviewItems.some((item) => item.issue_type === "missing_vendor_link")).toBe(false);

    const summary = buildOnboardingSummary({
      filesCount: GOLDEN_FILE_FIXTURES.length,
      rowsParsed: GOLDEN_FILE_FIXTURES.reduce((sum, fixture) => sum + fixture.rows.length, 0),
      entityRows: entities.map((entity) => ({ entity_type: entity.entity_type, status: entity.status })),
      linkRows: graph.links.map((link) => ({ link_type: link.link_type, status: link.status })),
      reviewRows: allReviewItems,
      analysisCompleted: true,
    });

    expect(summary.total_entities).toBe(16);
    expect(summary.review_counts_by_domain.parts ?? 0).toBeGreaterThanOrEqual(0);
  });
});
