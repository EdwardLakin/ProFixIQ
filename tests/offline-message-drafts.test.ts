import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staffNewMessageDraftTarget } from "@/features/chat/offline/messageDrafts";

const read = (path: string) => readFileSync(path, "utf8");
const repository = read("features/chat/offline/messageDrafts.ts");
const scopeRoute = read("app/api/chat/offline-scope/route.ts");
const staffInbox = read("features/chat/components/InboxModal.tsx");
const portal = read("features/chat/components/PortalMessagesWorkspace.tsx");
const chatWindow = read("features/ai/components/chat/ChatWindow.tsx");
const appShell = read("features/shared/components/AppShell.tsx");
const serviceWorker = read("app/sw.ts");
const privateNavigationCache = read(
  "features/shared/lib/pwa/privateNavigationCache.ts",
);

describe("offline messaging drafts", () => {
  it("binds each new customer draft to its intended recipient", () => {
    const context = {
      audience: "customer" as const,
      contextType: "vehicle",
      contextId: "vehicle-a",
    };

    const firstOwner = staffNewMessageDraftTarget({
      ...context,
      customerId: "customer-a",
    });
    const nextOwner = staffNewMessageDraftTarget({
      ...context,
      customerId: "customer-b",
    });

    expect(firstOwner).not.toBe(nextOwner);
    expect(firstOwner).toContain("customer:customer-a");
    expect(nextOwner).toContain("customer:customer-b");
    expect(staffInbox).toContain("staffNewMessageDraftTarget");
    expect(staffInbox).toContain("stored.customerId === selectedCustomerId");
  });

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
    expect(repository.indexOf("!navigator.onLine")).toBeLessThan(
      repository.indexOf("return cached"),
    );
    expect(repository.indexOf('fetch("/api/chat/offline-scope"')).toBeLessThan(
      repository.indexOf("setOfflineMutationScope(scope)"),
    );
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
    expect(staffInbox).toContain("request_id: deliveryDraft.conversationRequestId");
    expect(staffInbox).toContain("clientMessageId: deliveryDraft.clientMessageId");
    expect(repository).toContain("conversationRequestFingerprint?: string | null");
    expect(staffInbox).toContain("conversationRequestFingerprint: newConversationFingerprint");
    expect(staffInbox).toContain("newConversationFingerprint");
    expect(portal).toContain("newThreadDraft?.conversationRequestId");
    expect(chatWindow).toContain("const clientMessageId = draft.clientMessageId");
    expect(repository).not.toContain("runMutationWithOfflineQueue");
    expect(repository).not.toContain("replayAllOfflineMutations");
    for (const source of [staffInbox, portal, chatWindow]) {
      expect(source).toContain("!navigator.onLine");
    }
  });

  it("waits for draft hydration and confirms offline persistence before claiming success", () => {
    expect(staffInbox).toContain("disabled={!draftReady || sending}");
    expect(chatWindow).toContain("disabled={!draftReady || sending}");
    for (const source of [staffInbox, chatWindow]) {
      const offlineBranch = source.indexOf("if (!navigator.onLine)");
      const confirmedSave = source.indexOf("await saveOfflineMessageDraft", offlineBranch);
      const savedState = source.indexOf("setDraftSaved(true)", confirmedSave);
      expect(confirmedSave).toBeGreaterThan(offlineBranch);
      expect(savedState).toBeGreaterThan(confirmedSave);
    }
  });

  it("makes the messaging shell reopenable after an offline restart", () => {
    expect(repository).toContain('"/portal/messages", "/chat"');
    expect(serviceWorker).toContain('url.pathname === "/portal/messages"');
    expect(serviceWorker).toContain(
      "cacheName: PRIVATE_NAVIGATION_CACHE_NAMES.messaging",
    );
    expect(privateNavigationCache).toContain(
      'messaging: "profixiq-messaging-shell-v2"',
    );
    expect(repository).toContain("isSafePrivateNavigationShell");
    expect(serviceWorker).toContain("new NetworkFirst");
  });

  it("keeps tablet desktop inbox replies and unread badges in sync", () => {
    expect(staffInbox).toContain("const loadMessages = useCallback");
    expect(staffInbox).toContain("setMessages((prev) =>");
    expect(staffInbox).toContain("await loadMessages(conversationId)");
    expect(staffInbox).toContain('new CustomEvent("profixiq:inbox-refresh"');
    expect(staffInbox).toContain("detail: { conversationId }");
    expect(staffInbox).toContain('new CustomEvent("profixiq:inbox-read")');

    expect(appShell).toContain("inboxUnreadCount");
    expect(appShell).toContain("loadInboxUnreadCount");
    expect(appShell).toContain('"/api/chat/my-conversations"');
    expect(appShell).toContain('window.addEventListener("profixiq:inbox-refresh"');
    expect(appShell).toContain('window.addEventListener("profixiq:inbox-read"');
    expect(appShell).toContain('{inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}');
  });
});
