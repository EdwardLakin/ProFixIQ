import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendTechnicianCopilotMessage: vi.fn(),
}));

vi.mock("@/features/copilot/technician/server/messages", () => ({
  sendTechnicianCopilotMessage: mocks.sendTechnicianCopilotMessage,
}));

import { respondToMessageReply } from "@/features/copilot/technician/server/chat";

const identity = {
  authUserId: "00000000-0000-4000-8000-000000000011",
  profileId: "00000000-0000-4000-8000-000000000010",
  shopId: "00000000-0000-4000-8000-000000000001",
  documentationEnabled: true,
  voiceEnabled: true,
  supabase: {} as never,
};

const dispatchThread = { conversationId: "conv-1", title: "Dispatch" };
const jobThread = { conversationId: "conv-2", title: null };

describe("respondToMessageReply: target resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to guess when nothing was recently surfaced", async () => {
    const reply = await respondToMessageReply({
      identity,
      turnId: "turn-1",
      action: { type: "message.reply", conversationId: null, content: "On it." },
      recentConversations: [],
    });

    expect(reply).toBe("There's no recent message for me to reply to.");
    expect(mocks.sendTechnicianCopilotMessage).not.toHaveBeenCalled();
  });

  it("targets the single recent conversation without the model needing to name it", async () => {
    mocks.sendTechnicianCopilotMessage.mockResolvedValue({
      ok: true,
      idempotent: false,
    });

    const reply = await respondToMessageReply({
      identity,
      turnId: "turn-2",
      action: {
        type: "message.reply",
        conversationId: null,
        content: "On it, five minutes out.",
      },
      recentConversations: [dispatchThread],
    });

    expect(mocks.sendTechnicianCopilotMessage).toHaveBeenCalledWith({
      supabase: identity.supabase,
      actorUserId: identity.authUserId,
      conversationId: "conv-1",
      content: "On it, five minutes out.",
      clientMessageId: "turn-2",
    });
    expect(reply).toBe("Sent to Dispatch.");
  });

  it("asks which conversation instead of guessing when more than one is recent and none was named", async () => {
    const reply = await respondToMessageReply({
      identity,
      turnId: "turn-3",
      action: { type: "message.reply", conversationId: null, content: "On it." },
      recentConversations: [dispatchThread, jobThread],
    });

    expect(reply).toBe("Which conversation do you mean: Dispatch, a conversation?");
    expect(mocks.sendTechnicianCopilotMessage).not.toHaveBeenCalled();
  });

  it("never invents or reuses a conversationId outside what was actually surfaced", async () => {
    const reply = await respondToMessageReply({
      identity,
      turnId: "turn-4",
      action: {
        type: "message.reply",
        conversationId: "some-other-conversation-the-model-made-up",
        content: "On it.",
      },
      recentConversations: [dispatchThread, jobThread],
    });

    expect(reply).toContain("Which conversation do you mean");
    expect(mocks.sendTechnicianCopilotMessage).not.toHaveBeenCalled();
  });

  it("does not fall back to the single recent conversation when the model names a different, wrong id", async () => {
    const reply = await respondToMessageReply({
      identity,
      turnId: "turn-4b",
      action: {
        type: "message.reply",
        conversationId: "not-the-one-that-was-surfaced",
        content: "On it.",
      },
      recentConversations: [dispatchThread],
    });

    expect(reply).toBe(
      "I couldn't match that to a recent conversation. Ask what's new to refresh it.",
    );
    expect(mocks.sendTechnicianCopilotMessage).not.toHaveBeenCalled();
  });

  it("honors an explicit conversationId when the model did correctly name one of the recent conversations", async () => {
    mocks.sendTechnicianCopilotMessage.mockResolvedValue({
      ok: true,
      idempotent: false,
    });

    const reply = await respondToMessageReply({
      identity,
      turnId: "turn-5",
      action: {
        type: "message.reply",
        conversationId: "conv-2",
        content: "Tell the customer it's approved.",
      },
      recentConversations: [dispatchThread, jobThread],
    });

    expect(mocks.sendTechnicianCopilotMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-2" }),
    );
    expect(reply).toBe("Sent to that conversation.");
  });

  it("asks for content instead of sending an empty reply", async () => {
    const reply = await respondToMessageReply({
      identity,
      turnId: "turn-6",
      action: { type: "message.reply", conversationId: null, content: null },
      recentConversations: [dispatchThread],
    });

    expect(reply).toBe("What should I tell them in Dispatch?");
    expect(mocks.sendTechnicianCopilotMessage).not.toHaveBeenCalled();
  });

  it("returns a safe reply and never leaks the raw error when sending fails", async () => {
    mocks.sendTechnicianCopilotMessage.mockResolvedValue({
      ok: false,
      status: 500,
      error: "constraint violation on messages_pkey",
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const reply = await respondToMessageReply({
      identity,
      turnId: "turn-7",
      action: {
        type: "message.reply",
        conversationId: "conv-1",
        content: "On it.",
      },
      recentConversations: [dispatchThread],
    });
    errorLog.mockRestore();

    expect(reply).toBe("I couldn't send that reply in Dispatch. Try again.");
    expect(reply).not.toContain("constraint violation");
  });
});
