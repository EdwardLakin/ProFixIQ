import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_ACTION_EVENT_TYPES } from "./eventTypes";
import * as types from "./types";

const getAiActionPreviewMock = vi.fn();
const logAiActionEventMock = vi.fn();
const assertAiOwnerPinProofReferenceMock = vi.fn((value: unknown, _args?: unknown) => value);

vi.mock("./actionPreviews", () => ({
  getAiActionPreview: (...args: unknown[]) => getAiActionPreviewMock.apply(null, args),
}));

vi.mock("./actionEvents", () => ({
  logAiActionEvent: (...args: unknown[]) => logAiActionEventMock.apply(null, args),
}));

vi.mock("./ownerPinProof", () => ({
  assertAiOwnerPinProofReference: (value: unknown, args?: unknown) =>
    assertAiOwnerPinProofReferenceMock(value, args),
}));

import { requestAiActionPreviewApproval } from "./actionApprovals";
import { assertAiActionCanExecute } from "./safeActions";

const BASE_ACTOR = { shopId: "shop_1", actorId: "actor_1", source: "manual" as const };

function buildPreview(overrides: Record<string, unknown> = {}) {
  return {
    id: "pv_1",
    shop_id: "shop_1",
    recommendation_id: "rec_1",
    domain: "work_orders",
    action_type: "demo",
    subject_type: "work_order",
    subject_id: "wo_1",
    status: "approval_required",
    preview_payload: {},
    intended_mutations: [],
    affected_records: [],
    side_effects: [],
    compensation_plan: {},
    idempotency_key: null,
    requires_approval: true,
    requires_owner_pin: false,
    risk_tier: "medium",
    evidence_snapshot_id: null,
    created_by: "actor_1",
    created_at: "2026-04-24T00:00:00.000Z",
    updated_at: "2026-04-24T00:00:00.000Z",
    expires_at: null,
    metadata: {},
    ...overrides,
  } as never;
}

function mockFromTable(args: {
  pending?: Record<string, unknown> | null;
  inserted?: Record<string, unknown>;
}) {
  return vi.spyOn(types, "fromTable").mockImplementation((_, table: string) => {
    if (table !== "ai_action_approvals") {
      throw new Error(`unexpected table ${table}`);
    }

    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      maybeSingle: async () => ({ data: (args.pending ?? null) as never, error: null }),
      insert(payload: unknown) {
        return {
          select() {
            return this;
          },
          single: async () => ({
            data: {
              id: "appr_1",
              shop_id: "shop_1",
              action_preview_id: "pv_1",
              status: "pending",
              requested_by: "actor_1",
              requested_at: "2026-04-24T00:00:00.000Z",
              decided_by: null,
              decided_at: null,
              decision_note: null,
              owner_pin_required: false,
              owner_pin_verified: false,
              owner_pin_verification_ref: null,
              expires_at: null,
              metadata: payload as never,
              ...args.inserted,
            } as never,
            error: null,
          }),
        };
      },
    } as never;
  });
}

