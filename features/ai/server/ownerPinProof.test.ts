import { describe, expect, it, vi } from "vitest";
import {
  AI_OWNER_PIN_PROOF_PURPOSES,
  AI_OWNER_PIN_PROOF_TYPE,
  assertAiOwnerPinProofReference,
  isAiOwnerPinProofReference,
} from "./ownerPinProof";

vi.mock("./actionPreviews", () => ({
  getAiActionPreview: vi.fn(async () => ({ id: "pv_1" })),
  createAiActionPreview: vi.fn(),
}));

import { assertAiActionCanExecute, buildAiActionPreview } from "./safeActions";
import { createAiActionPreview } from "./actionPreviews";

const BASE_PROOF = {
  proofType: AI_OWNER_PIN_PROOF_TYPE,
  shopId: "shop_1",
  actorId: "actor_1",
  purpose: AI_OWNER_PIN_PROOF_PURPOSES.ACTION_APPROVAL_HIGH_RISK,
  verifiedAt: new Date("2026-04-24T10:00:00.000Z").toISOString(),
  expiresAt: new Date("2099-01-01T00:00:00.000Z").toISOString(),
  verificationRef: "ref_123",
};

describe("owner PIN proof reference validation", () => {
  it("accepts a valid proof reference shape", () => {
    expect(isAiOwnerPinProofReference(BASE_PROOF)).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(isAiOwnerPinProofReference({ ...BASE_PROOF, shopId: "" })).toBe(false);
    expect(isAiOwnerPinProofReference({ ...BASE_PROOF, actorId: "" })).toBe(false);
    expect(isAiOwnerPinProofReference({ ...BASE_PROOF, purpose: "" })).toBe(false);
    expect(isAiOwnerPinProofReference({ ...BASE_PROOF, expiresAt: "" })).toBe(false);
  });

  it("rejects expired proofs", () => {
    expect(
      isAiOwnerPinProofReference({
        ...BASE_PROOF,
        expiresAt: new Date("2020-01-01T00:00:00.000Z").toISOString(),
      }),
    ).toBe(false);
  });

  it("rejects plaintext PIN-like fields", () => {
    expect(isAiOwnerPinProofReference({ ...BASE_PROOF, pin: "1234" })).toBe(false);
    expect(isAiOwnerPinProofReference({ ...BASE_PROOF, owner_pin_hash: "hash" })).toBe(false);
    expect(isAiOwnerPinProofReference({ ...BASE_PROOF, token: "jwt" })).toBe(false);
  });

  it("rejects cross-shop proof mismatch assertions", () => {
    expect(() =>
      assertAiOwnerPinProofReference(BASE_PROOF, {
        expectedShopId: "shop_2",
      }),
    ).toThrow("shop mismatch");
  });
});

describe("safe action execution remains blocked", () => {
  it("blocks execution even when owner pin proof ref is supplied", async () => {
    const result = await assertAiActionCanExecute(
      {} as never,
      { shopId: "shop_1", actorId: "actor_1", source: "manual" },
      { actionPreviewId: "pv_1", ownerPinProofRef: BASE_PROOF },
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not enabled");
  });
});


describe("low-risk preview behavior", () => {
  it("keeps low-risk preview owner pin behavior unchanged by default", async () => {
    const createPreviewMock = vi.mocked(createAiActionPreview);
    createPreviewMock.mockResolvedValueOnce({ id: "pv_new" } as never);

    await buildAiActionPreview(
      {} as never,
      { shopId: "shop_1", actorId: "actor_1", source: "manual" },
      {
        domain: "work_orders",
        actionType: "noop",
        subjectType: "work_order",
        riskTier: "low",
      },
    );

    expect(createPreviewMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ requiresOwnerPin: false }),
    );
  });
});
