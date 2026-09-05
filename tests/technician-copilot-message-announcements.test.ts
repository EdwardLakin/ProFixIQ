import { describe, expect, it } from "vitest";

import {
  describeNewTechnicianMessages,
  detectNewTechnicianMessages,
  type ConversationDigestItem,
} from "@/features/copilot/technician/client/messageAnnouncements";

const dispatchThread: ConversationDigestItem = {
  conversationId: "conv-1",
  title: "Dispatch",
  workOrderId: null,
  latestMessageId: "msg-1",
  latestMessagePreview: "Can you pick up the part on your way in?",
  fromTechnician: false,
};

const jobThread: ConversationDigestItem = {
  conversationId: "conv-2",
  title: null,
  workOrderId: "wo-9",
  latestMessageId: "msg-2",
  latestMessagePreview: "Customer approved the extra hour.",
  fromTechnician: false,
};

describe("detectNewTechnicianMessages", () => {
  it("announces nothing on the very first fetch", () => {
    expect(detectNewTechnicianMessages(null, [dispatchThread, jobThread])).toEqual(
      [],
    );
  });

  it("finds a conversation whose latest message id changed", () => {
    const previous = new Map([
      ["conv-1", "msg-1"],
      ["conv-2", "msg-2-old"],
    ]);
    expect(
      detectNewTechnicianMessages(previous, [dispatchThread, jobThread]),
    ).toEqual([jobThread]);
  });

  it("never announces the technician's own outgoing message as new", () => {
    const previous = new Map([["conv-1", "msg-1-old"]]);
    const ownReply: ConversationDigestItem = {
      ...dispatchThread,
      latestMessageId: "msg-1-new",
      fromTechnician: true,
    };
    expect(detectNewTechnicianMessages(previous, [ownReply])).toEqual([]);
  });

  it("finds nothing new when nothing changed", () => {
    const previous = new Map([
      ["conv-1", "msg-1"],
      ["conv-2", "msg-2"],
    ]);
    expect(
      detectNewTechnicianMessages(previous, [dispatchThread, jobThread]),
    ).toEqual([]);
  });
});

describe("describeNewTechnicianMessages", () => {
  it("returns null when nothing is new", () => {
    expect(describeNewTechnicianMessages([])).toBeNull();
  });

  it("names the conversation and previews the single new message", () => {
    expect(describeNewTechnicianMessages([dispatchThread])).toBe(
      'New message in Dispatch: "Can you pick up the part on your way in?"',
    );
  });

  it("falls back to a generic label when the conversation has no title", () => {
    expect(describeNewTechnicianMessages([jobThread])).toBe(
      'New message in a conversation: "Customer approved the extra hour."',
    );
  });

  it("summarizes multiple new messages instead of reading out every one", () => {
    const third: ConversationDigestItem = {
      ...dispatchThread,
      conversationId: "conv-3",
      title: "Parts",
    };
    const fourth: ConversationDigestItem = {
      ...dispatchThread,
      conversationId: "conv-4",
      title: "Shift lead",
    };
    const text = describeNewTechnicianMessages([
      dispatchThread,
      jobThread,
      third,
      fourth,
    ]);
    expect(text).toBe(
      "You've got 4 new messages: Dispatch, a conversation, Parts, and 1 more.",
    );
  });
});
