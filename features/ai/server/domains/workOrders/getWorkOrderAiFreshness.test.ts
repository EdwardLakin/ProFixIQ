import { describe, expect, it } from "vitest";
import { evaluateWorkOrderAiFreshness } from "@/features/ai/server/domains/workOrders/getWorkOrderAiFreshness";

const NOW = "2026-04-24T12:00:00.000Z";

describe("getWorkOrderAiFreshness", () => {
  it("returns missing when no evidence or recommendations exist", () => {
    const result = evaluateWorkOrderAiFreshness({
      workOrderId: "wo-1",
      generatedAt: NOW,
      evidenceRows: [],
      recommendationRows: [],
      previewRows: [],
    });

    expect(result.status).toBe("missing");
    expect(result.label).toBe("Missing");
  });

  it("returns fresh for recent evidence/recommendations", () => {
    const result = evaluateWorkOrderAiFreshness({
      workOrderId: "wo-1",
      generatedAt: NOW,
      evidenceRows: [
        {
          created_at: "2026-04-24T10:30:00.000Z",
          freshness_at: "2026-04-24T10:30:00.000Z",
          missing_data: [],
        },
      ],
      recommendationRows: [
        {
          id: "rec-1",
          created_at: "2026-04-24T10:45:00.000Z",
          status: "open",
          expires_at: "2026-04-25T10:45:00.000Z",
          missing_data: [],
        },
      ],
      previewRows: [{ recommendation_id: "rec-1" }],
    });

    expect(result.status).toBe("fresh");
    expect(result.hasPreviewReady).toBe(true);
    expect(result.openRecommendationCount).toBe(1);
  });

  it("returns aging for signals older than 24h and within 72h", () => {
    const result = evaluateWorkOrderAiFreshness({
      workOrderId: "wo-1",
      generatedAt: NOW,
      evidenceRows: [
        {
          created_at: "2026-04-23T00:00:00.000Z",
          freshness_at: "2026-04-23T00:00:00.000Z",
          missing_data: [],
        },
      ],
      recommendationRows: [
        {
          id: "rec-1",
          created_at: "2026-04-23T00:00:00.000Z",
          status: "acknowledged",
          expires_at: "2026-04-26T00:00:00.000Z",
          missing_data: [],
        },
      ],
      previewRows: [],
    });

    expect(result.status).toBe("aging");
  });

  it("returns stale for recommendation stale/expired window breaches", () => {
    const result = evaluateWorkOrderAiFreshness({
      workOrderId: "wo-1",
      generatedAt: NOW,
      evidenceRows: [
        {
          created_at: "2026-04-20T00:00:00.000Z",
          freshness_at: "2026-04-20T00:00:00.000Z",
          missing_data: [],
        },
      ],
      recommendationRows: [
        {
          id: "rec-1",
          created_at: "2026-04-20T00:00:00.000Z",
          status: "open",
          expires_at: "2026-04-21T00:00:00.000Z",
          missing_data: [],
        },
      ],
      previewRows: [],
    });

    expect(result.status).toBe("stale");
    expect(result.staleRecommendationCount).toBe(1);
  });

  it("returns needs_refresh when missing data or expired recommendations are present", () => {
    const result = evaluateWorkOrderAiFreshness({
      workOrderId: "wo-1",
      generatedAt: NOW,
      evidenceRows: [
        {
          created_at: "2026-04-24T10:30:00.000Z",
          freshness_at: "2026-04-24T10:30:00.000Z",
          missing_data: ["approval_status"],
        },
      ],
      recommendationRows: [
        {
          id: "rec-1",
          created_at: "2026-04-24T10:45:00.000Z",
          status: "expired",
          expires_at: "2026-04-24T11:00:00.000Z",
          missing_data: ["parts_eta"],
        },
      ],
      previewRows: [],
    });

    expect(result.status).toBe("needs_refresh");
    expect(result.expiredRecommendationCount).toBe(1);
    expect(result.missingDataCount).toBeGreaterThan(0);
  });

  it("returns safe DTO-only fields", () => {
    const result = evaluateWorkOrderAiFreshness({
      workOrderId: "wo-1",
      generatedAt: NOW,
      evidenceRows: [],
      recommendationRows: [],
      previewRows: [],
    });

    expect(Object.keys(result)).not.toContain("snapshot");
    expect(Object.keys(result)).not.toContain("owner_pin_verification_ref");
    expect(Object.keys(result)).not.toContain("intended_mutations");
    expect(Object.keys(result)).not.toContain("preview_payload");
  });
});
