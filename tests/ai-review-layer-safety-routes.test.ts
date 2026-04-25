import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireShopScopedApiAccessMock = vi.fn();
const listAiEvidenceSnapshotsForSubjectMock = vi.fn();
const listAiRecommendationsForSubjectMock = vi.fn();
const getAiRecommendationMock = vi.fn();
const createAiActionPreviewMock = vi.fn();
const logAiActionEventMock = vi.fn();
const requestAiActionPreviewApprovalMock = vi.fn();
const generateShopBoostEvidenceAndRecommendationsMock = vi.fn();
const generateWorkOrderEvidenceAndRecommendationsMock = vi.fn();
const reviewWorkOrderMock = vi.fn();
const approveAiActionPreviewMock = vi.fn();
const rejectAiActionPreviewMock = vi.fn();
const acknowledgeAiRecommendationMock = vi.fn();
const dismissAiRecommendationMock = vi.fn();
const resolveAiRecommendationMock = vi.fn();

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: requireShopScopedApiAccessMock,
}));

vi.mock("@/features/ai/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/ai/server")>("@/features/ai/server");
  return {
    ...actual,
    listAiEvidenceSnapshotsForSubject: listAiEvidenceSnapshotsForSubjectMock,
    listAiRecommendationsForSubject: listAiRecommendationsForSubjectMock,
    getAiRecommendation: getAiRecommendationMock,
    createAiActionPreview: createAiActionPreviewMock,
    logAiActionEvent: logAiActionEventMock,
    requestAiActionPreviewApproval: requestAiActionPreviewApprovalMock,
    approveAiActionPreview: approveAiActionPreviewMock,
    rejectAiActionPreview: rejectAiActionPreviewMock,
    acknowledgeAiRecommendation: acknowledgeAiRecommendationMock,
    dismissAiRecommendation: dismissAiRecommendationMock,
    resolveAiRecommendation: resolveAiRecommendationMock,
  };
});

vi.mock("@/features/ai/server/domains/workOrders", async () => {
  const actual = await vi.importActual<typeof import("@/features/ai/server/domains/workOrders")>("@/features/ai/server/domains/workOrders");
  return {
    ...actual,
    generateWorkOrderEvidenceAndRecommendations: generateWorkOrderEvidenceAndRecommendationsMock,
    buildWorkOrderActionPreviewPayload: vi.fn(() => ({
      action_type: "advisor_review_needed",
      intended_mutations: [{ op: "update", internal: true }],
      affected_records: [{ id: "wo_1" }],
      side_effects: ["queue_update"],
      compensation_plan: {},
      risk_tier: "high",
      evidence_snapshot_id: "ev_1",
      requires_approval: true,
      blocked_execution_reason: "blocked",
    })),
    buildWorkOrderPreviewIdempotencyKey: vi.fn(() => "idem_1"),
    normalizePreviewWarnings: vi.fn(() => ["preview_only"]),
  };
});

vi.mock("@/features/ai/server/domains/shopBoost", async () => {
  const actual = await vi.importActual<typeof import("@/features/ai/server/domains/shopBoost")>("@/features/ai/server/domains/shopBoost");
  return {
    ...actual,
    generateShopBoostPostActivationEvidenceAndRecommendations: generateShopBoostEvidenceAndRecommendationsMock,
  };
});

vi.mock("../app/api/work-orders/[id]/_lib/reviewWorkOrder", () => ({
  reviewWorkOrder: reviewWorkOrderMock,
}));

function createScopedSupabase(workOrderExists = true) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: workOrderExists ? { id: "wo_1", shop_id: "shop_1" } : null, error: null })),
          })),
        })),
      })),
    })),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  requireShopScopedApiAccessMock.mockResolvedValue({
    ok: true,
    profile: { id: "actor_1", role: "manager", shop_id: "shop_1" },
    supabase: createScopedSupabase(true),
  });
});

