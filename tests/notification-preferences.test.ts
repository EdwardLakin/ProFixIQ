import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isNewAssistantAction } from "@/features/shared/lib/claimNotificationPopup";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferences,
} from "@/features/shared/hooks/useNotificationPreferences";

describe("notification preferences", () => {
  it("uses quiet, independently switchable defaults for invalid metadata", () => {
    expect(parseNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(parseNotificationPreferences({
      messagePopups: false, assistantPopups: false, navigationIndicators: true,
    })).toEqual({
      messagePopups: false, assistantPopups: false, navigationIndicators: true,
    });
    expect(parseNotificationPreferences({ messagePopups: "false" }).messagePopups).toBe(true);
  });

  it("does not mistake older actions entering the limited pending window for new actions", () => {
    const baseline = Date.parse("2026-09-28T04:00:00Z");
    expect(isNewAssistantAction("2026-09-28T03:00:00Z", baseline)).toBe(false);
    expect(isNewAssistantAction("2026-09-28T04:00:00Z", baseline)).toBe(false);
    expect(isNewAssistantAction("2026-09-28T04:00:01Z", baseline)).toBe(true);
    expect(isNewAssistantAction("invalid", baseline)).toBe(false);
  });

  it("keeps message popups on authorized reads and shares assistant delivery across shells", () => {
    const source = readFileSync("features/shared/components/AppShell.tsx", "utf8");
    const notifier = readFileSync("features/shared/hooks/useAssistantPendingPopups.ts", "utf8");
    const mobile = readFileSync("components/layout/MobileShell.tsx", "utf8");
    const listener = readFileSync(
      "features/shared/components/MobileAssistantNotificationListener.tsx", "utf8",
    );
    const route = readFileSync("app/api/shop-assistant/actions/pending/route.ts", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260928150000_shop_assistant_notification_clock.sql", "utf8",
    );
    const messageListener = readFileSync(
      "features/shared/components/MobileMessageNotificationListener.tsx", "utf8",
    );
    const inboxPopups = readFileSync(
      "features/shared/hooks/useInboxPendingPopups.ts", "utf8",
    );
    expect(source).toContain("pendingRealtimeMessageIds.current.has(message.id)");
    expect(source).toContain("generation !== inboxRequestGeneration.current");
    expect(source).toContain('claimNotificationPopup(userId, "message", message.id)');
    expect(source).toContain("useAssistantPendingPopups({");
    expect(source).toContain("preferences.navigationIndicators && inboxUnreadCount > 0");
    expect(source).toContain(
      'badge={!preferencesLoading && preferences.navigationIndicators ? inboxUnreadCount : 0}',
    );
    expect(notifier).toContain('claimNotificationPopup(userId, "assistant", action.id)');
    expect(notifier).toContain('fetch("/api/shop-assistant/actions/pending?baseline=1"');
    expect(notifier).toContain("performance.now() - subscriptionStartedAt");
    expect(notifier).toContain("requestId !== generation");
    expect(notifier).toContain('resolveMobileHref(href) ?? "/mobile/assistant"');
    expect(mobile).toContain("<MobileAssistantNotificationListener />");
    expect(listener).toContain("useAssistantPendingPopups({");
    expect(listener).toContain("resolveCanonicalStaffProfile");
    expect(listener).toContain('canonicalizeRole(role) !== "mechanic"');
    expect(route).toContain('"shop_assistant_notification_clock"');
    expect(route).not.toContain("as never");
    expect(migration).toContain("clock_timestamp()");
    expect(notifier).toContain("BASELINE_COMMIT_LAG_MS");
    expect(mobile).toContain("<MobileMessageNotificationListener />");
    expect(mobile).not.toContain(
      "{!fieldSurface && !fieldVerificationPending ? <MobileAssistantNotificationListener",
    );
    expect(messageListener).toContain("useInboxPendingPopups({");
    expect(messageListener).toContain("/mobile/messages/");
    expect(inboxPopups).toContain('claimNotificationPopup(userId, "message", message.id)');
    expect(source).toContain('.channel("app-shell-messages")');
    expect(source).toContain("}, [supabase, isAppRoute, userId]);");
    expect(source).toMatch(/<NotificationPreferencesButton\s+mobile\b/);
    const inbox = readFileSync("features/chat/components/InboxModal.tsx", "utf8");
    expect(inbox).toContain("pendingSeedRef.current = null;");
    expect(inbox).toContain("seedRequestId");
    expect(inbox).toContain("[open, loadConversations, seedRequestId]");
    expect(source).toContain("setIncomingConvoRequestId((value) => value + 1)");
    const prefs = readFileSync("features/shared/hooks/useNotificationPreferences.ts", "utf8");
    expect(prefs).toContain('event !== "USER_UPDATED"');
    expect(prefs).toContain('window.addEventListener("focus", onFocus)');
    const realtimeSection = source
      .split("const channel = supabase")[1]
      .split("}, [supabase, isAppRoute, userId]);")[0];
    expect(realtimeSection).not.toContain('toast.info("New inbox message"');
  });
});
