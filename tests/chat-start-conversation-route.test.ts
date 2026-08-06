import { beforeEach, describe, expect, it, vi } from "vitest";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mocks = vi.hoisted(() => {
  const conversations = new Map<string, { id: string; created_by: string }>();
  const getUser = vi.fn();
  const rpc = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === "conversations") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_column: string, id: string) => ({
            maybeSingle: vi.fn(async () => ({
              data: conversations.get(id) ?? null,
              error: null,
            })),
          })),
        })),
      };
    }
    return {};
  });
  return {
    conversations,
    getUser,
    rpc,
    from,
    authorizeConversationCreate: vi.fn(),
    authorizeConversationContext: vi.fn(),
  };
});

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: () => ({
    auth: { getUser: mocks.getUser },
  }),
  createAdminSupabase: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/features/ai/lib/chat/authorization", () => ({
  authorizeConversationCreate: mocks.authorizeConversationCreate,
  isCustomerMessagingRole: vi.fn(() => true),
  participantSeedForActor: vi.fn(
    (actor: { userId: string; customerId: string }) => ({
      userId: actor.userId,
      kind: "customer",
      profileId: null,
      customerId: actor.customerId,
      role: "customer",
    }),
  ),
}));

vi.mock("@/features/chat/server/conversationContext", () => ({
  authorizeConversationContext: mocks.authorizeConversationContext,
}));

function startRequest(body: Record<string, unknown>): Request {
  return new Request("https://profixiq.test/api/chat/start-conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/start-conversation", () => {
  beforeEach(() => {
    mocks.conversations.clear();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "customer-user-1" } },
    });
    mocks.authorizeConversationCreate.mockResolvedValue({
      ok: true,
      actor: {
        kind: "customer",
        userId: "customer-user-1",
        customerId: "customer-1",
        shopId: "shop-1",
        role: null,
        profileId: null,
      },
      actorShopId: "shop-1",
      channel: "customer",
      customerId: "customer-1",
      recipientUserIds: ["advisor-user-1"],
      participantKinds: { "advisor-user-1": "staff" },
      recipientParticipants: [
        {
          userId: "advisor-user-1",
          kind: "staff",
          profileId: "advisor-profile-1",
          customerId: null,
          role: "advisor",
        },
      ],
    });
    mocks.authorizeConversationContext.mockResolvedValue({
      ok: true,
      anchors: {
        context_type: null,
        context_id: null,
        customer_id: "customer-1",
        work_order_id: null,
        vehicle_id: null,
        booking_id: null,
      },
    });
    mocks.rpc.mockImplementation(
      async (_fn: string, args: Record<string, string>) => {
        mocks.conversations.set(args._conversation_id, {
          id: args._conversation_id,
          created_by: args._created_by,
        });
        return { data: args._conversation_id, error: null };
      },
    );
  });

  it("normalizes a stale non-UUID request ID into a replayable conversation ID", async () => {
    const { POST } = await import("../app/api/chat/start-conversation/route");
    const body = {
      request_id: "legacy-offline-draft-id",
      actor_kind: "customer",
      channel: "customer",
      participant_ids: ["advisor-user-1"],
      context_type: null,
      context_id: null,
      title: "Message from customer",
    };

    const firstResponse = await POST(startRequest(body));
    const firstPayload = await firstResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(firstPayload.id).toMatch(UUID_RE);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_actor_messaging_conversation",
      expect.objectContaining({
        _participants: expect.arrayContaining([
          expect.objectContaining({ participant_kind: "customer" }),
          expect.objectContaining({ participant_kind: "staff" }),
        ]),
      }),
    );

    const secondResponse = await POST(startRequest(body));
    const secondPayload = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondPayload).toEqual({ id: firstPayload.id, reused: true });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
