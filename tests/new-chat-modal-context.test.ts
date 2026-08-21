import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getContextualChatConversationIds,
  resolveInitialChatConversationId,
} from "@/features/ai/components/chat/NewChatModal";
import { getWorkOrderJobChatContext } from "@/features/work-orders/workspace/workOrderWorkspace";

const mobileFocusedJob = readFileSync(
  join(process.cwd(), "features/work-orders/mobile/MobileFocusedJob.tsx"),
  "utf8",
);
const newChatModal = readFileSync(
  join(process.cwd(), "features/ai/components/chat/NewChatModal.tsx"),
  "utf8",
);

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

  it("restores only conversations attached to the requested context", () => {
    const contextualConversationIds = getContextualChatConversationIds({
      conversations: [
        {
          conversation: {
            id: "older-match",
            context_type: "work_order",
            context_id: "wo-1",
            created_at: "2026-08-20T12:00:00.000Z",
          },
          latest_message: null,
        },
        {
          conversation: {
            id: "newer-match",
            context_type: "work_order",
            context_id: "wo-1",
            created_at: "2026-08-21T12:00:00.000Z",
          },
          latest_message: null,
        },
        {
          conversation: {
            id: "unrelated",
            context_type: "work_order",
            context_id: "wo-2",
            created_at: "2026-08-21T13:00:00.000Z",
          },
          latest_message: null,
        },
      ],
      recentConversationIds: ["older-match", "unrelated"],
      contextType: "work_order",
      contextId: "wo-1",
    });

    expect(contextualConversationIds).toEqual(["older-match", "newer-match"]);
    expect(
      resolveInitialChatConversationId({
        forcedConversationId: null,
        storedConversationId: "unrelated",
        restoreStoredConversation: false,
        contextualConversationIds,
      }),
    ).toBe("older-match");
  });

  it("keeps a recent thread active when its recipient picker is cleared", () => {
    expect(newChatModal).toContain("if (selectedIds.length === 0) return;");
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

  it("applies the canonical Work Order context to the mobile launcher", () => {
    expect(mobileFocusedJob).toContain(
      "context_type={jobChatContext.contextType}",
    );
    expect(mobileFocusedJob).toContain("context_id={jobChatContext.contextId}");
    expect(mobileFocusedJob).not.toContain('context_type="work_order_line"');
  });
});
