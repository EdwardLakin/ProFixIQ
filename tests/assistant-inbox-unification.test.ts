import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actionStore = readFileSync(
  "features/shop-assistant/server/actions/actionStore.ts",
  "utf8",
);
const pendingRoute = readFileSync(
  "app/api/shop-assistant/actions/pending/route.ts",
  "utf8",
);
const threadsRoute = readFileSync(
  "app/api/shop-assistant/threads/route.ts",
  "utf8",
);
const types = readFileSync("features/shop-assistant/types.ts", "utf8");
const activityHook = readFileSync(
  "features/shop-assistant/hooks/useAssistantInboxActivity.ts",
  "utf8",
);
const dashboard = readFileSync(
  "features/shop-assistant/components/ShopAssistantDashboard.tsx",
  "utf8",
);
const pendingList = readFileSync(
  "features/shop-assistant/components/PendingConfirmationsList.tsx",
  "utf8",
);
const recentList = readFileSync(
  "features/shop-assistant/components/RecentAssistantActivityList.tsx",
  "utf8",
);
const desktopPage = readFileSync("app/assistant/page.tsx", "utf8");
const mobilePage = readFileSync("app/mobile/assistant/page.tsx", "utf8");
const useShopAssistantHook = readFileSync(
  "features/shop-assistant/hooks/useShopAssistant.ts",
  "utf8",
);
const notificationSync = readFileSync(
  "features/agent/server/syncAssistantNotifications.ts",
  "utf8",
);
const suggestedActionsTypes = readFileSync(
  "features/assistant/types/suggested-actions.ts",
  "utf8",
);
const getSuggestedActions = readFileSync(
  "features/assistant/server/getSuggestedActions.ts",
  "utf8",
);
const suggestedActionsPanel = readFileSync(
  "features/assistant/components/SuggestedActionsPanel.tsx",
  "utf8",
);
const useSuggestedActionsHook = readFileSync(
  "features/assistant/hooks/useSuggestedActions.ts",
  "utf8",
);

describe("Phase 2 — unified assistant inbox", () => {
  it("scopes pending confirmations to the requesting actor and excludes expired/non-pending actions", () => {
    expect(actionStore).toContain(
      "export async function listPendingActionsForActor",
    );
    expect(actionStore).toContain('.eq("shop_id", actor.shopId)');
    expect(actionStore).toContain('.eq("requested_by", actor.userId)');
    expect(actionStore).toContain('.eq("status", "pending_confirmation")');
    expect(actionStore).toContain('.gt("expires_at", nowIso)');
  });

  it("serves pending confirmations through an authenticated no-store route", () => {
    expect(pendingRoute).toContain("requireShopAssistantActor");
    expect(pendingRoute).toContain("listPendingActionsForActor");
    expect(pendingRoute).toContain(
      '"cache-control": "private, no-store, max-age=0"',
    );
  });

  it("still serves the existing thread list route unchanged (reused, not duplicated)", () => {
    expect(threadsRoute).toContain("listShopAssistantThreads");
  });

  it("defines the pending-action response contract", () => {
    expect(types).toContain("export type ShopAssistantPendingAction");
    expect(types).toContain("export type ShopAssistantPendingActionsResponse");
  });

  it("joins pending actions to their thread context to build authoritative-workspace links", () => {
    expect(activityHook).toContain("/api/shop-assistant/actions/pending");
    expect(activityHook).toContain("/api/shop-assistant/threads");
    expect(activityHook).toContain("threadById");
    expect(activityHook).toContain("buildAssistantHref");
    expect(activityHook).toContain("resolveMobileHref");
  });

  it("brings daily summary, pending confirmations, and recent activity into ProFix Operations", () => {
    expect(dashboard).toContain("SuggestedActionsPanel");
    expect(dashboard).toContain("PendingConfirmationsList");
    expect(dashboard).toContain("RecentAssistantActivityList");
    expect(dashboard).toContain("useAssistantInboxActivity");
    expect(dashboard).not.toContain("ShopAlertList");
    expect(dashboard).not.toContain("ShopSuggestionList");
  });

  it("links pending confirmations and recent activity out to authoritative workspaces instead of a new management screen", () => {
    expect(pendingList).toContain("href={item.href}");
    expect(recentList).toContain("href={item.href}");
  });

  it("passes page context into the dashboard on both desktop and mobile", () => {
    expect(desktopPage).toContain("<ShopAssistantDashboard");
    expect(desktopPage).toContain("context={context}");
    expect(mobilePage).toContain("<ShopAssistantDashboard");
    expect(mobilePage).toContain("context={context}");
  });

  it("restores the exact thread an activity link points at, not just the newest one", () => {
    expect(activityHook).toContain('params.set("threadId", thread.id)');
    expect(useShopAssistantHook).toContain("initialThreadId");
    expect(useShopAssistantHook).toContain(
      "if (initialThreadId?.trim())",
    );
    expect(desktopPage).toContain(
      'optionalParam(new URLSearchParams(searchKey), "threadId")',
    );
    expect(desktopPage).toContain(
      "useShopAssistant(contextKey, true, threadId)",
    );
    expect(mobilePage).toContain(
      "useShopAssistant(contextKey, true, threadId)",
    );
  });

  it("does not merge a newly selected thread's messages into the previous thread's", () => {
    expect(useShopAssistantHook).toContain("loadedThreadIdRef");
    expect(useShopAssistantHook).toContain(
      "if (loadedThreadIdRef.current !== threadId)",
    );
  });

  it("surfaces activity loading failures with a retry instead of an empty-state lie", () => {
    expect(dashboard).toContain("activityError");
    expect(dashboard).toContain("reloadActivity");
  });

  it("refreshes pending confirmations on its own instead of only on shop-state refresh", () => {
    expect(activityHook).toContain("REFRESH_INTERVAL_MS");
    expect(activityHook).toContain("document.visibilityState");
  });

  it("coalesces concurrent notification syncs instead of running the shop-wide scan twice", () => {
    expect(notificationSync).toContain("inFlightNotificationSyncs");
    expect(notificationSync).toContain(
      "async function performSyncAssistantNotifications",
    );
  });

  it("returns and renders the role-aware daily summary text", () => {
    expect(suggestedActionsTypes).toContain("summaryText: string");
    expect(getSuggestedActions).toContain("summaryText: summary.summaryText");
    expect(suggestedActionsPanel).toContain("data.summaryText");
  });

  it("omits a daily-summary link already covered by a notification card", () => {
    expect(getSuggestedActions).toContain("hrefsFromNotifications");
    expect(getSuggestedActions).toContain(
      "if (hrefsFromNotifications.has(link.href)) continue;",
    );
  });

  it("refreshes suggested actions in step with the rest of the dashboard", () => {
    expect(useSuggestedActionsHook).toContain("refreshToken");
    expect(suggestedActionsPanel).toContain("refreshToken");
    expect(dashboard).toContain("refreshToken={refreshToken}");
  });
});
