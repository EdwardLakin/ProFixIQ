import { describe, expect, it } from "vitest";

import { resolveInitialChatConversationId } from "@/features/ai/components/chat/NewChatModal";
import { getWorkOrderJobChatContext } from "@/features/work-orders/workspace/workOrderWorkspace";

describe("NewChatModal contextual launch", () => {
  it("anchors selected-job chat to the authorized parent Work Order context", () => {
    expect(getWorkOrderJobChatContext("wo-1")).toEqual({
      contextType: "work_order",
      contextId: "wo-1",
      restoreStoredConversation: false,
    });
  });

  it("preserves the existing global last-conversation restore by default", () => {
    expect(
      resolveInitialChatConversationId({
        forcedConversationId: null,
        storedConversationId: "stored-conversation",
        restoreStoredConversation: true,
      }),
    ).toBe("stored-conversation");
  });

  it("does not replace a contextual launch with an unrelated stored conversation", () => {
    expect(
      resolveInitialChatConversationId({
        forcedConversationId: null,
        storedConversationId: "unrelated-conversation",
        restoreStoredConversation: false,
      }),
    ).toBeNull();
  });

  it("keeps an explicitly requested conversation authoritative", () => {
    expect(
      resolveInitialChatConversationId({
        forcedConversationId: "requested-conversation",
        storedConversationId: "unrelated-conversation",
        restoreStoredConversation: false,
      }),
    ).toBe("requested-conversation");
  });
});
