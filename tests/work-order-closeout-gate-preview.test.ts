import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listAiRecommendationsForSubjectMock,
  listAiEvidenceSnapshotsForSubjectMock,
} = vi.hoisted(() => ({
  listAiRecommendationsForSubjectMock: vi.fn(),
  listAiEvidenceSnapshotsForSubjectMock: vi.fn(),
}));

vi.mock("@/features/ai/server", () => ({
  listAiRecommendationsForSubject: listAiRecommendationsForSubjectMock,
  listAiEvidenceSnapshotsForSubject: listAiEvidenceSnapshotsForSubjectMock,
}));

import { getWorkOrderCloseoutGatePreview } from "@/features/ai/server/domains/workOrders/getWorkOrderCloseoutGatePreview";

function createSupabaseMock(workOrderExists: boolean) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: workOrderExists ? { id: "wo-1", shop_id: "shop-1" } : null,
              error: null,
            })),
          })),
        })),
      })),
    })),
  };
}

const actor = {
  shopId: "shop-1",
  actorId: "actor-1",
  role: "advisor",
  source: "manual" as const,
};

describe("getWorkOrderCloseoutGatePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAiRecommendationsForSubjectMock.mockResolvedValue([]);
    listAiEvidenceSnapshotsForSubjectMock.mockResolvedValue([]);
  });

  it("returns safe preview-only empty DTO when no recommendations are present", async () => {
    const supabase = createSupabaseMock(true);

    const preview = await getWorkOrderCloseoutGatePreview({
      supabase: supabase as never,
      actor,
      workOrderId: "wo-1",
    });

    expect(preview).toMatchObject({
      workOrderId: "wo-1",
      mode: "preview_only",
      enabled: false,
      wouldBlockIfEnabled: false,
      closeoutCurrentlyBlocked: false,
      executionBlocked: true,
      blockingCandidateCount: 0,
      advisoryCount: 0,
      missingDataCount: 0,
      items: [],
    });
    expect(preview?.emptyStateHint).toContain("No closeout preview recommendations yet");
  });

  it("maps closeout risk recommendation into wouldBlockIfEnabled while keeping closeoutCurrentlyBlocked false", async () => {
    const supabase = createSupabaseMock(true);
    listAiRecommendationsForSubjectMock.mockResolvedValue([
      {
        id: "rec-1",
        recommendation_type: "closeout_risk_inspection_incomplete",
        title: "Do not close yet — inspection is incomplete",
        summary: "Inspection incomplete",
        status: "open",
        risk_tier: "high",
        source: "work_order_closeout_rules",
        created_at: "2026-04-24T00:00:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
        missing_data: ["inspection_answers_pending"],
        recommended_action: { details: "Finalize inspection" },
        metadata: {
          would_block_closeout_future: true,
          blocks_closeout: false,
        },
      },
    ]);

    const preview = await getWorkOrderCloseoutGatePreview({
      supabase: supabase as never,
      actor,
      workOrderId: "wo-1",
    });

    expect(preview?.wouldBlockIfEnabled).toBe(true);
    expect(preview?.blockingCandidateCount).toBe(1);
    expect(preview?.closeoutCurrentlyBlocked).toBe(false);
    expect(preview?.items[0]).toMatchObject({
      recommendationId: "rec-1",
      wouldBlockIfEnabled: true,
      missingData: ["inspection_answers_pending"],
    });
  });

  it("surfaces missing data and stale records safely", async () => {
    const supabase = createSupabaseMock(true);
    listAiRecommendationsForSubjectMock.mockResolvedValue([
      {
        id: "rec-2",
        recommendation_type: "closeout_risk_missing_verification",
        title: "Verification missing",
        summary: "Notes missing",
        status: "acknowledged",
        risk_tier: "medium",
        source: "work_order_closeout_rules",
        created_at: "2026-04-24T00:00:00.000Z",
        expires_at: "2020-01-01T00:00:00.000Z",
        missing_data: ["cause_missing", "correction_missing"],
        recommended_action: { label: "Review closeout" },
        metadata: {
          would_block_closeout_future: false,
        },
      },
    ]);
    listAiEvidenceSnapshotsForSubjectMock.mockResolvedValue([
      {
        id: "ev-1",
        created_at: "2026-04-20T00:00:00.000Z",
        freshness_at: "2026-04-20T00:00:00.000Z",
      },
    ]);

    const preview = await getWorkOrderCloseoutGatePreview({
      supabase: supabase as never,
      actor,
      workOrderId: "wo-1",
    });

    expect(preview?.missingDataCount).toBe(2);
    expect(preview?.stale).toBe(true);
  });

  it("returns null for cross-shop or missing work order", async () => {
    const supabase = createSupabaseMock(false);

    const preview = await getWorkOrderCloseoutGatePreview({
      supabase: supabase as never,
      actor,
      workOrderId: "wo-missing",
    });

    expect(preview).toBeNull();
    expect(listAiRecommendationsForSubjectMock).not.toHaveBeenCalled();
  });

  it("never exposes raw evidence snapshot payloads or owner PIN proof metadata", async () => {
    const supabase = createSupabaseMock(true);
    listAiRecommendationsForSubjectMock.mockResolvedValue([
      {
        id: "rec-3",
        recommendation_type: "closeout_risk_job_lines_incomplete",
        title: "Job lines incomplete",
        summary: "Line still active",
        status: "open",
        risk_tier: "high",
        source: "work_order_closeout_rules",
        created_at: "2026-04-24T00:00:00.000Z",
        expires_at: null,
        missing_data: [],
        recommended_action: { details: "Finish lines" },
        metadata: {
          ownerPinProofRef: { proofType: "owner_pin_attestation", verificationRef: "secret" },
          rawEvidence: { privateField: "should_not_leak" },
        },
      },
    ]);

    const preview = await getWorkOrderCloseoutGatePreview({
      supabase: supabase as never,
      actor,
      workOrderId: "wo-1",
    });

    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain("ownerPinProofRef");
    expect(serialized).not.toContain("verificationRef");
    expect(serialized).not.toContain("rawEvidence");
    expect(serialized).not.toContain("privateField");
  });
});
