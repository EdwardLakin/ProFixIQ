import { beforeEach, describe, expect, it, vi } from "vitest";
import * as types from "./types";
import { AI_ACTION_EVENT_TYPES } from "./eventTypes";

const getAiActionPreviewMock = vi.fn();
const logAiActionEventMock = vi.fn();

vi.mock("./actionPreviews", () => ({
  getAiActionPreview: (...args: unknown[]) => getAiActionPreviewMock.apply(null, args),
}));

vi.mock("./actionEvents", () => ({
  logAiActionEvent: (...args: unknown[]) => logAiActionEventMock.apply(null, args),
}));

import { approveAiActionPreview, rejectAiActionPreview } from "./actionApprovals";

const ACTOR = { shopId: "shop_1", actorId: "actor_1", source: "manual" as const };

function mockFromTable(initialStatus: "pending" | "approved") {
  const calledTables: string[] = [];

  vi.spyOn(types, "fromTable").mockImplementation((_, table: string) => {
    calledTables.push(table);

    if (table === "ai_action_approvals") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "approval_1",
                  shop_id: "shop_1",
                  action_preview_id: "preview_1",
                  status: initialStatus,
                  owner_pin_required: false,
                  owner_pin_verified: false,
                  owner_pin_verification_ref: null,
                  metadata: {},
                },
                error: null,
              }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: "approval_1",
                    shop_id: "shop_1",
                    action_preview_id: "preview_1",
                    status: payload.status,
                    owner_pin_required: false,
                    owner_pin_verified: false,
                    owner_pin_verification_ref: null,
                    metadata: {},
                    decided_at: "2026-04-24T12:30:00.000Z",
                    decided_by: "actor_1",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as never;
    }

    if (table === "ai_action_previews") {
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            eq: async () => ({ data: { status: payload.status }, error: null }),
          }),
        }),
      } as never;
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return calledTables;
}

describe("approve/reject ai action approvals", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getAiActionPreviewMock.mockReset();
    logAiActionEventMock.mockReset();
    getAiActionPreviewMock.mockResolvedValue({
      id: "preview_1",
      shop_id: "shop_1",
      recommendation_id: "rec_1",
      status: "approval_required",
    });
  });

  it("allows pending -> approved and logs canonical event", async () => {
    const calledTables = mockFromTable("pending");

    const result = await approveAiActionPreview({} as never, ACTOR, { approvalId: "approval_1" });

    expect(result.status).toBe("approved");
    expect(logAiActionEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_APPROVED }),
    );
    expect(calledTables).toContain("ai_action_approvals");
    expect(calledTables).toContain("ai_action_previews");
  });

  it("allows pending -> rejected and logs canonical event", async () => {
    mockFromTable("pending");

    const result = await rejectAiActionPreview({} as never, ACTOR, { approvalId: "approval_1" });

    expect(result.status).toBe("rejected");
    expect(logAiActionEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_REJECTED }),
    );
  });

  it("rejects terminal status transitions", async () => {
    mockFromTable("approved");

    await expect(approveAiActionPreview({} as never, ACTOR, { approvalId: "approval_1" })).rejects.toThrow(
      "invalid approval status transition",
    );
  });
});
