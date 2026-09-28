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

  it("never emits a message popup from an unverified realtime payload", () => {
    const source = readFileSync("features/shared/components/AppShell.tsx", "utf8");
    expect(source).toContain("pendingRealtimeMessageIds.current.has(message.id)");
    expect(source).toContain("generation !== inboxRequestGeneration.current");
    expect(source).toContain('claimNotificationPopup(userId, "message", message.id)');
    expect(source).toContain('claimNotificationPopup(userId, "assistant", action.id)');
    expect(source).toContain('fetch("/api/shop-assistant/actions/pending"');
    expect(source).toContain('const conversations = (await response');
    expect(source).toContain("preferences.messagePopups");
    expect(source).toContain("popupPreferencesRef.current.messagePopups");
    expect(source).toContain("popupPreferencesRef.current.assistantPopups");
    expect(source).toContain("isNewAssistantAction(action.createdAt, baselineAt)");
    expect(source).toContain("preferences.assistantPopups");
    expect(source).toContain("inboxUnreadCount={inboxUnreadCount}");
    expect(source).toContain("preferences.navigationIndicators");
    expect(source).toContain("<NotificationPreferencesButton\\n                  mobile");
    expect(source).toContain("isNewAssistantAction(action.createdAt, baselineAt)");
    const prefs = readFileSync("features/shared/hooks/useNotificationPreferences.ts", "utf8");
    expect(prefs).toContain('event !== "USER_UPDATED"');
    expect(prefs).toContain('window.addEventListener("focus", onFocus)');
    const realtimeSection = source.split('const channel = supabase')[1].split('cleanup = () =>')[0];
    expect(realtimeSection).not.toContain('toast.info("New inbox message"');
  });
});
