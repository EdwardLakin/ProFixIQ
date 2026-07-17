import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const repository = read("features/chat/offline/messageDrafts.ts");
const scopeRoute = read("app/api/chat/offline-scope/route.ts");
const staffInbox = read("features/chat/components/InboxModal.tsx");
const portal = read("features/chat/components/PortalMessagesWorkspace.tsx");
const chatWindow = read("features/ai/components/chat/ChatWindow.tsx");
const serviceWorker = read("app/sw.ts");

describe("offline messaging drafts", () => {
  it("stores drafts in tenant-scoped IndexedDB and never localStorage", () => {
    expect(repository).toContain('const KIND = "message-draft"');
    expect(repository).toContain("saveOfflineSnapshot");
    expect(repository).toContain("getOfflineSnapshot");
    expect(repository).toContain("removeOfflineSnapshots");
    expect(repository).toContain("userId: draft.userId");
    expect(repository).toContain("shopId: draft.shopId");
    expect(repository).not.toContain("localStorage");
  });

  it("derives scope from the authenticated canonical messaging actor", () => {
    expect(scopeRoute).toContain("auth.getUser()");
    expect(scopeRoute).toContain("resolveMessagingActor");
    expect(scopeRoute).toContain("shopId: actor.actor.shopId");
    expect(scopeRoute).not.toContain("req.json");
  });

  it("restores and autosaves staff, customer, and reply composers", () => {
    for (const source of [staffInbox, portal, chatWindow]) {
      expect(source).toContain("getOfflineMessageDraft");
      expect(source).toContain("saveOfflineMessageDraft");
      expect(source).toContain("removeOfflineMessageDraft");
      expect(source).toContain("Saved on this device");
    }
    expect(staffInbox).toContain("recipientIds: selectedRecipients");
    expect(portal).toContain("subject");
    expect(staffInbox).toContain("auth.getSession()");
    expect(portal).toContain("auth.getSession()");
  });

  it("uses stable delivery identities but does not queue or auto-send drafts", () => {
    expect(repository).toContain("conversationRequestId: crypto.randomUUID()");
    expect(repository).toContain("clientMessageId: crypto.randomUUID()");
    expect(staffInbox).toContain("messageDraft?.conversationRequestId");
    expect(staffInbox).toContain("messageDraft?.clientMessageId");
    expect(portal).toContain("newThreadDraft?.conversationRequestId");
    expect(chatWindow).toContain("draft?.clientMessageId");
    expect(repository).not.toContain("runMutationWithOfflineQueue");
    expect(repository).not.toContain("replayAllOfflineMutations");
    for (const source of [staffInbox, portal, chatWindow]) {
      expect(source).toContain("!navigator.onLine");
    }
  });

  it("makes the messaging shell reopenable after an offline restart", () => {
    expect(repository).toContain('"/portal/messages", "/chat"');
    expect(serviceWorker).toContain('url.pathname === "/portal/messages"');
    expect(serviceWorker).toContain('cacheName: "profixiq-messaging-shell-v1"');
    expect(serviceWorker).toContain("new NetworkFirst");
  });
});