describe("requestAiActionPreviewApproval", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getAiActionPreviewMock.mockReset();
    logAiActionEventMock.mockReset();
    assertAiOwnerPinProofReferenceMock.mockReset();
    assertAiOwnerPinProofReferenceMock.mockImplementation((value: unknown) => value);
  });

  it("creates a pending approval for an approval-required preview", async () => {
    getAiActionPreviewMock.mockResolvedValue(buildPreview());
    mockFromTable({});

    const result = await requestAiActionPreviewApproval({} as never, BASE_ACTOR, { previewId: "pv_1" });

    expect(result.created).toBe(true);
    expect(result.executionBlocked).toBe(true);
    expect(result.approval.status).toBe("pending");
    expect(logAiActionEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_REQUESTED }),
    );
  });

  it("returns existing pending approval and avoids duplicates", async () => {
    getAiActionPreviewMock.mockResolvedValue(buildPreview());
    mockFromTable({
      pending: {
        id: "appr_existing",
        action_preview_id: "pv_1",
        status: "pending",
      },
    });

    const result = await requestAiActionPreviewApproval({} as never, BASE_ACTOR, { previewId: "pv_1" });

    expect(result.created).toBe(false);
    expect(result.approval.id).toBe("appr_existing");
    expect(logAiActionEventMock).not.toHaveBeenCalled();
  });

  it("rejects low-risk preview when approval is not required", async () => {
    getAiActionPreviewMock.mockResolvedValue(buildPreview({ requires_approval: false, risk_tier: "low", preview_payload: {}, metadata: {} }));
    mockFromTable({});

    await expect(requestAiActionPreviewApproval({} as never, BASE_ACTOR, { previewId: "pv_1" })).rejects.toThrow(
      "does not require approval",
    );
  });

  it("rejects terminal preview states", async () => {
    getAiActionPreviewMock.mockResolvedValue(buildPreview({ status: "executed" }));
    mockFromTable({});

    await expect(requestAiActionPreviewApproval({} as never, BASE_ACTOR, { previewId: "pv_1" })).rejects.toThrow(
      "terminal state",
    );
  });

  it("rejects cross-shop lookup via scoped preview fetch", async () => {
    getAiActionPreviewMock.mockResolvedValue(null);
    mockFromTable({});

    await expect(requestAiActionPreviewApproval({} as never, BASE_ACTOR, { previewId: "pv_other" })).rejects.toThrow(
      "not found",
    );
  });

  it("rejects missing owner PIN proof when required", async () => {
    getAiActionPreviewMock.mockResolvedValue(buildPreview({ requires_owner_pin: true }));
    mockFromTable({});

    await expect(requestAiActionPreviewApproval({} as never, BASE_ACTOR, { previewId: "pv_1" })).rejects.toThrow(
      "owner PIN proof is required",
    );
  });

  it("rejects owner PIN proof shop/actor mismatch", async () => {
    getAiActionPreviewMock.mockResolvedValue(buildPreview({ requires_owner_pin: true }));
    mockFromTable({});
    assertAiOwnerPinProofReferenceMock.mockImplementationOnce(() => {
      throw new Error("owner PIN proof reference actor mismatch");
    });

    await expect(
      requestAiActionPreviewApproval({} as never, BASE_ACTOR, {
        previewId: "pv_1",
        ownerPinProofRef: { proofType: "owner_pin_attestation" } as never,
      }),
    ).rejects.toThrow("invalid owner PIN proof reference");
  });

  it("stores owner PIN proof as metadata reference only", async () => {
    getAiActionPreviewMock.mockResolvedValue(buildPreview({ requires_owner_pin: true }));
    const fromTableSpy = mockFromTable({});

    const proofRef = {
      proofType: "owner_pin_attestation",
      shopId: "shop_1",
      actorId: "actor_1",
      purpose: "ai_action_approval_high_risk",
      verifiedAt: "2026-04-24T10:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      verificationRef: "verify_1",
    };

    await requestAiActionPreviewApproval({} as never, BASE_ACTOR, {
      previewId: "pv_1",
      ownerPinProofRef: proofRef as never,
    });

    const approvalsTableCalls = fromTableSpy.mock.calls.filter((entry) => entry[1] === "ai_action_approvals");
    expect(approvalsTableCalls.length).toBeGreaterThan(0);
    expect(logAiActionEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: AI_ACTION_EVENT_TYPES.OWNER_PIN_PROOF_ATTACHED }),
    );
  });

  it("keeps execution blocked even after approval request exists", async () => {
    const result = await assertAiActionCanExecute(
      {} as never,
      BASE_ACTOR,
      { actionPreviewId: "pv_1" },
    );

    expect(result.allowed).toBe(false);
  });

  it("includes action approval requested in event taxonomy", () => {
    expect(AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_REQUESTED).toBe("action_approval.requested");
  });
});
