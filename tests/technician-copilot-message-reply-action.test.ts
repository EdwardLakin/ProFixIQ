import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";
import { sendTechnicianCopilotMessage } from "@/features/copilot/technician/server/messages";

const technicianUserId = "11111111-1111-4111-8111-111111111111";
const dispatcherUserId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";
const outsiderUserId = "99999999-9999-4999-8999-999999999999";

function fakeSupabase(options: {
  existingClientMessageId?: string | null;
  insertError?: { message: string } | null;
} = {}): {
  client: SupabaseClient<Database>;
  insertCalls: Record<string, unknown>[];
} {
  const insertCalls: Record<string, unknown>[] = [];

  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          or: () => ({
            maybeSingle: async () => ({
              data: {
                id: "profile-tech",
                user_id: technicianUserId,
                shop_id: "shop-1",
                role: "technician",
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "customers") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }
    if (table === "conversations") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: conversationId,
                channel: "internal",
                customer_id: null,
                shop_id: "shop-1",
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "conversation_participants") {
      return {
        select: () => ({
          eq: async () => ({
            data: [
              {
                id: "tech-participant",
                conversation_id: conversationId,
                user_id: technicianUserId,
                participant_kind: "staff",
                customer_id: null,
                profile_id: "profile-tech",
                role: "technician",
                added_at: null,
              },
              {
                id: "dispatcher-participant",
                conversation_id: conversationId,
                user_id: dispatcherUserId,
                participant_kind: "staff",
                customer_id: null,
                profile_id: "profile-dispatcher",
                role: "advisor",
                added_at: null,
              },
            ],
            error: null,
          }),
        }),
      };
    }
    if (table === "messages") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.existingClientMessageId
                  ? { id: "existing-message-id" }
                  : null,
                error: null,
              }),
            }),
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          insertCalls.push(row);
          return { error: options.insertError ?? null };
        },
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { client: { from } as unknown as SupabaseClient<Database>, insertCalls };
}

describe("sendTechnicianCopilotMessage", () => {
  it("sends to every other participant and never invents a recipient", async () => {
    const { client, insertCalls } = fakeSupabase();

    const result = await sendTechnicianCopilotMessage({
      supabase: client,
      actorUserId: technicianUserId,
      conversationId,
      content: "On it, five minutes out.",
      clientMessageId: "turn-1",
    });

    expect(result).toEqual({ ok: true, idempotent: false });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      conversation_id: conversationId,
      sender_id: technicianUserId,
      client_message_id: "turn-1",
      content: "On it, five minutes out.",
      recipients: [dispatcherUserId],
    });
  });

  it("is idempotent on a retried turnId instead of double-sending", async () => {
    const { client, insertCalls } = fakeSupabase({
      existingClientMessageId: "turn-1",
    });

    const result = await sendTechnicianCopilotMessage({
      supabase: client,
      actorUserId: technicianUserId,
      conversationId,
      content: "On it, five minutes out.",
      clientMessageId: "turn-1",
    });

    expect(result).toEqual({ ok: true, idempotent: true });
    expect(insertCalls).toHaveLength(0);
  });

  it("refuses to send when the actor isn't actually a participant", async () => {
    const { client, insertCalls } = fakeSupabase();

    const result = await sendTechnicianCopilotMessage({
      supabase: client,
      actorUserId: outsiderUserId,
      conversationId,
      content: "Should never send.",
      clientMessageId: "turn-2",
    });

    expect(result.ok).toBe(false);
    expect(insertCalls).toHaveLength(0);
  });

  it("surfaces an insert failure without throwing", async () => {
    const { client } = fakeSupabase({
      insertError: { message: "constraint violation" },
    });

    const result = await sendTechnicianCopilotMessage({
      supabase: client,
      actorUserId: technicianUserId,
      conversationId,
      content: "On it.",
      clientMessageId: "turn-3",
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "constraint violation",
    });
  });
});
