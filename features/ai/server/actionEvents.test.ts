import { beforeEach, describe, expect, it, vi } from "vitest";
import * as types from "./types";
import { AI_ACTION_EVENT_TYPES } from "./eventTypes";

const { adminClient, createAdminSupabaseMock } = vi.hoisted(() => {
  const client = { trusted: "service-role" };
  return {
    adminClient: client,
    createAdminSupabaseMock: vi.fn(() => client),
  };
});

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

import { logAiActionEvent } from "./actionEvents";

describe("logAiActionEvent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createAdminSupabaseMock.mockClear();
  });

  it("stores trusted system actor names as metadata with a nullable profile actor", async () => {
    let insertedPayload: Record<string, unknown> | null = null;
    vi.spyOn(types, "fromTable").mockImplementation((client, table) => {
      expect(client).toBe(adminClient);
      expect(table).toBe("ai_action_events");

      return {
        insert(payload: Record<string, unknown>) {
          insertedPayload = payload;
          return {
            select() {
              return this;
            },
            single: async () => ({ data: { id: "event_1", ...payload }, error: null }),
          };
        },
      } as never;
    });

    await logAiActionEvent({} as never, {
      shopId: "11111111-1111-4111-8111-111111111111",
      actorId: "ai-maintenance-expirer",
      role: "system",
      source: "system",
    }, {
      eventType: AI_ACTION_EVENT_TYPES.RECOMMENDATION_EXPIRED,
      metadata: { reason: "scheduled" },
    });

    expect(insertedPayload).toEqual(expect.objectContaining({
      actor_id: null,
      actor_role: "system",
      source: "system",
      metadata: {
        reason: "scheduled",
        system_actor_id: "ai-maintenance-expirer",
      },
    }));
  });

  it("rejects a non-UUID manual actor instead of writing an invalid audit identity", async () => {
    await expect(logAiActionEvent({} as never, {
      shopId: "11111111-1111-4111-8111-111111111111",
      actorId: "not-a-profile-id",
      source: "manual",
    }, {
      eventType: AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_REQUESTED,
    })).rejects.toThrow("actorId must be a profile UUID");

    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });
});