describe("review-layer route safe contracts", () => {
  it("work-order recommendations GET omits raw evidence snapshot payload", async () => {
    listAiRecommendationsForSubjectMock.mockResolvedValue([
      {
        id: "rec_1",
        title: "Dispatch review",
        summary: "Internal only",
        priority: "high",
        confidence: 0.8,
        risk_tier: "high",
        status: "open",
        recommendation_type: "dispatch_review",
        recommended_action: { label: "Review queue" },
        missing_data: ["assignment_missing"],
        created_at: "2026-04-24T00:00:00.000Z",
        evidence_snapshot_id: "ev_1",
        requires_approval: true,
        requires_owner_pin: false,
      },
    ]);
    listAiEvidenceSnapshotsForSubjectMock.mockResolvedValue([
      {
        id: "ev_1",
        evidence_kind: "work_order_operational",
        domain: "work_orders",
        subject_type: "work_order",
        subject_id: "wo_1",
        created_at: "2026-04-24T00:00:00.000Z",
        freshness_at: "2026-04-24T00:00:00.000Z",
        confidence: 0.9,
        missing_data: ["assignment_missing"],
        snapshot: { private: true },
        metadata: { internal: true },
      },
    ]);

    const { GET } = await import("../app/api/work-orders/[id]/ai/recommendations/route");
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "wo_1" }) });
    const json = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("\"snapshot\":");
    expect(serialized).not.toContain("metadata");
    expect(serialized).toContain("evidenceSnapshotId");
  });

  it("preview route GET/POST omit raw preview payload internals", async () => {
    getAiRecommendationMock.mockResolvedValue({
      id: "rec_1",
      shop_id: "shop_1",
      domain: "work_orders",
      subject_type: "work_order",
      subject_id: "wo_1",
    });
    createAiActionPreviewMock.mockResolvedValue({
      id: "preview_1",
      recommendation_id: "rec_1",
      action_type: "advisor_review_needed",
      subject_type: "work_order",
      subject_id: "wo_1",
      status: "approval_required",
      preview_payload: { label: "Preview", ownerPinProofRef: "secret" },
      intended_mutations: [{ op: "update" }],
      affected_records: [{ id: "wo_1" }],
      side_effects: ["queue_update"],
      requires_approval: true,
      requires_owner_pin: false,
      risk_tier: "high",
      evidence_snapshot_id: "ev_1",
      created_at: "2026-04-24T00:00:00.000Z",
      expires_at: null,
    });

    const { GET, POST } = await import("../app/api/work-orders/[id]/ai/recommendations/[recommendationId]/preview/route");
    const getResponse = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "wo_1", recommendationId: "rec_1" }),
    });
    const getJson = await getResponse.json() as Record<string, unknown>;
    expect(JSON.stringify(getJson)).not.toContain("preview_payload");

    const postResponse = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "wo_1", recommendationId: "rec_1" }),
    });
    const postJson = await postResponse.json() as Record<string, unknown>;
    const serialized = JSON.stringify(postJson);
    expect(serialized).not.toContain("intended_mutations");
    expect(serialized).not.toContain("ownerPinProofRef");
    expect(serialized).not.toContain("side_effects\":[{");
    expect(postJson.executionBlocked).toBe(true);
  });

  it("approval-request route returns minimal DTO and hides owner pin proof refs", async () => {
    requestAiActionPreviewApprovalMock.mockResolvedValue({
      approval: {
        id: "approval_1",
        status: "pending",
        requested_at: "2026-04-24T00:00:00.000Z",
        owner_pin_verification_ref: "proof",
        metadata: { ownerPinProofRef: "secret" },
      },
      preview: {
        id: "preview_1",
        requires_owner_pin: true,
      },
      created: true,
    });

    const { POST } = await import("../app/api/ai/action-previews/[previewId]/approval-request/route");
    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ reason: "please approve" }) }),
      { params: Promise.resolve({ previewId: "preview_1" }) },
    );

    const json = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(json);
    expect(response.status).toBe(201);
    expect(serialized).not.toContain("owner_pin_verification_ref");
    expect(serialized).not.toContain("ownerPinProofRef");
    expect(serialized).not.toContain("metadata");
    expect(serialized).toContain("approvalId");
    expect((json.approval as { executionBlocked?: boolean }).executionBlocked).toBe(true);
  });

  it("shop boost recommendations POST omits raw evidence snapshot payload", async () => {
    generateShopBoostEvidenceAndRecommendationsMock.mockResolvedValue({
      evidenceSnapshot: {
        id: "ev_sb_1",
        evidence_kind: "shop_boost",
        domain: "shop_boost",
        subject_type: "shop_boost_intake",
        subject_id: "intake_1",
        created_at: "2026-04-24T00:00:00.000Z",
        freshness_at: "2026-04-24T00:00:00.000Z",
        confidence: 0.9,
        missing_data: [],
        snapshot: { importPayload: "raw" },
        source_refs: [],
        metadata: { materializationPayload: "raw" },
      },
      recommendations: [],
      skippedDuplicates: [],
      missingData: [],
      warnings: [],
    });

    const { POST } = await import("../app/api/shop-boost/ai/recommendations/route");
    const response = await POST(new Request("http://localhost", { method: "POST", body: "{}" }));
    const json = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("importPayload");
    expect(serialized).not.toContain("materializationPayload");
    expect(serialized).toContain("evidenceSnapshotId");
  });

  it("legacy ai-review rejects unauthenticated and cross-shop access", async () => {
    requireShopScopedApiAccessMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    });
    const { POST } = await import("../app/api/work-orders/[id]/ai-review/route");
    const unauth = await POST(new Request("http://localhost/api/work-orders/wo_1/ai-review", { method: "POST" }));
    expect(unauth.status).toBe(401);

    requireShopScopedApiAccessMock.mockResolvedValueOnce({
      ok: true,
      profile: { id: "actor_1", role: "manager", shop_id: "shop_1" },
      supabase: createScopedSupabase(false),
    });
    const notFound = await POST(new Request("http://localhost/api/work-orders/wo_cross/ai-review", { method: "POST" }));
    expect(notFound.status).toBe(404);
    expect(reviewWorkOrderMock).not.toHaveBeenCalled();
  });

  it("approval decision route cannot accept execute/apply semantics", async () => {
    const { PATCH } = await import("../app/api/ai/action-approvals/[approvalId]/route");
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ decision: "execute" }),
      }),
      { params: Promise.resolve({ approvalId: "approval_1" }) },
    );

    expect(response.status).toBe(400);
    expect(approveAiActionPreviewMock).not.toHaveBeenCalled();
    expect(rejectAiActionPreviewMock).not.toHaveBeenCalled();
  });

  it("approval decision route returns explicit executionBlocked semantics", async () => {
    approveAiActionPreviewMock.mockResolvedValue({
      id: "approval_1",
      status: "approved",
      decided_at: "2026-04-24T00:00:00.000Z",
      decided_by: "actor_1",
    });

    const { PATCH } = await import("../app/api/ai/action-approvals/[approvalId]/route");
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ decision: "approved" }),
      }),
      { params: Promise.resolve({ approvalId: "approval_1" }) },
    );

    const json = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(json.executionBlocked).toBe(true);
  });

  it("work-order recommendation lifecycle PATCH returns serialized recommendation only", async () => {
    getAiRecommendationMock.mockResolvedValue({
      id: "rec_1",
      shop_id: "shop_1",
      domain: "work_orders",
      subject_type: "work_order",
      subject_id: "wo_1",
    });
    acknowledgeAiRecommendationMock.mockResolvedValue({
      id: "rec_1",
      shop_id: "shop_1",
      domain: "work_orders",
      recommendation_type: "dispatch_review",
      subject_type: "work_order",
      subject_id: "wo_1",
      title: "Dispatch review",
      summary: "Review dispatch line",
      status: "acknowledged",
      priority: "high",
      confidence: 0.9,
      risk_tier: "high",
      evidence_snapshot_id: "ev_1",
      evidence_snapshot_ids: ["ev_1"],
      missing_data: ["tech_assignment"],
      recommended_action: { label: "Review", details: "Review queue" },
      side_effects: ["queue_update"],
      requires_approval: true,
      requires_owner_pin: false,
      source: "manual",
      source_run_id: null,
      created_by: "actor_1",
      assigned_to: null,
      dismissed_by: null,
      dismissed_at: null,
      resolved_by: null,
      resolved_at: null,
      expires_at: null,
      created_at: "2026-04-24T00:00:00.000Z",
      updated_at: "2026-04-24T00:01:00.000Z",
      metadata: {
        token: "secret",
        preview_payload: { hidden: true },
        side_effects: [{ internal: true }],
        ownerPinProofRef: "/secret",
        owner_pin_verification_ref: "proof_ref",
      },
      preview_payload: { label: "leak" },
      intended_mutations: [{ op: "update" }],
    });

    const { PATCH } = await import("../app/api/work-orders/[id]/ai/recommendations/[recommendationId]/route");
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ action: "acknowledge", note: "safe note" }),
      }),
      { params: Promise.resolve({ id: "wo_1", recommendationId: "rec_1" }) },
    );

    const json = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(json);
    expect(response.status).toBe(200);
    expect(json.executionBlocked).toBe(true);
    expect(serialized).not.toContain("metadata");
    expect(serialized).not.toContain("\"snapshot\":");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("preview_payload");
    expect(serialized).not.toContain("intended_mutations");
    expect(serialized).not.toContain("side_effects\":[{");
    expect(serialized).not.toContain("ownerPinProofRef");
    expect(serialized).not.toContain("owner_pin_verification_ref");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("hash");
    expect(serialized).not.toContain("\"pin\":");
    expect((json.recommendation as { id?: string; status?: string; recommendation_type?: string }).id).toBe("rec_1");
    expect((json.recommendation as { status?: string }).status).toBe("acknowledged");
    expect((json.recommendation as { recommendation_type?: string }).recommendation_type).toBe("dispatch_review");
  });

  it("work-order recommendation lifecycle PATCH keeps shop scoping and recommendation ownership checks", async () => {
    getAiRecommendationMock.mockResolvedValue({
      id: "rec_cross_shop",
      shop_id: "shop_2",
      domain: "work_orders",
      subject_type: "work_order",
      subject_id: "wo_1",
    });

    const { PATCH } = await import("../app/api/work-orders/[id]/ai/recommendations/[recommendationId]/route");
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ action: "dismiss" }),
      }),
      { params: Promise.resolve({ id: "wo_1", recommendationId: "rec_cross_shop" }) },
    );

    expect(response.status).toBe(404);
    expect(dismissAiRecommendationMock).not.toHaveBeenCalled();
  });
});
